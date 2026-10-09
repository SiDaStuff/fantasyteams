import { useCallback, useEffect, useRef, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { getFirebaseDatabase } from '@/lib/firebase';
import type {
  DraftRoomData,
  ExternalNflInsights,
  League,
  LeagueInsights,
  LeagueMember,
  TeamMarket,
  LeagueStandings,
  NflMeta,
  TeamSeasonProfile,
} from '@/types';

export type LoadStatus = 'loading' | 'ready' | 'error';

/**
 * Real-time data layer. API responses remain authoritative and sanitized;
 * Firebase signals only tell the client when to fetch a fresh response.
 */

interface PolledResult<T> {
  data: T | null;
  status: LoadStatus;
  error: string | null;
  refresh: () => void;
}

function useRealtimeLoader<T>(loader: () => Promise<T>, key: string, signalPath: string): PolledResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Keep the latest loader without re-running the subscription effect.
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });

  // React-documented render-time reset when the polled key changes (e.g. a
  // different league id is mounted).
  const [previousKey, setPreviousKey] = useState(key);
  if (previousKey !== key) {
    setPreviousKey(key);
    setData(null);
    setStatus('loading');
    setError(null);
  }

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const result = await loaderRef.current();
        if (!alive) return;
        setData(result);
        setStatus('ready');
        setError(null);
      } catch (err) {
        if (!alive) return;
        setStatus('error');
        setError(apiErrorMessage(err));
      }
    }

    void load();
    const database = getFirebaseDatabase();
    const unsubscribe = database
      ? onValue(ref(database, signalPath), () => { void load(); }, (listenerError) => {
        if (alive) {
          setStatus('error');
          setError(listenerError.message);
        }
      })
      : () => undefined;

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [key, signalPath, nonce]);

  const refresh = useCallback(() => setNonce((current) => current + 1), []);

  return { data, status, error, refresh };
}

export interface LeagueResult {
  league: League | null;
  members: LeagueMember[];
  status: LoadStatus;
  error: string | null;
  refresh: () => void;
}

/** Polls one league (with its members). Used by the lobby. */
export function useLeague(leagueId: string | undefined, intervalMs = 3000): LeagueResult {
  const key = leagueId ?? 'none';
  void intervalMs;
  const { data, status, error, refresh } = useRealtimeLoader<{ league: League; members: LeagueMember[] }>(
    () => {
      if (!leagueId) return Promise.reject(new Error('No league selected.'));
      return api.getLeague(leagueId);
    },
    key,
    leagueId ? `realtimeSignals/leagues/${leagueId}` : 'realtimeSignals/global',
  );

  return {
    league: data?.league ?? null,
    members: data?.members ?? [],
    status: leagueId ? status : 'loading',
    error,
    refresh,
  };
}

export interface MyLeaguesResult {
  leagues: League[];
  status: LoadStatus;
  error: string | null;
  refresh: () => void;
}

/** Polls the leagues the current user belongs to. Used by the dashboard. */
export function useMyLeagues(intervalMs = 5000): MyLeaguesResult {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  void intervalMs;
  const { data, status, error, refresh } = useRealtimeLoader<League[]>(
    () => (uid ? api.getMyLeagues() : Promise.resolve([])),
    uid ?? 'anon',
    'realtimeSignals/global',
  );

  return {
    leagues: data ?? [],
    status: uid ? status : 'ready',
    error,
    refresh,
  };
}

export interface DraftResult {
  room: DraftRoomData | null;
  status: LoadStatus;
  error: string | null;
  refresh: () => void;
}

/**
 * Polls the full draft-room payload (league, members, draft, picks). One
 * request keeps the lobby and the live draft page in sync with every other
 * connected client.
 */
export function useDraft(leagueId: string | undefined, intervalMs = 1000): DraftResult {
  const key = leagueId ?? 'none';
  void intervalMs;
  const { data, status, error, refresh } = useRealtimeLoader<DraftRoomData>(
    () => {
      if (!leagueId) return Promise.reject(new Error('No league selected.'));
      return api.getDraft(leagueId);
    },
    key,
    leagueId ? `realtimeSignals/leagues/${leagueId}` : 'realtimeSignals/global',
  );

  return {
    room: data,
    status: leagueId ? status : 'loading',
    error,
    refresh,
  };
}

/* ─────────────────────────── NFL data hooks ─────────────────────────── */

export interface NflMetaResult {
  meta: NflMeta | null;
  status: LoadStatus;
  error: string | null;
  refresh: () => void;
}

/** Current NFL season/week pointer from the cache. */
export function useNflMeta(intervalMs = 60000): NflMetaResult {
  void intervalMs;
  const { data, status, error, refresh } = useRealtimeLoader(() => api.getNflMeta(), 'nfl-meta', 'realtimeSignals/global');
  return { meta: data, status, error, refresh };
}

export interface NflWeekResult {
  weekData: ApiNflWeekData | null;
  status: LoadStatus;
  error: string | null;
  refresh: () => void;
}

import type { NflWeekData as ApiNflWeekData } from '@/lib/api';

/** A week of games with live scores (used by the NFL Scores page). */
export function useNflWeek(season: number, week: number, intervalMs = 30000): NflWeekResult {
  const key = `nfl-week-${season}-${week}`;
  void intervalMs;
  const { data, status, error, refresh } = useRealtimeLoader(() => api.getNflWeek(season, week), key, 'realtimeSignals/global');
  return { weekData: data, status, error, refresh };
}

export function useExternalNflInsights(season: number, week: number, intervalMs = 10 * 60 * 1000) {
  const key = `external-nfl-${season}-${week}`;
  void intervalMs;
  return useRealtimeLoader<ExternalNflInsights>(() => api.getExternalNflInsights(season, week), key, 'realtimeSignals/global');
}

export function useTeamMarket(leagueId: string | undefined, intervalMs = 15000) {
  void intervalMs;
  return useRealtimeLoader<TeamMarket>(
    () => {
      if (!leagueId) throw new Error('League id is required.');
      return api.getTeamMarket(leagueId);
    },
    leagueId ? `team-market-${leagueId}` : 'team-market-none',
    leagueId ? `realtimeSignals/leagues/${leagueId}` : 'realtimeSignals/global',
  );
}

export interface LeagueStandingsResult {
  standings: LeagueStandings | null;
  status: LoadStatus;
  error: string | null;
  refresh: () => void;
}

/** League standings + weekly breakdown, recomputed server-side from results. */
export function useLeagueStandings(leagueId: string | undefined, intervalMs = 30000): LeagueStandingsResult {
  const key = leagueId ? `standings-${leagueId}` : 'none';
  void intervalMs;
  const { data, status, error, refresh } = useRealtimeLoader<LeagueStandings>(
    () => {
      if (!leagueId) return Promise.reject(new Error('No league selected.'));
      return api.getLeagueStandings(leagueId);
    },
    key,
    leagueId ? `realtimeSignals/leagues/${leagueId}` : 'realtimeSignals/global',
  );
  return { standings: data, status, error, refresh };
}

export interface LeagueInsightsResult {
  insights: LeagueInsights | null;
  status: LoadStatus;
  error: string | null;
  refresh: () => void;
}

/** Everything the season hub needs in one payload: standings, live, projections, activity, progress. */
export function useLeagueInsights(leagueId: string | undefined, intervalMs = 30000): LeagueInsightsResult {
  const key = leagueId ? `insights-${leagueId}` : 'none';
  void intervalMs;
  const { data, status, error, refresh } = useRealtimeLoader<LeagueInsights>(
    () => {
      if (!leagueId) return Promise.reject(new Error('No league selected.'));
      return api.getLeagueInsights(leagueId);
    },
    key,
    leagueId ? `realtimeSignals/leagues/${leagueId}` : 'realtimeSignals/global',
  );
  return { insights: data, status, error, refresh };
}

export interface NflTeamResult {
  profile: TeamSeasonProfile | null;
  status: LoadStatus;
  error: string | null;
  refresh: () => void;
}

/** A team's season profile (record + games + optional league owner). */
export function useNflTeam(
  teamId: string | undefined,
  options: { season?: number; league?: string } = {},
  intervalMs = 60000,
): NflTeamResult {
  const key = teamId ? `nfl-team-${teamId}-${options.season ?? 0}-${options.league ?? ''}` : 'none';
  void intervalMs;
  const { data, status, error, refresh } = useRealtimeLoader<TeamSeasonProfile>(
    () => {
      if (!teamId) return Promise.reject(new Error('No team selected.'));
      return api.getNflTeam(teamId, options);
    },
    key,
    'realtimeSignals/global',
  );
  return { profile: data, status, error, refresh };
}
