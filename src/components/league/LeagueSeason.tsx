import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, ExternalLink, Newspaper, TrendingUp } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { LeagueHeader } from '@/components/layout/LeagueHeader';
import { TeamLink } from '@/components/nfl/TeamLink';
import { TeamLogo } from '@/components/draft/TeamLogo';
import { DraftBoard } from '@/components/draft/DraftBoard';
import { ChampionshipOddsChart } from '@/components/league/ChampionshipOddsChart';
import { CommissionerMenu } from '@/components/league/CommissionerMenu';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { api, apiErrorMessage } from '@/lib/api';
import { useExternalNflInsights, useLeagueInsights, useNflWeek } from '@/hooks/useLeagues';
import { formatRelativeTime } from '@/lib/format';
import { behindLabel, totalScoreLabel } from '@/lib/scoring';
import { cn } from '@/lib/cn';
import type { DraftRoomData, LeagueInsights, StandingRow } from '@/types';

type Tab = 'overview' | 'standings' | 'teams' | 'draft';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'standings', label: 'Standings' },
  { id: 'teams', label: 'My Teams' },
  { id: 'draft', label: 'Draft' },
];

export function LeagueSeason({ leagueId, room }: { leagueId: string; room: DraftRoomData }) {
  const { league, members } = room;
  const { user } = useAuth();
  const toast = useToast();

  const { insights, status, error, refresh } = useLeagueInsights(leagueId, 30000);
  const [tab, setTab] = useState<Tab>('overview');
  const [syncing, setSyncing] = useState(false);

  const myUid = user?.uid ?? null;
  const isCommissioner = league.commissionerId === myUid;

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await api.syncScores(leagueId);
      toast.push(result.skipped ? 'info' : 'success', result.skipped ? 'Scores are up to date' : 'Scores synced');
      refresh();
    } catch (err) {
      toast.push('error', 'Sync failed', apiErrorMessage(err));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="app-page animate-fade-up">
      <LeagueHeader
        leagueId={league.id}
        leagueName={league.name}
        season={league.season}
        right={isCommissioner ? (
          <CommissionerMenu
            leagueId={leagueId}
            insights={insights}
            members={room.members}
            currentUserId={myUid}
            onSynced={refresh}
            syncing={syncing}
            setSyncing={setSyncing}
            onSync={() => void handleSync()}
          />
        ) : undefined}
      >
        <nav className="league-tabs -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="League sections">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? 'page' : undefined}
              className={cn(
                'focus-ring shrink-0 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors',
                tab === item.id ? 'border-electric-400/45 bg-electric-500/12 text-electric-300' : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200',
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </LeagueHeader>

      {insights?.announcement ? (
        <div className="mt-5 rounded-xl border border-gold-400/25 bg-gold-400/5 px-4 py-3">
          <p className="text-sm text-slate-200">{insights.announcement.text}</p>
          <p className="mt-0.5 text-xs text-slate-500">Commissioner · {formatRelativeTime(insights.announcement.at)}</p>
        </div>
      ) : null}

      {status === 'loading' || !insights ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      ) : status === 'error' ? (
        <div className="mt-6">
          <Alert variant="error" title="Could not load the season">{error}</Alert>
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" onClick={refresh}>Retry</Button>
          </div>
        </div>
      ) : (
        <div className="mt-7">
          {tab === 'overview' ? <OverviewTab insights={insights} myUid={myUid} leagueId={leagueId} /> : null}
          {tab === 'standings' ? <StandingsTab insights={insights} myUid={myUid} leagueId={leagueId} /> : null}
          {tab === 'teams' ? <TeamsTab insights={insights} myUid={myUid} leagueId={leagueId} /> : null}
          {tab === 'draft' ? (
            <Panel className="rounded-xl p-4 sm:p-5">
              <DraftBoard draft={room.draft} members={members} picks={room.picks} />
            </Panel>
          ) : null}
        </div>
      )}

    </div>
  );
}

/* ─────────────────────────────── overview ─────────────────────────────── */

function OverviewTab({ insights, myUid, leagueId }: { insights: LeagueInsights; myUid: string | null; leagueId: string }) {
  const me = insights.standings.find((row) => row.userId === myUid) ?? null;
  const leader = insights.leader;
  const { progress } = insights;
  const mode = insights.prefs.scoringMode;
  const hasOfficialResults = progress.completedGames > 0;
  const isTied = me ? insights.standings.filter((row) => row.totalWins === me.totalWins).length > 1 : false;

  const myTeams = me?.teams ?? [];
  const weekData = useNflWeek(insights.season, progress.currentWeek, 60000);
  const external = useExternalNflInsights(insights.season, progress.currentWeek);
  const myTeamIds = new Set((me?.teams ?? []).map((team) => team.teamId));

  const myGamesThisWeek = (weekData.weekData?.games ?? []).filter(
    (game) => myTeamIds.has(game.homeTeamId) || myTeamIds.has(game.awayTeamId),
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-4 text-xs text-slate-500">
        <span>Active week: <strong className="font-semibold text-slate-300">Week {progress.currentWeek}</strong></span>
        <span>{insights.sync.lastSyncAt ? `Scores updated ${formatRelativeTime(insights.sync.lastSyncAt)}` : 'Waiting for the first score sync'}</span>
      </div>
      {insights.sync.lastError ? <Alert variant="warning" title="Score feed delayed">{insights.sync.lastError}</Alert> : null}

      {/* My standing — the primary fact */}
      {me ? (
        <section>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <p className="text-sm text-slate-400">You're in</p>
              <p className="font-display text-4xl font-bold tabular-nums text-white">
                {hasOfficialResults ? ordinal(me.rank) : '—'}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-400">{totalScoreLabel(mode)}</p>
              <p className="font-display text-4xl font-bold tabular-nums text-white">{me.totalWins}</p>
            </div>
            {!hasOfficialResults ? (
              <div>
                <p className="text-sm text-slate-400">Status</p>
                <p className="font-display text-lg font-semibold text-slate-300">Awaiting results</p>
              </div>
            ) : me.winsBehind > 0 ? (
              <div>
                <p className="text-sm text-slate-400">{behindLabel(mode)}</p>
                <p className="font-display text-4xl font-bold tabular-nums text-slate-400">{me.winsBehind}</p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-slate-400">Place</p>
                <p className="font-display text-4xl font-bold tabular-nums text-gold-300">
                  {isTied ? `Tied ${ordinal(me.rank)}` : ordinal(me.rank)}
                </p>
              </div>
            )}
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Week {progress.currentWeek} of {progress.totalWeeks}</span>
              <span>{progress.remainingGames} games left</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-navy-800">
              <div
                className="h-full rounded-full bg-electric-500"
                style={{ width: `${Math.min(100, Math.max(progress.pct * 100, 2))}%` }}
              />
            </div>
          </div>

          {leader && leader.userId !== myUid ? (
            <p className="mt-4 text-sm text-slate-400">
              {leader.displayName} leads with {leader.wins}.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* My teams */}
      <section>
        <h2 className="font-display text-lg font-semibold text-white">My Teams</h2>
        {myTeams.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No teams drafted yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-line/60 border-y border-line/60">
            {myTeams.map((team) => (
              <TeamRow key={team.teamId} team={team} leagueId={leagueId} mode={mode} />
            ))}
          </div>
        )}
      </section>

      {/* My games this week */}
      {myTeams.length > 0 ? (
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold text-white">This week</h2>
            <Link to="/nfl" className="focus-ring text-sm text-electric-300 transition-colors hover:text-electric-200">
              All NFL scores
            </Link>
          </div>
          {myGamesThisWeek.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No games for your teams this week.</p>
          ) : (
            <div className="mt-3 divide-y divide-line/60 border-y border-line/60">
              {myGamesThisWeek.map((game) => {
                const mineAway = myTeamIds.has(game.awayTeamId);
                return (
                  <div key={game.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <TeamLogo teamId={mineAway ? game.awayTeamId : game.homeTeamId} size="sm" />
                      <span className="truncate font-medium text-white">
                        {mineAway ? game.awayAbbreviation : game.homeAbbreviation}
                      </span>
                      <span className="text-slate-500">vs</span>
                      <TeamLogo teamId={mineAway ? game.homeTeamId : game.awayTeamId} size="sm" />
                      <span className="truncate text-slate-300">
                        {mineAway ? game.homeAbbreviation : game.awayAbbreviation}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {game.status === 'final' ? (
                        <span className="font-mono text-sm tabular-nums text-slate-300">
                          {game.awayScore ?? '–'}–{game.homeScore ?? '–'}
                        </span>
                      ) : game.status === 'in_progress' || game.status === 'halftime' ? (
                        <span className="font-mono text-sm tabular-nums text-electric-300">
                          {game.awayScore ?? '–'}–{game.homeScore ?? '–'}
                        </span>
                      ) : null}
                      <GameStatusLabel status={game.status} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      <ExternalContextSection
        insights={external.data}
        loading={external.status === 'loading'}
        myTeamIds={myTeamIds}
      />

      {/* Activity — secondary, collapsed by default */}
      <ActivitySection insights={insights} />
    </div>
  );
}

function ExternalContextSection({
  insights,
  loading,
  myTeamIds,
}: {
  insights: ReturnType<typeof useExternalNflInsights>['data'];
  loading: boolean;
  myTeamIds: Set<string>;
}) {
  if (loading) return <div className="skeleton h-28 rounded-xl" aria-label="Loading NFL news and forecasts" />;
  if (!insights || (insights.news.length === 0 && insights.forecasts.length === 0)) return null;
  const forecasts = insights.forecasts
    .filter((forecast) => myTeamIds.has(forecast.homeTeamId) || myTeamIds.has(forecast.awayTeamId))
    .slice(0, 3);

  return (
    <section aria-labelledby="league-context-title">
      <div className="flex items-end justify-between gap-3">
        <div><p className="app-kicker">Around the league</p><h2 id="league-context-title" className="mt-1 font-display text-lg font-semibold text-white">News & market outlook</h2></div>
        <span className="text-[10px] text-slate-500">External sources</span>
      </div>

      {forecasts.length > 0 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {forecasts.map((forecast) => {
            const homePct = Math.round(forecast.homeProbability * 100);
            const awayPct = Math.round(forecast.awayProbability * 100);
            return (
              <div key={forecast.id} className="rounded-xl border border-line bg-navy-900 p-3.5">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500"><TrendingUp className="h-3.5 w-3.5 text-electric-300" />Consensus forecast · {forecast.bookmakers} books</div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2"><TeamLogo teamId={forecast.awayTeamId} size="sm" /><strong className="text-sm text-white">{awayPct}%</strong></div>
                  <span className="text-[10px] text-slate-600">at</span>
                  <div className="flex items-center gap-2"><strong className="text-sm text-white">{homePct}%</strong><TeamLogo teamId={forecast.homeTeamId} size="sm" /></div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {insights.news.length > 0 ? (
        <div className="mt-4 divide-y divide-line/60 border-y border-line/60">
          {insights.news.slice(0, 4).map((item) => (
            <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="focus-ring group flex items-start gap-3 py-3.5">
              <Newspaper className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium leading-snug text-slate-200 transition-colors group-hover:text-electric-300">{item.headline}</span><span className="mt-1 block text-[10px] text-slate-500">{item.source}{item.publishedAt ? ` · ${formatRelativeTime(item.publishedAt)}` : ''}</span></span>
              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600" />
            </a>
          ))}
        </div>
      ) : null}
      <p className="mt-2 text-[10px] leading-relaxed text-slate-600">Market percentages are consensus estimates, not guarantees. News opens at the publisher.</p>
    </section>
  );
}

function GameStatusLabel({ status }: { status: string }) {
  if (status === 'final') return <span className="text-xs font-medium text-slate-500">Final</span>;
  if (status === 'in_progress') return <span className="text-xs font-medium text-rose-300">Live</span>;
  if (status === 'halftime') return <span className="text-xs font-medium text-rose-300">Half</span>;
  if (status === 'postponed') return <span className="text-xs font-medium text-amber-300">PPD</span>;
  return <span className="text-xs font-medium text-slate-500">Upcoming</span>;
}

function TeamRow({
  team,
  leagueId,
  mode,
}: {
  team: StandingRow['teams'][number];
  leagueId: string;
  mode: 'wins' | 'points';
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <TeamLink teamId={team.teamId} league={leagueId}>
          <TeamLogo teamId={team.teamId} size="md" />
        </TeamLink>
        <div className="min-w-0">
          <TeamLink teamId={team.teamId} league={leagueId}>
            <span className="truncate text-sm font-semibold text-white transition-colors hover:text-electric-300">
              {team.name}
            </span>
          </TeamLink>
          {team.next ? (
            <p className="text-xs text-slate-500">
              Next: vs {team.next.opponentAbbreviation} · Week {team.next.week}
            </p>
          ) : (
            <p className="text-xs text-slate-500">Schedule pending</p>
          )}
        </div>
      </div>
      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-white">
        {mode === 'points' ? `${team.points}` : `${team.wins}-${team.losses}${team.ties > 0 ? `-${team.ties}` : ''}`}
      </span>
    </div>
  );
}

/* ─────────────────────────────── standings ─────────────────────────────── */

function StandingsTab({ insights, myUid, leagueId }: { insights: LeagueInsights; myUid: string | null; leagueId: string }) {
  const [showProjections, setShowProjections] = useState(false);
  const mode = insights.prefs.scoringMode;
  const projection = insights.projection;
  const projectionsAvailable = projection !== null && insights.prefs.projectionsEnabled && insights.prefs.projectionsVisible;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-white">{totalScoreLabel(mode)}</h2>
        {projectionsAvailable ? (
          <button
            type="button"
            onClick={() => setShowProjections((v) => !v)}
            aria-expanded={showProjections}
            className="focus-ring flex items-center gap-1.5 rounded-lg text-sm font-medium text-slate-400 transition-colors hover:text-white"
          >
            Projections
            {showProjections ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        ) : insights.prefs.projectionsEnabled ? (
          <span className="text-right text-xs text-amber-300">{insights.projectionError ?? 'Projections are preparing'}</span>
        ) : null}
      </div>

      {/* Official standings */}
      <div className="divide-y divide-line/60 border-y border-line/60">
        {insights.standings.map((row) => (
          <StandingsRow key={row.userId} row={row} myUid={myUid} leagueId={leagueId} mode={mode} />
        ))}
        {insights.standings.length === 0 ? <p className="py-8 text-sm text-slate-500">No drafted teams yet.</p> : null}
      </div>

      {/* Projections — separate, clearly labeled, opt-in */}
      {showProjections && projectionsAvailable && projection ? (
        <section className="animate-fade-in">
          <h3 className="font-display text-base font-semibold text-white">Projections</h3>
          <p className="mt-1 text-xs text-slate-500">
            Updated {formatRelativeTime(projection.computedAt)} from {projection.remainingGames} remaining games and {projection.iterations.toLocaleString()} simulations. These are predictions, not results.
          </p>
          <div className="mt-4 divide-y divide-line/60 border-y border-line/60">
            {projection.owners
              .slice()
              .sort((a, b) => a.likelyFinalRank - b.likelyFinalRank)
              .map((owner) => (
                <div key={owner.userId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-5 text-right font-mono text-sm tabular-nums text-slate-500">{owner.likelyFinalRank}</span>
                    <Avatar name={owner.displayName} src={owner.photoURL} size="xs" />
                    <span className={cn('truncate font-medium', owner.userId === myUid ? 'text-electric-300' : 'text-white')}>
                      {owner.displayName}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-5">
                    <span className="text-right">
                      <span className="block font-mono font-semibold tabular-nums text-white">
                        {Math.round(owner.projectedFinalWins * 10) / 10}
                      </span>
                      <span className="block text-[10px] uppercase tracking-wide text-slate-500">proj. {mode}</span>
                    </span>
                    <span className="w-12 text-right font-mono tabular-nums text-slate-400">
                      {Math.round(owner.championshipProbability * 100)}%
                    </span>
                  </div>
                </div>
              ))}
          </div>
          <Panel className="mt-5 rounded-xl">
            <h4 className="mb-3 text-sm font-semibold text-slate-300">Championship odds</h4>
            <ChampionshipOddsChart owners={projection.owners} />
          </Panel>
        </section>
      ) : null}

      {showProjections && !projectionsAvailable ? (
        <p className="text-sm text-slate-500">Projections are turned off for this league.</p>
      ) : null}
    </div>
  );
}

function StandingsRow({
  row,
  myUid,
  leagueId,
  mode,
}: {
  row: StandingRow;
  myUid: string | null;
  leagueId: string;
  mode: 'wins' | 'points';
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn(row.userId === myUid && 'bg-electric-500/5')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="focus-ring flex w-full items-center justify-between gap-3 py-3 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="w-5 text-right font-mono text-sm tabular-nums text-slate-500">{row.rank}</span>
          <Avatar name={row.displayName} src={row.photoURL} size="xs" />
          <span className={cn('truncate text-sm font-semibold', row.userId === myUid ? 'text-electric-300' : 'text-white')}>
            {row.displayName}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <span className="font-mono text-sm font-semibold tabular-nums text-white">{row.totalWins}</span>
          <span className="w-10 text-right font-mono text-sm tabular-nums text-slate-500">
            {row.winsBehind > 0 ? `-${row.winsBehind}` : '—'}
          </span>
          {open ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
        </div>
      </button>

      {open ? (
        <div className="animate-fade-in pb-3 pl-8">
          <div className="flex flex-wrap gap-1.5">
            {row.teams.map((team) => (
              <TeamLink key={team.teamId} teamId={team.teamId} league={leagueId}>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-navy-900 px-2 py-1 text-xs text-slate-200 transition-colors hover:border-electric-400/40">
                  <TeamLogo teamId={team.teamId} size="xs" />
                  <span className="font-semibold">{team.abbreviation}</span>
                  <span className="font-mono tabular-nums text-slate-400">
                    {mode === 'points' ? `${team.points}` : `${team.wins}-${team.losses}`}
                  </span>
                </span>
              </TeamLink>
            ))}
          </div>
          <Link
            to={`/leagues/${leagueId}/compare?left=${encodeURIComponent(row.userId)}`}
            className="focus-ring mt-2.5 inline-block text-xs font-medium text-slate-400 transition-colors hover:text-electric-300"
          >
            Compare with another owner
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────── teams ─────────────────────────────── */

function TeamsTab({ insights, myUid, leagueId }: { insights: LeagueInsights; myUid: string | null; leagueId: string }) {
  const mode = insights.prefs.scoringMode;
  const mine = insights.standings.find((row) => row.userId === myUid) ?? null;
  const others = insights.standings.filter((row) => row.userId !== myUid);

  return (
    <div className="space-y-8">
      {mine ? (
        <section>
          <h2 className="font-display text-lg font-semibold text-white">My Teams</h2>
          {mine.teams.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No teams drafted yet.</p>
          ) : (
            <div className="mt-3 divide-y divide-line/60 border-y border-line/60">
              {mine.teams.map((team) => (
                <TeamRow key={team.teamId} team={team} leagueId={leagueId} mode={mode} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section>
        <h2 className="font-display text-lg font-semibold text-white">Everyone else</h2>
        <div className="mt-3 space-y-5">
          {others.map((row) => (
            <div key={row.userId}>
              <div className="flex items-center gap-2.5">
                <Avatar name={row.displayName} src={row.photoURL} size="xs" />
                <span className="truncate text-sm font-semibold text-white">{row.displayName}</span>
                <span className="font-mono text-xs tabular-nums text-slate-500">{row.totalWins}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {row.teams.map((team) => (
                  <TeamLink key={team.teamId} teamId={team.teamId} league={leagueId}>
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-navy-900 px-2 py-1 text-xs text-slate-200 transition-colors hover:border-electric-400/40">
                      <TeamLogo teamId={team.teamId} size="xs" />
                      <span className="font-semibold">{team.abbreviation}</span>
                      <span className="font-mono tabular-nums text-slate-400">
                        {mode === 'points' ? `${team.points}` : `${team.wins}-${team.losses}`}
                      </span>
                    </span>
                  </TeamLink>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ─────────────────────────────── activity ─────────────────────────────── */

function ActivitySection({ insights }: { insights: LeagueInsights }) {
  const [open, setOpen] = useState(false);

  if (insights.activity.length === 0) return null;

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="focus-ring flex w-full items-center justify-between py-2 text-left"
      >
        <span className="font-display text-lg font-semibold text-white">Activity</span>
        {open ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
      </button>
      {open ? (
        <ol className="animate-fade-in mt-2 space-y-2.5">
          {insights.activity.slice(0, 12).map((event) => (
            <li key={event.key} className="text-sm">
              <p className="text-slate-300">{event.message}</p>
              <p className="text-xs text-slate-500">{formatRelativeTime(event.timestamp)}</p>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

/* ─────────────────────────────── helpers ─────────────────────────────── */

function ordinal(rank: number): string {
  const suffix = rank % 100 >= 11 && rank % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][Math.min(rank % 10, 4)] ?? 'th';
  return `${rank}${suffix}`;
}
