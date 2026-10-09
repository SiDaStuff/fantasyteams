import type { Database } from 'firebase-admin/database';

const MAX_AUDIT_ENTRIES = 100;

export interface AuditEntryValue {
  id: string;
  action: string;
  actorId: string;
  route: string;
  timestamp: number;
}

export async function recordAudit(
  db: Database,
  leagueId: string,
  entry: Omit<AuditEntryValue, 'id' | 'timestamp'>,
): Promise<void> {
  const ref = db.ref(`leagues/${leagueId}/audit`).push();
  await ref.set({ ...entry, id: ref.key, timestamp: Date.now() });
  const snapshot = await db.ref(`leagues/${leagueId}/audit`).orderByChild('timestamp').once('value');
  const values = Object.entries(snapshot.val() ?? {}) as Array<[string, AuditEntryValue]>;
  if (values.length <= MAX_AUDIT_ENTRIES) return;
  values.sort((a, b) => b[1].timestamp - a[1].timestamp);
  const remove: Record<string, null> = {};
  for (const [id] of values.slice(MAX_AUDIT_ENTRIES)) remove[id] = null;
  await db.ref(`leagues/${leagueId}/audit`).update(remove);
}

export async function readAudit(db: Database, leagueId: string): Promise<AuditEntryValue[]> {
  const snapshot = await db.ref(`leagues/${leagueId}/audit`).orderByChild('timestamp').once('value');
  return Object.values((snapshot.val() ?? {}) as Record<string, AuditEntryValue>)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_AUDIT_ENTRIES);
}
