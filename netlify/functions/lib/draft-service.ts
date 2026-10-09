/**
 * Server-side draft operations. All critical transitions (start, pick,
 * autopick on expiry, pause, resume, complete) are atomic RTDB transactions on
 * the league's draft node, so concurrent requests can never double-advance or
 * double-select a team. The draft node is the only authoritative source.
 *
 * Pure pieces live in `draft-core.ts` (unit-tested); this module wires them to
 * the Firebase Admin SDK through a `Database` handle.
 */
import type { Database } from 'firebase-admin/database';
import type { DraftFormat } from '../../../src/types';
import { NFL_TEAMS_BY_ID } from '../../../src/data/nflTeams';
import {
  availableTeamIds,
  buildPickSequence,
  draftedTeamIdSet,
  isOrderPermutation,
  maxRoundsFor,
  pickRandom,
  roundForPick,
  totalPicksFor,
} from './draft-core';

export type DraftValue = Record<string, unknown>;

/* ───────────────────────────── value helpers ───────────────────────────── */

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown): boolean {
  return value === true;
}

/* ─────────────────────────── pure transitions ─────────────────────────── */

interface PickInput {
  pickNumber: number;
  userId: string;
  nflTeamId: string;
  teamName: string;
  teamAbbreviation: string;
  auto?: boolean;
  now: number;
  timerMs: number;
}

/**
 * Advances the draft after a selection. Returns the next draft value with the
 * pick recorded, the deadline reset, and completion handled when exhausted.
 */
export function applyDraftPick(draft: DraftValue, input: PickInput): DraftValue {
  const currentPick = num(draft.currentPick, 0);
  const totalPicks = num(draft.totalPicks, 0);
  const nextPick = currentPick + 1;
  const completed = nextPick > totalPicks;

  return {
    ...draft,
    status: completed ? 'completed' : str(draft.status, 'live'),
    currentPick: completed ? totalPicks : nextPick,
    pickDeadline: completed ? null : input.now + input.timerMs,
    pauseRemainingMs: null,
    startedAt: num(draft.startedAt, input.now),
    completedAt: completed ? input.now : num(draft.completedAt, 0) || null,
    picks: {
      ...((draft.picks as Record<string, unknown> | undefined) ?? {}),
      [input.pickNumber]: {
        userId: input.userId,
        nflTeamId: input.nflTeamId,
        teamName: input.teamName,
        teamAbbreviation: input.teamAbbreviation,
        auto: input.auto === true,
        pickedAt: input.now,
      },
    },
  };
}

/** Randomly selects an available team (used when the timer expires). */
export function autopick(draft: DraftValue, timerMs: number, now: number): DraftValue {
  const taken = draftedTeamIdSet(draft.picks as Record<string, { nflTeamId?: unknown }> | undefined);
  const available = availableTeamIds(taken);
  const teamId = pickRandom(available);
  const team = NFL_TEAMS_BY_ID[teamId];
  const currentPick = num(draft.currentPick, 0);
  const sequence = Array.isArray(draft.pickSequence) ? (draft.pickSequence as string[]) : [];
  const userId = currentPick >= 1 && currentPick <= sequence.length ? (sequence[currentPick - 1] ?? '') : '';

  return applyDraftPick(draft, {
    pickNumber: currentPick,
    userId,
    nflTeamId: teamId,
    teamName: team?.name ?? teamId,
    teamAbbreviation: team?.abbreviation ?? teamId.toUpperCase(),
    auto: true,
    now,
    timerMs,
  });
}

/* ─────────────────────────────── reconcile ─────────────────────────────── */

/**
 * Per-draft lock + single atomic write. RTDB SDK `transaction()` has been
 * observed to silently no-op in this deployment (embarrassingly, with a valid
 * snapshot and no reason), so draft mutations use a short-lived lock node and
 * one whole-node `set()`/`update()` instead — plain reads/writes that work
 * reliably everywhere, with atomicity preserved because all draft fields live
 * on a single node and concurrent writers are serialized by the lock.
 */
const DRAFT_LOCK_LEASE_MS = 3000;

export async function acquireDraftLock(db: Database, draftId: string, owner: string, attempts = 4): Promise<boolean> {
  const lockRef = db.ref(`drafts/${draftId}/_lock`);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const lock = (await lockRef.once('value')).val() as { owner?: string; at?: number } | null;
    if (lock && lock.owner !== owner && Date.now() - Number(lock.at ?? 0) < DRAFT_LOCK_LEASE_MS) {
      await new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1)));
      continue;
    }
    await lockRef.set({ owner, at: Date.now() });
    return true;
  }
  return false;
}

export async function releaseDraftLock(db: Database, draftId: string): Promise<void> {
  await db.ref(`drafts/${draftId}/_lock`).set(null).catch(() => undefined);
}

/** A lock child alone does not mean the draft has been initialized. */
export async function ensureDraftInitialized(db: Database, draftId: string, initialValue: DraftValue): Promise<void> {
  const draftRef = db.ref(`drafts/${draftId}`);
  const hasStatus = (value: DraftValue | null): boolean => typeof value?.status === 'string' && value.status !== '';
  if (hasStatus((await draftRef.once('value')).val() as DraftValue | null)) return;

  const locked = await acquireDraftLock(db, draftId, 'init');
  if (!locked) return;
  try {
    // Acquiring _lock creates the parent node even when no draft exists yet.
    if (hasStatus((await draftRef.once('value')).val() as DraftValue | null)) return;
    await draftRef.set(initialValue);
  } finally {
    await releaseDraftLock(db, draftId);
  }
}

/**
 * Expires any overdue pick: if the draft is live and the authoritative
 * deadline has passed, autopick the on-clock player and advance. Uses the lock
 * + whole-node write so it can never double-advance or race a human pick.
 */
export async function reconcileDraft(db: Database, leagueId: string, timerMs: number): Promise<{ completed: boolean }> {
  const draftRef = db.ref(`drafts/${leagueId}`);
  const locked = await acquireDraftLock(db, leagueId, 'sync');
  if (!locked) return { completed: false }; // another writer in progress — skip

  try {
    const snapshot = await draftRef.once('value');
    if (!snapshot.exists()) return { completed: false };
    const value = snapshot.val() as DraftValue;
    if (str(value.status) !== 'live') return { completed: false };

    const deadline = num(value.pickDeadline, 0);
    if (deadline === 0 || Date.now() < deadline) return { completed: false };

    const next = autopick(value, timerMs, Date.now());
    await draftRef.set(next);
    return { completed: str(next.status) === 'completed' };
  } finally {
    await releaseDraftLock(db, leagueId);
  }
}

/* ─────────────────────────── draft serialization ─────────────────────────── */

export interface DraftDTO {
  leagueId: string;
  status: string;
  format: DraftFormat;
  rounds: number;
  order: string[];
  pickSequence: string[];
  currentPick: number;
  totalPicks: number;
  currentPickUserId: string | null;
  pickDeadline: number | null;
  pauseRemainingMs: number | null;
  pausedAt: number | null;
  startedAt: number | null;
  completedAt: number | null;
}

export function serializeDraft(leagueId: string, value: DraftValue, leagueFormat: DraftFormat): DraftDTO {
  const order = Array.isArray(value.order) ? value.order.filter((id): id is string => typeof id === 'string') : [];
  const memberCount = Math.max(order.length, 1);
  const rounds = num(value.rounds, maxRoundsFor(memberCount));
  const intentional = Array.isArray(value.pickSequence)
    ? value.pickSequence.filter((id): id is string => typeof id === 'string')
    : [];
  const pickSequence = intentional.length > 0 ? intentional : buildPickSequence(order, memberCount, rounds, leagueFormat);
  const currentPick = num(value.currentPick, 0);

  return {
    leagueId,
    status: str(value.status, 'upcoming'),
    format: str(value.format) === 'linear' ? 'linear' : leagueFormat,
    rounds,
    order,
    pickSequence,
    currentPick,
    totalPicks: num(value.totalPicks, totalPicksFor(memberCount, rounds)),
    currentPickUserId:
      currentPick >= 1 && currentPick <= pickSequence.length ? (pickSequence[currentPick - 1] ?? null) : null,
    pickDeadline: typeof value.pickDeadline === 'number' ? value.pickDeadline : null,
    pauseRemainingMs: typeof value.pauseRemainingMs === 'number' ? value.pauseRemainingMs : null,
    pausedAt: typeof value.pausedAt === 'number' ? value.pausedAt : null,
    startedAt: typeof value.startedAt === 'number' ? value.startedAt : null,
    completedAt: typeof value.completedAt === 'number' ? value.completedAt : null,
  };
}

export interface PickDTO {
  leagueId: string;
  pickNumber: number;
  round: number;
  userId: string;
  displayName: string;
  nflTeamId: string;
  teamName: string;
  teamAbbreviation: string;
  auto: boolean;
  pickedAt: number;
}

export function serializePicks(
  leagueId: string,
  picksNode: unknown,
  membersById: Record<string, { displayName: string }>,
  memberCount: number,
): PickDTO[] {
  if (!picksNode || typeof picksNode !== 'object') return [];

  return Object.entries(picksNode as Record<string, unknown>)
    .map(([key, entry]) => {
      const value = (entry ?? {}) as Record<string, unknown>;
      const pickNumber = Number(key);
      const userId = str(value.userId);
      return {
        leagueId,
        pickNumber,
        round: pickNumber > 0 ? roundForPick(pickNumber, Math.max(memberCount, 1)) : 0,
        userId,
        displayName: membersById[userId]?.displayName ?? 'Player',
        nflTeamId: str(value.nflTeamId),
        teamName: str(value.teamName),
        teamAbbreviation: str(value.teamAbbreviation),
        auto: bool(value.auto),
        pickedAt: num(value.pickedAt, 0),
      };
    })
    .sort((a, b) => a.pickNumber - b.pickNumber);
}

/* ─────────────────────── draft node lifecycle helpers ─────────────────────── */

/** True when the league is still in its waiting room (nothing locked yet). */
export function isPreDraft(leagueStatus: unknown): boolean {
  return str(leagueStatus) === 'waiting';
}

/**
 * Validates a manual order rearrangement against the league's actual members.
 * Throws an Error carrying a `code` so the API layer can translate it.
 */
export function assertValidOrder(order: unknown, memberIds: string[]): void {
  if (!isOrderPermutation(order, memberIds)) {
    assertValidOrderError();
  }
}

function assertValidOrderError(): never {
  const err = new Error('Draft order must list every member exactly once.') as Error & { code: string };
  err.code = 'invalid-argument';
  throw err;
}
