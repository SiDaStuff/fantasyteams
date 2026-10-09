import { describe, expect, it } from 'vitest';
import {
  availableTeamIds,
  buildPickSequence,
  draftedTeamIdSet,
  isOrderPermutation,
  maxRoundsFor,
  pickWithinRound,
  roundForPick,
  totalPicksFor,
} from '../netlify/functions/lib/draft-core';
import { NFL_TEAMS } from '../src/data/nflTeams';

const A = 'user-a';
const B = 'user-b';
const C = 'user-c';
const D = 'user-d';

describe('snake draft order', () => {
  it('reverses every other round (1 → N → N → 1)', () => {
    const order = buildPickSequence([A, B, C, D], 4, 4, 'snake');
    expect(order).toEqual([A, B, C, D, D, C, B, A, A, B, C, D, D, C, B, A]);
  });

  it('generates exactly rounds × players picks', () => {
    expect(buildPickSequence([A, B, C, D], 4, 8, 'snake')).toHaveLength(32);
    expect(buildPickSequence([A, B, C], 3, 10, 'snake')).toHaveLength(30);
  });
});

describe('linear draft order', () => {
  it('repeats the same order every round', () => {
    const order = buildPickSequence([A, B, C], 3, 3, 'linear');
    expect(order).toEqual([A, B, C, A, B, C, A, B, C]);
  });
});

describe('round sizing', () => {
  it('computes maximum complete rounds from 32 teams', () => {
    expect(maxRoundsFor(4)).toBe(8);
    expect(maxRoundsFor(8)).toBe(4);
    expect(maxRoundsFor(16)).toBe(2);
    expect(maxRoundsFor(3)).toBe(10);
    expect(maxRoundsFor(2)).toBe(16);
  });

  it('never exceeds 32 total picks', () => {
    for (const players of [2, 3, 4, 5, 8, 16]) {
      const rounds = Math.min(Math.floor(32 / players), maxRoundsFor(players));
      expect(totalPicksFor(players, rounds)).toBeLessThanOrEqual(32);
    }
  });

  it('derives round and within-round positions', () => {
    expect(roundForPick(1, 4)).toBe(1);
    expect(roundForPick(4, 4)).toBe(1);
    expect(roundForPick(5, 4)).toBe(2);
    expect(roundForPick(9, 4)).toBe(3);
    expect(pickWithinRound(5, 4)).toBe(1);
    expect(pickWithinRound(8, 4)).toBe(4);
  });
});

describe('order validation', () => {
  it('accepts a true permutation of member ids', () => {
    expect(isOrderPermutation([D, B, A, C], [A, B, C, D])).toBe(true);
  });

  it('rejects duplicates, missing members, and injected users', () => {
    expect(isOrderPermutation([A, B, C, A], [A, B, C, D])).toBe(false);
    expect(isOrderPermutation([A, B, C], [A, B, C, D])).toBe(false);
    expect(isOrderPermutation([A, B, C, 'intruder'], [A, B, C, D])).toBe(false);
    expect(isOrderPermutation('nope', [A, B, C, D])).toBe(false);
  });
});

describe('team availability', () => {
  it('excludes drafted teams from the pool', () => {
    const taken = draftedTeamIdSet({ '1': { nflTeamId: 'kc' }, '2': { nflTeamId: 'buf' } });
    const available = availableTeamIds(taken);
    expect(available).toHaveLength(30);
    expect(available).not.toContain('kc');
    expect(available).not.toContain('buf');
  });
});

describe('NFL team data integrity', () => {
  it('contains exactly 32 unique teams', () => {
    expect(NFL_TEAMS).toHaveLength(32);
    expect(new Set(NFL_TEAMS.map((t) => t.id)).size).toBe(32);
    expect(new Set(NFL_TEAMS.map((t) => t.abbreviation)).size).toBe(32);
  });

  it('has 16 AFC and 16 NFC teams across four divisions', () => {
    expect(NFL_TEAMS.filter((t) => t.conference === 'AFC')).toHaveLength(16);
    expect(NFL_TEAMS.filter((t) => t.conference === 'NFC')).toHaveLength(16);
    for (const conference of ['AFC', 'NFC'] as const) {
      for (const division of ['North', 'South', 'East', 'West'] as const) {
        expect(NFL_TEAMS.filter((t) => t.conference === conference && t.division === division)).toHaveLength(4);
      }
    }
  });

  it('uses official city + nickname naming', () => {
    for (const team of NFL_TEAMS) {
      expect(team.name).toBe(`${team.city} ${team.nickname}`);
      expect(team.logoUrl.length).toBeGreaterThan(10);
    }
  });
});