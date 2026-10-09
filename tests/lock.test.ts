import { describe, expect, it } from 'vitest';
import { decideLock, type LockState } from '../netlify/functions/lib/lock';

const NOW = 1_700_000_000_000;
const STALE = 5 * 60 * 1000; // 5 min
const LEASE = 15 * 60 * 1000; // 15 min

const fresh = (ageSec = 0): LockState => ({ expiresAt: NOW + LEASE, acquiredAt: NOW - ageSec * 1000, owner: 'scheduled' });

describe('decideLock', () => {
  it('acquires when there is no lock', () => {
    expect(decideLock(null, NOW, STALE)).toEqual({ action: 'acquire' });
    expect(decideLock(undefined, NOW, STALE)).toEqual({ action: 'acquire' });
    expect(decideLock('garbage' as unknown as LockState, NOW, STALE)).toEqual({ action: 'acquire' });
  });

  it('respects a healthy (freshly heartbeated) holder', () => {
    expect(decideLock(fresh(10), NOW, STALE)).toEqual({ action: 'busy' });
  });

  it('takes over an expired lease', () => {
    expect(decideLock({ expiresAt: NOW - 1, acquiredAt: NOW - 600_000, owner: 'scheduled' }, NOW, STALE)).toEqual({
      action: 'takeover',
      reason: 'expired',
    });
  });

  it('takes over a stale lock (heartbeat stopped, lease still in the future)', () => {
    // Lease is valid (10 more minutes), but the holder went quiet 6 minutes ago.
    expect(decideLock(fresh(6 * 60), NOW, STALE)).toEqual({ action: 'takeover', reason: 'stale' });
  });

  it('does NOT take over a quiet-but-not-yet-stale holder', () => {
    expect(decideLock(fresh(4 * 60), NOW, STALE)).toEqual({ action: 'busy' });
    // Exactly at the stale boundary is still considered busy.
    expect(decideLock(fresh(STALE / 1000), NOW, STALE)).toEqual({ action: 'busy' });
  });
});