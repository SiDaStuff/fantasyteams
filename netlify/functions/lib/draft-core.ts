/**
 * Pure draft math — no Firebase imports, so it can be unit-tested directly.
 *
 * The complete pick sequence is generated server-side ONCE and persisted, so
 * every client sees identical order. Clients never compute orders themselves.
 */
import type { DraftFormat } from '../../../src/types';
import { NFL_TEAMS } from '../../../src/data/nflTeams';

export const NFL_TEAM_COUNT = NFL_TEAMS.length;

/** Maximum complete rounds a league of `memberCount` can hold (≤32 teams). */
export function maxRoundsFor(memberCount: number): number {
  if (memberCount < 1) return 0;
  return Math.max(1, Math.floor(NFL_TEAM_COUNT / memberCount));
}

/** Total picks for a league: complete rounds × participants. */
export function totalPicksFor(memberCount: number, rounds: number): number {
  return memberCount * rounds;
}

/**
 * Expands a round-1 order into the full pick sequence.
 *
 * Snake reverses the order every other round (1→N, N→1, 1→N, …).
 * Linear repeats the base order every round.
 */
export function buildPickSequence(
  order: string[],
  memberCount: number,
  rounds: number,
  format: DraftFormat,
): string[] {
  const base = order.slice(0, memberCount);
  const sequence: string[] = [];

  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    if (format === 'snake' && roundIndex % 2 === 1) {
      sequence.push(...base.slice().reverse());
    } else {
      sequence.push(...base);
    }
  }

  return sequence;
}

/** 1-based round for a global pick number. */
export function roundForPick(pickNumber: number, memberCount: number): number {
  return Math.ceil(pickNumber / memberCount);
}

/** 1-based pick within its round. */
export function pickWithinRound(pickNumber: number, memberCount: number): number {
  return ((pickNumber - 1) % memberCount) + 1;
}

/**
 * True when `order` is a permutation of exactly the given member ids.
 * Protects the manual "rearrange order" endpoint from injecting users.
 */
export function isOrderPermutation(order: unknown, memberIds: string[]): boolean {
  if (!Array.isArray(order)) return false;
  if (order.length !== memberIds.length) return false;
  if (order.some((id) => typeof id !== 'string')) return false;

  const unique = new Set(order as string[]);
  if (unique.size !== memberIds.length) return false;
  return memberIds.every((id) => unique.has(id));
}

/** Team ids that have not been drafted yet. */
export function availableTeamIds(draftedTeamIds: ReadonlySet<string>): string[] {
  return NFL_TEAMS.filter((team) => !draftedTeamIds.has(team.id)).map((team) => team.id);
}

/** Securely picks a random element from a non-empty array. */
export function pickRandom<T>(items: readonly T[]): T {
  const index = Math.floor(Math.random() * items.length);
  return items[index] as T;
}

/** Drafts recorded as a map pickNumber → { nflTeamId, … }. */
export function draftedTeamIdSet(picks: Record<string, { nflTeamId?: unknown }> | undefined): Set<string> {
  const taken = new Set<string>();
  if (!picks) return taken;
  for (const entry of Object.values(picks)) {
    if (typeof entry?.nflTeamId === 'string') taken.add(entry.nflTeamId);
  }
  return taken;
}