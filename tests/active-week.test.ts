import { describe, expect, it } from 'vitest';
import { deriveActiveWeek } from '../netlify/functions/lib/nfl-service';
import type { NflGame } from '../src/types';

function game(week: number, date: string, status: NflGame['status']): NflGame {
  return {
    id: `${week}-${date}`, season: 2026, week, date, status, period: 0, clock: '', detail: '',
    homeTeamId: 'buf', awayTeamId: 'mia', homeScore: status === 'final' ? 24 : null,
    awayScore: status === 'final' ? 17 : null, final: status === 'final', postponed: false,
  };
}

describe('active NFL week', () => {
  it('prefers a live week over future scheduled games', () => {
    const now = Date.parse('2026-10-11T18:00:00Z');
    expect(deriveActiveWeek([
      game(5, '2026-10-11T17:00:00Z', 'in_progress'),
      game(6, '2026-10-15T00:00:00Z', 'scheduled'),
    ], now)).toBe(5);
  });

  it('advances to the next scheduled week after the prior slate finishes', () => {
    const now = Date.parse('2026-10-13T10:00:00Z');
    expect(deriveActiveWeek([
      game(5, '2026-10-13T00:15:00Z', 'final'),
      game(6, '2026-10-16T00:15:00Z', 'scheduled'),
    ], now)).toBe(6);
  });

  it('falls back to the latest completed week during the offseason', () => {
    const now = Date.parse('2027-03-01T00:00:00Z');
    expect(deriveActiveWeek([game(18, '2027-01-04T01:00:00Z', 'final')], now)).toBe(18);
  });
});
