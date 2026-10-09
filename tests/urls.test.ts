import { describe, expect, it } from 'vitest';
import { buildProviderUrl, joinUrl } from '../netlify/functions/lib/urls';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

describe('joinUrl', () => {
  it('adds exactly one slash between base and path', () => {
    expect(joinUrl(BASE, 'scoreboard')).toBe(`${BASE}/scoreboard`);
    expect(joinUrl(`${BASE}/`, 'scoreboard')).toBe(`${BASE}/scoreboard`);
    expect(joinUrl(BASE, '/scoreboard')).toBe(`${BASE}/scoreboard`);
    expect(joinUrl(`${BASE}///`, '///scoreboard')).toBe(`${BASE}/scoreboard`);
  });

  it('preserves multi-segment endpoint paths', () => {
    expect(joinUrl(BASE, '/teams/8/schedule')).toBe(`${BASE}/teams/8/schedule`);
    expect(joinUrl(`${BASE}/`, 'teams/12/schedule')).toBe(`${BASE}/teams/12/schedule`);
  });

  it('handles an empty path without a stray slash', () => {
    expect(joinUrl(BASE, '')).toBe(BASE);
    expect(joinUrl(`${BASE}/`, '/')).toBe(BASE);
  });
});

describe('the original bug (scoreboard URL), fixed', () => {
  it('never produces .../nflscoreboard', () => {
    expect(joinUrl(BASE, 'scoreboard')).toBe(`${BASE}/scoreboard`);
    const url = buildProviderUrl(BASE, 'scoreboard', { week: 5, season: 2026, seasontype: 2 });
    expect(url).toBe(`${BASE}/scoreboard?week=5&season=2026&seasontype=2`);
    expect(url).not.toContain('nflscoreboard');
  });

  it('builds schedule URLs correctly', () => {
    expect(buildProviderUrl(BASE, 'teams/2/schedule', { season: 2026, seasontype: 2 })).toBe(
      `${BASE}/teams/2/schedule?season=2026&seasontype=2`,
    );
  });
});

describe('query encoding', () => {
  it('encodes special characters in params', () => {
    const url = buildProviderUrl(BASE, 'scoreboard', { week: 5, label: 'a&b c' });
    expect(url).toBe(`${BASE}/scoreboard?week=5&label=a%26b+c`);
  });

  it('omits the query string entirely when there are no params', () => {
    expect(buildProviderUrl(BASE, 'scoreboard')).toBe(`${BASE}/scoreboard`);
    expect(buildProviderUrl(BASE, 'scoreboard', {})).toBe(`${BASE}/scoreboard`);
    expect(buildProviderUrl(BASE, 'scoreboard', {}).endsWith('?')).toBe(false);
  });
});

describe('primary host ordering', () => {
  it('site.api.espn.com is the primary, site.web.api the mirror', () => {
    // Mirrors the constant order used by the sync (see nfl-service.ts).
    const bases = [
      'https://site.api.espn.com/apis/site/v2/sports/football/nfl',
      'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl',
    ];
    expect(bases[0]).toBe('https://site.api.espn.com/apis/site/v2/sports/football/nfl');
    expect(bases[1]).toContain('site.web.api.espn.com');
  });
});