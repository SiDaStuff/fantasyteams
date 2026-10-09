import { getFirebaseAuth } from '@/lib/firebase';
import { toErrorMessage } from '@/lib/errors';
import type {
  Draft,
  ExternalNflInsights,
  DraftFormat,
  DraftPick,
  DraftPickTimer,
  DraftRoomData,
  DraftStatus,
  League,
  LeagueActivityEvent,
  LeagueInsights,
  LeagueMember,
  LeaguePrefs,
  LeaguePreview,
  LeagueStandings,
  LeagueStatus,
  LeagueRole,
  LiveStandings,
  NflGame,
  NflGameStatus,
  NflMeta,
  ProjectionOwnerRow,
  ScoringMode,
  SeasonProgress,
  TeamSeasonProfile,
  UserProfile,
} from '@/types';

/**
 * Typed client for the Fantasy Teams API (Netlify Function).
 *
 * The browser has no Firestore/Realtime Database access — every request goes
 * through this module, authenticated with the current Firebase ID token.
 */

export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? '/.netlify/functions/api';

/** Error thrown by the API layer; `code` mirrors the server's error codes. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const STATUS_CODES: Record<number, string> = {
  400: 'invalid-argument',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not-found',
  409: 'conflict',
  429: 'resource-exhausted',
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = getFirebaseAuth();
  const user = auth?.currentUser;

  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');

  if (!user) {
    throw new ApiError(401, 'unauthenticated', 'You must be signed in.');
  }

  const token = await user.getIdToken();
  headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'network', 'Could not reach the server. Check your connection.');
  }

  if (!response.ok) {
    let data: { code?: string; message?: string } | null = null;
    try {
      data = (await response.json()) as { code?: string; message?: string } | null;
    } catch {
      /* non-JSON error body */
    }
    const code = data?.code ?? STATUS_CODES[response.status] ?? 'internal';
    throw new ApiError(
      response.status,
      code,
      data?.message ?? toErrorMessage(null, `Request failed (${response.status}).`),
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/* ─────────────────────────── serializers ─────────────────────────── */

function date(value: unknown): Date {
  const ms = Number(value);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms) : new Date(0);
}

function mapLeague(raw: Record<string, unknown>): League {
  return {
    id: String(raw.id),
    name: String(raw.name ?? 'Untitled League'),
    season: Number(raw.season ?? 2026),
    maxParticipants: Number(raw.maxParticipants ?? 8),
    draftFormat: (raw.draftFormat === 'linear' ? 'linear' : 'snake') as DraftFormat,
    draftPickTimerSeconds: Number(raw.draftPickTimerSeconds ?? 60) as DraftPickTimer,
    joinCode: String(raw.joinCode ?? ''),
    commissionerId: String(raw.commissionerId ?? ''),
    status: (String(raw.status ?? 'waiting') as LeagueStatus) || 'waiting',
    memberCount: Number(raw.memberCount ?? 0),
    createdAt: date(raw.createdAt),
    updatedAt: date(raw.updatedAt),
  };
}

function mapMember(raw: Record<string, unknown>): LeagueMember {
  return {
    id: String(raw.id ?? raw.userId),
    leagueId: String(raw.leagueId ?? ''),
    userId: String(raw.userId),
    displayName: String(raw.displayName ?? 'Player'),
    photoURL: typeof raw.photoURL === 'string' ? raw.photoURL : null,
    role: (raw.role === 'commissioner' ? 'commissioner' : 'member') as LeagueRole,
    isReady: raw.isReady === true,
    joinedAt: date(raw.joinedAt),
  };
}

function mapProfile(raw: Record<string, unknown>): UserProfile {
  return {
    uid: String(raw.uid),
    displayName: String(raw.displayName ?? 'Player'),
    email: typeof raw.email === 'string' ? raw.email : null,
    photoURL: typeof raw.photoURL === 'string' ? raw.photoURL : null,
    authProvider: String(raw.authProvider ?? 'unknown'),
    createdAt: date(raw.createdAt),
    updatedAt: date(raw.updatedAt),
  };
}

function nullableDate(value: unknown): Date | null {
  const ms = Number(value);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms) : null;
}

function externalDate(value: unknown): Date | null {
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? new Date(ms) : null;
  }
  return nullableDate(value);
}

function mapDraft(raw: Record<string, unknown>): Draft {
  const sequence = Array.isArray(raw.pickSequence)
    ? raw.pickSequence.filter((id): id is string => typeof id === 'string')
    : [];
  const order = Array.isArray(raw.order)
    ? raw.order.filter((id): id is string => typeof id === 'string')
    : [];
  const currentPick = Number(raw.currentPick ?? 0);

  return {
    leagueId: String(raw.leagueId ?? ''),
    status: (String(raw.status ?? 'upcoming') as DraftStatus) || 'upcoming',
    format: (raw.format === 'linear' ? 'linear' : 'snake') as DraftFormat,
    rounds: Number(raw.rounds ?? 0),
    order,
    pickSequence: sequence,
    currentPick,
    totalPicks: Number(raw.totalPicks ?? 0),
    currentPickUserId: typeof raw.currentPickUserId === 'string' ? raw.currentPickUserId : null,
    pickDeadline: nullableDate(raw.pickDeadline),
    pauseRemainingMs: typeof raw.pauseRemainingMs === 'number' ? raw.pauseRemainingMs : null,
    pausedAt: nullableDate(raw.pausedAt),
    startedAt: nullableDate(raw.startedAt),
    completedAt: nullableDate(raw.completedAt),
  };
}

function mapPick(raw: Record<string, unknown>): DraftPick {
  return {
    leagueId: String(raw.leagueId ?? ''),
    pickNumber: Number(raw.pickNumber ?? 0),
    round: Number(raw.round ?? 1),
    userId: String(raw.userId ?? ''),
    displayName: String(raw.displayName ?? 'Player'),
    nflTeamId: String(raw.nflTeamId ?? ''),
    teamName: String(raw.teamName ?? ''),
    teamAbbreviation: String(raw.teamAbbreviation ?? ''),
    auto: raw.auto === true,
    pickedAt: date(raw.pickedAt),
  };
}

function mapDraftRoom(raw: {
  league: Record<string, unknown>;
  draft: Record<string, unknown>;
  members: Array<Record<string, unknown>>;
  picks: Array<Record<string, unknown>>;
  isCommissioner: boolean;
}): DraftRoomData {
  return {
    league: mapLeague(raw.league),
    draft: mapDraft(raw.draft),
    members: (raw.members ?? []).map(mapMember),
    picks: (raw.picks ?? []).map(mapPick),
    isCommissioner: raw.isCommissioner === true,
  };
}

/** A game enriched with display names for both franchises. */
export interface NflGameDetail extends NflGame {
  homeName: string;
  awayName: string;
  homeAbbreviation: string;
  awayAbbreviation: string;
}

export interface NflWeekData {
  season: number;
  week: number;
  currentWeek: number;
  games: NflGameDetail[];
}

function mapNflGame(raw: Record<string, unknown>): NflGameDetail {
  return {
    id: String(raw.id ?? ''),
    season: Number(raw.season ?? 0),
    week: Number(raw.week ?? 0),
    date: String(raw.date ?? ''),
    status: (String(raw.status ?? 'scheduled') as NflGameStatus) || 'scheduled',
    period: Number(raw.period ?? 0),
    clock: String(raw.clock ?? ''),
    detail: String(raw.detail ?? ''),
    homeTeamId: String(raw.homeTeamId ?? ''),
    awayTeamId: String(raw.awayTeamId ?? ''),
    homeScore: typeof raw.homeScore === 'number' ? raw.homeScore : null,
    awayScore: typeof raw.awayScore === 'number' ? raw.awayScore : null,
    final: raw.final === true,
    postponed: raw.postponed === true,
    homeName: String(raw.homeName ?? ''),
    awayName: String(raw.awayName ?? ''),
    homeAbbreviation: String(raw.homeAbbreviation ?? ''),
    awayAbbreviation: String(raw.awayAbbreviation ?? ''),
  };
}

function mapNflMeta(raw: { season?: unknown; currentWeek?: unknown; lastSyncAt?: unknown }): NflMeta {
  return {
    season: Number(raw.season ?? 0),
    currentWeek: Number(raw.currentWeek ?? 0),
    lastSyncAt: nullableDate(raw.lastSyncAt),
  };
}

function mapStandings(raw: {
  leagueId: unknown;
  season: unknown;
  currentWeek: unknown;
  standings?: Array<Record<string, unknown>>;
  weeklyWins?: Record<string, Record<string, number>>;
  isCommissioner?: unknown;
}): LeagueStandings {
  return {
    leagueId: String(raw.leagueId ?? ''),
    season: Number(raw.season ?? 0),
    currentWeek: Number(raw.currentWeek ?? 0),
    weeklyWins: raw.weeklyWins ?? {},
    isCommissioner: raw.isCommissioner === true,
    standings: (raw.standings ?? []).map((row) => ({
      rank: Number(row.rank ?? 0),
      userId: String(row.userId ?? ''),
      displayName: String(row.displayName ?? 'Player'),
      photoURL: typeof row.photoURL === 'string' ? row.photoURL : null,
      totalWins: Number(row.totalWins ?? 0),
      winsBehind: Number(row.winsBehind ?? 0),
      teams: ((row.teams as Array<Record<string, unknown>> | undefined) ?? []).map(mapStandingTeam),
    })),
  };
}

function mapTeamSeason(raw: {
  teamId: unknown;
  season: unknown;
  record?: Record<string, unknown>;
  games?: Array<Record<string, unknown>>;
  owner?: { userId?: unknown; displayName?: unknown } | null;
}): TeamSeasonProfile {
  return {
    teamId: String(raw.teamId ?? ''),
    season: Number(raw.season ?? 0),
    record: {
      teamId: String(raw.teamId ?? ''),
      wins: Number(raw.record?.wins ?? 0),
      losses: Number(raw.record?.losses ?? 0),
      ties: Number(raw.record?.ties ?? 0),
      gamesPlayed: Number(raw.record?.gamesPlayed ?? 0),
      pointsFor: Number(raw.record?.pointsFor ?? 0),
      pointsAgainst: Number(raw.record?.pointsAgainst ?? 0),
    },
    games: (raw.games ?? []).map((game) => ({
      id: String(game.id ?? ''),
      week: Number(game.week ?? 0),
      date: typeof game.date === 'string' ? game.date : null,
      status: (String(game.status ?? 'scheduled') as NflGameStatus) || 'scheduled',
      isHome: game.isHome === true,
      opponentId: String(game.opponentId ?? ''),
      opponentName: String(game.opponentName ?? ''),
      opponentAbbreviation: String(game.opponentAbbreviation ?? ''),
      teamScore: typeof game.teamScore === 'number' ? game.teamScore : null,
      opponentScore: typeof game.opponentScore === 'number' ? game.opponentScore : null,
      result: (game.result as TeamSeasonProfile['games'][number]['result']) ?? null,
    })),
    owner: raw.owner ? { userId: String(raw.owner.userId), displayName: String(raw.owner.displayName) } : null,
  };
}

function mapProjectionOwner(raw: Record<string, unknown>): ProjectionOwnerRow {
  return {
    userId: String(raw.userId ?? ''),
    displayName: String(raw.displayName ?? 'Player'),
    photoURL: typeof raw.photoURL === 'string' ? raw.photoURL : null,
    confirmedWins: Number(raw.confirmedWins ?? 0),
    projectedFinalWins: Number(raw.projectedFinalWins ?? 0),
    expectedRemainingWins: Number(raw.expectedRemainingWins ?? 0),
    championshipProbability: Number(raw.championshipProbability ?? 0),
    likelyFinalRank: Number(raw.likelyFinalRank ?? 0),
  };
}

function mapProgress(raw: Record<string, unknown>): SeasonProgress {
  return {
    currentWeek: Number(raw.currentWeek ?? 0),
    totalWeeks: Number(raw.totalWeeks ?? 18),
    completedGames: Number(raw.completedGames ?? 0),
    inProgressGames: Number(raw.inProgressGames ?? 0),
    remainingGames: Number(raw.remainingGames ?? 0),
    pct: Number(raw.pct ?? 0),
  };
}

function mapActivityEvent(raw: Record<string, unknown>): LeagueActivityEvent {
  return {
    key: String(raw.key ?? ''),
    type: (String(raw.type ?? 'draft') as LeagueActivityEvent['type']),
    message: String(raw.message ?? ''),
    timestamp: date(raw.timestamp),
  };
}

function mapLiveRows(raw: Array<Record<string, unknown>>): LiveStandings['rows'] {
  return raw.map((row) => ({
    rank: Number(row.rank ?? 0),
    userId: String(row.userId ?? ''),
    displayName: String(row.displayName ?? 'Player'),
    photoURL: typeof row.photoURL === 'string' ? row.photoURL : null,
    confirmedWins: Number(row.confirmedWins ?? 0),
    potentialWins: Number(row.potentialWins ?? 0),
    liveTotal: Number(row.liveTotal ?? 0),
    winsBehind: Number(row.winsBehind ?? 0),
    teams: ((row.teams as Array<Record<string, unknown>> | undefined) ?? []).map((team) => ({
      teamId: String(team.teamId ?? ''),
      name: String(team.name ?? ''),
      abbreviation: String(team.abbreviation ?? ''),
      wins: Number(team.wins ?? 0),
      losses: Number(team.losses ?? 0),
      ties: Number(team.ties ?? 0),
      points: Number(team.points ?? 0),
    })),
  }));
}

function mapInsights(raw: Record<string, unknown>): LeagueInsights {
  const prefsRaw = (raw.prefs ?? {}) as Record<string, unknown>;
  const scoringMode: ScoringMode = prefsRaw.scoringMode === 'points' ? 'points' : 'wins';
  const prefs: LeaguePrefs = {
    projectionsEnabled: prefsRaw.projectionsEnabled !== false,
    projectionsVisible: prefsRaw.projectionsVisible !== false,
    scoringMode,
  };
  const syncRaw = (raw.sync ?? {}) as Record<string, unknown>;
  const projectionRaw = raw.projection as Record<string, unknown> | null;

  return {
    leagueId: String(raw.leagueId ?? ''),
    season: Number(raw.season ?? 0),
    currentWeek: Number(raw.currentWeek ?? 0),
    totalWeeks: Number(raw.totalWeeks ?? 18),
    prefs,
    sync: { lastSyncAt: nullableDate(syncRaw.lastSyncAt), lastError: typeof syncRaw.lastError === 'string' ? syncRaw.lastError : null },
    announcement: raw.announcement
      ? {
          text: String((raw.announcement as Record<string, unknown>).text ?? ''),
          by: String((raw.announcement as Record<string, unknown>).by ?? ''),
          at: date((raw.announcement as Record<string, unknown>).at),
        }
      : null,
    progress: mapProgress((raw.progress as Record<string, unknown> | undefined) ?? {}),
    standings: mapStandingsRows(raw.standings as Array<Record<string, unknown>> | undefined),
    weeklyWins: (raw.weeklyWins as Record<string, Record<string, number>> | undefined) ?? {},
    live:
      raw.live !== null && raw.live !== undefined
        ? { active: true, rows: mapLiveRows((raw.live as { rows: Array<Record<string, unknown>> }).rows ?? []) }
        : null,
    projection: projectionRaw
      ? {
          computedAt: nullableDate(projectionRaw.computedAt) ?? new Date(0),
          iterations: Number(projectionRaw.iterations ?? 0),
          remainingGames: Number(projectionRaw.remainingGames ?? 0),
          owners: ((projectionRaw.owners as Array<Record<string, unknown>> | undefined) ?? []).map(mapProjectionOwner),
        }
      : null,
    projectionError: typeof raw.projectionError === 'string' ? raw.projectionError : null,
    activity: ((raw.activity as Array<Record<string, unknown>> | undefined) ?? []).map(mapActivityEvent),
    leader: raw.leader
      ? {
          userId: String((raw.leader as Record<string, unknown>).userId ?? ''),
          displayName: String((raw.leader as Record<string, unknown>).displayName ?? ''),
          wins: Number((raw.leader as Record<string, unknown>).wins ?? 0),
        }
      : null,
    closestCompetitors: ((raw.closestCompetitors as Array<Record<string, unknown>> | undefined) ?? []).map((row) => ({
      userId: String(row.userId ?? ''),
      displayName: String(row.displayName ?? ''),
      wins: Number(row.wins ?? 0),
      behind: Number(row.behind ?? 0),
    })),
    isCommissioner: raw.isCommissioner === true,
  };
}

function mapStandingsRows(rows?: Array<Record<string, unknown>>): LeagueStandings['standings'] {
  return (rows ?? []).map((row) => ({
    rank: Number(row.rank ?? 0),
    userId: String(row.userId ?? ''),
    displayName: String(row.displayName ?? 'Player'),
    photoURL: typeof row.photoURL === 'string' ? row.photoURL : null,
    totalWins: Number(row.totalWins ?? 0),
    winsBehind: Number(row.winsBehind ?? 0),
    teams: ((row.teams as Array<Record<string, unknown>> | undefined) ?? []).map(mapStandingTeam),
  }));
}

function mapStandingTeam(team: Record<string, unknown>) {
  const next = team.next;
  return {
    teamId: String(team.teamId ?? ''),
    name: String(team.name ?? ''),
    abbreviation: String(team.abbreviation ?? ''),
    wins: Number(team.wins ?? 0),
    losses: Number(team.losses ?? 0),
    ties: Number(team.ties ?? 0),
    points: Number(team.points ?? 0),
    next: next
      ? {
          opponentId: String((next as Record<string, unknown>).opponentId ?? ''),
          opponentName: String((next as Record<string, unknown>).opponentName ?? ''),
          opponentAbbreviation: String((next as Record<string, unknown>).opponentAbbreviation ?? ''),
          week: Number((next as Record<string, unknown>).week ?? 0),
          date: String((next as Record<string, unknown>).date ?? ''),
        }
      : null,
  };
}

/* ─────────────────────────── payload types ─────────────────────────── */

export interface CreateLeagueInput {
  name: string;
  season: number;
  maxParticipants: number;
  draftFormat: DraftFormat;
  draftPickTimerSeconds: DraftPickTimer;
}

export interface CreateLeagueResult {
  leagueId: string;
  joinCode: string;
}

export interface LeagueDetail {
  league: League;
  members: LeagueMember[];
}

/* ─────────────────────────── public API ─────────────────────────── */

export const api = {
  /** Returns the caller's profile, creating it on first use. */
  async getMe(): Promise<UserProfile> {
    const raw = await request<Record<string, unknown>>('/me');
    return mapProfile(raw);
  },

  /** Updates own display name / photo (keeps Auth + Realtime DB in sync). */
  async updateProfile(patch: { displayName?: string; photoURL?: string | null }): Promise<UserProfile> {
    const raw = await request<Record<string, unknown>>('/me', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    return mapProfile(raw);
  },

  async createLeague(input: CreateLeagueInput): Promise<CreateLeagueResult> {
    return request<CreateLeagueResult>('/leagues', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async joinLeague(code: string): Promise<{ leagueId: string }> {
    return request<{ leagueId: string }>('/leagues/join', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },

  async getLeagueByCode(code: string): Promise<LeaguePreview> {
    return request<LeaguePreview>(`/leagues/by-code/${encodeURIComponent(code)}`);
  },

  async getLeague(leagueId: string): Promise<LeagueDetail> {
    const raw = await request<{ league: Record<string, unknown>; members: Array<Record<string, unknown>> }>(
      `/leagues/${encodeURIComponent(leagueId)}`,
    );
    return {
      league: mapLeague(raw.league),
      members: (raw.members ?? []).map(mapMember),
    };
  },

  async getMyLeagues(): Promise<League[]> {
    const raw = await request<Array<Record<string, unknown>>>('/leagues/mine');
    return (raw ?? []).map(mapLeague);
  },

  async updateLeagueSettings(
    leagueId: string,
    patch: { name?: string; draftFormat?: DraftFormat; draftPickTimerSeconds?: DraftPickTimer; maxParticipants?: number },
  ): Promise<void> {
    await request<{ ok: true }>(`/leagues/${encodeURIComponent(leagueId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  async setReady(leagueId: string, isReady: boolean): Promise<void> {
    await request<{ ok: true }>(`/leagues/${encodeURIComponent(leagueId)}/ready`, {
      method: 'PATCH',
      body: JSON.stringify({ isReady }),
    });
  },

  /* ── Draft ── */

  async getDraft(leagueId: string): Promise<DraftRoomData> {
    const raw = await request<DraftRoomRawPayload>(`/leagues/${encodeURIComponent(leagueId)}/draft`);
    return mapDraftRoom(raw);
  },

  async startDraft(leagueId: string, rounds: number): Promise<DraftRoomData> {
    const raw = await request<DraftRoomRawPayload>(`/leagues/${encodeURIComponent(leagueId)}/draft/start`, {
      method: 'POST',
      body: JSON.stringify({ rounds }),
    });
    return mapDraftRoom(raw);
  },

  async submitPick(leagueId: string, nflTeamId: string): Promise<DraftRoomData> {
    const raw = await request<DraftRoomRawPayload>(`/leagues/${encodeURIComponent(leagueId)}/draft/pick`, {
      method: 'POST',
      body: JSON.stringify({ nflTeamId }),
    });
    return mapDraftRoom(raw);
  },

  async pauseDraft(leagueId: string): Promise<DraftRoomData> {
    const raw = await request<DraftRoomRawPayload>(`/leagues/${encodeURIComponent(leagueId)}/draft/pause`, {
      method: 'POST',
    });
    return mapDraftRoom(raw);
  },

  async resumeDraft(leagueId: string): Promise<DraftRoomData> {
    const raw = await request<DraftRoomRawPayload>(`/leagues/${encodeURIComponent(leagueId)}/draft/resume`, {
      method: 'POST',
    });
    return mapDraftRoom(raw);
  },

  async randomizeDraftOrder(leagueId: string): Promise<void> {
    await request<{ ok: true }>(`/leagues/${encodeURIComponent(leagueId)}/draft/order/randomize`, {
      method: 'POST',
    });
  },

  async setDraftOrder(leagueId: string, order: string[]): Promise<void> {
    await request<{ ok: true }>(`/leagues/${encodeURIComponent(leagueId)}/draft/order`, {
      method: 'POST',
      body: JSON.stringify({ order }),
    });
  },

  async updateDraftSettings(
    leagueId: string,
    patch: { rounds?: number; draftFormat?: DraftFormat; draftPickTimerSeconds?: DraftPickTimer },
  ): Promise<void> {
    await request<{ ok: true }>(`/leagues/${encodeURIComponent(leagueId)}/draft`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  /* ── NFL data & season scoring ── */

  async getNflMeta(): Promise<NflMeta> {
    return mapNflMeta(await request<{ season?: unknown; currentWeek?: unknown; lastSyncAt?: unknown }>('/nfl/meta'));
  },

  async getNflWeek(season: number, week: number): Promise<NflWeekData> {
    const raw = await request<{
      season?: unknown;
      week?: unknown;
      currentWeek?: unknown;
      games?: Array<Record<string, unknown>>;
    }>(`/nfl/games?season=${season}&week=${week}`);
    return {
      season: Number(raw.season ?? 0),
      week: Number(raw.week ?? 0),
      currentWeek: Number(raw.currentWeek ?? 0),
      games: (raw.games ?? []).map(mapNflGame),
    };
  },

  async getExternalNflInsights(season: number, week: number): Promise<ExternalNflInsights> {
    const raw = await request<{
      news?: Array<Record<string, unknown>>;
      forecasts?: Array<Record<string, unknown>>;
      updatedAt?: unknown;
      oddsConfigured?: unknown;
      errors?: unknown;
    }>(`/nfl/external?season=${season}&week=${week}`);
    return {
      news: (raw.news ?? []).map((item) => ({
        id: String(item.id ?? ''),
        headline: String(item.headline ?? ''),
        description: String(item.description ?? ''),
        url: String(item.url ?? ''),
        publishedAt: externalDate(item.publishedAt),
        source: String(item.source ?? 'External'),
      })),
      forecasts: (raw.forecasts ?? []).map((item) => ({
        id: String(item.id ?? ''),
        homeTeamId: String(item.homeTeamId ?? ''),
        awayTeamId: String(item.awayTeamId ?? ''),
        commenceTime: externalDate(item.commenceTime),
        homeProbability: Number(item.homeProbability ?? 0),
        awayProbability: Number(item.awayProbability ?? 0),
        bookmakers: Number(item.bookmakers ?? 0),
      })),
      updatedAt: nullableDate(raw.updatedAt) ?? new Date(),
      oddsConfigured: raw.oddsConfigured === true,
      errors: Array.isArray(raw.errors) ? raw.errors.map(String) : [],
    };
  },

  async getNflTeam(teamId: string, options: { season?: number; league?: string } = {}): Promise<TeamSeasonProfile> {
    const params = new URLSearchParams();
    if (options.season) params.set('season', String(options.season));
    if (options.league) params.set('league', options.league);
    const query = params.toString();
    return mapTeamSeason(
      await request<{
        teamId: unknown;
        season: unknown;
        record?: Record<string, unknown>;
        games?: Array<Record<string, unknown>>;
        owner?: { userId?: unknown; displayName?: unknown } | null;
      }>(`/nfl/team/${encodeURIComponent(teamId)}${query ? `?${query}` : ''}`),
    );
  },

  async getLeagueStandings(leagueId: string, season?: number): Promise<LeagueStandings> {
    const query = season ? `?season=${season}` : '';
    return mapStandings(
      await request<{
        leagueId: unknown;
        season: unknown;
        currentWeek: unknown;
        standings?: Array<Record<string, unknown>>;
        weeklyWins?: Record<string, Record<string, number>>;
        isCommissioner?: unknown;
      }>(`/leagues/${encodeURIComponent(leagueId)}/standings${query}`),
    );
  },

  async syncScores(leagueId: string): Promise<{ ok: boolean; changed?: number; skipped?: boolean; message?: string }> {
    return request<{ ok: boolean; changed?: number; skipped?: boolean; message?: string }>(
      `/leagues/${encodeURIComponent(leagueId)}/sync`,
      { method: 'POST' },
    );
  },

  async getLeagueInsights(leagueId: string): Promise<LeagueInsights> {
    return mapInsights(await request<Record<string, unknown>>(`/leagues/${encodeURIComponent(leagueId)}/insights`));
  },

  async updateLeaguePrefs(
    leagueId: string,
    patch: { projectionsEnabled?: boolean; projectionsVisible?: boolean; scoringMode?: ScoringMode },
  ): Promise<void> {
    await request<{ ok: true }>(`/leagues/${encodeURIComponent(leagueId)}/prefs`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  /* ── Leader (commissioner) commands ── */

  async setAnnouncement(leagueId: string, message: string): Promise<void> {
    await request<{ ok: true }>(`/leagues/${encodeURIComponent(leagueId)}/announcement`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  },

  async resetReady(leagueId: string): Promise<void> {
    await request<{ ok: true }>(`/leagues/${encodeURIComponent(leagueId)}/reset-ready`, {
      method: 'POST',
    });
  },

  async transferCommissioner(leagueId: string, userId: string): Promise<void> {
    await request<{ ok: true }>(`/leagues/${encodeURIComponent(leagueId)}/commissioner`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  },

  async removeLeagueMember(leagueId: string, userId: string): Promise<void> {
    await request<{ ok: true }>(`/leagues/${encodeURIComponent(leagueId)}/member/remove`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  },
};

interface DraftRoomRawPayload {
  league: Record<string, unknown>;
  draft: Record<string, unknown>;
  members: Array<Record<string, unknown>>;
  picks: Array<Record<string, unknown>>;
  isCommissioner: boolean;
}

/** Friendly message for any API/network error. */
export function apiErrorMessage(error: unknown): string {
  return toErrorMessage(error, 'Something went wrong. Please try again.');
}

export function apiErrorCode(error: unknown): string {
  return error instanceof ApiError ? error.code : 'unknown';
}
