import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { GameStatusBadge } from '@/components/nfl/GameStatusBadge';
import { TeamLink } from '@/components/nfl/TeamLink';
import { TeamLogo } from '@/components/draft/TeamLogo';
import { useNflMeta, useNflWeek } from '@/hooks/useLeagues';
import { NFL_TEAMS } from '@/data/nflTeams';
import { cn } from '@/lib/cn';
import type { NflGameDetail } from '@/lib/api';

const MAX_WEEK = 18;

export function NflScores() {
  const { meta } = useNflMeta(60000);
  const season = meta?.season ?? 0;
  const currentWeek = meta?.currentWeek ?? 1;

  const [week, setWeek] = useState<number | null>(null);
  // Sync the week selector with the server's current week on load / change.
  const [prevCurrentWeek, setPrevCurrentWeek] = useState(currentWeek);
  if (prevCurrentWeek !== currentWeek) {
    setPrevCurrentWeek(currentWeek);
    setWeek((selected) => selected ?? currentWeek);
  }
  const selectedWeek = week ?? currentWeek;
  const [teamFilter, setTeamFilter] = useState<string>('All');

  const { weekData, status: gamesStatus, error, refresh } = useNflWeek(season, selectedWeek, 30000);

  const games = useMemo(() => {
    const list = weekData?.games ?? [];
    if (teamFilter === 'All') return list;
    return list.filter(
      (game) => game.homeTeamId === teamFilter || game.awayTeamId === teamFilter,
    );
  }, [weekData, teamFilter]);

  const hasLive = (weekData?.games ?? []).some((game) => game.status === 'in_progress' || game.status === 'halftime');
  const pollHint = hasLive ? 'Auto-refreshing while games are live' : 'Auto-refreshes during games';

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="animate-fade-up flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-electric-400">
            <CalendarDays className="h-4 w-4" />
            NFL scores
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {season} season
          </h1>
          <p className="mt-1 text-sm text-slate-400">{pollHint}.</p>
        </div>

        {/* Week picker */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            aria-label="Previous week"
            onClick={() => setWeek(Math.max(1, selectedWeek - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="w-28 text-center font-display text-base font-bold text-white">
            {selectedWeek === currentWeek ? (
              <>
                This week
                <span className="ml-1.5 text-xs font-semibold text-electric-300">{selectedWeek}</span>
              </>
            ) : (
              `Week ${selectedWeek}`
            )}
          </span>
          <Button
            size="sm"
            variant="secondary"
            aria-label="Next week"
            onClick={() => setWeek(Math.min(MAX_WEEK, selectedWeek + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Team filter */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTeamFilter('All')}
          className={cn(
            'focus-ring rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors',
            teamFilter === 'All'
              ? 'border-electric-400/60 bg-electric-500/15 text-electric-300'
              : 'border-line bg-navy-900/60 text-slate-400 hover:text-white',
          )}
        >
          All teams
        </button>
        {NFL_TEAMS.map((team) => (
          <button
            key={team.id}
            type="button"
            onClick={() => setTeamFilter(teamFilter === team.id ? 'All' : team.id)}
            className={cn(
              'focus-ring rounded-lg border px-2 py-1 text-sm font-semibold transition-colors',
              teamFilter === team.id
                ? 'border-electric-400/60 bg-electric-500/15 text-electric-300'
                : 'border-line bg-navy-900/60 text-slate-400 hover:text-white',
            )}
          >
            {team.abbreviation}
          </button>
        ))}
      </div>

      {/* Content */}
      {gamesStatus === 'loading' ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-20 rounded-xl" />
          ))}
        </div>
      ) : gamesStatus === 'error' ? (
        <div className="mt-6">
          <Alert variant="error" title="Could not load scores">
            {error ?? 'Try again in a moment.'}
          </Alert>
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" onClick={refresh} leftIcon={<RefreshCw className="h-4 w-4" />}>
              Retry
            </Button>
          </div>
        </div>
      ) : games.length === 0 ? (
        <div className="panel mt-6 rounded-2xl py-14 text-center">
          <p className="text-sm text-slate-400">No games this week.</p>
          <p className="mt-1 text-xs text-slate-500">Final scores appear once games wrap up.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-2.5" key={`${selectedWeek}-${teamFilter}`}>
          {games.map((game) => (
            <GameRow key={game.id} game={game} />
          ))}
        </div>
      )}
    </div>
  );
}

function GameRow({ game }: { game: NflGameDetail }) {
  const gameTime = game.date ? new Date(game.date) : null;
  const dayLabel = gameTime
    ? gameTime.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : '';
  const timeLabel = gameTime
    ? gameTime.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : '';
  const live = game.status === 'in_progress' || game.status === 'halftime';

  return (
    <Panel className="animate-fade-in rounded-xl" padded={false}>
      <div className="grid grid-cols-1 items-center gap-2 px-4 py-3 sm:grid-cols-[92px_1fr_auto]">
        <div className="text-xs text-slate-500">
          {dayLabel ? (
            <p className="font-semibold text-slate-400">{dayLabel}</p>
          ) : null}
          {timeLabel ? <p className="tabular-nums">{timeLabel}</p> : null}
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <ScoreSide game={game} teamId={game.awayTeamId} name={game.awayName} abbr={game.awayAbbreviation} score={game.awayScore} isHome={false} />
          <span className="text-xs font-bold tabular-nums text-slate-500">@</span>
          <ScoreSide game={game} teamId={game.homeTeamId} name={game.homeName} abbr={game.homeAbbreviation} score={game.homeScore} isHome />
        </div>

        <div className="flex items-center justify-between gap-3 sm:justify-end">
          {live && game.clock ? <span className="font-mono text-xs font-semibold tabular-nums text-rose-300">{game.clock}</span> : null}
          <GameStatusBadge status={game.status} />
        </div>
      </div>
    </Panel>
  );
}

function ScoreSide({
  game,
  teamId,
  name,
  abbr,
  score,
  isHome,
}: {
  game: NflGameDetail;
  teamId: string;
  name: string;
  abbr: string;
  score: number | null;
  isHome: boolean;
}) {
  const winner =
    score !== null &&
    (isHome
      ? game.homeScore !== null && game.awayScore !== null && score > (game.awayScore as number)
      : game.homeScore !== null && game.awayScore !== null && score > (game.homeScore as number));

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <TeamLogo teamId={teamId} size="sm" />
      <div className="min-w-0">
        <TeamLink teamId={teamId} className="truncate text-sm">
          <span className={cn('truncate', winner ? 'font-bold text-white' : 'text-slate-200')}>{name}</span>
        </TeamLink>
        <p className="text-[10px] uppercase tracking-wide text-slate-500">{isHome ? `vs ${abbr}` : `${abbr}`}</p>
      </div>
      <span className={cn('ml-1 w-7 text-right font-mono text-sm font-bold tabular-nums', winner ? 'text-white' : 'text-slate-400')}>
        {score ?? '–'}
      </span>
    </div>
  );
}