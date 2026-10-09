import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Check, Minus, X } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { Panel } from '@/components/ui/Panel';
import { Avatar } from '@/components/ui/Avatar';
import { GameStatusBadge } from '@/components/nfl/GameStatusBadge';
import { TeamLink } from '@/components/nfl/TeamLink';
import { TeamLogo } from '@/components/draft/TeamLogo';
import { useNflMeta, useNflTeam } from '@/hooks/useLeagues';
import { NFL_TEAMS_BY_ID, divisionLabel } from '@/data/nflTeams';
import { cn } from '@/lib/cn';
import type { NflTeamGame } from '@/types';

export function TeamProfile() {
  const { teamId } = useParams<{ teamId: string }>();
  const [searchParams] = useSearchParams();
  const league = searchParams.get('league');

  const { meta } = useNflMeta(120000);
  const { profile, status, error, refresh } = useNflTeam(
    teamId,
    { season: meta?.season, league: league ?? undefined },
    60000,
  );

  const team = teamId ? NFL_TEAMS_BY_ID[teamId] : undefined;

  const { past, comingUp } = useMemo(() => {
    const games = profile?.games ?? [];
    return {
      past: games.filter((game) => game.status === 'final' || game.status === 'postponed'),
      comingUp: games.filter((game) => game.status !== 'final' && game.status !== 'postponed'),
    };
  }, [profile]);

  const record = profile?.record;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <Link to="/nfl" className="focus-ring inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 transition-colors hover:text-electric-300">
        <ArrowLeft className="h-4 w-4" />
        NFL scores
      </Link>

      {status === 'loading' || !team ? (
        <div className="mt-8"><FullPageSpinner label="Loading team…" /></div>
      ) : status === 'error' ? (
        <div className="mt-8">
          <Alert variant="error" title="Could not load this team">{error}</Alert>
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" onClick={refresh}>Retry</Button>
          </div>
        </div>
      ) : (
        <div className="animate-fade-up">
          {/* Header */}
          <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
            <TeamLogo teamId={team.id} size="xl" ring />
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-bold tracking-tight text-white">{team.name}</h1>
              <p className="mt-1 text-sm text-slate-400">
                {divisionLabel(team)} · {profile?.season ?? '—'} season
              </p>
              {profile?.owner ? (
                <div className="mt-3 inline-flex items-center gap-2.5 rounded-xl border border-line bg-navy-900/60 px-3 py-2">
                  <Avatar name={profile.owner.displayName} size="xs" />
                  <span className="text-sm text-slate-300">
                    Owned by <span className="font-semibold text-white">{profile.owner.displayName}</span>
                  </span>
                </div>
              ) : null}
            </div>

            {record ? (
              <div className="sm:ml-auto">
                <p className="text-center text-xs font-medium uppercase tracking-wider text-slate-500 sm:text-left">Record</p>
                <div className="mt-1 flex items-center justify-center gap-2 sm:justify-start">
                  <RecordStat value={record.wins} label="Wins" tone="good" />
                  <RecordStat value={record.losses} label="Losses" />
                  <RecordStat value={record.ties} label="Ties" />
                </div>
              </div>
            ) : null}
          </div>

          {/* Upcoming */}
          <section className="mt-8" aria-label="Upcoming games">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
              <CalendarDays className="h-5 w-5 text-electric-400" />
              Upcoming games
            </h2>
            {comingUp.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No upcoming games on the board yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {comingUp.map((game) => (
                  <TeamGameRow key={game.id} game={game} opponentName={game.opponentName} opponentAbbreviation={game.opponentAbbreviation} status={game.status} teamScore={game.teamScore} opponentScore={game.opponentScore} />
                ))}
              </div>
            )}
          </section>

          {/* Results */}
          <section className="mt-8" aria-label="Results">
            <h2 className="font-display text-lg font-semibold text-white">Results</h2>
            {past.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No final results yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {past.slice().reverse().map((game) => (
                  <TeamGameRow
                    key={game.id}
                    game={game}
                    opponentName={game.opponentName}
                    opponentAbbreviation={game.opponentAbbreviation}
                    status={game.status}
                    teamScore={game.teamScore}
                    opponentScore={game.opponentScore}
                    result={game.result}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function RecordStat({ value, label, tone = 'neutral' }: { value: number; label: string; tone?: 'good' | 'neutral' }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-line bg-navy-900/60 px-3 py-1.5">
      <span className={cn('font-mono text-xl font-bold tabular-nums', tone === 'good' ? 'text-emerald-300' : 'text-white')}>{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
    </div>
  );
}

function TeamGameRow({
  game,
  opponentName,
  opponentAbbreviation,
  status,
  teamScore,
  opponentScore,
  result,
}: {
  game: NflTeamGame;
  opponentName: string;
  opponentAbbreviation: string;
  status: NflTeamGame['status'];
  teamScore: number | null;
  opponentScore: number | null;
  result?: 'win' | 'loss' | 'tie' | null;
}) {
  const date = game.date ? new Date(game.date) : null;
  return (
    <Panel className="rounded-xl" padded={false}>
      <div className="grid grid-cols-1 items-center gap-2 px-4 py-2.5 sm:grid-cols-[130px_1fr_auto]">
        <div className="text-xs text-slate-500">
          <p className="font-semibold text-slate-400">Week {game.week}</p>
          {date ? <p>{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p> : null}
        </div>
        <div className="flex items-center gap-2.5 text-sm">
          <GameResultIcon result={result} />
          <span className={cn('text-slate-200', result === 'win' && 'font-semibold text-white')}>
            {game.isHome ? 'vs' : '@'} <TeamLink teamId={game.opponentId}>{opponentName}</TeamLink>
          </span>
          <span className="font-mono text-sm font-bold tabular-nums text-slate-300">
            {teamScore ?? '–'}
            {opponentScore !== null ? <span className="text-slate-500">-{opponentScore}</span> : null}
          </span>
          <span className="text-[11px] uppercase text-slate-600">{opponentAbbreviation}</span>
        </div>
        <GameStatusBadge status={status} className="justify-self-start sm:justify-self-end" />
      </div>
    </Panel>
  );
}

function GameResultIcon({ result }: { result?: 'win' | 'loss' | 'tie' | null }) {
  if (result === 'win') return <Check className="h-4 w-4 text-emerald-400" aria-label="Win" />;
  if (result === 'loss') return <X className="h-4 w-4 text-rose-400" aria-label="Loss" />;
  if (result === 'tie') return <Minus className="h-4 w-4 text-amber-300" aria-label="Tie" />;
  return null;
}