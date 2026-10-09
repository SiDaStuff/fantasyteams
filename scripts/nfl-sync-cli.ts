/**
 * Fantasy Teams — local NFL sync CLI.
 *
 * Runs the EXACT same sync logic the scheduled Netlify function uses, but from
 * your own machine/network. This matters when ESPN's public endpoints 404 from
 * cloud/datacenter IP ranges (as they currently do from Netlify's region):
 * run `npm run sync:nfl` from a network where the provider is reachable and it
 * populates the cached games + records directly via the service account.
 *
 * Usage:
 *   npm run sync:nfl            # uses FIREBASE_SERVICE_ACCOUNT (+ optional
 *                               # FIREBASE_DATABASE_URL, NFL_API_BASE) from .env
 *
 * The scheduled function keeps trying automatically and will take over again
 * once its region can reach the provider.
 */
import { log } from 'node:console';
import { readFileSync } from 'node:fs';
import { getDb } from '../netlify/functions/lib/admin';
import { syncNflData } from '../netlify/functions/lib/nfl-service';

function loadEnvFile(): void {
  try {
    const text = readFileSync('.env', 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match as [unknown, string, string];
      if (process.env[key]) continue;
      let value = rawValue.trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1).replace(/\\"/g, '"');
      }
      process.env[key] = value;
    }
  } catch {
    /* no .env, rely on real environment variables */
  }
}

async function main(): Promise<void> {
  loadEnvFile();

  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    log('FIREBASE_SERVICE_ACCOUNT is required. Add it to .env (see .env.example) and try again.');
    process.exit(2);
  }

  const startedAt = Date.now();
  const result = await syncNflData(getDb());
  const elapsed = Date.now() - startedAt;

  if (result.skipped) {
    log(`[nfl-sync] skipped (${result.message ?? 'no change'}) in ${elapsed}ms`);
    process.exit(0);
  }

  log(
    `[nfl-sync] season ${result.season}, week ${result.currentWeek}, ` +
      `${result.changed} game(s) updated in ${elapsed}ms`,
  );
  process.exit(0);
}

main().catch((error) => {
  log('[nfl-sync] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});