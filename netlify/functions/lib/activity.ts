/**
 * League activity feed.
 *
 * Events are persisted per league under /leagues/{id}/activity/{key}; keys are
 * deterministic so re-syncs can never create duplicates (a draft pick, a final
 * game result, a leadership change, or a week change each have exactly one key).
 * The oldest events are pruned to keep the feed lean.
 */
import type { Database } from 'firebase-admin/database';
import type { LeagueActivityEvent, LeagueActivityType } from '../../../src/types';

const MAX_EVENTS = 40;

/* ─────────────────────────── deterministic keys ─────────────────────────── */

export function draftEventKey(pickNumber: number): string {
  return `draft-${pickNumber}`;
}

export function teamWinEventKey(gameId: string, teamId: string): string {
  return `teamwin-${gameId}-${teamId}`;
}

/** Key for a leadership change (winner set + wins at that moment). */
export function leaderEventKey(week: number, leaderUserIds: string[], wins: number): string {
  return `lead-${week}-${[...leaderUserIds].sort().join('+')}-${wins}`;
}

export function weekEventKey(week: number): string {
  return `week-${week}`;
}

/* ─────────────────────────────── messages ─────────────────────────────── */

export function draftPickMessage(pickerName: string, teamNickname: string): string {
  return `${pickerName} drafted the ${teamNickname}.`;
}

export function teamWinMessage(teamNickname: string, ownerName: string, week: number): string {
  return `The ${teamNickname} won in Week ${week} — +1 win for ${ownerName}.`;
}

export function leaderMessage(leaderNames: string[]): string {
  if (leaderNames.length <= 1) return `${leaderNames[0] ?? 'An owner'} took first place.`;
  if (leaderNames.length === 2) return `${leaderNames[0]} and ${leaderNames[1]} are tied for the lead.`;
  return `${leaderNames.slice(0, -1).join(', ')} and ${leaderNames[leaderNames.length - 1]} are tied for the lead.`;
}

export function weekBeganMessage(week: number): string {
  return `Week ${week} began.`;
}

/* ─────────────────────────────── persistence ─────────────────────────────── */

export async function pushActivity(
  db: Database,
  leagueId: string,
  key: string,
  type: LeagueActivityType,
  message: string,
): Promise<void> {
  const ref = db.ref(`leagues/${leagueId}/activity/${key}`);
  await ref.set({ key, type, message, timestamp: Date.now() });

  // Prune: keep the most recent MAX_EVENTS entries.
  const snapshot = await db.ref(`leagues/${leagueId}/activity`).once('value');
  if (!snapshot.exists()) return;
  const entries = Object.entries(snapshot.val() as Record<string, unknown>);
  if (entries.length <= MAX_EVENTS) return;

  const sorted = entries
    .map(([keyName, value]) => [keyName, Number((value as { timestamp?: unknown })?.timestamp ?? 0)] as const)
    .sort((a, b) => b[1] - a[1]);
  const toRemove = sorted.slice(MAX_EVENTS).map(([keyName]) => keyName);
  if (toRemove.length === 0) return;

  const patch: Record<string, null> = {};
  for (const keyName of toRemove) patch[keyName] = null;
  await db.ref(`leagues/${leagueId}/activity`).update(patch);
}

export async function readActivity(db: Database, leagueId: string): Promise<LeagueActivityEvent[]> {
  const snapshot = await db.ref(`leagues/${leagueId}/activity`).once('value');
  if (!snapshot.exists()) return [];
  const value = snapshot.val() as Record<string, Record<string, unknown>>;
  return Object.values(value)
    .map((entry) => ({
      key: String(entry.key ?? ''),
      type: (String(entry.type ?? 'draft') as LeagueActivityEvent['type']),
      message: String(entry.message ?? ''),
      timestamp: new Date(Number(entry.timestamp ?? 0)),
    }))
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, MAX_EVENTS);
}