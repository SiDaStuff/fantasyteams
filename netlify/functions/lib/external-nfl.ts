import { NFL_TEAMS } from '../../../src/data/nflTeams';
import type { NflGame } from '../../../src/types';

const ESPN_NEWS_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news';
const ODDS_URL = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds';
const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 10 * 60 * 1000;

export interface ExternalNewsItem {
  id: string;
  headline: string;
  description: string;
  url: string;
  publishedAt: string;
  source: string;
}

export interface MarketForecast {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  commenceTime: string;
  homeProbability: number;
  awayProbability: number;
  bookmakers: number;
}

export interface ExternalNflInsights {
  news: ExternalNewsItem[];
  forecasts: MarketForecast[];
  updatedAt: number;
  oddsConfigured: boolean;
  errors: string[];
}

const cache = new Map<string, { at: number; data: ExternalNflInsights }>();
const teamIdByName = new Map(NFL_TEAMS.map((team) => [team.name.toLowerCase(), team.id]));

async function fetchJson(url: URL): Promise<unknown> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'FantasyTeams/1.0 (Netlify Function)' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${url.hostname} responded ${response.status}`);
  return response.json() as Promise<unknown>;
}

async function fetchNews(): Promise<ExternalNewsItem[]> {
  const url = new URL(ESPN_NEWS_URL);
  url.searchParams.set('limit', '8');
  const raw = await fetchJson(url) as { articles?: Array<Record<string, unknown>> };
  return (raw.articles ?? []).flatMap((article) => {
    const links = article.links as { web?: { href?: unknown } } | undefined;
    const href = typeof links?.web?.href === 'string' ? links.web.href : '';
    const headline = typeof article.headline === 'string' ? article.headline.trim() : '';
    if (!href || !headline) return [];
    return [{
      id: String(article.id ?? href),
      headline,
      description: typeof article.description === 'string' ? article.description.trim() : '',
      url: href,
      publishedAt: typeof article.published === 'string' ? article.published : '',
      source: 'ESPN',
    }];
  }).slice(0, 6);
}

function impliedProbability(decimalOdds: number): number {
  return decimalOdds > 1 ? 1 / decimalOdds : 0;
}

async function fetchForecasts(apiKey: string, games: readonly NflGame[]): Promise<MarketForecast[]> {
  const url = new URL(ODDS_URL);
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('regions', 'us');
  url.searchParams.set('markets', 'h2h');
  url.searchParams.set('oddsFormat', 'decimal');
  url.searchParams.set('dateFormat', 'iso');
  const raw = await fetchJson(url);
  if (!Array.isArray(raw)) return [];

  const scheduledIds = new Set(games.filter((game) => !game.final).flatMap((game) => [game.homeTeamId, game.awayTeamId]));
  return raw.flatMap((event): MarketForecast[] => {
    if (!event || typeof event !== 'object') return [];
    const item = event as Record<string, unknown>;
    const homeName = String(item.home_team ?? '').toLowerCase();
    const awayName = String(item.away_team ?? '').toLowerCase();
    const homeTeamId = teamIdByName.get(homeName);
    const awayTeamId = teamIdByName.get(awayName);
    if (!homeTeamId || !awayTeamId || (!scheduledIds.has(homeTeamId) && !scheduledIds.has(awayTeamId))) return [];

    let homeTotal = 0;
    let awayTotal = 0;
    let books = 0;
    const bookmakers = Array.isArray(item.bookmakers) ? item.bookmakers as Array<Record<string, unknown>> : [];
    for (const bookmaker of bookmakers) {
      const markets = Array.isArray(bookmaker.markets) ? bookmaker.markets as Array<Record<string, unknown>> : [];
      const market = markets.find((entry) => entry.key === 'h2h');
      const outcomes = Array.isArray(market?.outcomes) ? market.outcomes as Array<Record<string, unknown>> : [];
      const home = outcomes.find((outcome) => String(outcome.name).toLowerCase() === homeName);
      const away = outcomes.find((outcome) => String(outcome.name).toLowerCase() === awayName);
      const homeP = impliedProbability(Number(home?.price));
      const awayP = impliedProbability(Number(away?.price));
      const total = homeP + awayP;
      if (homeP <= 0 || awayP <= 0 || total <= 0) continue;
      homeTotal += homeP / total;
      awayTotal += awayP / total;
      books += 1;
    }
    if (books === 0) return [];
    return [{
      id: String(item.id ?? `${awayTeamId}-${homeTeamId}`),
      homeTeamId,
      awayTeamId,
      commenceTime: String(item.commence_time ?? ''),
      homeProbability: homeTotal / books,
      awayProbability: awayTotal / books,
      bookmakers: books,
    }];
  }).sort((a, b) => a.commenceTime.localeCompare(b.commenceTime));
}

/** External context is supplementary: a provider failure never breaks league data. */
export async function getExternalNflInsights(season: number, week: number, games: readonly NflGame[]): Promise<ExternalNflInsights> {
  const apiKey = process.env.THE_ODDS_API_KEY?.trim() ?? '';
  const cacheKey = `${season}-${week}-${apiKey ? 'odds' : 'news'}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  const [newsResult, oddsResult] = await Promise.allSettled([
    fetchNews(),
    apiKey ? fetchForecasts(apiKey, games) : Promise.resolve([]),
  ]);
  const errors: string[] = [];
  if (newsResult.status === 'rejected') errors.push(`News: ${newsResult.reason instanceof Error ? newsResult.reason.message : 'unavailable'}`);
  if (oddsResult.status === 'rejected') errors.push(`Forecasts: ${oddsResult.reason instanceof Error ? oddsResult.reason.message : 'unavailable'}`);
  const data: ExternalNflInsights = {
    news: newsResult.status === 'fulfilled' ? newsResult.value : [],
    forecasts: oddsResult.status === 'fulfilled' ? oddsResult.value : [],
    updatedAt: Date.now(),
    oddsConfigured: apiKey.length > 0,
    errors,
  };
  cache.set(cacheKey, { at: Date.now(), data });
  return data;
}
