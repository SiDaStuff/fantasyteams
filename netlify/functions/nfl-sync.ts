/**
 * Fantasy Teams — scheduled NFL sync.
 *
 * Runs every 10 minutes on Netlify (see [functions."nfl-sync"] in netlify.toml).
 * Pulls live/final scores from the provider into the cache and recomputes team
 * records. The service's lock + cooldown prevent overlapping runs and respect
 * provider rate limits; during commercial breaks or the offseason it is a cheap
 * no-op.
 */

import { getDb } from './lib/admin';
import { syncNflData } from './lib/nfl-service';
import { touchRealtime } from './lib/realtime';

export default async (): Promise<Response> => {
  const startedAt = Date.now();
  try {
    const db = getDb();
    const result = await syncNflData(db);
    if (!result.skipped && result.changed > 0) await touchRealtime(db, 'global');
    console.log(
      `nfl-sync: season ${result.season}, week ${result.currentWeek}, ` +
        `${result.skipped ? 'skipped (' + (result.message ?? '') + ')' : 'changed ' + result.changed + ' game(s)'} ` +
        `in ${Date.now() - startedAt}ms`,
    );
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('nfl-sync: run failed', error);
    return new Response(JSON.stringify({ ok: false, message: 'Sync failed' }), { status: 500 });
  }
};