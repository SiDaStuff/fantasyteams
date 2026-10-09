import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
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
 * Real-time data layer.
 *
 * The browser cannot subscribe to Realtime Database directly — all data is
 * fetched through Netlify Functions. To keep the lobby and dashboard live we
 * poll the API on an interval (paused while the tab is hidden) and expose a
 * `refresh()` that re-fetches immediately after a mutation.
 */

interface PolledResult<T> {
  data: T | null;
  status: LoadStatus;
  error: string | null;
  refresh: () => void;
}

const LISTEN_TO_VISIBILITY = true;

function usePolledLoader<T>(loader: () => Promise<T>, key: string, intervalMs: number): PolledResult<T> {
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

    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, intervalMs);

    const onVisibilityChange = () => {
      if (!document.hidden) void load();
    };
    if (LISTEN_TO_VISIBILITY) document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [key, intervalMs, nonce]);

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
  const { data, status, error, refresh } = usePolledLoader<{ league: League; members: LeagueMember[] }>(
    () => {
      if (!leagueId) return Promise.reject(new Error('No league selected.'));
      return api.getLeague(leagueId);
    },
    key,
    intervalMs,
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

  const { data, status, error, refresh } = usePolledLoader<League[]>(
    () => (uid ? api.getMyLeagues() : Promise.resolve([])),
    uid ?? 'anon',
    intervalMs,
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
  const { data, status, error, refresh } = usePolledLoader<DraftRoomData>(
    () => {
      if (!leagueId) return Promise.reject(new Error('No league selected.'));
      return api.getDraft(leagueId);
    },
    key,
    intervalMs,
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
  const { data, status, error, refresh } = usePolledLoader(() => api.getNflMeta(), 'nfl-meta', intervalMs);
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
  const { data, status, error, refresh } = usePolledLoader(() => api.getNflWeek(season, week), key, intervalMs);
  return { weekData: data, status, error, refresh };
}

export function useExternalNflInsights(season: number, week: number, intervalMs = 10 * 60 * 1000) {
  const key = `external-nfl-${season}-${week}`;
  return usePolledLoader<ExternalNflInsights>(() => api.getExternalNflInsights(season, week), key, intervalMs);
}

export function useTeamMarket(leagueId: string | undefined, intervalMs = 15000) {
  return usePolledLoader<TeamMarket>(
    () => {
      if (!leagueId) throw new Error('League id is required.');
      return api.getTeamMarket(leagueId);
    },
    leagueId ? `team-market-${leagueId}` : 'team-market-none',
    intervalMs,
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
  const { data, status, error, refresh } = usePolledLoader<LeagueStandings>(
    () => {
      if (!leagueId) return Promise.reject(new Error('No league selected.'));
      return api.getLeagueStandings(leagueId);
    },
    key,
    intervalMs,
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
  const { data, status, error, refresh } = usePolledLoader<LeagueInsights>(
    () => {
      if (!leagueId) return Promise.reject(new Error('No league selected.'));
      return api.getLeagueInsights(leagueId);
    },
    key,
    intervalMs,
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
  const { data, status, error, refresh } = usePolledLoader<TeamSeasonProfile>(
    () => {
      if (!teamId) return Promise.reject(new Error('No team selected.'));
      return api.getNflTeam(teamId, options);
    },
    key,
    intervalMs,
  );
  return { profile: data, status, error, refresh };
}
