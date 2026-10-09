/**
 * Fantasy Teams API — Netlify Function (single entrypoint at `/.netlify/functions/api`).
 *
 * THE data layer. Every read and write to the Firebase Realtime Database
 * happens in this function using the Firebase Admin SDK authenticated with a
 * service account (`FIREBASE_SERVICE_ACCOUNT`). The browser never touches
 * Firebase data directly — RTDB rules deny all client access
 * (`database.rules.json`) and every endpoint here verifies the caller's
 * Firebase ID token first.
 *
 * Endpoint surface (all require `Authorization: Bearer <idToken>` unless noted):
 *   GET    /                                 health check (no auth)
 *   GET    /me · PATCH /me                   profile read / update
 *   GET    /leagues/mine                     my leagues
 *   POST   /leagues                          create a league (commissioner)
 *   GET    /leagues/by-code/:code            sanitized preview for the join flow
 *   POST   /leagues/join                     join by code { code }
 *   GET    /leagues/:id · PATCH /leagues/:id league detail / commissioner settings
 *   PATCH  /leagues/:id/ready                toggle own ready status
 *   GET    /leagues/:id/draft                draft-room payload
 *   POST   /leagues/:id/draft/{start|pick|pause|resume|order{,/randomize}}
 *   PATCH  /leagues/:id/draft                pre-draft settings
 *   GET    /leagues/:id/standings | /insights
 *   PATCH  /leagues/:id/prefs                commissioner projection prefs
 *   POST   /leagues/:id/sync                 commissioner NFL refresh
 *   GET    /nfl/meta · /nfl/games · /nfl/team/:id
 *
 *   GET    /nfl/external                      external news and market context
 *
 * RTDB shape:
 *   /users/{uid}                            profile + leagues index
 *   /leagueCodes/{code}                     unique join-code → leagueId (plain string)
 *   /leagues/{leagueId}                     metadata + /members/{uid} + /prefs + /activity
 *   /drafts/{leagueId}                      order, pickSequence, picks, timer, status + _lock
 *   /nfl (current, seasons/*: games, records, projections, meta) + sync + system locks
 */

import { randomInt } from 'node:crypto';
import admin from 'firebase-admin';
import type { Handler } from '@netlify/functions';
import type { DraftFormat, DraftPickTimer, LeagueStatus, NflGame, ScoringMode } from '../../src/types';
import { NFL_TEAMS_BY_ID } from '../../src/data/nflTeams';
import { getAdminApp, getDb, ServerConfigError } from './lib/admin';
import {
  acquireDraftLock,
  applyDraftPick,
  autopick,
  ensureDraftInitialized,
  reconcileDraft,
  releaseDraftLock,
  serializeDraft,
  serializePicks,
  type DraftDTO,
  type PickDTO,
} from './lib/draft-service';
import {
  buildPickSequence,
  draftedTeamIdSet,
  isOrderPermutation,
  maxRoundsFor,
  totalPicksFor,
} from './lib/draft-core';
import {
  computeStandings,
  computeTeamRecords,
  isTeamOwned,
  teamGames,
  type StandingOwner,
} from './lib/scoring-core';
import {
  deriveActiveWeek,
  readCurrentMeta,
  readSeasonGames,
  syncNflData,
} from './lib/nfl-service';
import { buildLeagueInsights, InsightsError } from './lib/season-service';
import { draftEventKey, draftPickMessage, pushActivity } from './lib/activity';
import { leagueIdFromCode } from './lib/codes';
import { getExternalNflInsights } from './lib/external-nfl';

/* ────────────────────────────── constants ────────────────────────────── */

const MIN_PARTICIPANTS = 2;
const MAX_PARTICIPANTS = 16;
const SEASON_MIN = 2024;
const SEASON_MAX = 2031;
const LEAGUE_NAME_MIN = 3;
const LEAGUE_NAME_MAX = 60;
const DISPLAY_NAME_MIN = 2;
const DISPLAY_NAME_MAX = 40;
const CODE_LENGTH = 6;
const CODE_MAX_ATTEMPTS = 8;
const PICK_TIMERS = new Set([30, 60, 90, 120]);

/** Ambiguity-free alphabet (no 0/O, 1/I/L) so codes survive human errors. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

/* ─────────────────────────────── errors ─────────────────────────────── */

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/* ─────────────────────────── admin bootstrap ─────────────────────────── */

/**
 * Uses the shared service-account bootstrap; wraps config failures in the
 * HTTP error shape the rest of this module expects.
 */
function getApp(): admin.app.App {
  try {
    return getAdminApp();
  } catch (error) {
    throw new HttpError(
      500,
      'server-config',
      error instanceof ServerConfigError ? error.message : 'Server configuration error.',
    );
  }
}

function db(): admin.database.Database {
  return getDb();
}

/* ───────────────────────────── validators ───────────────────────────── */

function generateJoinCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

function requireString(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new HttpError(400, 'invalid-argument', `${label} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new HttpError(400, 'invalid-argument', `${label} must be ${min}–${max} characters.`);
  }
  return trimmed;
}

function validJoinCode(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'invalid-argument', 'League code must be text.');
  const code = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== CODE_LENGTH) {
    throw new HttpError(400, 'invalid-argument', `League codes are ${CODE_LENGTH} characters.`);
  }
  return code;
}

interface LeagueInput {
  name: string;
  season: number;
  maxParticipants: number;
  draftFormat: DraftFormat;
  draftPickTimerSeconds: DraftPickTimer;
}

function parseLeagueInput(data: unknown): LeagueInput {
  if (data === null || typeof data !== 'object') {
    throw new HttpError(400, 'invalid-argument', 'No league settings provided.');
  }
  const raw = data as Record<string, unknown>;

  const name = requireString(raw.name, 'League name', LEAGUE_NAME_MIN, LEAGUE_NAME_MAX);

  const season = Number(raw.season);
  if (!Number.isInteger(season) || season < SEASON_MIN || season > SEASON_MAX) {
    throw new HttpError(400, 'invalid-argument', `Season must be ${SEASON_MIN}–${SEASON_MAX}.`);
  }

  const maxParticipants = Number(raw.maxParticipants);
  if (!Number.isInteger(maxParticipants) || maxParticipants < MIN_PARTICIPANTS || maxParticipants > MAX_PARTICIPANTS) {
    throw new HttpError(
      400,
      'invalid-argument',
      `Leagues hold ${MIN_PARTICIPANTS}–${MAX_PARTICIPANTS} participants.`,
    );
  }

  if (raw.draftFormat !== 'snake' && raw.draftFormat !== 'linear') {
    throw new HttpError(400, 'invalid-argument', 'Draft format must be snake or linear.');
  }

  const draftPickTimerSeconds = Number(raw.draftPickTimerSeconds);
  if (!PICK_TIMERS.has(draftPickTimerSeconds)) {
    throw new HttpError(400, 'invalid-argument', 'Pick timer must be 30, 60, 90, or 120 seconds.');
  }

  return {
    name,
    season,
    maxParticipants,
    draftFormat: raw.draftFormat,
    draftPickTimerSeconds: draftPickTimerSeconds as DraftPickTimer,
  };
}

/* ─────────────────────────── value helpers ─────────────────────────── */

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown): boolean {
  return value === true;
}

type MemberRecord = Record<string, unknown>;

function membersOf(leagueValue: Record<string, unknown>): MemberRecord {
  const members = leagueValue.members;
  return members && typeof members === 'object' ? (members as MemberRecord) : {};
}

/* ─────────────────────────── serialization ─────────────────────────── */

interface LeagueDTO {
  id: string;
  name: string;
  season: number;
  maxParticipants: number;
  draftFormat: DraftFormat;
  draftPickTimerSeconds: DraftPickTimer;
  joinCode: string;
  commissionerId: string;
  status: LeagueStatus;
  memberCount: number;
  createdAt: number;
  updatedAt: number;
  prefs: { projectionsEnabled: boolean; projectionsVisible: boolean; scoringMode: ScoringMode; benchEnabled: boolean; benchSlots: number; benchLocksAtKickoff: boolean; maxTeamsPerPlayer: number; maxActiveTeams: number; tradingEnabled: boolean };
}

interface MemberDTO {
  id: string;
  leagueId: string;
  userId: string;
  displayName: string;
  photoURL: string | null;
  role: 'commissioner' | 'member';
  isReady: boolean;
  joinedAt: number;
}

function serializeLeague(leagueId: string, value: Record<string, unknown>): LeagueDTO {
  const prefs = (value.prefs ?? {}) as Record<string, unknown>;
  return {
    id: leagueId,
    name: str(value.name, 'Untitled League'),
    season: num(value.season, 2026),
    maxParticipants: num(value.maxParticipants, 8),
    draftFormat: value.draftFormat === 'linear' ? 'linear' : 'snake',
    draftPickTimerSeconds: num(value.draftPickTimerSeconds, 60) as DraftPickTimer,
    joinCode: str(value.joinCode),
    commissionerId: str(value.commissionerId),
    status: (str(value.status, 'waiting') as LeagueStatus) || 'waiting',
    memberCount: num(value.memberCount, 0),
    createdAt: num(value.createdAt, 0),
    updatedAt: num(value.updatedAt, 0),
    prefs: {
      projectionsEnabled: prefs.projectionsEnabled !== false,
      projectionsVisible: prefs.projectionsVisible !== false,
      scoringMode: prefs.scoringMode === 'points' ? 'points' : 'wins',
      benchEnabled: prefs.benchEnabled === true,
      benchSlots: Math.max(0, Math.min(16, num(prefs.benchSlots, 1))),
      benchLocksAtKickoff: prefs.benchLocksAtKickoff !== false,
      maxTeamsPerPlayer: Math.max(1, Math.min(16, num(prefs.maxTeamsPerPlayer, 16))),
      maxActiveTeams: Math.max(1, Math.min(16, num(prefs.maxActiveTeams, 16))),
      tradingEnabled: prefs.tradingEnabled === true,
    },
  };
}

function serializeMembers(leagueId: string, members: MemberRecord): MemberDTO[] {
  return Object.entries(members)
    .map(([uid, entry]) => {
      const m = (entry ?? {}) as Record<string, unknown>;
      return {
        id: uid,
        leagueId,
        userId: uid,
        displayName: str(m.displayName, 'Player'),
        photoURL: typeof m.photoURL === 'string' ? m.photoURL : null,
        role: m.role === 'commissioner' ? ('commissioner' as const) : ('member' as const),
        isReady: bool(m.isReady),
        joinedAt: num(m.joinedAt, 0),
      };
    })
    .sort((a, b) => a.joinedAt - b.joinedAt);
}

/* ─────────────────────────── auth + routing ─────────────────────────── */

interface Claims {
  uid: string;
  name?: string | null;
  email?: string | null;
  picture?: string | null;
  provider?: string;
}

async function authenticate(event: { headers: Record<string, string | undefined> }): Promise<Claims> {
  const header = event.headers.authorization ?? event.headers.Authorization;
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'unauthenticated', 'Missing bearer token. Sign in and try again.');

  try {
    const decoded = await getApp().auth().verifyIdToken(token);
    const provider = decoded.firebase?.sign_in_provider;
    return {
      uid: decoded.uid,
      name: typeof decoded.name === 'string' ? decoded.name : null,
      email: typeof decoded.email === 'string' ? decoded.email : null,
      picture: typeof decoded.picture === 'string' ? decoded.picture : null,
      provider: typeof provider === 'string' ? provider : undefined,
    };
  } catch {
    throw new HttpError(401, 'unauthenticated', 'Your session is invalid or expired. Sign in again.');
  }
}

function parseSegments(rawPath: string): string[] {
  let path = rawPath;
  const FULL_PREFIX = '/.netlify/functions/api';
  const SHORT_PREFIX = '/api';
  if (path.startsWith(FULL_PREFIX)) path = path.slice(FULL_PREFIX.length);
  else if (path.startsWith(SHORT_PREFIX)) path = path.slice(SHORT_PREFIX.length);
  path = path.replace(/\/+$/g, '');
  if (path === '') return [];
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
}

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/* ─────────────────────────── profile helpers ─────────────────────────── */

async function getOrCreateProfile(claims: Claims) {
  const ref = db().ref(`users/${claims.uid}`);
  const snapshot = await ref.once('value');

  // Best available display name: verified token claims first, then the Auth
  // record (covers providers that don't stamp a `name` claim). One lookup.
  const authUser = await getAuthUser(claims.uid);
  const name = claims.name?.trim() || (authUser?.displayName ?? null);
  const photo = claims.picture || (authUser?.photoURL ?? null);

  if (snapshot.exists()) {
    const value = snapshot.val() as Record<string, unknown>;
    const storedName = str(value.displayName, 'Player');

    // Repair placeholder names so "Player" never sticks in league previews.
    if (name && storedName === 'Player') {
      await ref.update({ displayName: name, photoURL: photo ?? null, updatedAt: Date.now() });
    }

    return {
      uid: claims.uid,
      displayName: str(value.displayName, name || 'Player'),
      email: typeof value.email === 'string' ? value.email : null,
      photoURL: typeof value.photoURL === 'string' ? value.photoURL : null,
      authProvider: str(value.authProvider, 'unknown'),
      createdAt: num(value.createdAt, 0),
      updatedAt: num(value.updatedAt, 0),
    };
  }

  // First visit: seed the profile from verified claims (with auth fallback).
  const now = Date.now();
  const displayName = name || 'Player';
  await ref.set({
    displayName,
    email: claims.email ?? null,
    photoURL: photo ?? null,
    authProvider: claims.provider ?? 'unknown',
    createdAt: now,
    updatedAt: now,
    prefs: {
      projectionsEnabled: true,
      projectionsVisible: true,
      scoringMode: 'wins',
      benchEnabled: false,
      benchSlots: 1,
      benchLocksAtKickoff: true,
      maxTeamsPerPlayer: 16,
      maxActiveTeams: 16,
      tradingEnabled: false,
    },
  });

  return {
    uid: claims.uid,
    displayName,
    email: claims.email ?? null,
    photoURL: photo ?? null,
    authProvider: claims.provider ?? 'unknown',
    createdAt: now,
    updatedAt: now,
  };
}

async function getAuthUser(uid: string): Promise<{ displayName: string | null; photoURL: string | null } | null> {
  try {
    const user = await getApp().auth().getUser(uid);
    return { displayName: user.displayName ?? null, photoURL: user.photoURL ?? null };
  } catch {
    return null;
  }
}

/* ─────────────────────────── operations ─────────────────────────── */

// Serializes join-code reservations with a short lease (a plain check-then-set,
// not a SDK transaction, which misbehaves in some deployments).
const CODE_LOCK = 'system/codeLock';

async function reserveUniqueJoinCode(leagueId: string): Promise<string> {
  const lockRef = db().ref(CODE_LOCK);
  for (let attempt = 0; attempt < CODE_MAX_ATTEMPTS; attempt += 1) {
    const code = generateJoinCode();
    const ref = db().ref(`leagueCodes/${code}`);

    if ((await ref.once('value')).exists()) continue;
    await lockRef.set({ owner: leagueId, at: Date.now() });
    try {
      if ((await ref.once('value')).exists()) continue; // somebody got it first
      await ref.set(leagueId); // plain string value
      return code;
    } finally {
      await lockRef.set(null).catch(() => undefined);
    }
  }
  throw new HttpError(409, 'code-generation-failed', 'Could not generate a unique join code. Please try again.');
}

async function createLeague(claims: Claims, body: unknown) {
  const input = parseLeagueInput(body);
  const profile = await getOrCreateProfile(claims);

  const leagueRef = db().ref('leagues').push();
  const leagueId = leagueRef.key as string;
  const joinCode = await reserveUniqueJoinCode(leagueId);

  const now = Date.now();
  await leagueRef.set({
    name: input.name,
    season: input.season,
    maxParticipants: input.maxParticipants,
    draftFormat: input.draftFormat,
    draftPickTimerSeconds: input.draftPickTimerSeconds,
    joinCode,
    commissionerId: claims.uid,
    status: 'waiting',
    memberCount: 1,
    createdAt: now,
    updatedAt: now,
  });

  await leagueRef.child(`members/${claims.uid}`).set({
    displayName: profile.displayName,
    photoURL: profile.photoURL,
    role: 'commissioner',
    isReady: false,
    joinedAt: now,
  });

  await db().ref(`users/${claims.uid}/leagues/${leagueId}`).set({ role: 'commissioner' });
  await db().ref(`system/leagueIds/${leagueId}`).set(true);

  return { leagueId, joinCode };
}

/** A league record is only usable when it carries the fields createLeague writes. */
function isUsableLeague(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as Record<string, unknown>).name === 'string' &&
      String((value as Record<string, unknown>).name).trim() !== '' &&
      typeof (value as Record<string, unknown>).status === 'string' &&
      num((value as Record<string, unknown>).maxParticipants, 0) >= 2 &&
      num((value as Record<string, unknown>).memberCount, 0) >= 1,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_JOIN_ATTEMPTS = 3;

async function joinLeague(claims: Claims, body: unknown) {
  const code = validJoinCode(body && typeof body === 'object' ? (body as Record<string, unknown>).code : null);

  const codeSnapshot = await db().ref(`leagueCodes/${code}`).once('value');
  if (!codeSnapshot.exists()) {
    throw new HttpError(404, 'not-found', 'No league found with that code.');
  }
  const leagueId = leagueIdFromCode(codeSnapshot.val());
  if (leagueId === '') {
    throw new HttpError(404, 'not-found', 'No league found with that code.');
  }

  const profile = await getOrCreateProfile(claims);
  const leagueRef = db().ref(`leagues/${leagueId}`);

  // Reject degenerate/malformed league records instead of failing mid-join.
  const preflight = (await leagueRef.once('value')).val() as Record<string, unknown> | null;
  if (!isUsableLeague(preflight)) {
    throw new HttpError(404, 'not-found', 'This league no longer exists.');
  }

  // The join is NOT a SDK transaction — those have been observed to no-op out
  // of nowhere in this environment (valid league, "committed:false", no reason).
  // Instead we serialize joins to a league with a short-lived lock node, then
  // apply the membership as ONE atomic update() (memberCount + members/{uid} are
  // children of the same node, so RTDB applies them together). Reads + plain
  // writes are primitives that work reliably here.
  const lockRef = db().ref(`leagues/${leagueId}/joinLock`);
  let acquired = false;
  for (let attempt = 0; attempt < MAX_JOIN_ATTEMPTS; attempt += 1) {
    const lock = (await lockRef.once('value')).val() as { uid?: string; at?: number } | null;
    if (lock && lock.uid !== claims.uid && Date.now() - Number(lock.at ?? 0) < 2000) {
      await sleep(150 * (attempt + 1));
      continue;
    }
    await lockRef.set({ uid: claims.uid, at: Date.now() });
    acquired = true;
    break;
  }
  if (!acquired) {
    requestLog('warn', { method: 'POST', path: `/leagues/${leagueId}/join`, fn: 'join', code: 'conflict', reason: 'lock-busy', leagueId, uid: claims.uid });
    throw new HttpError(409, 'conflict', 'Another owner is joining right now. Try again in a moment.');
  }

  try {
    // Authoritative read + validation under the lock.
    const value = (await leagueRef.once('value')).val() as Record<string, unknown> | null;
    if (!isUsableLeague(value)) {
      requestLog('warn', { method: 'POST', path: `/leagues/${leagueId}/join`, fn: 'join', code: 'not-found', reason: 'degenerate-league', leagueId, uid: claims.uid });
      throw new HttpError(404, 'not-found', 'This league no longer exists.');
    }
    const members = membersOf(value);
    if (members[claims.uid]) {
      requestLog('warn', { method: 'POST', path: `/leagues/${leagueId}/join`, fn: 'join', code: 'already-exists', reason: 'already-member', leagueId, uid: claims.uid });
      throw new HttpError(409, 'already-exists', 'You are already a member of this league.');
    }
    const bannedUsers = value.bannedUsers && typeof value.bannedUsers === 'object'
      ? value.bannedUsers as Record<string, unknown>
      : {};
    if (bannedUsers[claims.uid]) {
      throw new HttpError(403, 'forbidden', 'You have been banned from this league.');
    }
    if (value.status !== 'waiting') {
      requestLog('warn', { method: 'POST', path: `/leagues/${leagueId}/join`, fn: 'join', code: 'failed-precondition', reason: 'not-waiting', leagueId, uid: claims.uid, status: str(value.status) });
      throw new HttpError(409, 'failed-precondition', `This league is not accepting new members (status: ${String(value.status)}).`);
    }
    const memberCount = num(value.memberCount, 0);
    const maxParticipants = num(value.maxParticipants, 0);
    if (memberCount >= maxParticipants) {
      requestLog('warn', { method: 'POST', path: `/leagues/${leagueId}/join`, fn: 'join', code: 'resource-exhausted', reason: 'full', leagueId, uid: claims.uid, memberCount, maxParticipants });
      throw new HttpError(429, 'resource-exhausted', 'This league is already full.');
    }

    const now = Date.now();
    await leagueRef.update({
      memberCount: memberCount + 1,
      updatedAt: now,
      [`members/${claims.uid}`]: {
        displayName: profile.displayName,
        photoURL: profile.photoURL,
        role: 'member',
        isReady: false,
        joinedAt: now,
      },
    });

    // Confirm the membership landed, then record the user's league index.
    const after = (await leagueRef.once('value')).val() as Record<string, unknown> | null;
    if (!after || !membersOf(after)[claims.uid]) {
      requestLog('warn', { method: 'POST', path: `/leagues/${leagueId}/join`, fn: 'join', code: 'conflict', reason: 'write-not-visible', leagueId, uid: claims.uid });
      throw new HttpError(409, 'conflict', 'This league just changed. Please try again.');
    }
  } finally {
    await lockRef.set(null).catch(() => undefined);
  }

  await db().ref(`users/${claims.uid}/leagues/${leagueId}`).set({ role: 'member' });

  return { leagueId };
}

async function getLeagueDetail(claims: Claims, leagueId: string) {
  const snapshot = await db().ref(`leagues/${leagueId}`).once('value');
  if (!snapshot.exists()) throw new HttpError(404, 'not-found', 'League not found.');

  const value = snapshot.val() as Record<string, unknown>;
  const members = membersOf(value);
  if (!members[claims.uid]) {
    throw new HttpError(403, 'forbidden', 'You are not a member of this league.');
  }

  return {
    league: serializeLeague(leagueId, value),
    members: serializeMembers(leagueId, members),
  };
}

async function getLeaguePreview(claims: Claims, code: string) {
  const codeSnapshot = await db().ref(`leagueCodes/${code}`).once('value');
  if (!codeSnapshot.exists()) throw new HttpError(404, 'not-found', 'No league found with that code.');
  const leagueId = leagueIdFromCode(codeSnapshot.val());
  if (leagueId === '') throw new HttpError(404, 'not-found', 'No league found with that code.');

  const snapshot = await db().ref(`leagues/${leagueId}`).once('value');
  const value = snapshot.exists() ? (snapshot.val() as Record<string, unknown>) : null;
  if (!isUsableLeague(value)) throw new HttpError(404, 'not-found', 'This league no longer exists.');
  const members = membersOf(value);

  // Commissioner display name: prefer the member record, fall back to the user
  // profile document so fresh names always show up.
  const commissionerId = str(value.commissionerId);
  let commissionerName = 'Commissioner';
  const commissionerMember = members[commissionerId];
  if (commissionerMember && typeof commissionerMember === 'object') {
    const displayName = (commissionerMember as Record<string, unknown>).displayName;
    if (typeof displayName === 'string' && displayName.trim() !== '') commissionerName = displayName;
  }
  if (commissionerName === 'Commissioner') {
    const userSnap = await db().ref(`users/${commissionerId}`).once('value');
    const userData = userSnap.val() as Record<string, unknown> | null;
    if (userData && typeof userData.displayName === 'string' && userData.displayName.trim() !== '') {
      commissionerName = userData.displayName;
    }
  }

  return {
    leagueId,
    name: str(value.name, 'Untitled League'),
    season: num(value.season, 2026),
    commissionerName,
    memberCount: num(value.memberCount, Object.keys(members).length),
    maxParticipants: num(value.maxParticipants, 0),
    draftFormat: value.draftFormat === 'linear' ? 'linear' : 'snake',
    draftPickTimerSeconds: num(value.draftPickTimerSeconds, 60),
    status: str(value.status, 'waiting'),
    isMember: Boolean(members[claims.uid]),
  };
}

async function getMyLeagues(claims: Claims) {
  const index = await db().ref(`users/${claims.uid}/leagues`).once('value');
  const leagueIds = index.exists() ? Object.keys(index.val() as Record<string, unknown>) : [];

  const results: Array<{ league: LeagueDTO; createdAt: number }> = [];
  for (const leagueId of leagueIds) {
    const snapshot = await db().ref(`leagues/${leagueId}`).once('value');
    if (!snapshot.exists()) continue;
    const league = serializeLeague(leagueId, snapshot.val() as Record<string, unknown>);
    results.push({ league, createdAt: league.createdAt });
  }

  results.sort((a, b) => b.createdAt - a.createdAt);
  return results.map((entry) => entry.league);
}

async function updateLeagueSettings(claims: Claims, leagueId: string, body: unknown) {
  const leagueRef = db().ref(`leagues/${leagueId}`);
  const snapshot = await leagueRef.once('value');
  if (!snapshot.exists()) throw new HttpError(404, 'not-found', 'League not found.');

  const value = snapshot.val() as Record<string, unknown>;
  if (value.commissionerId !== claims.uid) {
    throw new HttpError(403, 'forbidden', 'Only the commissioner can change league settings.');
  }
  if (str(value.status) !== 'waiting') {
    throw new HttpError(409, 'failed-precondition', 'League settings lock once the draft starts.');
  }

  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const patch: Record<string, unknown> = { updatedAt: Date.now() };

  if (raw.name !== undefined) {
    patch.name = requireString(raw.name, 'League name', LEAGUE_NAME_MIN, LEAGUE_NAME_MAX);
  }
  if (raw.draftFormat !== undefined) {
    if (raw.draftFormat !== 'snake' && raw.draftFormat !== 'linear') {
      throw new HttpError(400, 'invalid-argument', 'Draft format must be snake or linear.');
    }
    patch.draftFormat = raw.draftFormat;
  }
  if (raw.draftPickTimerSeconds !== undefined) {
    const timer = Number(raw.draftPickTimerSeconds);
    if (!PICK_TIMERS.has(timer)) {
      throw new HttpError(400, 'invalid-argument', 'Pick timer must be 30, 60, 90, or 120 seconds.');
    }
    patch.draftPickTimerSeconds = timer;
  }
  if (raw.maxParticipants !== undefined) {
    const maxParticipants = Number(raw.maxParticipants);
    const memberCount = num(value.memberCount, Object.keys(membersOf(value)).length);
    if (!Number.isInteger(maxParticipants) || maxParticipants < MIN_PARTICIPANTS || maxParticipants > MAX_PARTICIPANTS) {
      throw new HttpError(400, 'invalid-argument', `Leagues hold ${MIN_PARTICIPANTS}–${MAX_PARTICIPANTS} participants.`);
    }
    if (maxParticipants < memberCount) {
      throw new HttpError(400, 'invalid-argument', `Cannot shrink below the current ${memberCount} members.`);
    }
    patch.maxParticipants = maxParticipants;
  }

  await leagueRef.update(patch);
  return { ok: true };
}

async function setReady(claims: Claims, leagueId: string, body: unknown) {
  const isReady = bool(body && typeof body === 'object' ? (body as Record<string, unknown>).isReady : null);
  const memberRef = db().ref(`leagues/${leagueId}/members/${claims.uid}`);
  const snapshot = await memberRef.once('value');
  if (!snapshot.exists()) throw new HttpError(403, 'forbidden', 'You are not a member of this league.');

  await memberRef.update({ isReady });
  return { ok: true };
}

/* ═══════════════════════════ Draft operations ═══════════════════════════ */

interface DraftRoomPayload {
  league: ReturnType<typeof serializeLeague>;
  draft: DraftDTO;
  members: ReturnType<typeof serializeMembers>;
  picks: PickDTO[];
  isCommissioner: boolean;
}

async function readLeague(leagueId: string): Promise<Record<string, unknown>> {
  const snapshot = await db().ref(`leagues/${leagueId}`).once('value');
  if (!snapshot.exists()) throw new HttpError(404, 'not-found', 'League not found.');
  return snapshot.val() as Record<string, unknown>;
}

function requireMember(leagueValue: Record<string, unknown>, uid: string): void {
  if (!membersOf(leagueValue)[uid]) {
    throw new HttpError(403, 'forbidden', 'You are not a member of this league.');
  }
}

function requireCommissioner(leagueValue: Record<string, unknown>, uid: string): void {
  if (str(leagueValue.commissionerId) !== uid) {
    throw new HttpError(403, 'forbidden', 'Only the commissioner can do that.');
  }
}

function typeSafeMemberIds(members: MemberRecord): string[] {
  return Object.keys(members).sort(
    (a, b) => num(memberValue(members, a).joinedAt) - num(memberValue(members, b).joinedAt),
  );
}

function memberValue(members: MemberRecord, uid: string): Record<string, unknown> {
  const entry = members[uid];
  return entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
}

/** Idempotent: creates the league's draft node on first access. */
async function ensureDraftNode(leagueId: string, leagueValue: Record<string, unknown>): Promise<void> {
  const ids = typeSafeMemberIds(membersOf(leagueValue));
  const rounds = maxRoundsFor(ids.length);
  await ensureDraftInitialized(db(), leagueId, {
    status: 'upcoming',
    format: leagueValue.draftFormat === 'linear' ? 'linear' : 'snake',
    rounds,
    order: ids,
    currentPick: 0,
    totalPicks: totalPicksFor(ids.length, rounds),
    pickDeadline: null,
    pauseRemainingMs: null,
    pausedAt: null,
    startedAt: null,
    completedAt: null,
  });
}

function membersById(members: MemberRecord): Record<string, { displayName: string }> {
  const result: Record<string, { displayName: string }> = {};
  for (const [uid, entry] of Object.entries(members)) {
    const m = (entry ?? {}) as Record<string, unknown>;
    result[uid] = { displayName: str(m.displayName, 'Player') };
  }
  return result;
}

/** Full draft-room payload (used by both the lobby pre-draft and the draft page). */
async function getDraftRoom(claims: Claims, leagueId: string): Promise<DraftRoomPayload> {
  const leagueValue = await readLeague(leagueId);
  requireMember(leagueValue, claims.uid);

  const timerMs = num(leagueValue.draftPickTimerSeconds, 60) * 1000;
  await ensureDraftNode(leagueId, leagueValue);
  const { completed } = await reconcileDraft(db(), leagueId, timerMs);

  const draftSnapshot = await db().ref(`drafts/${leagueId}`).once('value');
  const draftValue = (draftSnapshot.exists() ? draftSnapshot.val() : {}) as Record<string, unknown>;
  if (str(draftValue.status) === 'completed' && leagueValue.lineupsInitialized !== true) {
    await initializeCompletedDraftLineups(leagueId, leagueValue, draftValue);
  }
  if (completed) {
    await db().ref(`leagues/${leagueId}`).update({ status: 'active', updatedAt: Date.now() });
  }
  const members = membersOf(leagueValue);
  const order = Array.isArray(draftValue.order)
    ? draftValue.order.filter((id): id is string => typeof id === 'string')
    : typeSafeMemberIds(members);

  return {
    league: serializeLeague(leagueId, leagueValue),
    draft: serializeDraft(leagueId, draftValue, leagueValue.draftFormat === 'linear' ? 'linear' : 'snake'),
    members: serializeMembers(leagueId, members),
    picks: serializePicks(leagueId, draftValue.picks, membersById(members), order.length),
    isCommissioner: str(leagueValue.commissionerId) === claims.uid,
  };
}

async function startDraft(claims: Claims, leagueId: string, body: unknown): Promise<DraftRoomPayload> {
  const leagueValue = await readLeague(leagueId);
  requireCommissioner(leagueValue, claims.uid);
  if (str(leagueValue.status) !== 'waiting') {
    throw new HttpError(409, 'failed-precondition', 'The draft can only start from the waiting room.');
  }

  const members = membersOf(leagueValue);
  const memberIds = typeSafeMemberIds(members);
  if (memberIds.length < 2) {
    throw new HttpError(409, 'failed-precondition', 'At least two players are needed to draft.');
  }

  await ensureDraftNode(leagueId, leagueValue);
  const draftRef = db().ref(`drafts/${leagueId}`);
  const currentValue = (await draftRef.once('value')).val() as Record<string, unknown> | null;
  const leaguePrefs = (leagueValue.prefs ?? {}) as Record<string, unknown>;
  const maxTeamsPerPlayer = Math.max(1, Math.min(16, num(leaguePrefs.maxTeamsPerPlayer, 16)));
  const maxRounds = Math.min(maxRoundsFor(memberIds.length), maxTeamsPerPlayer);

  const rawRounds = body && typeof body === 'object' ? (body as Record<string, unknown>).rounds : undefined;
  const rounds = rawRounds === undefined ? num(currentValue?.rounds, maxRounds) : Number(rawRounds);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > maxRounds) {
    throw new HttpError(400, 'invalid-argument', `This league supports 1–${maxRounds} rounds.`);
  }

  // Keep the commissioner's order but fold in anyone who joined after it was set.
  const savedOrder = Array.isArray(currentValue?.order) ? (currentValue.order as string[]) : [];
  const orderExisting = savedOrder.filter((id) => members[id]);
  const order = [...orderExisting, ...memberIds.filter((id) => !orderExisting.includes(id))];

  const format = leagueValue.draftFormat === 'linear' ? 'linear' : 'snake';
  const timerMs = num(leagueValue.draftPickTimerSeconds, 60) * 1000;
  const now = Date.now();
  const pickSequence = buildPickSequence(order, order.length, rounds, format);
  const totalPicks = totalPicksFor(order.length, rounds);

  const locked = await acquireDraftLock(db(), leagueId, claims.uid);
  if (!locked) {
    throw new HttpError(409, 'conflict', 'The draft is busy. Try again.');
  }
  try {
    const fresh = (await draftRef.once('value')).val() as Record<string, unknown> | null;
    if (!fresh || str(fresh.status) !== 'upcoming') {
      throw new HttpError(409, 'conflict', 'The draft just started elsewhere. Refresh to continue.');
    }
    await draftRef.set({
      ...fresh,
      status: 'live',
      format,
      rounds,
      order,
      pickSequence,
      currentPick: 1,
      totalPicks,
      pickDeadline: now + timerMs,
      pauseRemainingMs: null,
      pausedAt: null,
      startedAt: now,
      completedAt: null,
    });
  } finally {
    await releaseDraftLock(db(), leagueId);
  }

  await db().ref(`leagues/${leagueId}`).update({ status: 'drafting', updatedAt: now });
  return getDraftRoom(claims, leagueId);
}

async function submitPick(claims: Claims, leagueId: string, body: unknown): Promise<DraftRoomPayload> {
  const leagueValue = await readLeague(leagueId);
  requireMember(leagueValue, claims.uid);

  const nflTeamId = body && typeof body === 'object' ? (body as Record<string, unknown>).nflTeamId : undefined;
  if (typeof nflTeamId !== 'string' || !NFL_TEAMS_BY_ID[nflTeamId]) {
    throw new HttpError(400, 'invalid-argument', 'Choose an available NFL team.');
  }
  const team = NFL_TEAMS_BY_ID[nflTeamId];

  const timerMs = num(leagueValue.draftPickTimerSeconds, 60) * 1000;
  const draftRef = db().ref(`drafts/${leagueId}`);

  const locked = await acquireDraftLock(db(), leagueId, claims.uid);
  if (!locked) {
    throw new HttpError(409, 'conflict', 'The draft is busy. Try again.');
  }

  try {
    // 1) Expire any overdue pick first, so the board is always authoritative.
    const current = (await draftRef.once('value')).val() as Record<string, unknown> | null;
    if (current && str(current.status) === 'live') {
      const deadline = num(current.pickDeadline, 0);
      if (deadline !== 0 && Date.now() >= deadline) {
        await draftRef.set(autopick(current, timerMs, Date.now()));
      }
    }

    // 2) Authoritative validation under the lock.
    const fresh = (await draftRef.once('value')).val() as Record<string, unknown> | null;
    const now = Date.now();
    const status = fresh ? str(fresh.status) : '';
    if (status === 'paused') throw new HttpError(409, 'draft-paused', 'The draft is paused. Wait for the commissioner.');
    if (status === 'completed') throw new HttpError(409, 'draft-complete', 'The draft is already complete.');
    if (status !== 'live') throw new HttpError(409, 'conflict', 'The draft is not live right now.');

    const pickNumber = fresh ? num(fresh.currentPick, 0) : 0;
    const sequence = fresh && Array.isArray(fresh.pickSequence) ? (fresh.pickSequence as string[]) : [];
    if (fresh === null || pickNumber < 1 || pickNumber > num(fresh.totalPicks, 0)) {
      throw new HttpError(409, 'conflict', 'The draft changed. Refresh and try again.');
    }
    if (sequence[pickNumber - 1] !== claims.uid) {
      throw new HttpError(403, 'not-your-turn', "It's not your turn.");
    }
    const deadline = num(fresh.pickDeadline, 0);
    if (deadline !== 0 && now >= deadline) {
      throw new HttpError(409, 'turn-expired', 'Your turn expired. Refresh to see the current pick.');
    }
    if (draftedTeamIdSet(fresh.picks as Record<string, { nflTeamId?: unknown }> | undefined).has(nflTeamId)) {
      throw new HttpError(409, 'team-taken', 'That team was already drafted.');
    }

    // 3) Apply the pick as one whole-node write (atomic on a single node).
    const next = applyDraftPick(fresh, {
      pickNumber,
      userId: claims.uid,
      nflTeamId,
      teamName: team.name,
      teamAbbreviation: team.abbreviation,
      now,
      timerMs,
    });
    await draftRef.set(next);

    // 4) Confirm it landed before returning.
    const confirmed = (await draftRef.once('value')).val() as Record<string, unknown>;
    const picks = (confirmed.picks ?? {}) as Record<string, unknown>;
    if (!picks[String(pickNumber)]) {
      throw new HttpError(409, 'conflict', 'The pick did not land. Refresh and try again.');
    }

    if (str(confirmed.status) === 'completed') {
      await initializeCompletedDraftLineups(leagueId, leagueValue, confirmed);
      await db().ref(`leagues/${leagueId}`).update({ status: 'active', updatedAt: Date.now() });
    }

    // League activity: a franchise joined someone's roster.
    const pickerName = str(memberValue(membersOf(leagueValue), claims.uid).displayName, 'Player');
    await pushActivity(db(), leagueId, draftEventKey(pickNumber), 'draft', draftPickMessage(pickerName, team.nickname));
  } finally {
    await releaseDraftLock(db(), leagueId);
  }

  return getDraftRoom(claims, leagueId);
}

async function initializeCompletedDraftLineups(
  leagueId: string,
  leagueValue: Record<string, unknown>,
  draftValue: Record<string, unknown>,
): Promise<void> {
  const prefs = (leagueValue.prefs ?? {}) as Record<string, unknown>;
  if (prefs.benchEnabled !== true) return;
  const maxTeams = Math.max(1, Math.min(16, num(prefs.maxTeamsPerPlayer, 16)));
  const maxActive = Math.max(1, Math.min(maxTeams, num(prefs.maxActiveTeams, maxTeams)));
  const benchSlots = Math.max(0, Math.min(16, num(prefs.benchSlots, 1)));
  const picks = (draftValue.picks ?? {}) as Record<string, Record<string, unknown>>;
  const teamsByUser = new Map<string, Array<{ teamId: string; pickNumber: number }>>();
  for (const pick of Object.values(picks)) {
    const userId = str(pick.userId);
    const teamId = str(pick.nflTeamId);
    if (!userId || !teamId) continue;
    const list = teamsByUser.get(userId) ?? [];
    list.push({ teamId, pickNumber: num(pick.pickNumber, 0) });
    teamsByUser.set(userId, list);
  }

  const season = num(leagueValue.season, 2026);
  const games = await readSeasonGames(db(), season);
  const meta = await readCurrentMeta(db());
  const currentWeek = deriveActiveWeek(games, Date.now(), meta.currentWeek || 1);
  const weekStarted = games.some((game) => game.week === currentWeek &&
    (Date.parse(game.date) <= Date.now() || game.status === 'in_progress' || game.status === 'halftime' || game.final));
  const effectiveWeek = weekStarted ? Math.min(18, currentWeek + 1) : currentWeek;
  const updates: Record<string, unknown> = {};
  updates[`leagues/${leagueId}/lineupsInitialized`] = true;
  for (const [userId, entries] of teamsByUser) {
    const teams = entries.sort((a, b) => a.pickNumber - b.pickNumber).map((entry) => entry.teamId).slice(0, maxTeams);
    const requiredBench = Math.min(benchSlots, Math.max(0, teams.length - maxActive));
    const benched = teams.slice(-requiredBench);
    updates[`leagues/${leagueId}/lineups/${userId}/${effectiveWeek}`] = benched.length > 0
      ? Object.fromEntries(benched.map((teamId) => [teamId, true]))
      : { _empty: true };
  }
  if (Object.keys(updates).length > 0) await db().ref().update(updates);
}

async function pauseDraft(claims: Claims, leagueId: string): Promise<DraftRoomPayload> {
  const leagueValue = await readLeague(leagueId);
  requireCommissioner(leagueValue, claims.uid);

  const draftRef = db().ref(`drafts/${leagueId}`);
  const locked = await acquireDraftLock(db(), leagueId, claims.uid);
  if (!locked) throw new HttpError(409, 'conflict', 'The draft is busy. Try again.');
  try {
    const value = (await draftRef.once('value')).val() as Record<string, unknown> | null;
    if (!value || str(value.status) !== 'live') {
      throw new HttpError(409, 'conflict', 'The draft is not live right now.');
    }
    const now = Date.now();
    const deadline = num(value.pickDeadline, 0);
    const remaining = deadline > now ? deadline - now : num(leagueValue.draftPickTimerSeconds, 60) * 1000;
    await draftRef.set({
      ...value,
      status: 'paused',
      pickDeadline: null,
      pauseRemainingMs: remaining,
      pausedAt: now,
    });
  } finally {
    await releaseDraftLock(db(), leagueId);
  }

  return getDraftRoom(claims, leagueId);
}

async function resumeDraft(claims: Claims, leagueId: string): Promise<DraftRoomPayload> {
  const leagueValue = await readLeague(leagueId);
  requireCommissioner(leagueValue, claims.uid);

  const timerMs = num(leagueValue.draftPickTimerSeconds, 60) * 1000;
  const draftRef = db().ref(`drafts/${leagueId}`);
  const locked = await acquireDraftLock(db(), leagueId, claims.uid);
  if (!locked) throw new HttpError(409, 'conflict', 'The draft is busy. Try again.');
  try {
    const value = (await draftRef.once('value')).val() as Record<string, unknown> | null;
    if (!value || str(value.status) !== 'paused') {
      throw new HttpError(409, 'conflict', 'The draft is not paused.');
    }
    const remaining = num(value.pauseRemainingMs, timerMs);
    await draftRef.set({
      ...value,
      status: 'live',
      pickDeadline: Date.now() + Math.max(remaining, 1000),
      pauseRemainingMs: null,
      pausedAt: null,
    });
  } finally {
    await releaseDraftLock(db(), leagueId);
  }

  return getDraftRoom(claims, leagueId);
}

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

async function requirePreDraftDraftNode(claims: Claims, leagueId: string): Promise<{ leagueValue: Record<string, unknown>; members: MemberRecord }> {
  const leagueValue = await readLeague(leagueId);
  requireCommissioner(leagueValue, claims.uid);
  if (str(leagueValue.status) !== 'waiting') {
    throw new HttpError(409, 'failed-precondition', 'Draft settings lock once the draft starts.');
  }
  await ensureDraftNode(leagueId, leagueValue);
  return { leagueValue, members: membersOf(leagueValue) };
}

async function randomizeDraftOrder(claims: Claims, leagueId: string): Promise<{ ok: true }> {
  const { members } = await requirePreDraftDraftNode(claims, leagueId);
  const ids = typeSafeMemberIds(members);
  await db().ref(`drafts/${leagueId}`).update({ order: shuffled(ids), updatedAt: Date.now() });
  return { ok: true };
}

async function setDraftOrder(claims: Claims, leagueId: string, body: unknown): Promise<{ ok: true }> {
  const { members } = await requirePreDraftDraftNode(claims, leagueId);
  const order = body && typeof body === 'object' ? (body as Record<string, unknown>).order : undefined;
  if (!isOrderPermutation(order, typeSafeMemberIds(members))) {
    throw new HttpError(400, 'invalid-argument', 'Draft order must list every member exactly once.');
  }
  await db().ref(`drafts/${leagueId}`).update({ order: order as string[] });
  return { ok: true };
}

async function updateDraftSettings(claims: Claims, leagueId: string, body: unknown): Promise<{ ok: true }> {
  const { leagueValue, members } = await requirePreDraftDraftNode(claims, leagueId);
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const memberIds = typeSafeMemberIds(members);
  const patch: Record<string, unknown> = {};

  if (raw.rounds !== undefined) {
    const rounds = Number(raw.rounds);
    const prefs = (leagueValue.prefs ?? {}) as Record<string, unknown>;
    const maxRounds = Math.min(maxRoundsFor(memberIds.length), Math.max(1, Math.min(16, num(prefs.maxTeamsPerPlayer, 16))));
    if (!Number.isInteger(rounds) || rounds < 1 || rounds > maxRounds) {
      throw new HttpError(400, 'invalid-argument', `This league supports 1–${maxRounds} rounds.`);
    }
    patch.rounds = rounds;
  }

  if (patch.rounds !== undefined) {
    await db().ref(`drafts/${leagueId}`).update(patch);
  }

  const leaguePatch: Record<string, unknown> = { updatedAt: Date.now() };
  if (raw.draftFormat !== undefined) {
    if (raw.draftFormat !== 'snake' && raw.draftFormat !== 'linear') {
      throw new HttpError(400, 'invalid-argument', 'Draft format must be snake or linear.');
    }
    leaguePatch.draftFormat = raw.draftFormat;
  }
  if (raw.draftPickTimerSeconds !== undefined) {
    const timer = Number(raw.draftPickTimerSeconds);
    if (!PICK_TIMERS.has(timer)) {
      throw new HttpError(400, 'invalid-argument', 'Pick timer must be 30, 60, 90, or 120 seconds.');
    }
    leaguePatch.draftPickTimerSeconds = timer;
  }
  if (Object.keys(leaguePatch).length > 1) {
    await db().ref(`leagues/${leagueId}`).update(leaguePatch);
  }
  void leagueValue;
  return { ok: true };
}

/** Routes under /leagues/:id/draft. */
function dispatchDraft(method: string, segments: string[], claims: Claims, body: unknown) {
  const leagueId = segments[1] as string;
  if (method === 'GET' && segments.length === 3) return getDraftRoom(claims, leagueId);
  if (method === 'PATCH' && segments.length === 3) return updateDraftSettings(claims, leagueId, body);

  if (method === 'POST' && segments.length === 4) {
    const action = segments[3];
    if (action === 'start') return startDraft(claims, leagueId, body);
    if (action === 'pick') return submitPick(claims, leagueId, body);
    if (action === 'pause') return pauseDraft(claims, leagueId);
    if (action === 'resume') return resumeDraft(claims, leagueId);
    if (action === 'order') return setDraftOrder(claims, leagueId, body);
  }
  if (method === 'POST' && segments.length === 5 && segments[3] === 'order' && segments[4] === 'randomize') {
    return randomizeDraftOrder(claims, leagueId);
  }

  throw new HttpError(404, 'not-found', 'Unknown draft endpoint.');
}

/* ═════════════════════ NFL data & season standings ═════════════════════ */

type QueryParams = Record<string, string | undefined>;

function queryNumber(query: QueryParams | undefined, key: string, fallback: number): number {
  const value = query?.[key];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function enrichGame(game: NflGame) {
  const home = NFL_TEAMS_BY_ID[game.homeTeamId];
  const away = NFL_TEAMS_BY_ID[game.awayTeamId];
  return {
    ...game,
    homeName: home?.name ?? game.homeTeamId,
    awayName: away?.name ?? game.awayTeamId,
    homeAbbreviation: home?.abbreviation ?? game.homeTeamId.toUpperCase(),
    awayAbbreviation: away?.abbreviation ?? game.awayTeamId.toUpperCase(),
  };
}

async function getNflMeta() {
  const meta = await readCurrentMeta(db());
  const season = meta.season || new Date().getUTCFullYear();
  const games = await readSeasonGames(db(), season);
  const currentWeek = deriveActiveWeek(games, Date.now(), meta.currentWeek || 1);
  return { season, currentWeek, lastSyncAt: meta.lastSyncAt || null };
}

async function getNflGames(query: QueryParams) {
  const meta = await readCurrentMeta(db());
  const season = queryNumber(query, 'season', meta.season || 2026);
  const seasonGames = await readSeasonGames(db(), season);
  const currentWeek = deriveActiveWeek(seasonGames, Date.now(), meta.currentWeek || 1);
  const week = Math.max(1, queryNumber(query, 'week', currentWeek));
  const games = seasonGames
    .filter((game) => game.week === week)
    .map(enrichGame)
    .sort((a, b) => a.date.localeCompare(b.date));
  return { season, week, currentWeek, games };
}

async function getNflExternal(query: QueryParams) {
  const meta = await readCurrentMeta(db());
  const season = queryNumber(query, 'season', meta.season || 2026);
  const seasonGames = await readSeasonGames(db(), season);
  const currentWeek = deriveActiveWeek(seasonGames, Date.now(), meta.currentWeek || 1);
  const week = Math.max(1, queryNumber(query, 'week', currentWeek));
  const games = seasonGames.filter((game) => game.week === week);
  return getExternalNflInsights(season, week, games);
}

async function getNflTeam(claims: Claims, teamId: string, query: QueryParams) {
  if (!NFL_TEAMS_BY_ID[teamId]) throw new HttpError(404, 'not-found', 'Team not found.');

  const meta = await readCurrentMeta(db());
  const season = queryNumber(query, 'season', meta.season || 2026);
  const games = await readSeasonGames(db(), season);
  const record = computeTeamRecords(games).get(teamId) ?? {
    teamId,
    wins: 0,
    losses: 0,
    ties: 0,
    gamesPlayed: 0,
    pointsFor: 0,
    pointsAgainst: 0,
  };

  const gamesForTeam = teamGames(games, teamId).map((game) => {
    const opponent = NFL_TEAMS_BY_ID[game.opponentId];
    return {
      ...game,
      opponentName: opponent?.name ?? game.opponentId,
      opponentAbbreviation: opponent?.abbreviation ?? game.opponentId.toUpperCase(),
    };
  });

  // Optional: current fantasy owner, scoped to a league the caller belongs to.
  let owner: { userId: string; displayName: string } | null = null;
  const leagueId = query?.league;
  if (leagueId) {
    const leagueValue = await readLeague(leagueId);
    requireMember(leagueValue, claims.uid);
    const context = await readOwnershipContext(leagueId, leagueValue);
    const uid = context.owners.get(teamId);
    if (uid && uid !== '_available' && membersOf(leagueValue)[uid]) {
      const member = memberValue(membersOf(leagueValue), uid);
      owner = { userId: uid, displayName: str(member.displayName, 'Player') };
    }
  }

  return { teamId, season, record, games: gamesForTeam, owner };
}

async function getLeagueStandings(claims: Claims, leagueId: string, query: QueryParams) {
  const leagueValue = await readLeague(leagueId);
  requireMember(leagueValue, claims.uid);

  const members = membersOf(leagueValue);
  const meta = await readCurrentMeta(db());
  const season = queryNumber(query, 'season', num(leagueValue.season, meta.season || 2026));
  const games = await readSeasonGames(db(), season);
  const standingsWeek = deriveActiveWeek(games, Date.now(), meta.currentWeek || 1);

  // Fantasy owners come from draft selections, not from stored points.
  const teamIdsByUser = new Map<string, Set<string>>();
  const picksSnap = await db().ref(`drafts/${leagueId}/picks`).once('value');
  if (picksSnap.exists()) {
    const picks = picksSnap.val() as Record<string, Record<string, unknown>>;
    for (const pick of Object.values(picks)) {
      const uid = str(pick.userId);
      const teamId = str(pick.nflTeamId);
      if (!uid || !teamId) continue;
      const set = teamIdsByUser.get(uid) ?? new Set<string>();
      set.add(teamId);
      teamIdsByUser.set(uid, set);
    }
  }

  const owners: StandingOwner[] = Object.keys(members).map((uid) => {
    const member = memberValue(members, uid);
    const lineups = (leagueValue.lineups && typeof leagueValue.lineups === 'object'
      ? leagueValue.lineups
      : {}) as Record<string, Record<string, Record<string, unknown>>>;
    const initialTeamIds = Array.from(teamIdsByUser.get(uid) ?? []);
    const ownershipByWeek = (leagueValue.teamOwnership && typeof leagueValue.teamOwnership === 'object'
      ? leagueValue.teamOwnership
      : {}) as Record<string, Record<string, string>>;
    const owner: StandingOwner = {
      userId: uid,
      displayName: str(member.displayName, 'Player'),
      photoURL: typeof member.photoURL === 'string' ? member.photoURL : null,
      teamIds: initialTeamIds,
      initialTeamIds,
      ownershipByWeek,
      benchedTeamIdsByWeek: Object.fromEntries(Object.entries(lineups[uid] ?? {}).map(([week, teams]) => [
        week,
        Object.entries(teams ?? {}).filter(([teamId, value]) => teamId !== '_empty' && value === true).map(([teamId]) => teamId),
      ])),
    };
    owner.teamIds = Object.keys(NFL_TEAMS_BY_ID).filter((teamId) => isTeamOwned(owner, teamId, standingsWeek));
    return owner;
  });

  const prefsValue = (leagueValue.prefs ?? {}) as Record<string, unknown>;
  const scoringMode = prefsValue.scoringMode === 'points' ? 'points' : 'wins';
  const result = computeStandings(owners, games, scoringMode);
  const standings = result.standings.map((row) => ({
    ...row,
    teams: row.teams.map((team) => {
      const info = NFL_TEAMS_BY_ID[team.teamId];
      const upcoming = games
        .filter((game) => game.status === 'scheduled' && (game.homeTeamId === team.teamId || game.awayTeamId === team.teamId))
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      const opponentId = upcoming
        ? upcoming.homeTeamId === team.teamId
          ? upcoming.awayTeamId
          : upcoming.homeTeamId
        : null;
      const opponent = opponentId ? NFL_TEAMS_BY_ID[opponentId] : undefined;
      return {
        ...team,
        name: info?.name ?? team.teamId,
        abbreviation: info?.abbreviation ?? team.teamId.toUpperCase(),
        next: upcoming
          ? {
              opponentId: opponentId ?? '',
              opponentName: opponent?.name ?? opponentId ?? '',
              opponentAbbreviation: opponent?.abbreviation ?? opponentId?.toUpperCase() ?? '',
              week: upcoming.week,
              date: upcoming.date,
            }
          : null,
      };
    }),
  }));

  return {
    leagueId,
    season,
    currentWeek: deriveActiveWeek(games, Date.now(), meta.currentWeek || 1),
    standings,
    weeklyWins: result.weeklyWins,
    isCommissioner: str(leagueValue.commissionerId) === claims.uid,
  };
}

async function manualSyncScores(claims: Claims, leagueId: string) {
  const leagueValue = await readLeague(leagueId);
  requireCommissioner(leagueValue, claims.uid);

  try {
    const result = await syncNflData(db());
    return { ok: !result.skipped, ...result };
  } catch (error) {
    throw new HttpError(
      502,
      'provider-error',
      error instanceof Error ? error.message : 'Could not reach the NFL data source.',
    );
  }
}

async function getLeagueInsightsHandler(claims: Claims, leagueId: string) {
  try {
    return await buildLeagueInsights(db(), leagueId, claims.uid);
  } catch (error) {
    if (error instanceof InsightsError) {
      throw new HttpError(error.code === 'not-found' ? 404 : 403, error.code, error.message);
    }
    throw error;
  }
}

async function updateLeaguePrefs(claims: Claims, leagueId: string, body: unknown) {
  const leagueValue = await readLeague(leagueId);
  requireCommissioner(leagueValue, claims.uid);

  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const prefs: Record<string, unknown> = {};
  if (raw.projectionsEnabled !== undefined) {
    if (typeof raw.projectionsEnabled !== 'boolean') {
      throw new HttpError(400, 'invalid-argument', 'projectionsEnabled must be a boolean.');
    }
    prefs.projectionsEnabled = raw.projectionsEnabled;
  }
  if (raw.projectionsVisible !== undefined) {
    if (typeof raw.projectionsVisible !== 'boolean') {
      throw new HttpError(400, 'invalid-argument', 'projectionsVisible must be a boolean.');
    }
    prefs.projectionsVisible = raw.projectionsVisible;
  }
  if (raw.scoringMode !== undefined) {
    if (raw.scoringMode !== 'wins' && raw.scoringMode !== 'points') {
      throw new HttpError(400, 'invalid-argument', 'scoringMode must be "wins" or "points".');
    }
    prefs.scoringMode = raw.scoringMode;
  }
  if (raw.benchEnabled !== undefined) {
    if (typeof raw.benchEnabled !== 'boolean') {
      throw new HttpError(400, 'invalid-argument', 'benchEnabled must be a boolean.');
    }
    prefs.benchEnabled = raw.benchEnabled;
  }
  if (raw.benchSlots !== undefined) {
    const benchSlots = Number(raw.benchSlots);
    if (!Number.isInteger(benchSlots) || benchSlots < 0 || benchSlots > 16) {
      throw new HttpError(400, 'invalid-argument', 'Bench slots must be between 0 and 16.');
    }
    prefs.benchSlots = benchSlots;
  }
  if (raw.benchLocksAtKickoff !== undefined) {
    if (typeof raw.benchLocksAtKickoff !== 'boolean') {
      throw new HttpError(400, 'invalid-argument', 'benchLocksAtKickoff must be a boolean.');
    }
    prefs.benchLocksAtKickoff = raw.benchLocksAtKickoff;
  }
  if (raw.maxTeamsPerPlayer !== undefined) {
    const value = Number(raw.maxTeamsPerPlayer);
    if (!Number.isInteger(value) || value < 1 || value > 16) {
      throw new HttpError(400, 'invalid-argument', 'Maximum teams per player must be between 1 and 16.');
    }
    prefs.maxTeamsPerPlayer = value;
  }
  if (raw.maxActiveTeams !== undefined) {
    const value = Number(raw.maxActiveTeams);
    if (!Number.isInteger(value) || value < 1 || value > 16) {
      throw new HttpError(400, 'invalid-argument', 'Maximum active teams must be between 1 and 16.');
    }
    prefs.maxActiveTeams = value;
  }
  if (raw.tradingEnabled !== undefined) {
    if (typeof raw.tradingEnabled !== 'boolean') throw new HttpError(400, 'invalid-argument', 'tradingEnabled must be a boolean.');
    prefs.tradingEnabled = raw.tradingEnabled;
  }
  if (Object.keys(prefs).length === 0) {
    throw new HttpError(400, 'invalid-argument', 'Nothing to update.');
  }

  const currentPrefs = (leagueValue.prefs ?? {}) as Record<string, unknown>;
  const maxTeamsPerPlayer = num(prefs.maxTeamsPerPlayer, num(currentPrefs.maxTeamsPerPlayer, 16));
  const maxActiveTeams = num(prefs.maxActiveTeams, num(currentPrefs.maxActiveTeams, 16));
  const benchSlots = num(prefs.benchSlots, num(currentPrefs.benchSlots, 1));
  const benchEnabled = typeof prefs.benchEnabled === 'boolean' ? prefs.benchEnabled : currentPrefs.benchEnabled === true;
  if (maxActiveTeams > maxTeamsPerPlayer) {
    throw new HttpError(400, 'invalid-argument', 'Active-team limit cannot exceed the total team limit.');
  }
  if (benchEnabled && maxActiveTeams + benchSlots < maxTeamsPerPlayer) {
    throw new HttpError(400, 'invalid-argument', 'Active-team limit plus bench slots must cover the total team limit.');
  }

  const picks = (await db().ref(`drafts/${leagueId}/picks`).once('value')).val() as Record<string, Record<string, unknown>> | null;
  const rosterCounts = new Map<string, number>();
  for (const pick of Object.values(picks ?? {})) {
    const userId = str(pick.userId);
    rosterCounts.set(userId, (rosterCounts.get(userId) ?? 0) + 1);
  }
  const largestRoster = Math.max(0, ...rosterCounts.values());
  if (largestRoster > maxTeamsPerPlayer) {
    throw new HttpError(409, 'failed-precondition', `A player already owns ${largestRoster} teams, so the total limit cannot be lower.`);
  }

  const rosterRulesChanged = prefs.benchEnabled !== undefined || prefs.benchSlots !== undefined ||
    prefs.maxTeamsPerPlayer !== undefined || prefs.maxActiveTeams !== undefined;
  if (prefs.benchEnabled === false) {
    const season = num(leagueValue.season, 2026);
    const games = await readSeasonGames(db(), season);
    const meta = await readCurrentMeta(db());
    const week = deriveActiveWeek(games, Date.now(), meta.currentWeek || 1);
    const lineupUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(prefs)) {
      lineupUpdates[`leagues/${leagueId}/prefs/${key}`] = value;
    }
    for (const userId of Object.keys(membersOf(leagueValue))) {
      lineupUpdates[`leagues/${leagueId}/lineups/${userId}/${week}`] = { _empty: true };
    }
    await db().ref().update(lineupUpdates);
  } else if (benchEnabled && rosterRulesChanged) {
    const season = num(leagueValue.season, 2026);
    const games = await readSeasonGames(db(), season);
    const meta = await readCurrentMeta(db());
    const currentWeek = deriveActiveWeek(games, Date.now(), meta.currentWeek || 1);
    const weekStarted = games.some((game) => game.week === currentWeek &&
      (Date.parse(game.date) <= Date.now() || game.status === 'in_progress' || game.status === 'halftime' || game.final));
    const effectiveWeek = weekStarted ? Math.min(18, currentWeek + 1) : currentWeek;
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(prefs)) updates[`leagues/${leagueId}/prefs/${key}`] = value;

    const picksByUser = new Map<string, Array<{ teamId: string; pickNumber: number }>>();
    for (const pick of Object.values(picks ?? {})) {
      const userId = str(pick.userId);
      const teamId = str(pick.nflTeamId);
      if (!userId || !teamId) continue;
      const entries = picksByUser.get(userId) ?? [];
      entries.push({ teamId, pickNumber: num(pick.pickNumber, 0) });
      picksByUser.set(userId, entries);
    }
    const storedLineups = (leagueValue.lineups && typeof leagueValue.lineups === 'object'
      ? leagueValue.lineups
      : {}) as Record<string, Record<string, Record<string, unknown>>>;
    for (const userId of Object.keys(membersOf(leagueValue))) {
      const teams = (picksByUser.get(userId) ?? []).sort((a, b) => a.pickNumber - b.pickNumber).map((entry) => entry.teamId);
      const snapshots = storedLineups[userId] ?? {};
      const snapshotWeek = Object.keys(snapshots).map(Number).filter((week) => week <= effectiveWeek).sort((a, b) => b - a)[0];
      const existing = snapshotWeek === undefined ? [] : Object.entries(snapshots[String(snapshotWeek)] ?? {})
        .filter(([teamId, value]) => teamId !== '_empty' && value === true && teams.includes(teamId))
        .map(([teamId]) => teamId);
      const requiredBench = Math.max(0, teams.length - maxActiveTeams);
      const desired = existing.slice(0, benchSlots);
      for (const teamId of teams.slice().reverse()) {
        if (desired.length >= requiredBench) break;
        if (!desired.includes(teamId)) desired.push(teamId);
      }
      updates[`leagues/${leagueId}/lineups/${userId}/${effectiveWeek}`] = desired.length > 0
        ? Object.fromEntries(desired.map((teamId) => [teamId, true]))
        : { _empty: true };
    }
    await db().ref().update(updates);
  } else {
    await db().ref(`leagues/${leagueId}/prefs`).update(prefs);
  }
  return { ok: true };
}

/* ─────────────────────────── leader (commissioner) commands ─────────────────────────── */

async function setAnnouncement(claims: Claims, leagueId: string, body: unknown) {
  const leagueValue = await readLeague(leagueId);
  requireCommissioner(leagueValue, claims.uid);

  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const message = typeof raw.message === 'string' ? raw.message.trim() : '';
  if (message.length > 280) {
    throw new HttpError(400, 'invalid-argument', 'Announcements are limited to 280 characters.');
  }

  const announcementRef = db().ref(`leagues/${leagueId}/announcement`);
  if (message === '') {
    await announcementRef.set(null);
  } else {
    await announcementRef.set({ text: message, by: claims.uid, at: Date.now() });
  }
  return { ok: true };
}

async function resetMemberReady(claims: Claims, leagueId: string) {
  const leagueValue = await readLeague(leagueId);
  requireCommissioner(leagueValue, claims.uid);

  const members = membersOf(leagueValue);
  const patch: Record<string, boolean> = {};
  for (const uid of Object.keys(members)) patch[`members/${uid}/isReady`] = false;
  await db().ref(`leagues/${leagueId}`).update(patch);

  return { ok: true, reset: Object.keys(members).length };
}

async function transferCommissioner(claims: Claims, leagueId: string, body: unknown) {
  const leagueValue = await readLeague(leagueId);
  requireCommissioner(leagueValue, claims.uid);

  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const targetId = typeof raw.userId === 'string' ? raw.userId : '';
  const members = membersOf(leagueValue);

  if (!members[targetId]) {
    throw new HttpError(400, 'invalid-argument', 'Choose an active member of this league.');
  }
  if (targetId === claims.uid) {
    throw new HttpError(400, 'invalid-argument', 'You are already the commissioner.');
  }
  const target = memberValue(members, targetId);
  const now = Date.now();

  // Update the league's commissioner pointer and both owner roles.
  await db().ref(`leagues/${leagueId}`).update({
    commissionerId: targetId,
    updatedAt: now,
    [`members/${claims.uid}/role`]: 'member',
    [`members/${targetId}/role`]: 'commissioner',
  });
  await db().ref(`users/${claims.uid}/leagues/${leagueId}`).update({ role: 'member' });
  await db().ref(`users/${targetId}/leagues/${leagueId}`).update({ role: 'commissioner' });

  await pushActivity(
    db(),
    leagueId,
    `commissioner-${targetId}`,
    'leader',
    `${str(target.displayName, 'A member')} is now the commissioner.`,
  );

  return { ok: true };
}

async function removeMember(claims: Claims, leagueId: string, body: unknown) {
  const leagueValue = await readLeague(leagueId);
  requireCommissioner(leagueValue, claims.uid);
  if (str(leagueValue.status) === 'drafting') {
    throw new HttpError(409, 'failed-precondition', 'Players cannot be removed while the draft is live. Pause and complete the draft first.');
  }

  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const userId = typeof raw.userId === 'string' ? raw.userId : '';
  const members = membersOf(leagueValue);

  if (!members[userId]) {
    throw new HttpError(404, 'not-found', 'That member is not in this league.');
  }
  if (userId === claims.uid || userId === str(leagueValue.commissionerId)) {
    throw new HttpError(400, 'invalid-argument', 'The commissioner cannot be removed.');
  }

  await removeMembership(leagueId, leagueValue, userId, false, claims.uid);

  return { ok: true };
}

async function removeMembership(
  leagueId: string,
  leagueValue: Record<string, unknown>,
  userId: string,
  ban: boolean,
  actorId: string,
): Promise<void> {
  const members = membersOf(leagueValue);
  const memberCount = num(leagueValue.memberCount, Object.keys(members).length);
  const updates: Record<string, unknown> = {
    [`leagues/${leagueId}/memberCount`]: Math.max(1, memberCount - 1),
    [`leagues/${leagueId}/updatedAt`]: Date.now(),
    [`leagues/${leagueId}/members/${userId}`]: null,
    [`leagues/${leagueId}/lineups/${userId}`]: null,
    [`users/${userId}/leagues/${leagueId}`]: null,
  };
  if (ban) updates[`leagues/${leagueId}/bannedUsers/${userId}`] = { at: Date.now(), by: actorId };

  // A banned player's drafted teams must immediately return to the market.
  // Use the current ownership context so this also releases teams acquired
  // through a trade or claim, not just the original draft picks.
  if (ban) {
    const ownership = await readOwnershipContext(leagueId, leagueValue);
    for (const [teamId, ownerId] of ownership.owners) {
      if (ownerId === userId) updates[`leagues/${leagueId}/teamOwnership/${ownership.effectiveWeek}/${teamId}`] = '_available';
    }
  }

  if (str(leagueValue.status) === 'waiting') {
    const draft = (await db().ref(`drafts/${leagueId}`).once('value')).val() as Record<string, unknown> | null;
    if (draft && Array.isArray(draft.order)) {
      updates[`drafts/${leagueId}/order`] = (draft.order as string[]).filter((uid) => uid !== userId);
    }
  }
  await db().ref().update(updates);
}

async function leaveLeague(claims: Claims, leagueId: string) {
  const leagueValue = await readLeague(leagueId);
  requireMember(leagueValue, claims.uid);
  if (str(leagueValue.commissionerId) === claims.uid) {
    throw new HttpError(409, 'failed-precondition', 'Transfer commissioner ownership or disband the league before leaving.');
  }
  if (str(leagueValue.status) === 'drafting') {
    throw new HttpError(409, 'failed-precondition', 'You cannot leave while the draft is live.');
  }
  await removeMembership(leagueId, leagueValue, claims.uid, false, claims.uid);
  return { ok: true };
}

async function banMember(claims: Claims, leagueId: string, body: unknown) {
  const leagueValue = await readLeague(leagueId);
  requireCommissioner(leagueValue, claims.uid);
  if (str(leagueValue.status) === 'drafting') {
    throw new HttpError(409, 'failed-precondition', 'Players cannot be banned while the draft is live.');
  }
  const raw = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const userId = typeof raw.userId === 'string' ? raw.userId : '';
  if (!membersOf(leagueValue)[userId]) throw new HttpError(404, 'not-found', 'That member is not in this league.');
  if (userId === claims.uid) throw new HttpError(400, 'invalid-argument', 'The commissioner cannot be banned.');
  await removeMembership(leagueId, leagueValue, userId, true, claims.uid);
  return { ok: true };
}

async function disbandLeague(claims: Claims, leagueId: string) {
  const leagueValue = await readLeague(leagueId);
  requireCommissioner(leagueValue, claims.uid);
  const updates: Record<string, unknown> = {
    [`leagues/${leagueId}`]: null,
    [`drafts/${leagueId}`]: null,
    [`system/leagueIds/${leagueId}`]: null,
    [`nfl/seasons/${num(leagueValue.season, 2026)}/projections/${leagueId}`]: null,
  };
  const joinCode = str(leagueValue.joinCode);
  if (joinCode) updates[`leagueCodes/${joinCode}`] = null;
  for (const userId of Object.keys(membersOf(leagueValue))) updates[`users/${userId}/leagues/${leagueId}`] = null;
  await db().ref().update(updates);
  return { ok: true };
}

async function updateLineup(claims: Claims, leagueId: string, body: unknown) {
  const leagueValue = await readLeague(leagueId);
  requireMember(leagueValue, claims.uid);
  const prefs = (leagueValue.prefs ?? {}) as Record<string, unknown>;
  if (prefs.benchEnabled !== true) throw new HttpError(409, 'failed-precondition', 'The bench is disabled for this league.');

  const raw = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  if (!Array.isArray(raw.benchedTeamIds)) throw new HttpError(400, 'invalid-argument', 'benchedTeamIds must be an array.');
  const benchedTeamIds = Array.from(new Set(raw.benchedTeamIds.filter((id): id is string => typeof id === 'string')));
  const benchSlots = Math.max(0, Math.min(16, num(prefs.benchSlots, 1)));
  const maxTeamsPerPlayer = Math.max(1, Math.min(16, num(prefs.maxTeamsPerPlayer, 16)));
  const maxActiveTeams = Math.max(1, Math.min(maxTeamsPerPlayer, num(prefs.maxActiveTeams, maxTeamsPerPlayer)));
  if (benchedTeamIds.length > benchSlots) throw new HttpError(400, 'invalid-argument', `This league allows ${benchSlots} bench slot${benchSlots === 1 ? '' : 's'}.`);

  const picks = (await db().ref(`drafts/${leagueId}/picks`).once('value')).val() as Record<string, Record<string, unknown>> | null;
  const owned = new Set(Object.values(picks ?? {}).filter((pick) => str(pick.userId) === claims.uid).map((pick) => str(pick.nflTeamId)));
  if (owned.size > maxTeamsPerPlayer) throw new HttpError(409, 'failed-precondition', 'Your existing roster exceeds this league’s total-team limit.');
  if (benchedTeamIds.some((teamId) => !owned.has(teamId))) throw new HttpError(403, 'forbidden', 'You can only bench teams you drafted.');
  if (owned.size - benchedTeamIds.length > maxActiveTeams) {
    throw new HttpError(400, 'invalid-argument', `You can have at most ${maxActiveTeams} active team${maxActiveTeams === 1 ? '' : 's'}.`);
  }

  const season = num(leagueValue.season, 2026);
  const games = await readSeasonGames(db(), season);
  const meta = await readCurrentMeta(db());
  const currentWeek = deriveActiveWeek(games, Date.now(), meta.currentWeek || 1);
  const lineupRef = db().ref(`leagues/${leagueId}/lineups/${claims.uid}/${currentWeek}`);
  const allLineups = (await db().ref(`leagues/${leagueId}/lineups/${claims.uid}`).once('value')).val() as Record<string, Record<string, unknown>> | null;
  const previousWeek = Object.keys(allLineups ?? {}).map(Number).filter((week) => week <= currentWeek).sort((a, b) => b - a)[0];
  const previousValue = previousWeek === undefined ? null : allLineups?.[String(previousWeek)] ?? null;
  const previous = new Set(Object.entries(previousValue ?? {}).filter(([teamId, value]) => teamId !== '_empty' && value === true).map(([teamId]) => teamId));

  if (prefs.benchLocksAtKickoff !== false) {
    const changed = new Set([...benchedTeamIds.filter((id) => !previous.has(id)), ...Array.from(previous).filter((id) => !benchedTeamIds.includes(id))]);
    const locked = games.some((game) => {
      const changedTeamPlays = changed.has(game.homeTeamId) || changed.has(game.awayTeamId);
      return game.week === currentWeek && changedTeamPlays &&
        (Date.parse(game.date) <= Date.now() || game.status === 'in_progress' || game.status === 'halftime' || game.final);
    });
    if (locked) throw new HttpError(409, 'failed-precondition', 'A changed team has already kicked off this week.');
  }

  await lineupRef.set(benchedTeamIds.length > 0 ? Object.fromEntries(benchedTeamIds.map((teamId) => [teamId, true])) : { _empty: true });
  return { ok: true, week: currentWeek, benchedTeamIds };
}

interface OwnershipContext {
  currentWeek: number;
  effectiveWeek: number;
  owners: Map<string, string>;
}

async function readOwnershipContext(leagueId: string, leagueValue: Record<string, unknown>): Promise<OwnershipContext> {
  const season = num(leagueValue.season, 2026);
  const games = await readSeasonGames(db(), season);
  const meta = await readCurrentMeta(db());
  const currentWeek = deriveActiveWeek(games, Date.now(), meta.currentWeek || 1);
  const weekStarted = games.some((game) => game.week === currentWeek &&
    (Date.parse(game.date) <= Date.now() || game.status === 'in_progress' || game.status === 'halftime' || game.final));
  const effectiveWeek = weekStarted ? Math.min(18, currentWeek + 1) : currentWeek;
  const owners = new Map<string, string>();
  const picks = (await db().ref(`drafts/${leagueId}/picks`).once('value')).val() as Record<string, Record<string, unknown>> | null;
  for (const pick of Object.values(picks ?? {})) {
    const teamId = str(pick.nflTeamId);
    const userId = str(pick.userId);
    if (teamId && userId) owners.set(teamId, userId);
  }
  const history = (leagueValue.teamOwnership && typeof leagueValue.teamOwnership === 'object'
    ? leagueValue.teamOwnership
    : {}) as Record<string, Record<string, string>>;
  for (const week of Object.keys(history).map(Number).filter((week) => week <= effectiveWeek).sort((a, b) => a - b)) {
    for (const [teamId, userId] of Object.entries(history[String(week)] ?? {})) owners.set(teamId, userId);
  }
  return { currentWeek, effectiveWeek, owners };
}

function currentBenchFor(leagueValue: Record<string, unknown>, userId: string, week: number): string[] {
  const lineups = (leagueValue.lineups && typeof leagueValue.lineups === 'object'
    ? leagueValue.lineups
    : {}) as Record<string, Record<string, Record<string, unknown>>>;
  const snapshots = lineups[userId] ?? {};
  const snapshotWeek = Object.keys(snapshots).map(Number).filter((value) => value <= week).sort((a, b) => b - a)[0];
  if (snapshotWeek === undefined) return [];
  return Object.entries(snapshots[String(snapshotWeek)] ?? {})
    .filter(([teamId, value]) => teamId !== '_empty' && value === true)
    .map(([teamId]) => teamId);
}

async function getTeamMarket(claims: Claims, leagueId: string) {
  const leagueValue = await readLeague(leagueId);
  requireMember(leagueValue, claims.uid);
  const context = await readOwnershipContext(leagueId, leagueValue);
  const members = membersOf(leagueValue);
  const tradesSnapshot = await db().ref(`leagues/${leagueId}/trades`).once('value');
  const trades: Array<Record<string, unknown> & { id: string }> = tradesSnapshot.exists()
    ? Object.entries(tradesSnapshot.val() as Record<string, Record<string, unknown>>).map(([id, value]) => ({ id, ...value }))
    : [];
  return {
    enabled: ((leagueValue.prefs ?? {}) as Record<string, unknown>).tradingEnabled === true,
    effectiveWeek: context.effectiveWeek,
    teams: Object.keys(NFL_TEAMS_BY_ID).map((teamId) => {
      const ownerId = context.owners.get(teamId);
      const member = ownerId && ownerId !== '_available' ? memberValue(members, ownerId) : null;
      return { teamId, ownerId: member ? ownerId : null, ownerName: member ? str(member.displayName, 'Player') : null };
    }),
    trades: trades.filter((trade) => str(trade.fromUserId) === claims.uid || str(trade.toUserId) === claims.uid),
  };
}

async function claimAvailableTeam(claims: Claims, leagueId: string, teamId: string) {
  const leagueValue = await readLeague(leagueId);
  requireMember(leagueValue, claims.uid);
  const prefs = (leagueValue.prefs ?? {}) as Record<string, unknown>;
  if (prefs.tradingEnabled !== true) throw new HttpError(409, 'failed-precondition', 'Player trading is disabled.');
  if (!NFL_TEAMS_BY_ID[teamId]) throw new HttpError(404, 'not-found', 'NFL team not found.');
  const context = await readOwnershipContext(leagueId, leagueValue);
  const ownerId = context.owners.get(teamId);
  if (ownerId && ownerId !== '_available' && membersOf(leagueValue)[ownerId]) throw new HttpError(409, 'already-exists', 'That team already has an owner.');
  const owned = Array.from(context.owners.entries()).filter(([, uid]) => uid === claims.uid).map(([id]) => id);
  const maxTeams = Math.max(1, Math.min(16, num(prefs.maxTeamsPerPlayer, 16)));
  if (owned.length >= maxTeams) throw new HttpError(409, 'failed-precondition', 'Your roster is already full.');

  const updates: Record<string, unknown> = {
    [`leagues/${leagueId}/teamOwnership/${context.effectiveWeek}/${teamId}`]: claims.uid,
  };
  const maxActive = Math.max(1, Math.min(maxTeams, num(prefs.maxActiveTeams, maxTeams)));
  if (prefs.benchEnabled === true && owned.length >= maxActive) {
    const bench = currentBenchFor(leagueValue, claims.uid, context.effectiveWeek);
    const slots = Math.max(0, Math.min(16, num(prefs.benchSlots, 1)));
    if (bench.length >= slots) throw new HttpError(409, 'failed-precondition', 'Your active roster and bench are full.');
    const nextBench = [...bench, teamId];
    updates[`leagues/${leagueId}/lineups/${claims.uid}/${context.effectiveWeek}`] = Object.fromEntries(nextBench.map((id) => [id, true]));
  }
  await db().ref().update(updates);
  return { ok: true, effectiveWeek: context.effectiveWeek };
}

async function proposeTrade(claims: Claims, leagueId: string, body: unknown) {
  const leagueValue = await readLeague(leagueId);
  requireMember(leagueValue, claims.uid);
  const prefs = (leagueValue.prefs ?? {}) as Record<string, unknown>;
  if (prefs.tradingEnabled !== true) throw new HttpError(409, 'failed-precondition', 'Player trading is disabled.');
  const raw = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const offeredTeamId = str(raw.offeredTeamId);
  const requestedTeamId = str(raw.requestedTeamId);
  const context = await readOwnershipContext(leagueId, leagueValue);
  const toUserId = context.owners.get(requestedTeamId) ?? '';
  if (context.owners.get(offeredTeamId) !== claims.uid) throw new HttpError(403, 'forbidden', 'You do not own the offered team.');
  if (!toUserId || toUserId === '_available' || toUserId === claims.uid || !membersOf(leagueValue)[toUserId]) {
    throw new HttpError(400, 'invalid-argument', 'Choose a team owned by another player.');
  }
  const ref = db().ref(`leagues/${leagueId}/trades`).push();
  await ref.set({ fromUserId: claims.uid, toUserId, offeredTeamId, requestedTeamId, status: 'pending', createdAt: Date.now() });
  return { ok: true, tradeId: ref.key };
}

async function respondToTrade(claims: Claims, leagueId: string, tradeId: string, body: unknown) {
  const leagueValue = await readLeague(leagueId);
  requireMember(leagueValue, claims.uid);
  const prefs = (leagueValue.prefs ?? {}) as Record<string, unknown>;
  if (prefs.tradingEnabled !== true) throw new HttpError(409, 'failed-precondition', 'Player trading is disabled.');
  const ref = db().ref(`leagues/${leagueId}/trades/${tradeId}`);
  const snapshot = await ref.once('value');
  if (!snapshot.exists()) throw new HttpError(404, 'not-found', 'Trade offer not found.');
  const trade = snapshot.val() as Record<string, unknown>;
  if (str(trade.toUserId) !== claims.uid) throw new HttpError(403, 'forbidden', 'Only the receiving player can answer this offer.');
  if (str(trade.status) !== 'pending') throw new HttpError(409, 'failed-precondition', 'This trade offer is already closed.');
  const accept = body && typeof body === 'object' && (body as Record<string, unknown>).accept === true;
  if (!accept) {
    await ref.update({ status: 'rejected', respondedAt: Date.now() });
    return { ok: true, status: 'rejected' };
  }
  const context = await readOwnershipContext(leagueId, leagueValue);
  const offeredTeamId = str(trade.offeredTeamId);
  const requestedTeamId = str(trade.requestedTeamId);
  const fromUserId = str(trade.fromUserId);
  if (context.owners.get(offeredTeamId) !== fromUserId || context.owners.get(requestedTeamId) !== claims.uid) {
    throw new HttpError(409, 'failed-precondition', 'Team ownership changed after this offer was created.');
  }
  const updates: Record<string, unknown> = {
    [`leagues/${leagueId}/teamOwnership/${context.effectiveWeek}/${offeredTeamId}`]: claims.uid,
    [`leagues/${leagueId}/teamOwnership/${context.effectiveWeek}/${requestedTeamId}`]: fromUserId,
    [`leagues/${leagueId}/trades/${tradeId}/status`]: 'accepted',
    [`leagues/${leagueId}/trades/${tradeId}/respondedAt`]: Date.now(),
  };
  for (const [userId, outgoing, incoming] of [[fromUserId, offeredTeamId, requestedTeamId], [claims.uid, requestedTeamId, offeredTeamId]] as const) {
    const bench = currentBenchFor(leagueValue, userId, context.effectiveWeek);
    if (bench.includes(outgoing)) {
      const next = bench.map((id) => id === outgoing ? incoming : id);
      updates[`leagues/${leagueId}/lineups/${userId}/${context.effectiveWeek}`] = Object.fromEntries(next.map((id) => [id, true]));
    }
  }
  await db().ref().update(updates);
  return { ok: true, status: 'accepted', effectiveWeek: context.effectiveWeek };
}

async function updateProfile(claims: Claims, body: unknown) {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const patchUser: { displayName?: string; photoURL?: string } = {};
  const patchData: Record<string, unknown> = { updatedAt: Date.now() };

  if (raw.displayName !== undefined) {
    const displayName = requireString(raw.displayName, 'Display name', DISPLAY_NAME_MIN, DISPLAY_NAME_MAX);
    patchUser.displayName = displayName;
    patchData.displayName = displayName;
  }
  if (raw.photoURL !== undefined) {
    if (raw.photoURL === null) {
      patchUser.photoURL = '';
      patchData.photoURL = null;
    } else if (typeof raw.photoURL === 'string' && raw.photoURL.trim() !== '') {
      patchUser.photoURL = raw.photoURL.trim();
      patchData.photoURL = patchUser.photoURL;
    } else {
      throw new HttpError(400, 'invalid-argument', 'Photo URL must be a valid URL or null.');
    }
  }

  if (patchUser.displayName !== undefined || patchUser.photoURL !== undefined) {
    await getApp().auth().updateUser(claims.uid, patchUser);
  }

  await db().ref(`users/${claims.uid}`).update(patchData);

  // Keep league member records in sync so names/photos update everywhere.
  const memberPatch: Record<string, unknown> = {};
  if (patchData.displayName !== undefined) memberPatch.displayName = patchData.displayName;
  if (patchData.photoURL !== undefined) memberPatch.photoURL = patchData.photoURL;
  if (Object.keys(memberPatch).length > 0) {
    const index = await db().ref(`users/${claims.uid}/leagues`).once('value');
    if (index.exists()) {
      const leagueIds = Object.keys(index.val() as Record<string, unknown>);
      for (const leagueId of leagueIds) {
        await db()
          .ref(`leagues/${leagueId}/members/${claims.uid}`)
          .update(memberPatch)
          .catch(() => undefined);
      }
    }
  }

  const profile = await getOrCreateProfile(claims);
  return profile;
}

/* ─────────────────────────────── dispatcher ─────────────────────────────── */

function dispatch(
  method: string,
  segments: string[],
  claims: Claims | null,
  rawBody: string | null,
  query: QueryParams,
) {
  const body = (() => {
    if (!rawBody || rawBody.trim() === '') return {};
    try {
      return JSON.parse(rawBody) as unknown;
    } catch {
      throw new HttpError(400, 'invalid-argument', 'Request body must be valid JSON.');
    }
  })();

  // Health check — no auth required.
  if (method === 'GET' && segments.length === 0) {
    return { ok: true, service: 'fantasy-teams-api', time: Date.now() };
  }

  if (!claims) throw new HttpError(401, 'unauthenticated', 'You must be signed in.');

  if (method === 'GET' && segments.length === 1 && segments[0] === 'me') {
    return getOrCreateProfile(claims);
  }
  if (method === 'PATCH' && segments.length === 1 && segments[0] === 'me') {
    return updateProfile(claims, body);
  }

  if (method === 'GET' && segments[0] === 'leagues' && segments[1] === 'mine' && segments.length === 2) {
    return getMyLeagues(claims);
  }
  if (method === 'POST' && segments[0] === 'leagues' && segments.length === 1) {
    return createLeague(claims, body);
  }
  if (method === 'POST' && segments[0] === 'leagues' && segments[1] === 'join' && segments.length === 2) {
    return joinLeague(claims, body);
  }
  if (method === 'GET' && segments[0] === 'leagues' && segments[1] === 'by-code' && segments.length === 3) {
    return getLeaguePreview(claims, validJoinCode(segments[2]));
  }
  if (method === 'GET' && segments[0] === 'leagues' && segments.length === 2) {
    return getLeagueDetail(claims, segments[1]);
  }
  if (method === 'PATCH' && segments[0] === 'leagues' && segments[2] === 'ready' && segments.length === 3) {
    return setReady(claims, segments[1], body);
  }
  if (method === 'PATCH' && segments[0] === 'leagues' && segments.length === 2) {
    return updateLeagueSettings(claims, segments[1], body);
  }

  // Draft routes: /leagues/:id/draft…
  if (segments[0] === 'leagues' && segments[2] === 'draft') {
    return dispatchDraft(method, segments, claims, body);
  }

  // NFL data (any signed-in user)
  if (method === 'GET' && segments[0] === 'nfl' && segments[1] === 'meta' && segments.length === 2) {
    return getNflMeta();
  }
  if (method === 'GET' && segments[0] === 'nfl' && segments[1] === 'games' && segments.length === 2) {
    return getNflGames(query);
  }
  if (method === 'GET' && segments[0] === 'nfl' && segments[1] === 'external' && segments.length === 2) {
    return getNflExternal(query);
  }
  if (method === 'GET' && segments[0] === 'nfl' && segments[1] === 'team' && segments.length === 3) {
    return getNflTeam(claims, segments[2] as string, query);
  }

  // League season
  if (method === 'GET' && segments[0] === 'leagues' && segments[2] === 'standings' && segments.length === 3) {
    return getLeagueStandings(claims, segments[1] as string, query);
  }
  if (method === 'GET' && segments[0] === 'leagues' && segments[2] === 'insights' && segments.length === 3) {
    return getLeagueInsightsHandler(claims, segments[1] as string);
  }
  if (method === 'PATCH' && segments[0] === 'leagues' && segments[2] === 'prefs' && segments.length === 3) {
    return updateLeaguePrefs(claims, segments[1] as string, body);
  }
  if (method === 'PATCH' && segments[0] === 'leagues' && segments[2] === 'lineup' && segments.length === 3) {
    return updateLineup(claims, segments[1] as string, body);
  }
  if (method === 'GET' && segments[0] === 'leagues' && segments[2] === 'market' && segments.length === 3) {
    return getTeamMarket(claims, segments[1] as string);
  }
  if (method === 'POST' && segments[0] === 'leagues' && segments[2] === 'market' && segments[3] === 'claim' && segments.length === 5) {
    return claimAvailableTeam(claims, segments[1] as string, segments[4] as string);
  }
  if (method === 'POST' && segments[0] === 'leagues' && segments[2] === 'trades' && segments.length === 3) {
    return proposeTrade(claims, segments[1] as string, body);
  }
  if (method === 'POST' && segments[0] === 'leagues' && segments[2] === 'trades' && segments[4] === 'respond' && segments.length === 5) {
    return respondToTrade(claims, segments[1] as string, segments[3] as string, body);
  }
  if (method === 'POST' && segments[0] === 'leagues' && segments[2] === 'leave' && segments.length === 3) {
    return leaveLeague(claims, segments[1] as string);
  }
  if (method === 'POST' && segments[0] === 'leagues' && segments[2] === 'announcement' && segments.length === 3) {
    return setAnnouncement(claims, segments[1] as string, body);
  }
  if (method === 'POST' && segments[0] === 'leagues' && segments[2] === 'reset-ready' && segments.length === 3) {
    return resetMemberReady(claims, segments[1] as string);
  }
  if (method === 'POST' && segments[0] === 'leagues' && segments[2] === 'commissioner' && segments.length === 3) {
    return transferCommissioner(claims, segments[1] as string, body);
  }
  if (method === 'POST' && segments[0] === 'leagues' && segments[2] === 'member' && segments[3] === 'remove' && segments.length === 4) {
    return removeMember(claims, segments[1] as string, body);
  }
  if (method === 'POST' && segments[0] === 'leagues' && segments[2] === 'member' && segments[3] === 'ban' && segments.length === 4) {
    return banMember(claims, segments[1] as string, body);
  }
  if (method === 'DELETE' && segments[0] === 'leagues' && segments.length === 2) {
    return disbandLeague(claims, segments[1] as string);
  }
  if (method === 'POST' && segments[0] === 'leagues' && segments[2] === 'sync' && segments.length === 3) {
    return manualSyncScores(claims, segments[1] as string);
  }

  throw new HttpError(404, 'not-found', 'Unknown endpoint.');
}

/* ─────────────────────────────── handler ─────────────────────────────── */

/**
 * Central request logging: every call logs method, path, caller, status, error
 * code/message, and duration, so production issues (like join failures) are
 * traceable without guessing. Logs are JSON lines for easy search in Netlify.
 */
function requestLog(level: 'info' | 'warn' | 'error', entry: Record<string, unknown>): void {
  const line = JSON.stringify({ level, ts: new Date().toISOString(), ...entry });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const startedAt = Date.now();
  const baseLog = {
    method: event.httpMethod,
    path: event.path,
    fn: 'api',
  };

  try {
    getApp(); // fail fast if the service account is missing
    const segments = parseSegments(event.path);

    // Health check is the only unauthenticated endpoint.
    const isHealth = event.httpMethod === 'GET' && segments.length === 0;
    const claims = isHealth ? null : await authenticate(event);

    const result = await dispatch(
      event.httpMethod,
      segments,
      claims,
      event.body ?? null,
      event.queryStringParameters ?? {},
    );
    requestLog('info', { ...baseLog, uid: claims?.uid ?? null, status: 200, durationMs: Date.now() - startedAt });
    return json(200, result);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (error instanceof HttpError) {
      requestLog('warn', { ...baseLog, status: error.statusCode, code: error.code, message: error.message, durationMs });
      return json(error.statusCode, { code: error.code, message: error.message });
    }
    requestLog('error', { ...baseLog, status: 500, code: 'internal', message: error instanceof Error ? error.message : 'Unknown error', durationMs });
    console.error(error);
    return json(500, { code: 'internal', message: 'Unexpected server error.' });
  }
};
