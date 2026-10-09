/**
 * ESPN payload parsing + normalization — pure and unit-tested.
 *
 * Verified live (2026 season):
 *  - Scoreboard returns `events` at the TOP level; each event carries
 *    `id`, `week`, `date`, `season`, `competitions[0]` with `competitors[]`
 *    and `status.type`.
 *  - Team schedule returns `events` at the TOP level too (17 events/team),
 *    with the identical event shape. A few providers/legacy shapes nest them
 *    under `sports[0].leagues[0].events`, which we also accept.
 *
 * Nothing here assumes an HTTP 200 implies valid data: events are fully
 * validated (known team ids, home+away competitors, id, week) before they
 * become `NflGame`s.
 */
import type { NflGame, NflGameStatus } from '../../../src/types';
import { NFL_TEAM_BY_ESPN_ID } from '../../../src/data/nflTeams';
import { normalizeStatus } from './scoring-core';

export interface EspnEvent {
  id?: unknown;
  date?: unknown;
  season?: { year?: unknown };
  week?: { number?: unknown };
  competitions?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/**
 * Pulls events from a payload. Prefers the top-level `events` array (the
 * verified shape for both scoreboard and schedule); falls back to the legacy
 * nested `sports[0].leagues[0].events`.
 */
export function extractEvents(payload: unknown): EspnEvent[] {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as Record<string, unknown>;

  if (Array.isArray(root.events)) return root.events as EspnEvent[];

  const sports = root.sports as Array<Record<string, unknown>> | undefined;
  const leagues = sports?.[0]?.leagues as Array<Record<string, unknown>> | undefined;
  const nested = leagues?.[0]?.events;
  if (Array.isArray(nested)) return nested as EspnEvent[];

  return [];
}

export interface ParsedScoreboard {
  season: number;
  currentWeek: number;
  events: EspnEvent[];
}

/** Reads season + current week from a scoreboard payload. */
export function parseScoreboard(payload: unknown): ParsedScoreboard {
  const root = (payload ?? {}) as Record<string, unknown>;
  return {
    season: Number((root.season as { year?: unknown } | undefined)?.year ?? 0),
    currentWeek: Number((root.week as { number?: unknown } | undefined)?.number ?? 0),
    events: extractEvents(payload),
  };
}

function scoreOf(competitor: Record<string, unknown> | undefined): number | null {
  if (!competitor) return null;
  const raw = competitor.score;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (raw !== null && typeof raw === 'object') {
    const value = (raw as { value?: unknown }).value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }
  return null;
}

function competitorTeamId(competitor: Record<string, unknown> | undefined): number {
  if (!competitor) return NaN;
  return Number(competitor.id ?? (competitor.team as Record<string, unknown> | undefined)?.id);
}

/**
 * Validates and normalizes one ESPN event into an `NflGame`, or returns null
 * when the event is malformed or references unknown teams.
 */
export function normalizeEspnEvent(raw: EspnEvent | Record<string, unknown> | undefined, season: number): NflGame | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id !== '' ? raw.id : null;
  if (!id) return null;

  const competition = Array.isArray(raw.competitions) ? raw.competitions[0] : undefined;
  if (!competition || typeof competition !== 'object') return null;

  const competitors = Array.isArray(competition.competitors) ? competition.competitors : [];
  const home = competitors.find((entry: Record<string, unknown>) => entry.homeAway === 'home');
  const away = competitors.find((entry: Record<string, unknown>) => entry.homeAway === 'away');
  const homeTeam = NFL_TEAM_BY_ESPN_ID[competitorTeamId(home)];
  const awayTeam = NFL_TEAM_BY_ESPN_ID[competitorTeamId(away)];
  if (!homeTeam || !awayTeam) return null;

  const week = Number((raw.week as { number?: unknown } | undefined)?.number ?? 0);
  if (week < 1) return null;

  const statusType = (competition.status as Record<string, unknown> | undefined)?.type;
  const normalized = normalizeStatus(statusType);
  const typeRecord = (statusType ?? {}) as Record<string, unknown>;
  const detail = String(typeRecord.shortDetail ?? '') || String(typeRecord.detail ?? '');

  return {
    id,
    season,
    week,
    date: typeof raw.date === 'string' ? raw.date : '',
    status: normalized.status as NflGameStatus,
    period: Number((competition.status as Record<string, unknown> | undefined)?.period ?? 0),
    clock: String((competition.status as Record<string, unknown> | undefined)?.displayClock ?? ''),
    detail,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    homeScore: scoreOf(home),
    awayScore: scoreOf(away),
    final: normalized.final,
    postponed: normalized.postponed,
  };
}

export interface NormalizedGames {
  games: NflGame[];
  /** Count of events that were rejected during validation. */
  invalid: number;
}

/** Normalizes an array of events, counting rejections for diagnostics. */
export function normalizeGames(events: readonly EspnEvent[] | undefined, season: number): NormalizedGames {
  const games: NflGame[] = [];
  let invalid = 0;
  for (const event of events ?? []) {
    const game = normalizeEspnEvent(event, season);
    if (game) games.push(game);
    else invalid += 1;
  }
  return { games, invalid };
}