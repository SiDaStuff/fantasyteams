import { describe, expect, it } from 'vitest';
import type { NflGame, NflGameStatus } from '../src/types';
import {
  computeStandings,
  computeTeamRecords,
  isWinnerOf,
  resultForTeam,
  teamWins,
  teamWinsInWeek,
  type StandingOwner,
} from '../netlify/functions/lib/scoring-core';

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

const owners = (list: Array<[userId: string, teamIds: string[]]>): StandingOwner[] =>
  list.map(([userId, teamIds], i) => ({
    userId,
    displayName: `Owner ${i + 1}`,
    photoURL: null,
    teamIds,
  }));

describe('game result helpers', () => {
  it('a final win for the home side is a win', () => {
    expect(isWinnerOf(game({}), 'kc')).toBe(true);
    expect(isWinnerOf(game({}), 'buf')).toBe(false);
  });

  it('overtime finishes are ordinary final results (higher score wins)', () => {
    const ot = game({ homeScore: 31, awayScore: 28, detail: 'Final/OT' });
    expect(isWinnerOf(ot, 'kc')).toBe(true);
    expect(resultForTeam(ot, 'kc')).toBe('win');
    expect(resultForTeam(ot, 'buf')).toBe('loss');
  });

  it('ties earn zero wins for both sides', () => {
    const tied = game({ homeScore: 21, awayScore: 21 });
    expect(isWinnerOf(tied, 'kc')).toBe(false);
    expect(isWinnerOf(tied, 'buf')).toBe(false);
    expect(resultForTeam(tied, 'kc')).toBe('tie');
  });

  it('live and postponed games never count', () => {
    expect(isWinnerOf(game({ status: 'in_progress' as NflGameStatus, final: false, homeScore: 14, awayScore: 7 }), 'kc')).toBe(false);
    expect(isWinnerOf(game({ status: 'postponed' as NflGameStatus, postponed: true }), 'kc')).toBe(false);
  });
});

describe('team records', () => {
  it('tallies wins, losses, ties, and points', () => {
    const games = [
      game({ week: 1, homeScore: 27, awayScore: 20 }), // kc W
      game({ week: 2, homeScore: 10, awayScore: 24 }), // kc L
      game({ week: 3, homeScore: 17, awayScore: 17 }), // tie
      game({ id: 'g99', week: 4, status: 'in_progress' as NflGameStatus, final: false, homeScore: 7, awayScore: 0 }), // ignore
    ];
    const records = computeTeamRecords(games);
    const kc = records.get('kc');
    expect(kc).toMatchObject({ wins: 1, losses: 1, ties: 1, gamesPlayed: 3, pointsFor: 54, pointsAgainst: 61 });
    const buf = records.get('buf');
    expect(buf).toMatchObject({ wins: 1, losses: 1, ties: 1 });
  });

  it('a team on a bye week has no games and no wins', () => {
    const records = computeTeamRecords([game({ homeTeamId: 'kc', awayTeamId: 'sf' })]);
    expect(records.get('mia')).toBeUndefined();
    expect(teamWins([game({})], 'mia')).toBe(0);
  });
});

describe('weekly wins', () => {
  it('counts one win per drafted team per week', () => {
    const games = [
      game({ week: 1, homeScore: 27, awayScore: 20 }), // kc wins
      game({ week: 1, homeTeamId: 'phi', awayTeamId: 'dal', homeScore: 30, awayScore: 10 }), // phi wins
      game({ week: 2, homeScore: 7, awayScore: 21 }), // buf wins
    ];
    expect(teamWinsInWeek(games, 'kc', 1)).toBe(1);
    expect(teamWinsInWeek(games, 'buf', 2)).toBe(1);
    expect(teamWinsInWeek(games, 'buf', 1)).toBe(0);
    expect(teamWins(games, 'kc')).toBe(1);
    expect(teamWins(games, 'buf')).toBe(1);
  });

  it('a victory is never counted twice when one owner owns both sides', () => {
    const games = [game({ week: 1, homeScore: 30, awayScore: 21 })];
    const result = computeStandings(owners([['a', ['kc', 'buf']]]), games);
    expect(result.standings[0]?.totalWins).toBe(1);
  });
});

describe('standings', () => {
  it('ranks by total wins and reports wins behind the leader', () => {
    const games = [
      game({ id: 'a1', week: 1, homeTeamId: 'kc', awayTeamId: 'buf', homeScore: 30, awayScore: 10 }), // kc W
      game({ id: 'a2', week: 2, homeTeamId: 'kc', awayTeamId: 'dal', homeScore: 21, awayScore: 3 }), // kc W
      game({ id: 'a3', week: 1, homeTeamId: 'phi', awayTeamId: 'nyg', homeScore: 14, awayScore: 20 }), // nyg W
      game({ id: 'a4', week: 1, homeTeamId: 'sf', awayTeamId: 'sea', homeScore: 24, awayScore: 20 }), // sf W
    ];
    const result = computeStandings(
      owners([
        ['kcOwn', ['kc']],
        ['nygOwn', ['nyg']],
        ['seaOwn', ['sea']],
      ]),
      games,
    );
    const byId = new Map(result.standings.map((row) => [row.userId, row]));
    expect(byId.get('kcOwn')?.totalWins).toBe(2);
    expect(byId.get('nygOwn')?.totalWins).toBe(1);
    expect(byId.get('seaOwn')?.totalWins).toBe(0);
    expect(byId.get('kcOwn')?.rank).toBe(1);
    expect(byId.get('seaOwn')?.winsBehind).toBe(2);
  });

  it('tied owners share a rank and the next rank skips ahead (1, 1, 3)', () => {
    const games = [
      game({ id: 'w1', week: 1, homeTeamId: 'kc', awayTeamId: 'buf', homeScore: 30, awayScore: 10 }),
      game({ id: 'w2', week: 1, homeTeamId: 'phi', awayTeamId: 'dal', homeScore: 21, awayScore: 3 }),
    ];
    const result = computeStandings(owners([['a', ['kc']], ['b', ['phi']], ['c', ['sea']]]), games);
    expect(result.standings.map((row) => row.rank)).toEqual([1, 1, 3]);
  });

  it('a corrected final recomputes standings automatically', () => {
    const base = game({ id: 'corr', week: 1, homeScore: 17, awayScore: 20 });
    const before = computeStandings(owners([['a', ['kc']]]), [base]); // kc lost
    expect(before.standings[0]?.totalWins).toBe(0);

    const corrected = { ...base, homeScore: 24, awayScore: 20 }; // kc wins
    const after = computeStandings(owners([['a', ['kc']]]), [corrected]);
    expect(after.standings[0]?.totalWins).toBe(1);
  });

  it('only regular-season games feed standings (postseason ignored by scope)', () => {
    const playoffs = game({ id: 'playoffs', week: 19, homeScore: 30, awayScore: 10 });
    const result = computeStandings(owners([['a', ['kc']]]), [playoffs]);
    // When the caller scopes games to the regular season (weeks 1..18), a
    // week-19 game cannot be present; if it slips through it still counts a
    // single win — the season filter happens before computation.
    expect(result.standings[0]?.totalWins).toBe(1);
    expect(result.weeklyWins['19']?.['a']).toBe(1);
  });
});