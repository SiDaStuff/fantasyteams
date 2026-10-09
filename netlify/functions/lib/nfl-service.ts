/**
 * NFL data service — provider client + scheduled synchronization.
 *
 * Provider: ESPN's public web API (free, keyless). Verified live (2026 season):
 * both the scoreboard and team-schedule endpoints return `events` at the top
 * level with the same event shape (`id`, `week`, `competitions[0]`,
 * `status.type`, scores as object-or-string).
 *
 * Sync design:
 *  - Atomic RTDB lock prevents overlapping scheduled/manual syncs.
 *  - Games are upserted by provider id; a `scoresHash` prevents rewrites when
 *    nothing changed (no duplicate records, minimal provider load).
 *  - Regular-season games only (`seasontype=2`); week/season supported.
 *  - Payloads are validated (not treated as valid just because HTTP 200):
 *    events must reference known teams and parse into `NflGame`s before they
 *    are stored.
 *  - Team records + fantasy standings are always RECOMPUTED from stored games,
 *    so corrected finals propagate everywhere automatically.
 */
import type { Database } from 'firebase-admin/database';
import { NFL_TEAMS } from '../../../src/data/nflTeams';
import { computeTeamRecords } from './scoring-core';
import { extractEvents, normalizeGames, parseScoreboard } from './espn-parse';
import { runLeagueActivitySync } from './season-service';
import { buildProviderUrl } from './urls';
import { decideLock, type LockState } from './lock';
import type { NflGame } from '../../../src/types';

/**
 * Provider endpoints, tried in order. `site.api.espn.com` is the primary (the
 * classic scoreboard + schedule host); the web host is the mirror.
 * `NFL_API_BASE` (server-only env) overrides the chain entirely.
 */
const DEFAULT_PROVIDER_BASES = [
  'https://site.api.espn.com/apis/site/v2/sports/football/nfl',
  'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl',
];
const FETCH_TIMEOUT_MS = 12000;
const MAX_ATTEMPTS = 2;
const LOCK_LEASE_MS = 15 * 60 * 1000;
const SYNC_COOLDOWN_MS = 5 * 60 * 1000;

/** Regular-season week count (seeded on first sync so projections see the full slate). */
const SCHEDULE_WEEKS = 18;
/** When the provider is unreachable, back off at least this long before retrying. */
const ERROR_COOLDOWN_MS = 30 * 60 * 1000;

/** Captures upstream failures with full URL + status + content type + body, minus credentials. */
const LOG_SNIPPET_LENGTH = 320;

function sanitizeSnippet(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > LOG_SNIPPET_LENGTH ? `${compact.slice(0, LOG_SNIPPET_LENGTH)}…` : compact;
}

function logUpstream(context: string, info: Record<string, unknown>): void {
  console.warn(JSON.stringify({ level: 'warn', source: 'nfl-sync', context, ts: new Date().toISOString(), ...info }));
}

async function fetchNfl<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const envBase = process.env.NFL_API_BASE?.trim();
  const bases = envBase ? [envBase, ...DEFAULT_PROVIDER_BASES] : DEFAULT_PROVIDER_BASES;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    for (const base of bases) {
      // One slash between base and endpoint, params encoded via URLSearchParams.
      const url = buildProviderUrl(base, path, params);
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'FantasyTeams/1.0 (netlify function)' },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        const contentType = response.headers.get('content-type') ?? '';
        const text = await response.text();

        if (!response.ok) {
          logUpstream(`http:${path}`, { url, status: response.status, contentType, body: sanitizeSnippet(text) });
          lastError = new Error(`Provider responded ${response.status} for ${path}`);
          continue;
        }

        try {
          return JSON.parse(text) as T;
        } catch {
          logUpstream(`json:${path}`, { url, status: response.status, contentType, body: sanitizeSnippet(text) });
          lastError = new Error(`Invalid JSON from provider for ${path}`);
        }
      } catch (error) {
        lastError = error;
        logUpstream(`network:${path}`, { url, error: error instanceof Error ? error.message : 'network error' });
      }
    }
    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unknown provider error.');
}

/* ─────────────────────────── normalizers ─────────────────────────── */

function scoresHash(game: NflGame): string {
  return [
    game.status,
    game.period,
    game.clock,
    game.homeScore ?? '-',
    game.awayScore ?? '-',
    game.detail,
  ].join('|');
}

/**
 * Derives the week users should see from normalized schedule state. Provider
 * metadata is useful, but it can lag at week boundaries or point at preseason.
 */
export function deriveActiveWeek(games: readonly NflGame[], now = Date.now(), fallback = 1): number {
  const regular = games.filter((game) => game.week >= 1 && game.week <= SCHEDULE_WEEKS && !game.postponed);
  const liveWeeks = regular
    .filter((game) => game.status === 'in_progress' || game.status === 'halftime')
    .map((game) => game.week);
  if (liveWeeks.length > 0) return Math.min(...liveWeeks);

  const scheduled = regular
    .filter((game) => game.status === 'scheduled' && Date.parse(game.date) >= now - 6 * 60 * 60 * 1000)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (scheduled[0]) return scheduled[0].week;

  const completed = regular
    .filter((game) => game.final && Date.parse(game.date) <= now)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  if (completed[0]) return completed[0].week;

  return Math.min(SCHEDULE_WEEKS, Math.max(1, fallback));
}

/* ─────────────────────────── reads (from cache) ─────────────────────────── */

interface SeasonMeta {
  season: number;
  currentWeek: number;
  lastSyncAt: number;
  lastFullSyncWeek: number;
  provider: string;
  /** Epoch ms of the last provider failure; used to back off retries. */
  lastErrorAt: number;
}

export interface SeasonMetaRecord extends SeasonMeta {
  lastError?: { message?: string; at?: number };
}

type CachedGame = NflGame & { scoresHash?: string; updatedAt?: number };

export async function readCurrentMeta(db: Database): Promise<SeasonMeta> {
  const snapshot = await db.ref('nfl/current').once('value');
  const value = (snapshot.exists() ? snapshot.val() : {}) as Record<string, unknown>;
  const meta = (
    value.season ? await db.ref(`nfl/seasons/${String(value.season)}/meta`).once('value') : null
  )?.val() as Record<string, unknown> | null;

  return {
    season: Number(value.season ?? meta?.season ?? 0),
    currentWeek: Number(value.currentWeek ?? meta?.currentWeek ?? 0),
    lastSyncAt: typeof (value.lastSyncAt ?? meta?.lastSyncAt) === 'number' ? Number(value.lastSyncAt ?? meta?.lastSyncAt) : 0,
    lastFullSyncWeek: Number(meta?.lastFullSyncWeek ?? 0),
    provider: String(meta?.provider ?? 'espn'),
    lastErrorAt: Number(meta?.lastErrorAt ?? 0),
  };
}

export async function readSeasonGames(db: Database, season: number): Promise<CachedGame[]> {
  const snapshot = await db.ref(`nfl/seasons/${season}/games`).once('value');
  if (!snapshot.exists()) return [];
  const map = snapshot.val() as Record<string, unknown>;
  return Object.values(map)
    .map((entry) => entry as CachedGame)
    .filter((game) => game && typeof game.id === 'string');
}

/**
 * Resolves the season to sync. Prefers the provider/cache season; otherwise
 * falls back to the season configured on the leagues in `/system/leagueIds`
 * (all default to 2026), and finally to 2026.
 */
export async function resolveSeason(db: Database): Promise<number> {
  const meta = await readCurrentMeta(db);
  if (meta.season > 0) return meta.season;

  const counts = new Map<number, number>();
  const idsSnap = await db.ref('system/leagueIds').once('value');
  if (idsSnap.exists()) {
    for (const leagueId of Object.keys(idsSnap.val() as Record<string, unknown>)) {
      const season = Number((await db.ref(`leagues/${leagueId}/season`).once('value')).val());
      if (Number.isInteger(season) && season >= 2024 && season <= 2031) {
        counts.set(season, (counts.get(season) ?? 0) + 1);
      }
      if (counts.size >= 8) break; // enough signal
    }
  }

  let best = 2026;
  let bestCount = 0;
  for (const [season, count] of counts.entries()) {
    if (count > bestCount) {
      bestCount = count;
      best = season;
    }
  }
  return best;
}

export async function readSeasonRecords(db: Database, season: number): Promise<Record<string, { wins: number; losses: number; ties: number }>> {
  const snapshot = await db.ref(`nfl/seasons/${season}/records`).once('value');
  return (snapshot.exists() ? snapshot.val() : {}) as Record<string, { wins: number; losses: number; ties: number }>;
}

/* ─────────────────────────────── sync engine ─────────────────────────────── */

export class SyncSkippedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncSkippedError';
  }
}

/** When a lock holder has been quiet (no heartbeat) past this, take it over. */
const STALE_LOCK_MS = 5 * 60 * 1000;

async function touchLock(db: Database, owner: string): Promise<void> {
  const now = Date.now();
  await db
    .ref('nfl/system/lock')
    .update({ expiresAt: now + LOCK_LEASE_MS, acquiredAt: now, owner })
    .catch(() => undefined);
}

/**
 * Acquires the global sync lock; returns false when a healthy job holds it.
 * A crashed holder (heartbeat stopped) is taken over after the stale window.
 */
async function acquireLock(db: Database, owner: string): Promise<boolean> {
  const lockRef = db.ref('nfl/system/lock');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const raw = (await lockRef.once('value')).val() as LockState | null;
    const decision = decideLock(raw, Date.now(), STALE_LOCK_MS);
    if (decision.action === 'busy') {
      const age = Math.round((Date.now() - Number(raw?.acquiredAt ?? 0)) / 1000);
      logUpstream('lock:busy', {
        owner: String(raw?.owner ?? 'unknown'),
        ageSeconds: age,
        expiresInSeconds: Math.max(0, Math.round((Number(raw?.expiresAt ?? 0) - Date.now()) / 1000)),
      });
      return false;
    }
    if (decision.action === 'takeover') {
      logUpstream('lock:takeover', {
        reason: decision.reason,
        previousOwner: String(raw?.owner ?? 'unknown'),
        previousAgeSeconds: Math.round((Date.now() - Number(raw?.acquiredAt ?? 0)) / 1000),
      });
    }

    const acquiredNow = Date.now();
    await lockRef.set({ expiresAt: acquiredNow + LOCK_LEASE_MS, acquiredAt: acquiredNow, owner });
    const owned = (await lockRef.once('value')).val() as LockState | null;
    if (owned && Number(owned.expiresAt) === acquiredNow + LOCK_LEASE_MS) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  logUpstream('lock:exhausted', { owner });
  return false;
}

async function releaseLock(db: Database): Promise<void> {
  await db.ref('nfl/system/lock').set(null).catch(() => {
    /* best effort */
  });
}

async function writeChangedGames(db: Database, season: number, games: NflGame[]): Promise<{ written: number; newlyFinal: NflGame[] }> {
  const seasonRef = db.ref(`nfl/seasons/${season}`);
  const newlyFinal: NflGame[] = [];
  let written = 0;

  for (const game of games) {
    if (!game.id) continue;
    const existing = (await seasonRef.child(`games/${game.id}`).once('value')).val() as CachedGame | null;
    const hash = scoresHash(game);
    if (existing && existing.scoresHash === hash) continue;

    if (game.final && !existing?.final) newlyFinal.push(game);

    await seasonRef.child(`games/${game.id}`).set({
      ...game,
      scoresHash: hash,
      updatedAt: Date.now(),
    });
    written += 1;
  }

  return { written, newlyFinal };
}

export interface ScoreboardWeekPayload {
  week: number;
  events: Array<Record<string, unknown>>;
}

/**
 * Normalizes and stores provider scoreboard payloads, recomputes records, fans
 * out league activity, and refreshes metadata. Callers must hold the sync lock.
 */
export async function storeScoreboards(db: Database, input: {
  season: number;
  currentWeek: number;
  weeks: ScoreboardWeekPayload[];
  previousWeek: number;
  provider: string;
}): Promise<number> {
  const { season, currentWeek, weeks } = input;
  const now = Date.now();
  const newlyFinal: NflGame[] = [];
  let changed = 0;

  for (const payload of weeks) {
    const { games, invalid } = normalizeGames(payload.events, season);
    if (invalid > 0) {
      logUpstream('normalize', { week: payload.week, invalid, kept: games.length });
    }
    const result = await writeChangedGames(db, season, games);
    changed += result.written;
    newlyFinal.push(...result.newlyFinal);
  }

  // Recompute every team's record from stored games (authoritative).
  const cached = await readSeasonGames(db, season);
  const records = computeTeamRecords(cached);
  const recordsObject: Record<string, Record<string, number>> = {};
  for (const [teamId, record] of records.entries()) {
    recordsObject[teamId] = {
      wins: record.wins,
      losses: record.losses,
      ties: record.ties,
      gamesPlayed: record.gamesPlayed,
      pointsFor: record.pointsFor,
      pointsAgainst: record.pointsAgainst,
    };
  }
  await db.ref(`nfl/seasons/${season}/records`).set(recordsObject);

  const activeWeek = deriveActiveWeek(cached, now, currentWeek);

  // League activity (wins earned, leadership changes, new weeks).
  if (newlyFinal.length > 0 || activeWeek !== input.previousWeek) {
    await runLeagueActivitySync(db, { season, currentWeek: activeWeek, previousWeek: input.previousWeek, games: cached, newlyFinal });
  }

  const maxWeek = Math.max(currentWeek, ...weeks.map((week) => week.week));
  const meta = await readCurrentMeta(db);
  await db.ref(`nfl/seasons/${season}/meta`).set({
    season,
    currentWeek: activeWeek,
    lastFullSyncWeek: Math.max(meta.lastFullSyncWeek, maxWeek || currentWeek),
    lastSyncAt: now,
    provider: input.provider,
    lastError: null,
    lastErrorAt: 0,
  });
  await db.ref('nfl/current').set({ season, currentWeek: activeWeek, lastSyncAt: now });

  return changed;
}

/**
 * Pulls the latest regular-season games from the provider into the cache and
 * recomputes team records. Safe to call from the scheduled `nfl-sync`
 * function and from the commissioner's manual sync endpoint.
 */
export async function syncNflData(db: Database): Promise<{ season: number; currentWeek: number; changed: number; skipped: boolean; message?: string }> {
  const now = Date.now();
  const meta = await readCurrentMeta(db);

  // 1) Back off after a provider outage instead of hammering an unreachable
  //    source every few minutes.
  if (meta.lastErrorAt && now - meta.lastErrorAt < ERROR_COOLDOWN_MS) {
    return { season: meta.season, currentWeek: meta.currentWeek, changed: 0, skipped: true, message: 'Provider recently unreachable; backing off.' };
  }

  // 2) Cooldown + overlap protection.
  if (meta.lastSyncAt && now - meta.lastSyncAt < SYNC_COOLDOWN_MS) {
    return { season: meta.season, currentWeek: meta.currentWeek, changed: 0, skipped: true, message: 'Recent sync already ran.' };
  }
  const hasLock = await acquireLock(db, 'scheduled');
  if (!hasLock) {
    return { season: meta.season, currentWeek: meta.currentWeek, changed: 0, skipped: true, message: 'Another sync is already running.' };
  }

  // Season comes from the cache or the leagues' configured season (never -0-).
  let season = await resolveSeason(db);
  let currentWeek = meta.currentWeek || 0;
  let probeMessage: string | null = null;

  console.log(`nfl-sync: start (season ${season}, cachedWeek ${currentWeek})`);

  try {
    // 3) Probe the provider for the current season + week. This is optional:
    //    failure only means we rely on the resolved season and derive the week
    //    from schedule data (or the schedule-walk fallback).
    try {
      const body = await fetchNfl<unknown>('scoreboard', {});
      const probe = parseScoreboard(body);
      if (probe.season > 0) season = probe.season;
      if (probe.currentWeek > 0) currentWeek = probe.currentWeek;
      if (probe.currentWeek < 1) throw new Error('Provider returned no active NFL week.');
      console.log(`nfl-sync: probe ok (season ${season}, week ${currentWeek}, ${probe.events.length} events)`);
    } catch (error) {
      probeMessage = error instanceof Error ? error.message : 'Unknown provider error';
      console.warn(`nfl-sync: scoreboard probe failed (${probeMessage})`);
    }

    // 4) Scope the refresh. The very first run seeds the full schedule so
    //    projections and season progress see every remaining game; afterwards
    //    refresh the active week and its neighbors so Thursday/Monday boundary
    //    changes are picked up even when provider metadata lags.
    const weeks =
      meta.lastFullSyncWeek === 0 || currentWeek === 0
        ? Array.from({ length: SCHEDULE_WEEKS }, (_, i) => i + 1)
        : meta.lastFullSyncWeek >= currentWeek
          ? Array.from(new Set([currentWeek - 1, currentWeek, currentWeek + 1])).filter((week) => week >= 1 && week <= SCHEDULE_WEEKS)
          : Array.from(new Set([
              ...Array.from({ length: currentWeek - meta.lastFullSyncWeek }, (_, i) => meta.lastFullSyncWeek + i + 1),
              currentWeek - 1,
              currentWeek,
              currentWeek + 1,
            ])).filter((week) => week >= 1 && week <= SCHEDULE_WEEKS);

    // 5) Per-week scoreboards. "Success" means events that actually normalize
    //    into valid games — never an empty/`200`-but-bogus payload.
    const weeksPayload: ScoreboardWeekPayload[] = [];
    let normalizedTotal = 0;
    for (const week of weeks) {
      try {
        const body = await fetchNfl<unknown>('scoreboard', { week, season, seasontype: 2 });
        const { games, invalid } = normalizeGames(extractEvents(body), season);
        if (games.length > 0) {
          weeksPayload.push({ week, events: extractEvents(body) });
          normalizedTotal += games.length;
        }
        if (invalid > 0) logUpstream('normalize', { week, invalid, kept: games.length });
        // Keep the lease fresh while we work (heartbeat), so a long run is
        // never mistaken for a crashed one.
        await touchLock(db, 'scheduled');
      } catch (error) {
        console.warn(`nfl-sync: week ${week} scoreboard fetch failed`, error instanceof Error ? error.message : error);
      }
    }

    // 6) Server-side fallback: only when the scoreboard path produced no valid
    //    games do we walk each team's schedule endpoint (avoids 32 calls on the
    //    happy path).
    let usedFallback = false;
    if (normalizedTotal === 0) {
      const walked = await walkTeamSchedules(season);
      if (walked.games > 0) {
        weeksPayload.length = 0;
        weeksPayload.push(...walked.weeks);
        usedFallback = true;
        if (currentWeek < 1) {
          currentWeek = walked.weeks.reduce((max, entry) => Math.max(max, entry.week), 0);
        }
        console.log(`nfl-sync: fell back to team-schedule walk (${walked.games} games)`);
      }
    }

    // 7) Nothing validated anywhere — record the outage and back off.
    if (normalizedTotal === 0 && !usedFallback) {
      const message = probeMessage ?? 'Provider returned no valid game data.';
      console.warn(`nfl-sync: provider unavailable (${message})`);
      const friendly =
        `${message}. NFL scores are unreachable from this server. The scheduled sync retries automatically ` +
        `(30 min backoff); pointing NFL_API_BASE at a reachable mirror, or hosting the cron somewhere the ` +
        `provider allows, will restore scores.`;
      await db
        .ref(`nfl/seasons/${season > 0 ? season : 2026}/meta`)
        .update({ lastError: { message: friendly, at: now }, lastErrorAt: now })
        .catch(() => undefined);
      return { season, currentWeek, changed: 0, skipped: true, message: 'NFL data source unavailable.' };
    }

    // 8) Store, recompute records, fan out activity.
    await touchLock(db, 'scheduled');
    const changed = await storeScoreboards(db, {
      season,
      currentWeek: currentWeek || 1,
      weeks: weeksPayload,
      previousWeek: meta.currentWeek,
      provider: usedFallback ? 'espn-schedule' : 'espn',
    });
    const storedMeta = await readCurrentMeta(db);
    currentWeek = storedMeta.currentWeek || currentWeek;
    console.log(`nfl-sync: completed (season ${season}, week ${currentWeek}, ${changed} game(s) written)`);
    return { season, currentWeek, changed, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sync error';
    console.error(`nfl-sync: storage failed (${message})`);
    return { season, currentWeek, changed: 0, skipped: true, message: 'Could not store the scoreboard.' };
  } finally {
    await releaseLock(db);
  }
}

export type { SeasonMeta };

/**
 * Fallback data path: walks every team's schedule endpoint and reconstructs the
 * same season game set. Both endpoints return the SAME top-level `events`
 * shape, but schedules cover the full season in one call per team (verified
 * live: 17 events/team on both hosts). Only used when the scoreboard path
 * yields no valid games.
 */
async function fetchTeamSchedule(
  espnId: number,
  season: number,
): Promise<Array<Record<string, unknown>>> {
  const body = await fetchNfl<unknown>(`teams/${espnId}/schedule`, { season, seasontype: 2 });
  // May be top-level `events` (verified) or the legacy nested location.
  return extractEvents(body).map((event) => event as Record<string, unknown>);
}

async function walkTeamSchedules(season: number): Promise<{ weeks: ScoreboardWeekPayload[]; games: number; collected: number }> {
  const byId = new Map<string, Record<string, unknown>>();
  let collected = 0;

  for (const team of NFL_TEAMS) {
    try {
      const events = await fetchTeamSchedule(team.espnId, season);
      for (const event of events) {
        const id = String(event.id ?? '');
        if (id && !byId.has(id)) {
          byId.set(id, event);
          collected += 1;
        }
      }
    } catch (error) {
      console.warn(`nfl-sync: team ${team.id} schedule fetch failed`, error instanceof Error ? error.message : error);
    }
  }

  // Validate everything we collected; only events that normalize count.
  const { games } = normalizeGames(Array.from(byId.values()), season);

  const grouped = new Map<number, Array<Record<string, unknown>>>();
  for (const event of byId.values()) {
    const week = Number((event.week as { number?: unknown } | undefined)?.number ?? 0);
    if (week < 1) continue;
    const list = grouped.get(week) ?? [];
    list.push(event);
    grouped.set(week, list);
  }

  const weeks: ScoreboardWeekPayload[] = Array.from(grouped.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([week, events]) => ({ week, events }));

  return { weeks, games: games.length, collected };
}
