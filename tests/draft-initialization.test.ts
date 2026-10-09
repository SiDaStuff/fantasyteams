import { describe, expect, it } from 'vitest';
import type { Database } from 'firebase-admin/database';
import { acquireDraftLock, ensureDraftInitialized, releaseDraftLock, type DraftValue } from '../netlify/functions/lib/draft-service';

const INITIAL_DRAFT = { status: 'upcoming', rounds: 8, order: ['a', 'b'], currentPick: 0, totalPicks: 16 };

/** Mimics RTDB: writing a child makes its previously missing parent exist. */
function databaseFixture(initial: DraftValue | null, onLock?: () => DraftValue) {
  let value = structuredClone(initial);
  const writes: DraftValue[] = [];
  const db = {
    ref(path: string) {
      const isLock = path.endsWith('/_lock');
      return {
        async once() {
          const snapshot = structuredClone(isLock ? value?._lock ?? null : value);
          return { val: () => snapshot, exists: () => snapshot !== null };
        },
        async set(next: DraftValue | null) {
          if (!isLock) {
            value = structuredClone(next);
            if (next) writes.push(structuredClone(next));
          } else if (next) {
            value = { ...value, _lock: structuredClone(next) };
            if (onLock) value = { ...onLock(), _lock: next };
          } else if (value) {
            delete value._lock;
            if (Object.keys(value).length === 0) value = null;
          }
        },
        async transaction(update: (current: unknown) => unknown) {
          if (!isLock) throw new Error('Transactions are only supported for lock references in this fixture');
          const current = structuredClone(value?._lock ?? null);
          const next = update(current);
          if (next === undefined) return { committed: false };
          if (next === null) {
            if (value) delete value._lock;
          } else {
            value = { ...(value ?? {}), _lock: structuredClone(next) };
            if (onLock) value = { ...onLock(), _lock: structuredClone(next) };
          }
          return { committed: true };
        },
      };
    },
  } as unknown as Database;
  return { db, writes, value: () => value };
}

describe('draft initialization', () => {
  it('creates a draft even though acquiring the lock creates its parent node', async () => {
    const fixture = databaseFixture(null);
    await ensureDraftInitialized(fixture.db, 'league', INITIAL_DRAFT);
    expect(fixture.value()).toEqual(INITIAL_DRAFT);
    expect(fixture.writes).toHaveLength(1);
  });

  it('recovers an uninitialized node containing only an expired lock', async () => {
    const fixture = databaseFixture({ _lock: { owner: 'sync', at: Date.now() - 10_000 } });
    await ensureDraftInitialized(fixture.db, 'league', INITIAL_DRAFT);
    expect(fixture.value()).toEqual(INITIAL_DRAFT);
  });

  it('takes over a legacy lock that has no ownership token', async () => {
    const fixture = databaseFixture({ _lock: { owner: 'old-deployment', at: Date.now() } });
    const token = await acquireDraftLock(fixture.db, 'league', 'start');
    expect(token).toMatch(/^start:/);
    await releaseDraftLock(fixture.db, 'league', token as string);
    expect(fixture.value()).toEqual({});
  });

  it.each(['upcoming', 'live', 'paused', 'completed'])('preserves an existing %s draft and its picks', async (status) => {
    const existing = { status, rounds: 3, currentPick: 4, picks: { 1: { nflTeamId: 'buf' } } };
    const fixture = databaseFixture(existing);
    await ensureDraftInitialized(fixture.db, 'league', INITIAL_DRAFT);
    expect(fixture.value()).toEqual(existing);
    expect(fixture.writes).toHaveLength(0);
  });

  it('does not overwrite a draft initialized between its first read and acquiring the lock', async () => {
    const existing = { status: 'upcoming', rounds: 3, order: ['b', 'a'] };
    const fixture = databaseFixture(null, () => existing);
    await ensureDraftInitialized(fixture.db, 'league', INITIAL_DRAFT);
    expect(fixture.value()).toEqual(existing);
    expect(fixture.writes).toHaveLength(0);
  });
});
