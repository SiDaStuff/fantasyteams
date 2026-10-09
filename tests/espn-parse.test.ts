import { describe, expect, it } from 'vitest';
import {
  extractEvents,
  normalizeEspnEvent,
  normalizeGames,
  parseScoreboard,
} from '../netlify/functions/lib/espn-parse';

/* Representative payloads captured from ESPN's NFL endpoints (2026 season). */

const STATUS = {
  final: { id: '3', name: 'STATUS_FINAL', state: 'post', completed: true, description: 'Final', detail: 'Final', shortDetail: 'Final' },
  live: { name: 'STATUS_IN_PROGRESS', state: 'in', completed: false, description: 'In Progress', detail: '1:46 - 3rd Quarter', shortDetail: '1:46 - 3rd', period: 3, displayClock: '1:46' },
  scheduled: { name: 'STATUS_SCHEDULED', state: 'pre', completed: false, description: 'Scheduled', detail: 'Sun, October 11th at 9:30 AM EDT', shortDetail: '10/11 - 9:30 AM EDT' },
  postponed: { name: 'STATUS_POSTPONED', state: 'pre', completed: false, description: 'Postponed', detail: 'Postponed', shortDetail: 'Postponed' },
};

function competitor(id: string | number, homeAway: string, score: unknown, winner = false): Record<string, unknown> {
  return { id: String(id), homeAway, score, winner, team: { id: String(id) } };
}

function event(id: string, week: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const competition: Record<string, unknown> = {
    id: `comp-${id}`,
    competitors: [
      competitor(2, 'home', { value: 31, displayValue: '31' }, true),
      competitor(22, 'away', '20'),
    ],
    status: { type: STATUS.final },
  };
  const { status, ...rest } = overrides;
  if (status) competition.status = status as Record<string, unknown>;

  return {
    id,
    uid: `s:20~l:28~e:${id}`,
    date: `2026-09-1${week}T17:00:00.000Z`,
    name: 'Home at Away',
    shortName: 'A @ H',
    season: { year: 2026 },
    seasonType: 2,
    week: { number: week, text: `Week ${week}` },
    competitions: [competition],
    ...rest,
  };
}

describe('parseScoreboard', () => {
  it('reads season, week, and top-level events', () => {
    const games = [event('g1', 5), event('g2', 5, { status: undefined })];
    const payload = { season: { year: 2026 }, week: { number: 5 }, events: games };
    const parsed = parseScoreboard(payload);
    expect(parsed.season).toBe(2026);
    expect(parsed.currentWeek).toBe(5);
    expect(parsed.events).toHaveLength(2);
  });

  it('returns zeros for an empty/bogus payload instead of crashing', () => {
    expect(parseScoreboard({}).season).toBe(0);
    expect(parseScoreboard(null).currentWeek).toBe(0);
    expect(parseScoreboard('nope').events).toEqual([]);
  });
});

describe('event normalization (scoreboard shape)', () => {
  it('normalizes a final game with object + string scores and known teams', () => {
    const fixtures = [event('g1', 5)];
    const { games, invalid } = normalizeGames(fixtures, 2026);
    expect(invalid).toBe(0);
    expect(games).toHaveLength(1);

    const game = games[0];
    expect(game.id).toBe('g1');
    expect(game.week).toBe(5);
    expect(game.season).toBe(2026);
    expect(game.homeTeamId).toBe('buf'); // espnId 2 → Buffalo
    expect(game.awayTeamId).toBe('ariz'); // espnId 22 → Arizona
    expect(game.homeScore).toBe(31); // object score
    expect(game.awayScore).toBe(20); // string score
    expect(game.final).toBe(true);
    expect(game.postponed).toBe(false);
    expect(game.status).toBe('final');
    expect(game.date).toContain('2026-09-15');
  });

  it('maps live, scheduled, and postponed statuses', () => {
    const live = normalizeEspnEvent(event('live-e', 3, { status: { type: STATUS.live } }), 2026);
    expect(live?.status).toBe('in_progress');
    expect(live?.final).toBe(false);

    const scheduled = normalizeEspnEvent(event('sched-e', 4, { status: { type: STATUS.scheduled } }), 2026);
    expect(scheduled?.status).toBe('scheduled');
    expect(scheduled?.final).toBe(false);

    const postponed = normalizeEspnEvent(event('post-e', 5, { status: { type: STATUS.postponed } }), 2026);
    expect(postponed?.status).toBe('postponed');
    expect(postponed?.postponed).toBe(true);
    expect(postponed?.final).toBe(false);
  });
});

describe('event normalization (team schedule shape)', () => {
  it('reads top-level events (the verified schedule shape)', () => {
    // Schedule endpoints return `events` at the top level, 17 per team.
    const schedulePayload = {
      timestamp: '2026-10-09T00:00:00Z',
      status: 'success',
      season: { year: 2026, type: 2 },
      team: { id: '2' },
      requestedSeason: '2026',
      byeWeek: 10,
      events: [event('s1', 1), event('s2', 2), event('s3', 3)],
    };
    const events = extractEvents(schedulePayload);
    expect(events).toHaveLength(3);
    const { games, invalid } = normalizeGames(events, 2026);
    expect(invalid).toBe(0);
    expect(games.map((g) => g.week)).toEqual([1, 2, 3]);
  });

  it('falls back to the legacy nested sports[0].leagues[0].events shape', () => {
    const payload = {
      sports: [{ leagues: [{ abbreviation: 'NFL', events: [event('n1', 1)] }] }],
    };
    expect(extractEvents(payload)).toHaveLength(1);
  });
});

describe('validation (a 200 is not proof of valid data)', () => {
  it('rejects events with no competitions, unknown teams, or missing week', () => {
    expect(normalizeEspnEvent({ id: 'x' }, 2026)).toBeNull();
    expect(normalizeEspnEvent(event('y', 1, { competitions: [] }), 2026)).toBeNull();
    expect(normalizeEspnEvent(event('z', 1, { competitions: [{ id: 'c', competitors: [] }] }), 2026)).toBeNull();
    expect(normalizeEspnEvent(event('u', 0), 2026)).toBeNull();

    // Unknown teams (espnId 999) are rejected; only known ids pass the map.
    const badTeams = event('v', 1);
    (badTeams.competitions as Array<Record<string, unknown>>)[0] = {
      id: 'c',
      competitors: [
        competitor(999, 'home', 10),
        competitor(999, 'away', 7),
      ],
    };
    expect(normalizeEspnEvent(badTeams, 2026)).toBeNull();
  });

  it('counts rejected events and still keeps the valid ones', () => {
    const events = [event('ok1', 1), event('bad', 1, { competitions: [] })];
    const { games, invalid } = normalizeGames(events, 2026);
    expect(games).toHaveLength(1);
    expect(invalid).toBe(1);
  });

  it('does not invent data when nothing is supplied', () => {
    const { games } = normalizeGames([], 2026);
    expect(games).toHaveLength(0);
    expect(extractEvents({ events: 'not-an-array' })).toEqual([]);
  });
});