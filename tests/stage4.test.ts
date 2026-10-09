import { describe, expect, it } from 'vitest';
import type { NflGame, NflGameStatus, TeamRecord } from '../src/types';
import {
  computeGamesVersion,
  createRng,
  hashString,
  matchupOdds,
  projectSeason,
  remainingGames,
} from '../netlify/functions/lib/simulation-core';
import {
  computeLiveStandings,
  computeSeasonProgress,
  computeStandings,
  type StandingOwner,
} from '../netlify/functions/lib/scoring-core';
import { leagueIdFromCode } from '../netlify/functions/lib/codes';
import {
  draftEventKey,
  leaderEventKey,
  teamWinEventKey,
  weekEventKey,
} from '../netlify/functions/lib/activity';

let gameCounter = 0;
function game(partial: Partial<NflGame>): NflGame {
  gameCounter += 1;
  return {
    id: `g${gameCounter}`,
    season: 2026,
    week: 1,
    date: '2026-09-10T00:00:00.000Z',
    status: 'final',
    period: 4,
    clock: '0:00',
    detail: 'Final',
    homeTeamId: 'kc',
    awayTeamId: 'buf',
    homeScore: 27,
    awayScore: 20,
    final: true,
    postponed: false,
    ...partial,
  };
}

function owner(userId: string, teamIds: string[]): StandingOwner {
  return { userId, displayName: userId.toUpperCase(), photoURL: null, teamIds };
}

const emptyRecord: TeamRecord = { teamId: 'x', wins: 0, losses: 0, ties: 0, gamesPlayed: 0, pointsFor: 0, pointsAgainst: 0 };

describe('odds & randomness', () => {
  it('odds are normalized probabilities with a documented tie share', () => {
    const odds = matchupOdds(emptyRecord, emptyRecord, 0.02);
    expect(odds.home + odds.away + odds.tie).toBeCloseTo(1, 6);
    expect(odds.home).toBeGreaterThan(0);
    expect(odds.away).toBeGreaterThan(0);
    expect(odds.tie).toBeCloseTo(0.02, 6);
  });

  it('a stronger team has a higher home probability', () => {
    const strong = { teamId: 'a', wins: 6, losses: 0, ties: 0, gamesPlayed: 6, pointsFor: 0, pointsAgainst: 0 };
    const weak = { teamId: 'b', wins: 0, losses: 6, ties: 0, gamesPlayed: 6, pointsFor: 0, pointsAgainst: 0 };
    expect(matchupOdds(strong, weak).home).toBeGreaterThan(matchupOdds(weak, strong).home);
  });

  it('rng and hashing are deterministic', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(createRng(42)()).toBe(createRng(42)());
    expect(createRng(42)()).not.toBe(createRng(43)());
  });

  it('games version changes when a score changes (cache invalidation)', () => {
    const games = [game({ id: 'g-1', homeScore: 27, awayScore: 20 })];
    const changed = [game({ id: 'g-1', homeScore: 28, awayScore: 20 })];
    expect(computeGamesVersion(games)).not.toBe(computeGamesVersion(changed));
  });
});

describe('championship projections', () => {
  it('is reproducible for the same inputs', () => {
    const games = [
      game({ id: 'a', week: 1, homeTeamId: 'kc', awayTeamId: 'buf', homeScore: 30, awayScore: 10 }),
      game({ id: 'b', week: 2, status: 'scheduled' as NflGameStatus, final: false, homeScore: null, awayScore: null }),
      game({ id: 'c', week: 2, status: 'scheduled' as NflGameStatus, final: false, homeTeamId: 'phi', awayTeamId: 'dal', homeScore: null, awayScore: null }),
    ];
    const owners = [owner('a', ['kc', 'phi']), owner('b', ['buf', 'dal'])];
    const first = projectSeason(2026, owners, games, { iterations: 120, seedSalt: 'league1' });
    const second = projectSeason(2026, owners, games, { iterations: 120, seedSalt: 'league1' });
    expect(first).toEqual(second);
  });

  it('championship probabilities total approximately 100%', () => {
    const games = [
      game({ id: 'a', week: 1, homeTeamId: 'kc', awayTeamId: 'buf', homeScore: 30, awayScore: 10 }),
      game({ id: 'b', week: 2, status: 'scheduled' as NflGameStatus, final: false, homeScore: null, awayScore: null }),
    ];
    const owners = [owner('a', ['kc']), owner('b', ['buf'])];
    const result = projectSeason(2026, owners, games, { iterations: 200, seedSalt: 'x' });
    const total = result.owners.reduce((sum, row) => sum + row.championshipProbability, 0);
    expect(total).toBeCloseTo(1, 1);
    expect(result.owners.length).toBe(2);
  });

  it('tied champions split the title probability equally when no games remain', () => {
    const games = [
      game({ id: 'a', week: 1, homeTeamId: 'kc', awayTeamId: 'buf', homeScore: 30, awayScore: 10 }),
      game({ id: 'b', week: 1, homeTeamId: 'phi', awayTeamId: 'dal', homeScore: 21, awayScore: 3 }),
    ];
    const owners = [owner('a', ['kc']), owner('b', ['phi'])]; // both at 1 win, nothing left
    const result = projectSeason(2026, owners, games, { iterations: 100, seedSalt: 'tie' });
    expect(result.remainingGames).toBe(0);
    expect(result.owners.find((row) => row.userId === 'a')?.championshipProbability).toBeCloseTo(0.5, 2);
    expect(result.owners.find((row) => row.userId === 'b')?.championshipProbability).toBeCloseTo(0.5, 2);
  });

  it('no games remaining means projections equal confirmed totals', () => {
    const games = [game({ id: 'a', week: 1, homeTeamId: 'kc', awayTeamId: 'buf', homeScore: 30, awayScore: 10 })];
    const owners = [owner('a', ['kc', 'mia'])];
    const result = projectSeason(2026, owners, games, { iterations: 50 });
    const row = result.owners[0];
    expect(row?.projectedFinalWins).toBeCloseTo(row?.confirmedWins ?? -1, 6);
    expect(row?.expectedRemainingWins).toBeCloseTo(0, 6);
  });

  it('a game between two teams owned in the same league produces one win, never two', () => {
    // Only remaining game: kc @ buf. Owner A owns BOTH franchises.
    const games = [game({ id: 'm', week: 5, homeTeamId: 'kc', awayTeamId: 'buf', status: 'scheduled' as NflGameStatus, final: false, homeScore: null, awayScore: null })];
    const ownerA = owner('a', ['kc', 'buf']);
    const result = projectSeason(2026, [ownerA], games, { iterations: 300, seedSalt: 'ownboth' });
    const row = result.owners[0];
    // In every simulation exactly one franchise wins; A gets at most 1 win.
    expect(row?.projectedFinalWins ?? 2).toBeLessThanOrEqual(1.01);
  });

  it('two owners in the same league split a single simulated win per matchup', () => {
    const games = [
      game({ id: 'm', week: 5, homeTeamId: 'kc', awayTeamId: 'buf', status: 'scheduled' as NflGameStatus, final: false, homeScore: null, awayScore: null }),
    ];
    const owners = [owner('a', ['kc']), owner('b', ['buf'])];
    const result = projectSeason(2026, owners, games, { iterations: 300, seedSalt: 'split' });
    const a = result.owners.find((row) => row.userId === 'a')?.projectedFinalWins ?? 0;
    const b = result.owners.find((row) => row.userId === 'b')?.projectedFinalWins ?? 0;
    expect(a + b).toBeCloseTo(1, 1); // the matchup yields exactly one win between them
  });

  it('undrafted teams never credit an owner', () => {
    const games = [
      game({ id: 'a', week: 1, homeTeamId: 'kc', awayTeamId: 'buf', homeScore: 30, awayScore: 10 }),
      game({ id: 'b', week: 2, status: 'scheduled' as NflGameStatus, final: false, homeTeamId: 'kc', awayTeamId: 'sf', homeScore: null, awayScore: null }),
    ];
    const owners = [owner('a', ['mia'])]; // mia has no games at all
    const result = projectSeason(2026, owners, games, { iterations: 60 });
    expect(result.owners[0]?.projectedFinalWins).toBe(0);
    expect(result.owners[0]?.confirmedWins).toBe(0);
  });

  it('results changing after a game becomes final update the projection', () => {
    const pending = game({ id: 'decider', week: 6, homeTeamId: 'kc', awayTeamId: 'buf', status: 'scheduled' as NflGameStatus, final: false, homeScore: null, awayScore: null });
    const owners = [owner('a', ['kc']), owner('b', ['buf'])];

    const before = projectSeason(2026, owners, [pending], { iterations: 200, seedSalt: 'flip' });
    // Force the same game final with kc winning (matching the prior matchup).
    const after = projectSeason(2026, owners, [{ ...pending, status: 'final', final: true, homeScore: 24, awayScore: 17 }], { iterations: 200, seedSalt: 'flip' });
    const aBefore = before.owners.find((row) => row.userId === 'a')?.projectedFinalWins ?? 0;
    const aAfter = after.owners.find((row) => row.userId === 'a')?.confirmedWins ?? 0;
    // With no other games, once final A's projected total is exactly that confirmed win.
    expect(aAfter).toBe(1);
    expect(aBefore).toBeLessThanOrEqual(1.01);
    expect(before.owners.find((row) => row.userId === 'b')?.projectedFinalWins ?? 0).toBeCloseTo(1 - aBefore, 1);
  });

  it('multiple leagues simulate independently from the same game data', () => {
    const games = [
      game({ id: 'a', week: 1, homeTeamId: 'kc', awayTeamId: 'buf', homeScore: 30, awayScore: 10 }),
      game({ id: 'b', week: 2, homeTeamId: 'kc', awayTeamId: 'sea', homeScore: 17, awayScore: 20 }),
    ];
    const leagueA = projectSeason(2026, [owner('a', ['kc'])], games, { iterations: 80, seedSalt: 'leagueA' });
    const leagueB = projectSeason(2026, [owner('z', ['kc'])], games, { iterations: 80, seedSalt: 'leagueB' });
    // kc's confirmed wins are identical whoever drafted them.
    expect(leagueA.owners[0]?.confirmedWins).toBe(leagueB.owners[0]?.confirmedWins);
    expect((leagueA.owners[0]?.projectedFinalWins ?? 0) + (leagueB.owners[0]?.projectedFinalWins ?? 0)).toBeGreaterThan(0);
  });
});

describe('live standings', () => {
  it('credits only currently-leading franchises and ignores ties and future games', () => {
    const games = [
      game({ id: 'a', week: 1, homeTeamId: 'kc', awayTeamId: 'buf', homeScore: 30, awayScore: 10 }), // kc confirmed win
      game({ id: 'live1', week: 2, status: 'in_progress' as NflGameStatus, final: false, homeTeamId: 'kc', awayTeamId: 'dal', homeScore: 14, awayScore: 7 }), // kc leading
      game({ id: 'live2', week: 2, status: 'in_progress' as NflGameStatus, final: false, homeTeamId: 'sf', awayTeamId: 'phi', homeScore: 10, awayScore: 10 }), // tied → nobody
      game({ id: 'up', week: 2, status: 'scheduled' as NflGameStatus, final: false, homeTeamId: 'buf', awayTeamId: 'nyg', homeScore: null, awayScore: null }),
    ];
    const owners = [owner('a', ['kc']), owner('b', ['buf', 'sf'])];
    const rows = computeLiveStandings(owners, games);
    const a = rows.find((row) => row.userId === 'a');
    const b = rows.find((row) => row.userId === 'b');
    expect(a?.confirmedWins).toBe(1);
    expect(a?.potentialWins).toBe(1);
    expect(a?.liveTotal).toBe(2);
    expect(b?.confirmedWins).toBe(0);
    expect(b?.potentialWins).toBe(0); // tied game awards nothing
  });
});

describe('season progress', () => {
  it('derives completed/remaining and a progress fraction from the schedule', () => {
    const games = [
      game({ id: 'f1', week: 1, homeScore: 27, awayScore: 20 }),
      game({ id: 'f2', week: 2, homeScore: 10, awayScore: 24 }),
      game({ id: 'f3', week: 3, homeScore: 17, awayScore: 17 }),
      game({ id: 'live', week: 4, status: 'in_progress' as NflGameStatus, final: false, homeScore: 7, awayScore: 3 }),
      game({ id: 's1', week: 4, status: 'scheduled' as NflGameStatus, final: false, homeScore: null, awayScore: null }),
      game({ id: 's2', week: 5, status: 'scheduled' as NflGameStatus, final: false, homeScore: null, awayScore: null }),
    ];
    const progress = computeSeasonProgress(games, 4);
    expect(progress.completedGames).toBe(3);
    expect(progress.inProgressGames).toBe(1);
    expect(progress.remainingGames).toBe(3);
    expect(progress.pct).toBeCloseTo(3 / 6, 6);
    expect(progress.totalWeeks).toBeGreaterThanOrEqual(4);
  });
});

describe('activity events', () => {
  it('deterministic keys prevent duplicates and stay unique per event', () => {
    expect(draftEventKey(7)).toBe('draft-7');
    expect(draftEventKey(7)).toBe(draftEventKey(7));
    expect(draftEventKey(7)).not.toBe(draftEventKey(8));

    expect(teamWinEventKey('g9', 'kc')).toBe('teamwin-g9-kc');
    expect(teamWinEventKey('g9', 'kc')).toBe(teamWinEventKey('g9', 'kc'));
    expect(teamWinEventKey('g9', 'kc')).not.toBe(teamWinEventKey('g9', 'buf'));

    // Leader keys sort user ids so "a and b tied" == "b and a tied".
    expect(leaderEventKey(5, ['b', 'a'], 6)).toBe(leaderEventKey(5, ['a', 'b'], 6));
    expect(leaderEventKey(5, ['a'], 6)).not.toBe(leaderEventKey(5, ['a'], 7));

    expect(weekEventKey(6)).toBe('week-6');
    expect(weekEventKey(6)).not.toBe(weekEventKey(7));
  });

  it('remainingGames returns deterministic order', () => {
    const games = [
      game({ id: 'z', week: 2, status: 'scheduled' as NflGameStatus, final: false }),
      game({ id: 'a', week: 1, status: 'scheduled' as NflGameStatus, final: false }),
    ];
    expect(remainingGames(games).map((g) => g.week)).toEqual([1, 2]);
  });
});

describe('league codes', () => {
  it('decodes canonical string values', () => {
    expect(leagueIdFromCode('K7XQ2M')).toBe('K7XQ2M');
    expect(leagueIdFromCode('')).toBe('');
  });

  it('tolerates legacy object values', () => {
    expect(leagueIdFromCode({ leagueId: 'abc123' })).toBe('abc123');
    expect(leagueIdFromCode({ leagueId: '' })).toBe('');
  });

  it('returns empty for anything unresolvable', () => {
    expect(leagueIdFromCode(null)).toBe('');
    expect(leagueIdFromCode(undefined)).toBe('');
    expect(leagueIdFromCode(42)).toBe('');
    expect(leagueIdFromCode({})).toBe('');
  });
});

describe('points scoring mode', () => {
  it('sums each drafted team\'s points scored in official standings', () => {
    const games = [
      game({ id: 'p1', week: 1, homeTeamId: 'kc', awayTeamId: 'phi', homeScore: 36, awayScore: 42 }),
      game({ id: 'p2', week: 2, homeTeamId: 'kc', awayTeamId: 'buf', homeScore: 24, awayScore: 10 }),
    ];
    const result = computeStandings([owner('a', ['kc']), owner('b', ['phi'])], games, 'points');
    const a = result.standings.find((row) => row.userId === 'a');
    const b = result.standings.find((row) => row.userId === 'b');
    expect(a?.totalWins).toBe(60); // 36 + 24
    expect(b?.totalWins).toBe(42);
    expect(a?.rank).toBe(1);
    expect(result.weeklyWins['1']?.['a']).toBe(36);
    expect(result.weeklyWins['2']?.['a']).toBe(24);
    expect(result.standings[0]?.teams[0]?.points).toBe(60);
  });

  it('live standings bank the points already on the board', () => {
    const games = [
      game({ id: 'lp1', week: 1, homeTeamId: 'kc', awayTeamId: 'buf', homeScore: 36, awayScore: 10 }),
      game({ id: 'lp2', week: 2, status: 'in_progress' as NflGameStatus, final: false, homeTeamId: 'kc', awayTeamId: 'dal', homeScore: 14, awayScore: 7 }),
    ];
    const rows = computeLiveStandings([owner('a', ['kc'])], games, 'points');
    const a = rows.find((row) => row.userId === 'a');
    expect(a?.confirmedWins).toBe(36);
    expect(a?.potentialWins).toBe(14);
    expect(a?.liveTotal).toBe(50);
  });

  it('projects points mode deterministically and never below confirmed', () => {
    const games = [
      game({ id: 's1', week: 1, homeTeamId: 'kc', awayTeamId: 'buf', homeScore: 30, awayScore: 10 }),
      game({ id: 's2', week: 2, status: 'scheduled' as NflGameStatus, final: false, homeTeamId: 'kc', awayTeamId: 'sf', homeScore: null, awayScore: null }),
    ];
    const first = projectSeason(2026, [owner('a', ['kc'])], games, { iterations: 60, seedSalt: 'pts', mode: 'points' });
    const second = projectSeason(2026, [owner('a', ['kc'])], games, { iterations: 60, seedSalt: 'pts', mode: 'points' });
    expect(first).toEqual(second);
    expect(first.owners[0]?.confirmedWins).toBe(30);
    expect(first.owners[0]?.projectedFinalWins ?? 0).toBeGreaterThanOrEqual(30);
  });
});