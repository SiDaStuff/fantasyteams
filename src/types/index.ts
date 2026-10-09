/**
 * Shared domain types for Fantasy Teams.
 *
 * These mirror the JSON shapes served by the Netlify API function
 * (`netlify/functions/api.ts`), which is the only consumer of the
 * Firebase Realtime Database (see `database.rules.json`).
 */

/* ─────────────────────────── Enums & constants ─────────────────────────── */

export type DraftFormat = 'snake' | 'linear';

/**
 * League lifecycle. Stage 1 only reaches `waiting`; later stages advance
 * through `drafting` → `active` → `completed`.
 */
export type LeagueStatus = 'waiting' | 'drafting' | 'active' | 'completed';

export type LeagueRole = 'commissioner' | 'member';

export type PlayerReadyStatus = 'ready' | 'not_ready';

export const DRAFT_PICK_TIMERS = [30, 60, 90, 120] as const;
export type DraftPickTimer = (typeof DRAFT_PICK_TIMERS)[number];

export const MIN_PARTICIPANTS = 2;
export const MAX_PARTICIPANTS = 16;
export const LEAGUE_CODE_LENGTH = 6;

export const SEASON_DEFAULT = 2026;
export const SEASON_MIN = 2024;
export const SEASON_MAX = 2031;

export const LEAGUE_NAME_MIN = 3;
export const LEAGUE_NAME_MAX = 60;

/* ─────────────────────────────── users ─────────────────────────────────── */

export interface UserProfile {
  /** Firebase Auth UID — also the document id. */
  uid: string;
  displayName: string;
  email: string | null;
  photoURL: string | null;
  /** 'google.com' | 'password' */
  authProvider: string;
  createdAt: Date;
  updatedAt: Date;
}

/* ─────────────────────────────── leagues ───────────────────────────────── */

export interface League {
  id: string;
  name: string;
  /** NFL season this league plays, e.g. 2026 */
  season: number;
  maxParticipants: number;
  draftFormat: DraftFormat;
  draftPickTimerSeconds: DraftPickTimer;
  /** Unique 6-character code, generated server-side. */
  joinCode: string;
  commissionerId: string;
  status: LeagueStatus;
  /** Denormalized count, maintained server-side in a transaction. */
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
  prefs: LeaguePrefs;
}

/* ─────────────────────────── leagueMembers ─────────────────────────────── */

/**
 * Membership document. Id is `${leagueId}_${userId}`.
 *
 * Membership records — including the `role` field and `memberCount` on the
 * league — are only ever written by the Cloud Functions layer. Clients may
 * only toggle `isReady` on their own record (enforced in security rules).
 */
export interface LeagueMember {
  id: string;
  leagueId: string;
  userId: string;
  displayName: string;
  photoURL: string | null;
  role: LeagueRole;
  isReady: boolean;
  joinedAt: Date;
}

/* ─────────────────────────────── drafts ────────────────────────────────── */

export type DraftStatus = 'upcoming' | 'live' | 'paused' | 'completed';

/**
 * The draft for a league (one per league, keyed by leagueId under /drafts).
 * All state is authoritative server data: order, the full pick sequence, and
 * the current pick deadline are generated and stored server-side.
 */
export interface Draft {
  leagueId: string;
  status: DraftStatus;
  format: DraftFormat;
  /** Number of complete rounds drafted. */
  rounds: number;
  /** Round-1 pick order (userIds), commissioner-configurable pre-draft. */
  order: string[];
  /** Fully expanded pick order: length = rounds × participants. */
  pickSequence: string[];
  /** 1-based index of the pick on the clock; 0 before the draft starts. */
  currentPick: number;
  totalPicks: number;
  /** User id holding the current pick, derived from pickSequence. */
  currentPickUserId: string | null;
  /** Authoritative server deadline (epoch ms) for the current pick. */
  pickDeadline: Date | null;
  /** Remaining time captured when the draft was paused (ms). */
  pauseRemainingMs: number | null;
  pausedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

/* ─────────────────────────────── draftPicks ────────────────────────────── */

/** A single draft selection. */
export interface DraftPick {
  leagueId: string;
  pickNumber: number;
  round: number;
  userId: string;
  displayName: string;
  nflTeamId: string;
  teamName: string;
  teamAbbreviation: string;
  /** True when the server auto-selected this team after the timer expired. */
  auto: boolean;
  pickedAt: Date;
}

/* ─────────────────────── draft room payload (API) ──────────────────────── */

/** Everything the draft page (or pre-draft lobby) needs from one request. */
export interface DraftRoomData {
  league: League;
  draft: Draft;
  members: LeagueMember[];
  picks: DraftPick[];
  isCommissioner: boolean;
}

/* ─────────────────────────────── nflTeams ──────────────────────────────── */

export type NFLConference = 'AFC' | 'NFC';

/** NFL team reference data. Ship source: src/data/nflTeams.ts. */
export interface NFLTeam {
  /** Stable id, e.g. 'kc' */
  id: string;
  /** Full official name, e.g. 'Kansas City Chiefs' */
  name: string;
  city: string;
  nickname: string;
  abbreviation: string;
  conference: NFLConference;
  division: string;
  primaryColor: string;
  secondaryColor: string;
  /** Stable logo URL (gracious fallback handled by <TeamLogo/>). */
  logoUrl: string;
  /** ESPN team id used to map provider data back to this franchise. */
  espnId: number;
}

/* ─────────────────────────────── NFL data ─────────────────────────────── */

export type NflGameStatus = 'scheduled' | 'in_progress' | 'halftime' | 'final' | 'postponed';

/** A normalized NFL game (regular season), cached server-side. */
export interface NflGame {
  /** Provider game id. */
  id: string;
  season: number;
  week: number;
  /** ISO-8601 kickoff timestamp. */
  date: string;
  status: NflGameStatus;
  /** Quarter/period (0 when scheduled). */
  period: number;
  /** Game clock text. */
  clock: string;
  /** Raw provider status detail, kept for display. */
  detail: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  final: boolean;
  postponed: boolean;
}

/** Computed per-team season record. */
export interface TeamRecord {
  teamId: string;
  wins: number;
  losses: number;
  ties: number;
  gamesPlayed: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface NflMeta {
  season: number;
  currentWeek: number;
  lastSyncAt: Date | null;
}

export interface ExternalNewsItem {
  id: string;
  headline: string;
  description: string;
  url: string;
  publishedAt: Date | null;
  source: string;
}

export interface MarketForecast {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  commenceTime: Date | null;
  homeProbability: number;
  awayProbability: number;
  bookmakers: number;
}

export interface ExternalNflInsights {
  news: ExternalNewsItem[];
  forecasts: MarketForecast[];
  updatedAt: Date;
  oddsConfigured: boolean;
  errors: string[];
}

/* ───────────────────────────── league season ──────────────────────────── */

/** A league owner with their drafted franchises. */
export interface StandingTeam {
  teamId: string;
  name: string;
  abbreviation: string;
  wins: number;
  losses: number;
  ties: number;
  /** Team's total fantasy score (wins in 'wins' mode, points scored in 'points' mode). */
  points: number;
  /** Next scheduled game, when known. */
  next?: { opponentId: string; opponentName: string; opponentAbbreviation: string; week: number; date: string } | null;
}

export interface StandingRow {
  /** Competition rank; tied owners share a rank. */
  rank: number;
  userId: string;
  displayName: string;
  photoURL: string | null;
  totalWins: number;
  winsBehind: number;
  teams: StandingTeam[];
}

export interface LeagueStandings {
  leagueId: string;
  season: number;
  currentWeek: number;
  standings: StandingRow[];
  /** week ("1".."18") → userId → wins earned that week. */
  weeklyWins: Record<string, Record<string, number>>;
  isCommissioner: boolean;
}

/** One team's full season view. */
export interface NflTeamGame {
  id: string;
  week: number;
  date: string | null;
  status: NflGameStatus;
  isHome: boolean;
  opponentId: string;
  opponentName: string;
  opponentAbbreviation: string;
  teamScore: number | null;
  opponentScore: number | null;
  /** 'win' | 'loss' | 'tie' | null (final games only). */
  result: 'win' | 'loss' | 'tie' | null;
}

export interface TeamSeasonProfile {
  teamId: string;
  season: number;
  record: TeamRecord;
  games: NflTeamGame[];
  owner: { userId: string; displayName: string } | null;
}

/* ───────────────────────── Stage 4: season insights ───────────────────────── */

/**
 * How fantasy points are awarded per league:
 *  - 'wins'   → 1 point per regular-season win (loss/tie = 0)
 *  - 'points' → each drafted team's actual points scored each game
 *    (e.g. your Bears scoring 36 → +36 to you; the opponent's owner gets +42)
 */
export type ScoringMode = 'wins' | 'points';

export interface LeaguePrefs {
  projectionsEnabled: boolean;
  projectionsVisible: boolean;
  scoringMode: ScoringMode;
  benchEnabled: boolean;
  benchSlots: number;
  benchLocksAtKickoff: boolean;
  maxTeamsPerPlayer: number;
  maxActiveTeams: number;
  tradingEnabled: boolean;
}

export interface ProjectionOwnerRow {
  userId: string;
  displayName: string;
  photoURL: string | null;
  /** Wins from confirmed final results. */
  confirmedWins: number;
  /** Mean simulated final win total. */
  projectedFinalWins: number;
  expectedRemainingWins: number;
  championshipProbability: number;
  /** Most frequent simulated final rank (1-based). */
  likelyFinalRank: number;
}

export interface SeasonProjection {
  computedAt: Date;
  iterations: number;
  remainingGames: number;
  owners: ProjectionOwnerRow[];
}

export interface LiveStandingsRow {
  rank: number;
  userId: string;
  displayName: string;
  photoURL: string | null;
  confirmedWins: number;
  potentialWins: number;
  liveTotal: number;
  winsBehind: number;
  teams: StandingTeam[];
}

export interface LiveStandings {
  active: boolean;
  rows: LiveStandingsRow[];
}

export type LeagueActivityType = 'draft' | 'team-win' | 'leader' | 'tie-lead' | 'week';

export interface LeagueActivityEvent {
  key: string;
  type: LeagueActivityType;
  message: string;
  timestamp: Date;
}

export interface SeasonProgress {
  currentWeek: number;
  totalWeeks: number;
  completedGames: number;
  inProgressGames: number;
  remainingGames: number;
  /** 0..1 through the regular season. */
  pct: number;
}

export interface LeagueInsights {
  leagueId: string;
  season: number;
  currentWeek: number;
  totalWeeks: number;
  prefs: LeaguePrefs;
  lineup: { week: number; benchedTeamIds: string[] };
  sync: { lastSyncAt: Date | null; lastError: string | null };
  announcement: { text: string; by: string; at: Date } | null;
  progress: SeasonProgress;
  standings: StandingRow[];
  weeklyWins: Record<string, Record<string, number>>;
  live: LiveStandings | null;
  projection: SeasonProjection | null;
  projectionError: string | null;
  activity: LeagueActivityEvent[];
  leader: { userId: string; displayName: string; wins: number } | null;
  closestCompetitors: Array<{ userId: string; displayName: string; wins: number; behind: number }>;
  isCommissioner: boolean;
}

export interface TeamMarketEntry {
  teamId: string;
  ownerId: string | null;
  ownerName: string | null;
}

export interface LeagueTrade {
  id: string;
  fromUserId: string;
  toUserId: string;
  offeredTeamId: string;
  requestedTeamId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
}

export interface TeamMarket {
  enabled: boolean;
  effectiveWeek: number;
  teams: TeamMarketEntry[];
  trades: LeagueTrade[];
}

export interface AuditEntry {
  id: string;
  action: string;
  actorId: string;
  route: string;
  timestamp: Date;
}

/* ─────────────────────────────── seasonRecords ─────────────────────────── */

/**
 * Per-league win/loss ledger for drafted NFL teams. Id is
 * `${leagueId}_${nflTeamId}`. Reserved for Stage 3; written by server-side
 * jobs, read by clients.
 */
export interface SeasonRecord {
  id: string;
  leagueId: string;
  nflTeamId: string;
  teamName: string;
  ownerUserId: string;
  wins: number;
  losses: number;
  ties: number;
  updatedAt: Date;
}

/* ─────────────────────────── League preview (join flow) ────────────────── */

/** Sanitized league summary returned by the `getLeagueByCode` callable. */
export interface LeaguePreview {
  leagueId: string;
  name: string;
  season: number;
  commissionerName: string;
  memberCount: number;
  maxParticipants: number;
  draftFormat: DraftFormat;
  draftPickTimerSeconds: DraftPickTimer;
  status: LeagueStatus;
  isMember: boolean;
}
