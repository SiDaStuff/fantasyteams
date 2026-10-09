/**
 * Season insights service — assembles everything a league season page needs:
 * official standings, live ("if games ended now") standings, cached Monte Carlo
 * projections, season progress, league preferences, sync health, and activity.
 *
 * Projections are computed once per games-version per league and cached in RTDB,
 * so identical simulations are never recalculated for every viewer, and they
 * invalidate automatically whenever a meaningful game result changes.
 */
import type { Database } from 'firebase-admin/database';
import { NFL_TEAMS_BY_ID } from '../../../src/data/nflTeams';
import {
  computeLiveStandings,
  computeSeasonProgress,
  computeStandings,
  isTeamOwned,
  type StandingOwner,
} from './scoring-core';
import { computeGamesVersion, projectSeason, type ProjectionResult } from './simulation-core';
import { deriveActiveWeek, readCurrentMeta, readSeasonGames } from './nfl-service';
import {
  leaderEventKey,
  leaderMessage,
  pushActivity,
  readActivity,
  teamWinEventKey,
  teamWinMessage,
  weekBeganMessage,
  weekEventKey,
} from './activity';
import type {
  NflGame,
  LeagueActivityType,
  ScoringMode,
  StandingTeam,
  StandingRow,
} from '../../../src/types';

const PROJECTION_TTL_MS = 20 * 60 * 1000;

export class InsightsError extends Error {
  constructor(
    readonly code: 'not-found' | 'forbidden',
    message: string,
  ) {
    super(message);
    this.name = 'InsightsError';
  }
}

/* ─────────────────────────────── helpers ─────────────────────────────── */

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

type MemberRecord = Record<string, unknown>;

function membersOf(leagueValue: Record<string, unknown>): MemberRecord {
  const members = leagueValue.members;
  return members && typeof members === 'object' ? (members as MemberRecord) : {};
}

function memberValue(members: MemberRecord, uid: string): Record<string, unknown> {
  const entry = members[uid];
  return entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
}

export interface RawProjectionOwner {
  userId: string;
  displayName: string;
  photoURL: string | null;
  confirmedWins: number;
  projectedFinalWins: number;
  expectedRemainingWins: number;
  championshipProbability: number;
  likelyFinalRank: number;
}

function enrichTeams(teams: StandingTeam[], games?: readonly NflGame[]): StandingTeam[] {
  return teams.map((team) => {
    const info = NFL_TEAMS_BY_ID[team.teamId];
    let next: StandingTeam['next'] = null;
    if (games) {
      const upcoming = games
        .filter((game) => game.status === 'scheduled' && (game.homeTeamId === team.teamId || game.awayTeamId === team.teamId))
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      const opponentId = upcoming ? (upcoming.homeTeamId === team.teamId ? upcoming.awayTeamId : upcoming.homeTeamId) : null;
      const opponent = opponentId ? NFL_TEAMS_BY_ID[opponentId] : undefined;
      next = upcoming
        ? {
            opponentId: opponentId ?? '',
            opponentName: opponent?.name ?? opponentId ?? '',
            opponentAbbreviation: opponent?.abbreviation ?? opponentId?.toUpperCase() ?? '',
            week: upcoming.week,
            date: upcoming.date,
          }
        : null;
    }
    return {
      ...team,
      name: info?.name ?? team.teamId,
      abbreviation: info?.abbreviation ?? team.teamId.toUpperCase(),
      next,
    };
  });
}

function enrichStandings(rows: StandingRow[], games?: readonly NflGame[]): StandingRow[] {
  return rows.map((row) => ({ ...row, teams: enrichTeams(row.teams, games) }));
}

function ownersForLeague(
  leagueValue: Record<string, unknown>,
  picks: Record<string, Record<string, unknown>> | null,
  currentWeek: number,
): StandingOwner[] {
  const members = membersOf(leagueValue);
  const lineups = (leagueValue.lineups && typeof leagueValue.lineups === 'object'
    ? leagueValue.lineups
    : {}) as Record<string, Record<string, Record<string, unknown>>>;
  const ownershipByWeek = (leagueValue.teamOwnership && typeof leagueValue.teamOwnership === 'object'
    ? leagueValue.teamOwnership
    : {}) as Record<string, Record<string, string>>;
  const teamIdsByUser = new Map<string, string[]>();
  if (picks) {
    for (const pick of Object.values(picks)) {
      const userId = str(pick.userId);
      const teamId = str(pick.nflTeamId);
      if (!userId || !teamId) continue;
      const list = teamIdsByUser.get(userId) ?? [];
      if (!list.includes(teamId)) list.push(teamId);
      teamIdsByUser.set(userId, list);
    }
  }
  return Object.keys(members).map((userId) => {
    const member = memberValue(members, userId);
    const initialTeamIds = teamIdsByUser.get(userId) ?? [];
    const owner: StandingOwner = {
      userId,
      displayName: str(member.displayName, 'Player'),
      photoURL: typeof member.photoURL === 'string' ? member.photoURL : null,
      teamIds: initialTeamIds,
      initialTeamIds,
      ownershipByWeek,
      benchedTeamIdsByWeek: Object.fromEntries(
        Object.entries(lineups[userId] ?? {}).map(([week, teams]) => [
          week,
          Object.entries(teams ?? {}).filter(([teamId, benched]) => teamId !== '_empty' && benched === true).map(([teamId]) => teamId),
        ]),
      ),
    };
    owner.teamIds = Object.keys(NFL_TEAMS_BY_ID).filter((teamId) => isTeamOwned(owner, teamId, currentWeek));
    return owner;
  });
}

/* ─────────────────────────── cached projections ─────────────────────────── */

function decodeProjection(result: ProjectionResult, members: MemberRecord): RawProjectionOwner[] {
  return result.owners.map((owner) => {
    const member = memberValue(members, owner.userId);
    return {
      userId: owner.userId,
      displayName: str(member.displayName, owner.userId),
      photoURL: typeof member.photoURL === 'string' ? member.photoURL : null,
      confirmedWins: owner.confirmedWins,
      projectedFinalWins: owner.projectedFinalWins,
      expectedRemainingWins: owner.expectedRemainingWins,
      championshipProbability: owner.championshipProbability,
      likelyFinalRank: owner.likelyFinalRank,
    };
  });
}

export interface CachedProjection {
  version: string;
  computedAt: number;
  data: ProjectionResult;
}

async function ensureProjectionCached(
  db: Database,
  leagueId: string,
  season: number,
  owners: StandingOwner[],
  games: readonly NflGame[],
  seedSalt: string,
  mode: ScoringMode = 'wins',
): Promise<CachedProjection> {
  const lineupVersion = JSON.stringify(owners.map((owner) => [owner.userId, owner.benchedTeamIdsByWeek ?? {}]));
  const version = `${computeGamesVersion(games)}-${lineupVersion}`;
  const ref = db.ref(`nfl/seasons/${season}/projections/${leagueId}/${mode}`);
  let existing: CachedProjection | null = null;
  try {
    const snapshot = await ref.once('value');
    existing = snapshot.val() as CachedProjection | null;
  } catch (error) {
    console.warn(`projection cache read failed for ${leagueId}; computing directly`, error);
  }
  const now = Date.now();

  if (existing && existing.version === version && now - Number(existing.computedAt ?? 0) < PROJECTION_TTL_MS) {
    return existing;
  }

  const data = projectSeason(season, owners, games, { iterations: 2000, seedSalt, mode });
  const next: CachedProjection = { version, computedAt: now, data };
  // Cache failures should make the next request recompute, not hide otherwise
  // valid projections from every league member.
  await ref.set(next).catch((error) => {
    console.warn(`projection cache write failed for ${leagueId}; returning uncached result`, error);
  });
  return next;
}

/* ─────────────────────────────── insights payload ─────────────────────────────── */

export interface LeagueInsightsPayload {
  leagueId: string;
  season: number;
  currentWeek: number;
  totalWeeks: number;
  prefs: { projectionsEnabled: boolean; projectionsVisible: boolean; scoringMode: ScoringMode; benchEnabled: boolean; benchSlots: number; benchLocksAtKickoff: boolean; maxTeamsPerPlayer: number; maxActiveTeams: number; tradingEnabled: boolean };
  lineup: { week: number; benchedTeamIds: string[] };
  sync: { lastSyncAt: number | null; lastError: string | null };
  announcement: { text: string; by: string; at: number } | null;
  progress: ReturnType<typeof computeSeasonProgress>;
  standings: StandingRow[];
  weeklyWins: Record<string, Record<string, number>>;
  live: ReturnType<typeof computeLiveStandings> | null;
  projection: { computedAt: number; iterations: number; remainingGames: number; owners: RawProjectionOwner[] } | null;
  projectionError: string | null;
  projectionEnabled: boolean;
  activity: Array<{ key: string; type: LeagueActivityType; message: string; timestamp: number }>;
  leader: { userId: string; displayName: string; wins: number } | null;
  closestCompetitors: Array<{ userId: string; displayName: string; wins: number; behind: number }>;
  isCommissioner: boolean;
}

export async function buildLeagueInsights(
  db: Database,
  leagueId: string,
  uid: string,
): Promise<LeagueInsightsPayload> {
  const leagueSnapshot = await db.ref(`leagues/${leagueId}`).once('value');
  if (!leagueSnapshot.exists()) throw new InsightsError('not-found', 'League not found.');
  const leagueValue = leagueSnapshot.val() as Record<string, unknown>;
  const members = membersOf(leagueValue);
  if (!members[uid]) throw new InsightsError('forbidden', 'You are not a member of this league.');

  const meta = await readCurrentMeta(db);
  const leagueSeason = num(leagueValue.season, 0);
  const season = leagueSeason > 0 ? leagueSeason : meta.season > 0 ? meta.season : 2026;
  const games = await readSeasonGames(db, season);
  const seasonMetaSnapshot = await db.ref(`nfl/seasons/${season}/meta`).once('value');
  const seasonMeta = (seasonMetaSnapshot.exists() ? seasonMetaSnapshot.val() : {}) as Record<string, unknown>;
  const storedCurrentWeek = num(seasonMeta.currentWeek, season === meta.season ? meta.currentWeek : 1);
  const currentWeek = deriveActiveWeek(games, Date.now(), storedCurrentWeek > 0 ? storedCurrentWeek : 1);

  const picksSnapshot = await db.ref(`drafts/${leagueId}/picks`).once('value');
  const picks = picksSnapshot.exists() ? (picksSnapshot.val() as Record<string, Record<string, unknown>>) : null;
  const owners = ownersForLeague(leagueValue, picks, currentWeek);

  // Preferences (read early — scoring mode changes how standings are computed).
  const prefsValue = (leagueValue.prefs ?? {}) as Record<string, unknown>;
  const scoringMode: ScoringMode = prefsValue.scoringMode === 'points' ? 'points' : 'wins';
  const prefs = {
    projectionsEnabled: bool(prefsValue.projectionsEnabled, true),
    projectionsVisible: bool(prefsValue.projectionsVisible, true),
    scoringMode,
    benchEnabled: bool(prefsValue.benchEnabled, false),
    benchSlots: Math.max(0, Math.min(16, num(prefsValue.benchSlots, 1))),
    benchLocksAtKickoff: bool(prefsValue.benchLocksAtKickoff, true),
    maxTeamsPerPlayer: Math.max(1, Math.min(16, num(prefsValue.maxTeamsPerPlayer, 16))),
    maxActiveTeams: Math.max(1, Math.min(16, num(prefsValue.maxActiveTeams, 16))),
    tradingEnabled: bool(prefsValue.tradingEnabled, false),
  };

  // Official standings + weekly breakdown, in the league's scoring mode.
  const computed = computeStandings(owners, games, scoringMode);
  const standings = enrichStandings(computed.standings, games);

  // Live standings, only when games are underway.
  const hasLiveGames = games.some((game) => game.status === 'in_progress' || game.status === 'halftime');
  const live = hasLiveGames
    ? computeLiveStandings(owners, games, scoringMode).map((row) => ({ ...row, teams: enrichTeams(row.teams, games) }))
    : null;

  // Cached projections.
  let projectionPayload: LeagueInsightsPayload['projection'] = null;
  let projectionError: string | null = null;
  if (prefs.projectionsEnabled && owners.some((owner) => owner.teamIds.length > 0) && games.some((game) => game.week >= 1)) {
    try {
      const cached = await ensureProjectionCached(db, leagueId, season, owners, games, leagueId, scoringMode);
      projectionPayload = {
        computedAt: cached.computedAt,
        iterations: cached.data.iterations,
        remainingGames: cached.data.remainingGames,
        owners: decodeProjection(cached.data, members),
      };
    } catch (error) {
      projectionError = error instanceof Error ? error.message : 'Projection calculation failed.';
      console.warn(`projection failed for league ${leagueId}: ${projectionError}`);
    }
  } else if (prefs.projectionsEnabled && owners.some((owner) => owner.teamIds.length > 0)) {
    projectionError = 'The season schedule has not synced yet.';
  }

  const progress = computeSeasonProgress(games, currentWeek);
  const currentOwner = owners.find((owner) => owner.userId === uid);
  const currentBench = currentOwner?.benchedTeamIdsByWeek ?? {};
  const currentSnapshotWeek = Object.keys(currentBench).map(Number).filter((week) => week <= currentWeek).sort((a, b) => b - a)[0];
  const benchedTeamIds = currentSnapshotWeek === undefined ? [] : currentBench[String(currentSnapshotWeek)] ?? [];

  // Leader + closest competitors from the official standings.
  const leaderRow = standings[0];
  const runnerUp = standings[1];
  const leader = leaderRow && leaderRow.totalWins > 0 && (!runnerUp || leaderRow.totalWins > runnerUp.totalWins)
    ? { userId: leaderRow.userId, displayName: leaderRow.displayName, wins: leaderRow.totalWins }
    : null;
  const closestCompetitors = standings
    .slice(1, 4)
    .map((row) => ({ userId: row.userId, displayName: row.displayName, wins: row.totalWins, behind: row.winsBehind }));

  const activity = await readActivity(db, leagueId);

  // Announcement from the commissioner.
  const announcementValue = leagueValue.announcement;
  const announcement =
    announcementValue && typeof announcementValue === 'object'
      ? {
          text: str((announcementValue as Record<string, unknown>).text),
          by: str((announcementValue as Record<string, unknown>).by),
          at: num((announcementValue as Record<string, unknown>).at, 0),
        }
      : null;

  // Sync health.
  const lastError = (seasonMeta.lastError as Record<string, unknown> | undefined)?.message;

  return {
    leagueId,
    season,
    currentWeek,
    totalWeeks: progress.totalWeeks,
    prefs,
    lineup: { week: currentWeek, benchedTeamIds },
    sync: { lastSyncAt: num(seasonMeta.lastSyncAt, meta.lastSyncAt) || null, lastError: typeof lastError === 'string' ? lastError : null },
    announcement,
    progress,
    standings,
    weeklyWins: computed.weeklyWins,
    live,
    projection: projectionPayload,
    projectionError,
    projectionEnabled: prefs.projectionsEnabled,
    activity: activity.map((event) => ({ ...event, timestamp: event.timestamp.getTime() })),
    leader,
    closestCompetitors,
    isCommissioner: str(leagueValue.commissionerId) === uid,
  };
}

/* ─────────────────────── post-sync league event fan-out ─────────────────────── */

export interface SyncFanoutInput {
  season: number;
  currentWeek: number;
  previousWeek: number;
  games: readonly NflGame[];
  newlyFinal: NflGame[];
}

/**
 * Writes league activity after an NFL sync: newly-final game wins, leadership
 * changes, and week transitions. Runs only when a league has drafted teams, and
 * uses deterministic keys so duplicates can never be created by repeated syncs.
 */
export async function runLeagueActivitySync(db: Database, input: SyncFanoutInput): Promise<void> {
  const leagueIds = (await db.ref('system/leagueIds').once('value')).val() as Record<string, unknown> | null;
  if (!leagueIds) return;

  for (const leagueId of Object.keys(leagueIds)) {
    const leagueSnapshot = await db.ref(`leagues/${leagueId}`).once('value');
    if (!leagueSnapshot.exists()) continue;
    const leagueValue = leagueSnapshot.val() as Record<string, unknown>;

    const picksSnapshot = await db.ref(`drafts/${leagueId}/picks`).once('value');
    if (!picksSnapshot.exists()) continue;
    const picks = picksSnapshot.val() as Record<string, Record<string, unknown>>;
    const owners = ownersForLeague(leagueValue, picks, input.currentWeek);
    if (owners.every((owner) => owner.teamIds.length === 0)) continue;

    // New week.
    if (input.previousWeek > 0 && input.currentWeek > input.previousWeek) {
      await pushActivity(db, leagueId, weekEventKey(input.currentWeek), 'week', weekBeganMessage(input.currentWeek));
    }

    // Teams that won newly-final games.
    for (const game of input.newlyFinal) {
      if (!game.final) continue;
      const winner = game.homeScore !== null && game.awayScore !== null
        ? game.homeScore > game.awayScore
          ? game.homeTeamId
          : game.awayScore > game.homeScore
            ? game.awayTeamId
            : null
        : null;
      if (!winner) continue;
      const owner = owners.find((entry) => entry.teamIds.includes(winner));
      if (!owner) continue;
      const team = NFL_TEAMS_BY_ID[winner];
      await pushActivity(
        db,
        leagueId,
        teamWinEventKey(game.id, winner),
        'team-win',
        teamWinMessage(team?.nickname ?? winner.toUpperCase(), owner.displayName, game.week),
      );
    }

    // Leadership changes (in the league's scoring mode).
    const prefsRaw = (leagueValue.prefs ?? {}) as Record<string, unknown>;
    const scoringMode = prefsRaw.scoringMode === 'points' ? 'points' : 'wins';
    const computed = computeStandings(owners, input.games, scoringMode);
    const rankOne = computed.standings.filter((row) => row.rank === 1);
    if (rankOne.length > 0) {
      const wins = rankOne[0]?.totalWins ?? 0;
      const leaderIds = rankOne.map((row) => row.userId);
      const key = leaderEventKey(input.currentWeek, leaderIds, wins);
      const stateRef = db.ref(`leagues/${leagueId}/activityState`);
      const state = (await stateRef.once('value')).val() as { leaderKey?: string } | null;
      if (state?.leaderKey !== key) {
        await pushActivity(db, leagueId, key, leaderIds.length > 1 ? 'tie-lead' : 'leader', leaderMessage(rankOne.map((row) => row.displayName)));
        await stateRef.set({ leaderKey: key, updatedAt: Date.now() });
      }
    }
  }
}
