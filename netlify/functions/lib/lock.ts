/**
 * Sync-lock decision logic — pure and unit-tested.
 *
 * A healthy sync refreshes the lock (heartbeat) so its `acquiredAt` stays
 * recent. If a run is killed mid-flight (function timeout, etc.) the lock goes
 * stale: `expiresAt` is still in the future (long lease), but `acquiredAt` is
 * old. `decideLock` lets a later run take over a stale or expired lock instead
 * of being blocked for the full lease — and never pre-empts a living holder.
 */

export interface LockState {
  expiresAt?: unknown;
  acquiredAt?: unknown;
  owner?: unknown;
}

export type LockDecision =
  | { action: 'acquire' }
  | { action: 'busy' }
  | { action: 'takeover'; reason: 'expired' | 'stale' };

export function decideLock(lock: LockState | null | undefined, now: number, staleMs: number): LockDecision {
  if (!lock || typeof lock !== 'object') return { action: 'acquire' };

  const expiresAt = Number(lock.expiresAt ?? 0);
  const acquiredAt = Number(lock.acquiredAt ?? 0);

  // Lease already over → takeover.
  if (expiresAt <= now) {
    return { action: 'takeover', reason: 'expired' };
  }

  // Lease still valid, but the holder went quiet beyond the stale window
  // (no heartbeat) → it crashed; take over instead of blocking on it.
  if (now - acquiredAt > staleMs) {
    return { action: 'takeover', reason: 'stale' };
  }

  // A healthy holder (or one within the stale window) keeps the lock.
  return { action: 'busy' };
}