/**
 * Championship prediction engine — pure Monte Carlo, unit-tested.
 *
 * Model (documented, never presented as official):
 *  - Team strength = (wins + ½·ties + shrinkage·0.5) / (games + shrinkage) from
 *    the confirmed season records cached by the Stage 3 sync.
 *  - P(home win) = logistic((strength_home − strength_away + HFA) · SCALE),
 *    clamped to [0.05, 0.95] with an optional explicit tie probability.
 *  - Every remaining regular-season game is simulated ONCE per run — a single
 *    outcome applied to both franchises — so an owner who owns both teams in a
 *    game can never earn two fantasy wins from it.
 *  - Tied first-place participants split the championship share equally.
 *
 * Determinism: same inputs + seed ⇒ identical results, which keeps the test
 * suite stable and lets the server cache projections by a games-version key.
 */
import type { NflGame, ScoringMode, TeamRecord } from '../../../src/types';
import { computeTeamRecords, isTeamBenched, isTeamOwned, scoringTeamIdsForOwner, teamScoreFor } from './scoring-core';
import type { StandingOwner } from './scoring-core';

/* ─────────────────────────── seeded randomness ─────────────────────────── */

/** FNV-1a string hash → 32-bit seed. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 — small, fast, deterministic PRNG. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ─────────────────────────── strength / odds model ─────────────────────────── */

const STRENGTH_SHRINKAGE = 4;
const HOME_FIELD_ADVANTAGE = 0.06;
const STRENGTH_SCALE = 10;
const DEFAULT_TIE_PROBABILITY = 0.02;

/** Fallback league-average points per game when a team has no games yet. */
const DEFAULT_PPG = 21;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Shrinkage-smoothed team strength in [0,1]. */
export function teamStrength(record: TeamRecord): number {
  const points = record.wins + 0.5 * record.ties;
  return (points + STRENGTH_SHRINKAGE * 0.5) / (record.gamesPlayed + STRENGTH_SHRINKAGE);
}

export interface GameOdds {
  home: number;
  away: number;
  tie: number;
}

/** Win probabilities for a matchup, including tie probability and home field. */
export function matchupOdds(home: TeamRecord, away: TeamRecord, tieProbability = DEFAULT_TIE_PROBABILITY): GameOdds {
  const disparity = teamStrength(home) - teamStrength(away) + HOME_FIELD_ADVANTAGE;
  const rawHome = 1 / (1 + Math.exp(-STRENGTH_SCALE * disparity));
  const tie = clamp(tieProbability, 0, 0.05);
  const homeP = clamp(rawHome, MIN_P, MAX_P - tie);
  return { home: homeP, away: 1 - homeP - tie, tie };
}

const MIN_P = 0.05;
const MAX_P = 0.95;

/** Rolls one game outcome from the odds: 'home' | 'away' | 'tie'. */
export function rollOutcome(rng: () => number, odds: GameOdds): 'home' | 'away' | 'tie' {
  const r = rng();
  if (r < odds.home) return 'home';
  if (r < odds.home + odds.tie) return 'tie';
  return 'away';
}

/* ─────────────────────────────── simulation ─────────────────────────────── */

export interface SimulatedOwner {
  userId: string;
  teamIds: string[];
}

export interface ProjectionOwner {
  userId: string;
  confirmedWins: number;
  projectedFinalWins: number;
  expectedRemainingWins: number;
  championshipProbability: number;
  likelyFinalRank: number;
}

export interface ProjectionResult {
  season: number;
  iterations: number;
  remainingGames: number;
  owners: ProjectionOwner[];
}

export interface SimulationOptions {
  iterations?: number;
  tieProbability?: number;
  /** Salt for reproducibility (e.g. league id). */
  seedSalt?: string;
  /** 'wins' (1 pt/win) or 'points' (team points scored). Defaults to 'wins'. */
  mode?: ScoringMode;
}

/** Box–Muller normal sample (deterministic via the seeded rng). */
export function sampleNormal(rng: () => number, mean: number, stdDev: number): number {
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

/** Remaining regular-season games (not final, not postponed), deterministic order. */
export function remainingGames(games: readonly NflGame[]): NflGame[] {
  return games
    .filter((game) => !game.final && !game.postponed)
    .sort((a, b) => a.week - b.week || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** Stable version fingerprint of game data, used to invalidate projections. */
export function computeGamesVersion(games: readonly NflGame[]): string {
  const lines = games
    .map((game) =>
      [game.id, game.status, game.final ? '1' : '0', String(game.homeScore ?? ''), String(game.awayScore ?? '')].join(':'),
    )
    .sort()
    .join('|');
  return `${hashString(lines).toString(36)}-${games.length}`;
}

function emptyRecord(teamId: string): TeamRecord {
  return { teamId, wins: 0, losses: 0, ties: 0, gamesPlayed: 0, pointsFor: 0, pointsAgainst: 0 };
}

function competitionRank(scores: Array<[userId: string, wins: number]>): Map<string, number> {
  const sorted = scores.slice().sort((a, b) => b[1] - a[1]);
  const ranks = new Map<string, number>();
  for (let i = 0; i < sorted.length; i += 1) {
    const [id, wins] = sorted[i] as [string, number];
    const prevId = sorted[i - 1]?.[0] ?? '';
    const prevWins = i > 0 ? sorted[i - 1]?.[1] : null;
    const rank = prevWins !== null && prevWins === wins ? (ranks.get(prevId) ?? 1) : i + 1;
    ranks.set(id, rank);
  }
  return ranks;
}

export function projectSeason(
  season: number,
  owners: readonly StandingOwner[],
  games: readonly NflGame[],
  options: SimulationOptions = {},
): ProjectionResult {
  const iterations = Math.max(1, options.iterations ?? 2000);
  const tieProbability = options.tieProbability ?? DEFAULT_TIE_PROBABILITY;
  const seedSalt = options.seedSalt ?? 'fantasy-teams';
  const mode = options.mode ?? 'wins';

  const records = computeTeamRecords(games);
  const pending = remainingGames(games);
  const seed = hashString(`${season}|${mode}|${seedSalt}|${computeGamesVersion(games)}`);
  const rng = createRng(seed);

  const ids = owners.map((owner) => owner.userId);

  // Confirmed score from final games (wins or points scored).
  const confirmed = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const owner of owners) {
    let score = 0;
    for (const teamId of scoringTeamIdsForOwner(owner)) {
      score += teamScoreFor(games.filter((game) => isTeamOwned(owner, teamId, game.week) && !isTeamBenched(owner, teamId, game.week)), teamId, mode);
    }
    confirmed.set(owner.userId, score);
  }

  // Points-per-game per team, used when simulating 'points' mode.
  const ppg = new Map<string, number>();
  for (const [teamId, record] of records.entries()) {
    ppg.set(
      teamId,
      record.gamesPlayed > 0 ? record.pointsFor / record.gamesPlayed : DEFAULT_PPG,
    );
  }

  const pendingOdds = pending.map((game) => ({
    game,
    odds: matchupOdds(
      records.get(game.homeTeamId) ?? emptyRecord(game.homeTeamId),
      records.get(game.awayTeamId) ?? emptyRecord(game.awayTeamId),
      tieProbability,
    ),
  }));

  // Per-iteration observations.
  const finalTotals: number[][] = ids.map(() => []);
  const champShares: number[] = ids.map(() => 0);
  const rankSamples: number[][] = ids.map(() => []);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const wins = new Map(confirmed);

    for (const { game, odds } of pendingOdds) {
      if (mode === 'points') {
        // Both franchises earn points in a simulated game.
        const homePts = Math.max(0, sampleNormal(rng, ppg.get(game.homeTeamId) ?? DEFAULT_PPG, Math.max(3, (ppg.get(game.homeTeamId) ?? DEFAULT_PPG) / 2)));
        const awayPts = Math.max(0, sampleNormal(rng, ppg.get(game.awayTeamId) ?? DEFAULT_PPG, Math.max(3, (ppg.get(game.awayTeamId) ?? DEFAULT_PPG) / 2)));
        for (const owner of owners) {
          let added = 0;
          for (const teamId of scoringTeamIdsForOwner(owner)) {
            if (!isTeamOwned(owner, teamId, game.week)) continue;
            if (isTeamBenched(owner, teamId, game.week)) continue;
            if (game.homeTeamId === teamId) added += homePts;
            else if (game.awayTeamId === teamId) added += awayPts;
          }
          if (added > 0) wins.set(owner.userId, (wins.get(owner.userId) ?? 0) + added);
        }
        continue;
      }

      const outcome = rollOutcome(rng, odds);
      const winner = outcome === 'home' ? game.homeTeamId : outcome === 'away' ? game.awayTeamId : null;
      if (!winner) continue;
      for (const owner of owners) {
        if (scoringTeamIdsForOwner(owner).includes(winner) && isTeamOwned(owner, winner, game.week) && !isTeamBenched(owner, winner, game.week)) {
          wins.set(owner.userId, (wins.get(owner.userId) ?? 0) + 1);
        }
      }
    }

    const scores: Array<[string, number]> = ids.map((id) => [id, wins.get(id) ?? 0]);
    const maxWins = Math.max(...scores.map(([, w]) => w));
    const champions = scores.filter(([, w]) => w === maxWins).map(([id]) => id);
    const share = champions.length > 0 ? 1 / champions.length : 0;

    const ranks = competitionRank(scores);
    for (let i = 0; i < ids.length; i += 1) {
      finalTotals[i]?.push(scores[i]?.[1] ?? 0);
      rankSamples[i]?.push(ranks.get(ids[i] ?? '') ?? 0);
    }
    for (const champion of champions) {
      const index = ids.indexOf(champion);
      if (index >= 0) champShares[index] = (champShares[index] ?? 0) + share;
    }
  }

  const ownersResult: ProjectionOwner[] = ids.map((id, index) => {
    const samples = finalTotals[index] ?? [];
    const meanWins = samples.reduce((sum, value) => sum + value, 0) / iterations;
    const confirmedWins = confirmed.get(id) ?? 0;

    // Most frequent simulated final rank (mode); mean rank as a fallback.
    const ranks = rankSamples[index] ?? [];
    const counts = new Map<number, number>();
    for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
    let bestRank = 0;
    let bestCount = -1;
    for (const [rank, count] of counts.entries()) {
      if (count > bestCount || (count === bestCount && (bestRank === 0 || rank < bestRank))) {
        bestCount = count;
        bestRank = rank;
      }
    }
    const meanRank = ranks.reduce((sum, value) => sum + value, 0) / Math.max(ranks.length, 1);

    return {
      userId: id,
      confirmedWins,
      projectedFinalWins: meanWins,
      expectedRemainingWins: meanWins - confirmedWins,
      championshipProbability: (champShares[index] ?? 0) / iterations,
      likelyFinalRank: bestRank > 0 ? bestRank : Math.max(1, Math.round(meanRank)),
    };
  });

  return { season, iterations, remainingGames: pending.length, owners: ownersResult };
}
