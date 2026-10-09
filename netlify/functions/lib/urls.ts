/**
 * Provider URL joining — pure and unit-tested.
 *
 * The original bug: `scoreboard` was appended to
 * `.../sports/football/nfl` without a leading slash, producing
 * `.../nflscoreboard`, which ESPN 404s. These helpers guarantee exactly one
 * slash between the base and the endpoint, regardless of trailing/leading
 * slashes, and encode query parameters with URLSearchParams.
 */

/** Joins a base URL and an endpoint path with exactly one slash. */
export function joinUrl(base: string, path: string): string {
  const left = base.replace(/\/+$/, '');
  const right = path.replace(/^\/+/, '');
  return right === '' ? left : `${left}/${right}`;
}

export type ProviderParams = Record<string, string | number>;

/** Builds a full provider URL with query params, or no `?` when empty. */
export function buildProviderUrl(base: string, path: string, params: ProviderParams = {}): string {
  const joined = joinUrl(base, path);
  const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));
  const queryString = query.toString();
  return queryString ? `${joined}?${queryString}` : joined;
}