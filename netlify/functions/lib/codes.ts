/**
 * Join-code value decoding.
 *
 * League codes map to a league id. The canonical value is a plain string; this
 * also tolerates a legacy `{ leagueId }` object so older records keep working.
 * An empty result means "no resolvable league" and callers must 404.
 */
export function leagueIdFromCode(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value !== null && typeof value === 'object') {
    const id = (value as Record<string, unknown>).leagueId;
    return typeof id === 'string' ? id : '';
  }
  return '';
}