/**
 * Pure NFL scoring math — no Firebase, no I/O, unit-tested in tests/.
 *
 * Fantasy scoring is derived on demand from authoritative game results (never
 * incremented from stored "points"), so a corrected final score re-computes
 * standings everywhere automatically.
 *
 * Rules: regular-season win = 1 fantasy point · loss = 0 · tie = 0 ·
 * bye weeks = no game · postseason = ignored · a win is never counted twice.
 */
import type {
  NflGame,
  NflGameStatus,
  NflTeamGame,
  ScoringMode,
  StandingRow,
  StandingTeam,
  TeamRecord,
} from '../../../src/types';

/* ─────────────────────── provider status normalization ─────────────────────── */

export interface NormalizedStatus {
  status: NflGameStatus;
  final: boolean;
  postponed: boolean;
}

/** Maps an ESPN `status.type` object to our compact status. */
export function normalizeStatus(raw: unknown): NormalizedStatus {
  if (!raw || typeof raw !== 'object') return { status: 'scheduled', final: false, postponed: false };

  const type = raw as Record<string, unknown>;
  const name = String(type.name ?? '');
  const detail = String(type.detail ?? '');
  const state = String(type.state ?? '');
  const completed = type.completed === true;
  const haystack = `${name} ${detail}`.toUpperCase();

  if (haystack.includes('CANCEL')) {
    return { status: 'postponed', final: false, postponed: true };
  }
  if (haystack.includes('POSTPONED')) {
    return { status: 'postponed', final: false, postponed: true };
  }
  if (haystack.includes('HALFTIME')) {
    return { status: 'halftime', final: false, postponed: false };
  }
  if (state === 'post' || completed || haystack.includes('FINAL')) {
    return { status: 'final', final: true, postponed: false };
  }
  if (state === 'in' || haystack.includes('IN PROGRESS')) {
    return { status: 'in_progress', final: false, postponed: false };
  }
  return { status: 'scheduled', final: false, postponed: false };
}

/* ─────────────────────────── game result helpers ─────────────────────────── */

/** Wins accrued by a team across final, non-postponed regular-season games. */
export function teamWins(games: readonly NflGame[], teamId: string): number {
  let wins = 0;
  for (const game of games) {
    if (game.final && !game.postponed && isWinnerOf(game, teamId)) wins += 1;
  }
  return wins;
}

/** Wins accrued by a team in a single week. */
export function teamWinsInWeek(games: readonly NflGame[], teamId: string, week: number): number {
  let wins = 0;
  for (const game of games) {
    if (game.week === week && game.final && !game.postponed && isWinnerOf(game, teamId)) wins += 1;
  }
  return wins;
}

/** True when the team won this (final) game. */
export function isWinnerOf(game: NflGame, teamId: string): boolean {
  if (!game.final || game.postponed) return false;
  if (game.homeTeamId === teamId) {
    return game.homeScore !== null && game.awayScore !== null && game.homeScore > game.awayScore;
  }
  if (game.awayTeamId === teamId) {
    return game.homeScore !== null && game.awayScore !== null && game.awayScore > game.homeScore;
  }
  return false;
}

/** 'win' | 'loss' | 'tie' | null for a team in a game. */
export function resultForTeam(game: NflGame, teamId: string): 'win' | 'loss' | 'tie' | null {
  if (!game.final || game.postponed) return null;
  if (game.homeTeamId !== teamId && game.awayTeamId !== teamId) return null;
  const ours = game.homeTeamId === teamId ? game.homeScore : game.awayScore;
  const theirs = game.homeTeamId === teamId ? game.awayScore : game.homeScore;
  if (ours === null || theirs === null) return null;
  if (ours > theirs) return 'win';
  if (ours < theirs) return 'loss';
  return 'tie';
}

/** The opponent game object a team sees for a game. */
export function opponentOf(game: NflGame, teamId: string): string | null {
  if (game.homeTeamId === teamId) return game.awayTeamId;
  if (game.awayTeamId === teamId) return game.homeTeamId;
  return null;
}

/* ─────────────────────────────── season records ─────────────────────────────── */

export function computeTeamRecords(games: readonly NflGame[]): Map<string, TeamRecord> {
  const records = new Map<string, TeamRecord>();

  for (const game of games) {
    if (!game.final || game.postponed) continue;
    const home = records.get(game.homeTeamId) ?? emptyRecord(game.homeTeamId);
    const away = records.get(game.awayTeamId) ?? emptyRecord(game.awayTeamId);

    const homeScore = game.homeScore ?? 0;
    const awayScore = game.awayScore ?? 0;

    home.pointsFor += homeScore;
    home.pointsAgainst += awayScore;
    away.pointsFor += awayScore;
    away.pointsAgainst += homeScore;

    if (homeScore > awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else if (awayScore > homeScore) {
      away.wins += 1;
      home.losses += 1;
    } else {
      home.ties += 1;
      away.ties += 1;
    }
    home.gamesPlayed += 1;
    away.gamesPlayed += 1;

    records.set(game.homeTeamId, home);
    records.set(game.awayTeamId, away);
  }

  return records;
}

function emptyRecord(teamId: string): TeamRecord {
  return { teamId, wins: 0, losses: 0, ties: 0, gamesPlayed: 0, pointsFor: 0, pointsAgainst: 0 };
}

/* ─────────────────────────────── standings ─────────────────────────────── */

export interface StandingOwner {
  userId: string;
  displayName: string;
  photoURL: string | null;
  teamIds: string[];
  /** Week-keyed lineup snapshots. A snapshot carries forward until replaced. */
  benchedTeamIdsByWeek?: Record<string, string[]>;
}

export function isTeamBenched(owner: StandingOwner, teamId: string, week: number): boolean {
  const snapshots = owner.benchedTeamIdsByWeek ?? {};
  const snapshotWeek = Object.keys(snapshots)
    .map(Number)
    .filter((value) => Number.isInteger(value) && value <= week)
    .sort((a, b) => b - a)[0];
  return snapshotWeek !== undefined && (snapshots[String(snapshotWeek)] ?? []).includes(teamId);
}

function scoringGamesForTeam(games: readonly NflGame[], owner: StandingOwner, teamId: string): NflGame[] {
  return games.filter(
    (game) =>
      (game.homeTeamId === teamId || game.awayTeamId === teamId) &&
      !isTeamBenched(owner, teamId, game.week),
  );
}

export interface StandingsResult {
  standings: StandingRow[];
  /** week ("1"…) → userId → wins earned that week. */
  weeklyWins: Record<string, Record<string, number>>;
  /** Week keys present in the data, ascending. */
  weeks: number[];
}

/**
 * Total points a team has scored in final, non-postponed regular-season games.
 */
export function teamPointsFor(games: readonly NflGame[], teamId: string): number {
  let points = 0;
  for (const game of games) {
    if (!game.final || game.postponed) continue;
    if (game.homeTeamId === teamId) points += game.homeScore ?? 0;
    else if (game.awayTeamId === teamId) points += game.awayScore ?? 0;
  }
  return points;
}

/** Team's total fantasy score for the given mode. */
export function teamScoreFor(games: readonly NflGame[], teamId: string, mode: ScoringMode): number {
  return mode === 'points' ? teamPointsFor(games, teamId) : teamWins(games, teamId);
}

/**
 * Computes league standings + per-week breakdown from final game results.
 * Mode 'wins' scores 1 point per win; mode 'points' scores each team's actual
 * points scored. Ranks use competition ranking — equal scores share a rank and
 * the next rank skips ahead (1, 1, 3). No arbitrary tiebreaker is applied.
 */
export function computeStandings(
  owners: readonly StandingOwner[],
  games: readonly NflGame[],
  mode: ScoringMode = 'wins',
): StandingsResult {
  const weeks = Array.from(new Set(games.map((game) => game.week))).sort((a, b) => a - b);
  const weeklyWins: Record<string, Record<string, number>> = {};

  const rows = owners.map((owner) => {
    const teams: StandingTeam[] = owner.teamIds
      .map((teamId) => {
        const scoringGames = scoringGamesForTeam(games, owner, teamId);
        const record = computeTeamRecords(scoringGames).get(teamId);
        return {
          teamId,
          name: '',
          abbreviation: '',
          wins: record?.wins ?? 0,
          losses: record?.losses ?? 0,
          ties: record?.ties ?? 0,
          points: mode === 'points' ? teamPointsFor(scoringGames, teamId) : record?.wins ?? 0,
        };
      })
      .sort((a, b) => b.points - a.points || a.teamId.localeCompare(b.teamId));

    const totalWins = owner.teamIds.reduce((sum, teamId) => {
      const scoringGames = scoringGamesForTeam(games, owner, teamId);
      const record = computeTeamRecords(scoringGames).get(teamId);
      return sum + (mode === 'points' ? teamPointsFor(scoringGames, teamId) : record?.wins ?? 0);
    }, 0);

    // Per-week breakdown for this owner's franchises.
    for (const week of weeks) {
      let score = 0;
      for (const teamId of owner.teamIds) {
        if (isTeamBenched(owner, teamId, week)) continue;
        if (mode === 'points') {
          for (const game of games) {
            if (game.week === week && game.final && !game.postponed) {
              if (game.homeTeamId === teamId) score += game.homeScore ?? 0;
              else if (game.awayTeamId === teamId) score += game.awayScore ?? 0;
            }
          }
        } else {
          score += teamWinsInWeek(games, teamId, week);
        }
      }
      if (score > 0) {
        const key = String(week);
        weeklyWins[key] = weeklyWins[key] ?? {};
        weeklyWins[key][owner.userId] = score;
      }
    }

    return { owner, teams, totalWins };
  });

  const sorted = rows.slice().sort((a, b) => b.totalWins - a.totalWins);
  const leaderWins = sorted.length > 0 ? (sorted[0]?.totalWins ?? 0) : 0;

  const standings: StandingRow[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const { owner, teams, totalWins } = sorted[i] as NonNullable<(typeof sorted)[number]>;
    const previous = standings[i - 1];
    const rank = previous && previous.totalWins === totalWins ? previous.rank : i + 1;
    standings.push({
      rank,
      userId: owner.userId,
      displayName: owner.displayName,
      photoURL: owner.photoURL,
      totalWins,
      winsBehind: leaderWins - totalWins,
      teams,
    });
  }

  return { standings, weeklyWins, weeks };
}

/* ─────────────────────── team season (profile + roster) ─────────────────────── */

export function teamGames(games: readonly NflGame[], teamId: string): NflTeamGame[] {
  return games
    .filter((game) => game.homeTeamId === teamId || game.awayTeamId === teamId)
    .map((game) => {
      const isHome = game.homeTeamId === teamId;
      const opponentId = isHome ? game.awayTeamId : game.homeTeamId;
      return {
        id: game.id,
        week: game.week,
        date: game.date ?? null,
        status: game.status,
        isHome,
        opponentId,
        opponentName: '',
        opponentAbbreviation: '',
        teamScore: isHome ? game.homeScore : game.awayScore,
        opponentScore: isHome ? game.awayScore : game.homeScore,
        result: resultForTeam(game, teamId),
      };
    })
    .sort((a, b) => a.week - b.week);
}

/* ─────────────────────── score normalization guards ─────────────────────── */

/** A tie result earns no fantasy points (0), but is still a completed game. */
export function isCompletedGame(game: NflGame): boolean {
  return game.final && !game.postponed;
}

/* ─────────────────────── live standings (games in progress) ─────────────────────── */

export interface LiveStandingRow {
  rank: number;
  userId: string;
  displayName: string;
  photoURL: string | null;
  confirmedWins: number;
  potentialWins: number;
  liveTotal: number;
  winsBehind: number;
  teams: StandingTeam[];
}

/**
 * "If the games ended right now" view.
 * 'wins' mode: confirmed wins plus one potential win for each in-progress game
 * where a drafted team is currently leading (ties award nobody).
 * 'points' mode: confirmed points plus the points already on the board in
 * in-progress games for each drafted team.
 */
export function computeLiveStandings(
  owners: readonly StandingOwner[],
  games: readonly NflGame[],
  mode: ScoringMode = 'wins',
): LiveStandingRow[] {
  const confirmed = new Map<string, number>();
  const potential = new Map<string, number>();

  for (const game of games) {
    if (game.final && !game.postponed) {
      if (mode === 'points') {
        for (const owner of owners) {
          let added = 0;
          for (const teamId of owner.teamIds) {
            if (isTeamBenched(owner, teamId, game.week)) continue;
            if (game.homeTeamId === teamId) added += game.homeScore ?? 0;
            else if (game.awayTeamId === teamId) added += game.awayScore ?? 0;
          }
          if (added > 0) confirmed.set(owner.userId, (confirmed.get(owner.userId) ?? 0) + added);
        }
        continue;
      }
      const winner = isWinnerOf(game, game.homeTeamId)
        ? game.homeTeamId
        : isWinnerOf(game, game.awayTeamId)
          ? game.awayTeamId
          : null;
      if (winner) {
        for (const owner of owners) {
          if (owner.teamIds.includes(winner) && !isTeamBenched(owner, winner, game.week)) {
            confirmed.set(owner.userId, (confirmed.get(owner.userId) ?? 0) + 1);
          }
        }
      }
      continue;
    }

    const live = game.status === 'in_progress' || game.status === 'halftime';
    if (!live) continue;

    if (mode === 'points') {
      // Points already banked in the live game count toward the live total.
      for (const owner of owners) {
        let added = 0;
        for (const teamId of owner.teamIds) {
          if (isTeamBenched(owner, teamId, game.week)) continue;
          if (game.homeTeamId === teamId) added += game.homeScore ?? 0;
          else if (game.awayTeamId === teamId) added += game.awayScore ?? 0;
        }
        if (added > 0) potential.set(owner.userId, (potential.get(owner.userId) ?? 0) + added);
      }
      continue;
    }

    if (game.homeScore === null || game.awayScore === null || game.homeScore === game.awayScore) continue;
    const leader = game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId;
    const owner = owners.find((entry) => entry.teamIds.includes(leader) && !isTeamBenched(entry, leader, game.week));
    if (owner) potential.set(owner.userId, (potential.get(owner.userId) ?? 0) + 1);
  }

  const rows = owners
    .map((owner) => {
      const confirmedWins = confirmed.get(owner.userId) ?? 0;
      const potentialWins = potential.get(owner.userId) ?? 0;
      return {
        userId: owner.userId,
        displayName: owner.displayName,
        photoURL: owner.photoURL,
        confirmedWins,
        potentialWins,
        liveTotal: confirmedWins + potentialWins,
        winsBehind: 0,
        teams: owner.teamIds.map((teamId) => {
          const scoringGames = scoringGamesForTeam(games, owner, teamId);
          const record = computeTeamRecords(scoringGames).get(teamId);
          return {
            teamId,
            name: '',
            abbreviation: '',
            wins: record?.wins ?? 0,
            losses: record?.losses ?? 0,
            ties: record?.ties ?? 0,
            points: mode === 'points' ? teamPointsFor(scoringGames, teamId) : record?.wins ?? 0,
          };
        }),
        rank: 1,
      };
    })
    .sort((a, b) => b.liveTotal - a.liveTotal);

  const leaderTotal = rows[0]?.liveTotal ?? 0;
  const ranked: LiveStandingRow[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] as NonNullable<(typeof rows)[number]>;
    const previous = ranked[i - 1];
    ranked.push({
      ...row,
      rank: previous && previous.liveTotal === row.liveTotal ? previous.rank : i + 1,
      winsBehind: leaderTotal - row.liveTotal,
    });
  }
  return ranked;
}

/* ─────────────────────────────── season progress ─────────────────────────────── */

export interface SeasonProgressData {
  totalWeeks: number;
  maxWeekSeen: number;
  completedGames: number;
  inProgressGames: number;
  remainingGames: number;
  pct: number;
}

/** Progress through the regular season, derived from the cached schedule. */
export function computeSeasonProgress(games: readonly NflGame[], currentWeek: number): SeasonProgressData {
  let completed = 0;
  let inProgress = 0;
  let remaining = 0;
  let maxWeek = 0;

  for (const game of games) {
    maxWeek = Math.max(maxWeek, game.week);
    if (game.final && !game.postponed) completed += 1;
    else if (game.status === 'in_progress' || game.status === 'halftime') inProgress += 1;
    if (!game.final && !game.postponed) remaining += 1;
  }

  const totalGames = completed + remaining;
  return {
    totalWeeks: Math.max(currentWeek, Math.min(maxWeek, 18), 1),
    maxWeekSeen: maxWeek,
    completedGames: completed,
    inProgressGames: inProgress,
    remainingGames: remaining,
    pct: totalGames > 0 ? completed / totalGames : 0,
  };
}
