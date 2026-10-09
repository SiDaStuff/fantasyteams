import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { TeamLink } from '@/components/nfl/TeamLink';
import { TeamLogo } from '@/components/draft/TeamLogo';
import { useNflMeta, useNflWeek, useMyLeagues, useLeagueInsights } from '@/hooks/useLeagues';
import { cn } from '@/lib/cn';
import type { NflGameDetail } from '@/lib/api';

const MAX_WEEK = 18;

export function NflScores() {
  const { meta } = useNflMeta(60000);
  const season = meta?.season ?? 0;
  const currentWeek = meta?.currentWeek ?? 1;

  // Subtle ownership highlighting: teams the user drafted in their leagues.
  const { leagues } = useMyLeagues(60000);
  const primaryLeague = leagues.find((league) => league.status === 'active') ?? leagues[0] ?? null;
  const { insights } = useLeagueInsights(primaryLeague?.id ?? undefined, 60000);
  const ownedTeams = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of insights?.standings ?? []) {
      for (const team of row.teams) map.set(team.teamId, row.displayName);
    }
    return map;
  }, [insights]);

  const [week, setWeek] = useState<number | null>(null);
  // Sync the week selector with the server's current week on load / change.
  const [prevCurrentWeek, setPrevCurrentWeek] = useState(currentWeek);
  if (prevCurrentWeek !== currentWeek) {
    setPrevCurrentWeek(currentWeek);
    setWeek((selected) => selected ?? currentWeek);
  }
  const selectedWeek = week ?? currentWeek;

  const { weekData, status: gamesStatus, error, refresh } = useNflWeek(season, selectedWeek, 30000);

  const games = useMemo(() => {
    const list = weekData?.games ?? [];
    return list.slice().sort((a, b) => {
      // Live games first, then by start time.
      const liveA = a.status === 'in_progress' || a.status === 'halftime' ? 0 : a.status === 'final' ? 2 : 1;
      const liveB = b.status === 'in_progress' || b.status === 'halftime' ? 0 : b.status === 'final' ? 2 : 1;
      if (liveA !== liveB) return liveA - liveB;
      return (a.date ?? '').localeCompare(b.date ?? '');
    });
  }, [weekData]);

  const hasLive = games.some((game) => game.status === 'in_progress' || game.status === 'halftime');

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">NFL Scores</h1>
        {hasLive ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-rose-300">
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-rose-400" />
            Live
          </span>
        ) : null}
      </div>

      {/* Week picker */}
      <div className="mt-5 flex items-center justify-between">
        <Button
          size="sm"
          variant="outline"
          aria-label="Previous week"
          disabled={selectedWeek <= 1}
          onClick={() => setWeek(Math.max(1, selectedWeek - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Prev</span>
        </Button>
        <p className="font-display text-base font-semibold text-white">
          Week {selectedWeek}
          {selectedWeek === currentWeek ? <span className="ml-2 text-xs font-medium text-electric-300">Current</span> : null}
        </p>
        <Button
          size="sm"
          variant="outline"
          aria-label="Next week"
          disabled={selectedWeek >= MAX_WEEK}
          onClick={() => setWeek(Math.min(MAX_WEEK, selectedWeek + 1))}
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      {gamesStatus === 'loading' ? (
        <div className="mt-6 space-y-2.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-16 rounded-xl" />
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
        <div className="panel mt-6 rounded-xl py-14 text-center">
          <p className="text-sm text-slate-400">No games this week.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-2" key={`${selectedWeek}`}>
          {games.map((game) => (
            <GameRow key={game.id} game={game} ownedTeams={ownedTeams} />
          ))}
        </div>
      )}
    </div>
  );
}

function GameRow({ game, ownedTeams }: { game: NflGameDetail; ownedTeams: Map<string, string> }) {
  const gameTime = game.date ? new Date(game.date) : null;
  const timeLabel = gameTime
    ? gameTime.toLocaleTimeString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    : '';
  const live = game.status === 'in_progress' || game.status === 'halftime';
  const final = game.status === 'final';

  return (
    <div className="panel rounded-xl px-4 py-3">
      {/* Status line */}
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {live ? (
          <span className="text-rose-300">{game.clock ? `${game.clock} · Live` : 'Live'}</span>
        ) : final ? (
          'Final'
        ) : game.status === 'postponed' ? (
          <span className="text-amber-300">Postponed</span>
        ) : (
          timeLabel
        )}
      </p>

      <div className="space-y-1.5">
        <ScoreSide
          teamId={game.awayTeamId}
          name={game.awayName}
          abbr={game.awayAbbreviation}
          score={game.awayScore}
          winner={final && game.awayScore !== null && game.homeScore !== null && (game.awayScore as number) > (game.homeScore as number)}
          ownedBy={ownedTeams.get(game.awayTeamId)}
        />
        <ScoreSide
          teamId={game.homeTeamId}
          name={game.homeName}
          abbr={game.homeAbbreviation}
          score={game.homeScore}
          winner={final && game.homeScore !== null && game.awayScore !== null && (game.homeScore as number) > (game.awayScore as number)}
          ownedBy={ownedTeams.get(game.homeTeamId)}
        />
      </div>
    </div>
  );
}

function ScoreSide({
  teamId,
  name,
  abbr,
  score,
  winner,
  ownedBy,
}: {
  teamId: string;
  name: string;
  abbr: string;
  score: number | null;
  winner: boolean;
  ownedBy?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <TeamLogo teamId={teamId} size="sm" />
        <TeamLink teamId={teamId} className="min-w-0">
          <span className={cn('truncate text-sm', winner ? 'font-bold text-white' : 'text-slate-300')}>{name}</span>
        </TeamLink>
        {ownedBy ? (
          <span className="shrink-0 rounded bg-electric-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-electric-300">
            {ownedBy}
          </span>
        ) : (
          <span className="text-[11px] font-medium text-slate-600">{abbr}</span>
        )}
      </div>
      <span className={cn('shrink-0 font-mono text-base font-bold tabular-nums', winner ? 'text-white' : score === null ? 'text-slate-600' : 'text-slate-400')}>
        {score ?? '–'}
      </span>
    </div>
  );
}
