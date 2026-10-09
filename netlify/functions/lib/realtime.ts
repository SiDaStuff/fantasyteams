import type { Database } from 'firebase-admin/database';

export type RealtimeScope = 'global' | `league:${string}`;

function pathFor(scope: RealtimeScope): string {
  return scope === 'global'
    ? 'realtimeSignals/global'
    : `realtimeSignals/leagues/${scope.slice('league:'.length)}`;
}

export async function touchRealtime(db: Database, scope: RealtimeScope): Promise<void> {
  await db.ref(pathFor(scope)).set({ updatedAt: Date.now() });
}
