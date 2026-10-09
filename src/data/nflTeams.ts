import type { NFLTeam } from '../types';

/**
 * Reference data for all 32 NFL franchises.
 *
 * This is the single source of truth for team metadata — the server
 * (`netlify/functions`) imports the same module to map provider data (via the
 * verified `espnId`) and the client uses it for logos, colors, and filters.
 *
 * Logos use a stable, widely mirrored CDN pattern (ESPN image CDN). The
 * <TeamLogo/> component falls back to a colored monogram when an image fails.
 */

const LOGO_BASE = 'https://a.espncdn.com/i/teamlogos/nfl/500';

type TeamSeed = Omit<NFLTeam, 'logoUrl'>;

const SEEDS: TeamSeed[] = [
  // ── AFC East
  { id: 'buf', name: 'Buffalo Bills', city: 'Buffalo', nickname: 'Bills', abbreviation: 'BUF', conference: 'AFC', division: 'East', primaryColor: '#00338D', secondaryColor: '#C60C30', espnId: 2 },
  { id: 'mia', name: 'Miami Dolphins', city: 'Miami', nickname: 'Dolphins', abbreviation: 'MIA', conference: 'AFC', division: 'East', primaryColor: '#008E97', secondaryColor: '#FC4C02', espnId: 15 },
  { id: 'ne', name: 'New England Patriots', city: 'New England', nickname: 'Patriots', abbreviation: 'NE', conference: 'AFC', division: 'East', primaryColor: '#002244', secondaryColor: '#C60C30', espnId: 17 },
  { id: 'nyj', name: 'New York Jets', city: 'New York', nickname: 'Jets', abbreviation: 'NYJ', conference: 'AFC', division: 'East', primaryColor: '#125740', secondaryColor: '#FFFFFF', espnId: 20 },

  // ── AFC North
  { id: 'bal', name: 'Baltimore Ravens', city: 'Baltimore', nickname: 'Ravens', abbreviation: 'BAL', conference: 'AFC', division: 'North', primaryColor: '#241773', secondaryColor: '#9E7C0C', espnId: 33 },
  { id: 'cin', name: 'Cincinnati Bengals', city: 'Cincinnati', nickname: 'Bengals', abbreviation: 'CIN', conference: 'AFC', division: 'North', primaryColor: '#FB4F14', secondaryColor: '#000000', espnId: 4 },
  { id: 'cle', name: 'Cleveland Browns', city: 'Cleveland', nickname: 'Browns', abbreviation: 'CLE', conference: 'AFC', division: 'North', primaryColor: '#311D00', secondaryColor: '#FF3C00', espnId: 5 },
  { id: 'pit', name: 'Pittsburgh Steelers', city: 'Pittsburgh', nickname: 'Steelers', abbreviation: 'PIT', conference: 'AFC', division: 'North', primaryColor: '#FFB612', secondaryColor: '#101820', espnId: 23 },

  // ── AFC South
  { id: 'hou', name: 'Houston Texans', city: 'Houston', nickname: 'Texans', abbreviation: 'HOU', conference: 'AFC', division: 'South', primaryColor: '#03202F', secondaryColor: '#A71930', espnId: 34 },
  { id: 'ind', name: 'Indianapolis Colts', city: 'Indianapolis', nickname: 'Colts', abbreviation: 'IND', conference: 'AFC', division: 'South', primaryColor: '#002C5F', secondaryColor: '#A2AAAD', espnId: 11 },
  { id: 'jax', name: 'Jacksonville Jaguars', city: 'Jacksonville', nickname: 'Jaguars', abbreviation: 'JAX', conference: 'AFC', division: 'South', primaryColor: '#101820', secondaryColor: '#D7A22A', espnId: 30 },
  { id: 'ten', name: 'Tennessee Titans', city: 'Tennessee', nickname: 'Titans', abbreviation: 'TEN', conference: 'AFC', division: 'South', primaryColor: '#0C2340', secondaryColor: '#4B92DB', espnId: 10 },

  // ── AFC West
  { id: 'den', name: 'Denver Broncos', city: 'Denver', nickname: 'Broncos', abbreviation: 'DEN', conference: 'AFC', division: 'West', primaryColor: '#FB4F14', secondaryColor: '#002244', espnId: 7 },
  { id: 'kc', name: 'Kansas City Chiefs', city: 'Kansas City', nickname: 'Chiefs', abbreviation: 'KC', conference: 'AFC', division: 'West', primaryColor: '#E31837', secondaryColor: '#FFB81C', espnId: 12 },
  { id: 'lv', name: 'Las Vegas Raiders', city: 'Las Vegas', nickname: 'Raiders', abbreviation: 'LV', conference: 'AFC', division: 'West', primaryColor: '#000000', secondaryColor: '#A5ACAF', espnId: 13 },
  { id: 'lac', name: 'Los Angeles Chargers', city: 'Los Angeles', nickname: 'Chargers', abbreviation: 'LAC', conference: 'AFC', division: 'West', primaryColor: '#0080C6', secondaryColor: '#FFC20E', espnId: 24 },

  // ── NFC East
  { id: 'dal', name: 'Dallas Cowboys', city: 'Dallas', nickname: 'Cowboys', abbreviation: 'DAL', conference: 'NFC', division: 'East', primaryColor: '#003594', secondaryColor: '#869397', espnId: 6 },
  { id: 'nyg', name: 'New York Giants', city: 'New York', nickname: 'Giants', abbreviation: 'NYG', conference: 'NFC', division: 'East', primaryColor: '#0B2265', secondaryColor: '#A71930', espnId: 19 },
  { id: 'phi', name: 'Philadelphia Eagles', city: 'Philadelphia', nickname: 'Eagles', abbreviation: 'PHI', conference: 'NFC', division: 'East', primaryColor: '#004C54', secondaryColor: '#A5ACAF', espnId: 21 },
  { id: 'was', name: 'Washington Commanders', city: 'Washington', nickname: 'Commanders', abbreviation: 'WAS', conference: 'NFC', division: 'East', primaryColor: '#5A1414', secondaryColor: '#FFB612', espnId: 28 },

  // ── NFC North
  { id: 'chi', name: 'Chicago Bears', city: 'Chicago', nickname: 'Bears', abbreviation: 'CHI', conference: 'NFC', division: 'North', primaryColor: '#0B162A', secondaryColor: '#C83803', espnId: 3 },
  { id: 'det', name: 'Detroit Lions', city: 'Detroit', nickname: 'Lions', abbreviation: 'DET', conference: 'NFC', division: 'North', primaryColor: '#0076B6', secondaryColor: '#B0B7BC', espnId: 8 },
  { id: 'gb', name: 'Green Bay Packers', city: 'Green Bay', nickname: 'Packers', abbreviation: 'GB', conference: 'NFC', division: 'North', primaryColor: '#203731', secondaryColor: '#FFB612', espnId: 9 },
  { id: 'min', name: 'Minnesota Vikings', city: 'Minnesota', nickname: 'Vikings', abbreviation: 'MIN', conference: 'NFC', division: 'North', primaryColor: '#4F2683', secondaryColor: '#FFC62F', espnId: 16 },

  // ── NFC South
  { id: 'atl', name: 'Atlanta Falcons', city: 'Atlanta', nickname: 'Falcons', abbreviation: 'ATL', conference: 'NFC', division: 'South', primaryColor: '#A71930', secondaryColor: '#000000', espnId: 1 },
  { id: 'car', name: 'Carolina Panthers', city: 'Carolina', nickname: 'Panthers', abbreviation: 'CAR', conference: 'NFC', division: 'South', primaryColor: '#0085CA', secondaryColor: '#101820', espnId: 29 },
  { id: 'no', name: 'New Orleans Saints', city: 'New Orleans', nickname: 'Saints', abbreviation: 'NO', conference: 'NFC', division: 'South', primaryColor: '#D3BC8D', secondaryColor: '#101820', espnId: 18 },
  { id: 'tb', name: 'Tampa Bay Buccaneers', city: 'Tampa Bay', nickname: 'Buccaneers', abbreviation: 'TB', conference: 'NFC', division: 'South', primaryColor: '#D50A0A', secondaryColor: '#34302B', espnId: 27 },

  // ── NFC West
  { id: 'ariz', name: 'Arizona Cardinals', city: 'Arizona', nickname: 'Cardinals', abbreviation: 'ARI', conference: 'NFC', division: 'West', primaryColor: '#97233F', secondaryColor: '#000000', espnId: 22 },
  { id: 'lar', name: 'Los Angeles Rams', city: 'Los Angeles', nickname: 'Rams', abbreviation: 'LAR', conference: 'NFC', division: 'West', primaryColor: '#003594', secondaryColor: '#FFA300', espnId: 14 },
  { id: 'sf', name: 'San Francisco 49ers', city: 'San Francisco', nickname: '49ers', abbreviation: 'SF', conference: 'NFC', division: 'West', primaryColor: '#AA0000', secondaryColor: '#B3995D', espnId: 25 },
  { id: 'sea', name: 'Seattle Seahawks', city: 'Seattle', nickname: 'Seahawks', abbreviation: 'SEA', conference: 'NFC', division: 'West', primaryColor: '#002244', secondaryColor: '#69BE28', espnId: 26 },
];

/** ESPN serves logo files by lowercase abbreviation (verified 2026-10-09):
 *  two of our slugs don't match ESPN's — ariz→ari, was→wsh. */
const LOGO_FILE_OVERRIDES: Record<string, string> = { ariz: 'ari', was: 'wsh' };

function toLogoUrl(id: string): string {
  const file = LOGO_FILE_OVERRIDES[id] ?? id;
  return `${LOGO_BASE}/${file}.png`;
}

export const NFL_TEAMS: NFLTeam[] = SEEDS.map((team) => ({ ...team, logoUrl: toLogoUrl(team.id) }));

export const NFL_TEAMS_BY_ID: Record<string, NFLTeam> = Object.fromEntries(NFL_TEAMS.map((team) => [team.id, team]));

/** Maps a provider's ESPN team id back to our team slug (espnId → id). */
export const NFL_TEAM_BY_ESPN_ID: Record<number, NFLTeam> = Object.fromEntries(
  NFL_TEAMS.map((team) => [team.espnId, team]),
);

export const NFL_CONFERENCES = ['AFC', 'NFC'] as const;

export const NFL_DIVISIONS = ['North', 'East', 'South', 'West'] as const;

export function teamsByConference(conference: NFLTeam['conference']): NFLTeam[] {
  return NFL_TEAMS.filter((team) => team.conference === conference);
}

/** Display label, e.g. 'AFC West'. */
export function divisionLabel(team: NFLTeam): string {
  return `${team.conference} ${team.division}`;
}

/** Display label, e.g. 'Kansas City Chiefs'. */
export function teamName(team: NFLTeam): string {
  return team.name;
}