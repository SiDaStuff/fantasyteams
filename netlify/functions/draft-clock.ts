/**
 * Fantasy Teams — scheduled "draft clock".
 *
 * Runs every minute on Netlify (see [functions."draft-clock"] in netlify.toml)
 * and advances any live draft whose authoritative pick deadline has passed.
 * This guarantees drafts keep moving even when every participant is offline —
 * it does not depend on any client's browser.
 *
 * The same expiry logic also runs lazily inside the API (every poll/pick), so
 * in practice picks resolve within ~1s of the deadline whenever anyone has a
 * tab open; this function is the safety net for fully-headless leagues.
 */

import { getDb } from './lib/admin';
import { reconcileDraft } from './lib/draft-service';

export default async (): Promise<Response> => {
  const startedAt = Date.now();
  let reconciled = 0;
  let errors = 0;

  try {
    const db = getDb();

    // Query all leagues with a live draft. RTDB indexes child fields
    // automatically, so no index configuration is required.
    const liveDrafts = await db.ref('drafts').orderByChild('status').equalTo('live').once('value');

    if (liveDrafts.exists()) {
      const entries = Object.entries(liveDrafts.val() as Record<string, unknown>);
      for (const [leagueId] of entries) {
        try {
          const leagueSnap = await db.ref(`leagues/${leagueId}`).once('value');
          if (!leagueSnap.exists()) continue;
          const league = leagueSnap.val() as Record<string, unknown>;
          const timerMs =
            (typeof league.draftPickTimerSeconds === 'number' ? league.draftPickTimerSeconds : 60) * 1000;

          const { completed } = await reconcileDraft(db, leagueId, timerMs);
          if (completed) {
            await db.ref(`leagues/${leagueId}`).update({ status: 'active', updatedAt: Date.now() });
          }
          reconciled += 1;
        } catch (error) {
          errors += 1;
          console.error(`draft-clock: failed to reconcile league ${leagueId}`, error);
        }
      }
    }

    console.log(`draft-clock: ${reconciled} draft(s) reconciled in ${Date.now() - startedAt}ms`);
    return new Response(JSON.stringify({ ok: true, reconciled, errors }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('draft-clock: run failed', error);
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  }
};