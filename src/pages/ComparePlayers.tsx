import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Swords } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Alert } from '@/components/ui/Alert';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { Panel } from '@/components/ui/Panel';
import { TeamLink } from '@/components/nfl/TeamLink';
import { TeamLogo } from '@/components/draft/TeamLogo';
import { CumulativeWinsChart } from '@/components/league/CumulativeWinsChart';
import { useLeagueInsights } from '@/hooks/useLeagues';
import { cn } from '@/lib/cn';
import type { LeagueInsights, StandingRow } from '@/types';

export function ComparePlayers() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { insights, status, error, refresh } = useLeagueInsights(leagueId, 30000);

  const owners = insights?.standings ?? [];
  const leftValue = searchParams.get('left');
  const rightValue = searchParams.get('right');

  const left = leftValue ? owners.find((row) => row.userId === leftValue) ?? owners[0] ?? null : owners[0] ?? null;
  const rightRaw = rightValue ? owners.find((row) => row.userId === rightValue) : undefined;
  const right = rightRaw ?? owners[1] ?? (owners.length > 1 ? owners[1] : null);

  function selectLeft(userId: string) {
    setSearchParams({ left: userId, right: right?.userId ?? '' }, { replace: true });
  }
  function selectRight(userId: string) {
    setSearchParams({ left: left?.userId ?? '', right: userId }, { replace: true });
  }

  // Weekly wins side by side.
  const weeklyData = useMemo(() => {
    if (!insights) return [];
    const weeks = Object.keys(insights.weeklyWins).map(Number).filter((week) => week > 0).sort((a, b) => a - b);
    return weeks.map((week) => ({
      week: `W${week}`,
      left: insights.weeklyWins[String(week)]?.[left?.userId ?? ''] ?? 0,
      right: insights.weeklyWins[String(week)]?.[right?.userId ?? ''] ?? 0,
    }));
  }, [insights, left?.userId, right?.userId]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <Link to={`/leagues/${leagueId}`} className="focus-ring inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 transition-colors hover:text-electric-300">
        <ArrowLeft className="h-4 w-4" />
        Back to league
      </Link>

      <div className="animate-fade-up mt-4">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-electric-400">
          <Swords className="h-4 w-4" />
          Compare owners
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-white">Head to head</h1>
      </div>

      {status === 'loading' || !insights ? (
        <div className="mt-8"><FullPageSpinner label="Loading comparison…" /></div>
      ) : status === 'error' ? (
        <div className="mt-8">
          <Alert variant="error" title="Could not load the league">{error}</Alert>
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" onClick={refresh}>Retry</Button>
          </div>
        </div>
      ) : owners.length < 2 ? (
        <div className="panel mt-8 rounded-2xl py-14 text-center">
          <Swords className="mx-auto h-8 w-8 text-electric-400/60" />
          <p className="mt-3 text-sm text-slate-400">Need at least two owners to compare.</p>
        </div>
      ) : left && right ? (
        <div className="animate-fade-up mt-8">
          {/* Pickers */}
          <div className="grid gap-4 sm:grid-cols-2">
            <OwnerPicker label="Left owner" owners={owners} value={left.userId} onChange={selectLeft} />
            <OwnerPicker label="Right owner" owners={owners} value={right.userId} onChange={selectRight} />
          </div>

          {/* Side-by-side stats */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <CompareColumn className="lg:border-electric-400/30" row={left} insights={insights} highlight />
            <CompareColumn row={right} insights={insights} />
          </div>

          {/* Weekly comparison */}
          <Panel className="mt-6 rounded-2xl">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-slate-300">Weekly wins</h3>
            <div className="mt-3">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={weeklyData} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,178,235,0.12)" vertical={false} />
                  <XAxis dataKey="week" stroke="#5b6b8c" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} stroke="#5b6b8c" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(31,125,255,0.08)' }} contentStyle={{ background: '#0e1a33', border: '1px solid rgba(148,178,235,0.2)', borderRadius: 10, fontSize: 13 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="left" fill="#4da6ff" name={left.displayName} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="right" fill="#22d3ee" name={right.displayName} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel className="mt-6 rounded-2xl">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-slate-300">Cumulative wins</h3>
            <div className="mt-3">
              <CumulativeWinsChart insights={insights} owners={[left, right]} height={260} />
            </div>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}

function OwnerPicker({
  label,
  owners,
  value,
  onChange,
}: {
  label: string;
  owners: StandingRow[];
  value: string;
  onChange: (userId: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-200">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="focus-ring h-11 w-full rounded-xl border border-line bg-navy-900/80 px-3.5 text-sm text-white"
      >
        {owners.map((owner) => (
          <option key={owner.userId} value={owner.userId} className="bg-navy-900">
            {owner.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}

function CompareColumn({ row, insights, highlight = false, className = '' }: { row: StandingRow; insights: LeagueInsights; highlight?: boolean; className?: string }) {
  const projection = insights.projection?.owners.find((owner) => owner.userId === row.userId);
  const mode = insights.prefs.scoringMode;
  const pts = mode === 'points';

  return (
    <Panel className={cn('rounded-2xl', highlight && 'border-electric-400/30', className)}>
      <div className="flex items-center gap-3">
        <Avatar name={row.displayName} src={row.photoURL} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-semibold text-white">{row.displayName}</p>
          <p className="text-xs text-slate-400">Rank {row.rank} · {row.teams.length} teams</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat value={String(row.totalWins)} label={pts ? 'Points' : 'Wins'} />
        <Stat value={projection ? String(Math.round(projection.projectedFinalWins * 10) / 10) : '—'} label={pts ? 'Proj. points' : 'Projected'} />
        <Stat value={projection ? `${Math.round(projection.championshipProbability * 100)}%` : '—'} label="Championship" />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-center">
        <Stat value={String(insights.progress.remainingGames)} label="League games left" />
        <Stat value={projection ? String(Math.round(projection.expectedRemainingWins * 10) / 10) : '—'} label={pts ? 'Pts expected' : 'Wins expected'} />
      </div>

      <p className="mt-4 text-xs font-medium uppercase tracking-wider text-slate-500">Roster</p>
      <div className="mt-2 space-y-1.5">
        {row.teams.map((team) => (
          <div key={team.teamId} className="flex items-center gap-2.5 rounded-lg border border-line bg-navy-900/50 px-2.5 py-1.5">
            <TeamLink teamId={team.teamId} league={insights.leagueId}>
              <TeamLogo teamId={team.teamId} size="sm" />
            </TeamLink>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{team.name}</p>
              {team.next ? (
                <p className="truncate text-[11px] text-slate-500">
                  Next: {team.next.opponentAbbreviation} · Week {team.next.week}
                </p>
              ) : (
                <p className="text-[11px] text-slate-500">Schedule pending</p>
              )}
            </div>
            <span className="font-mono text-sm font-bold tabular-nums text-white">
              {team.wins}-{team.losses}
              {team.ties > 0 ? `-${team.ties}` : ''}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-navy-900/50 px-2 py-2">
      <p className="font-mono text-lg font-bold tabular-nums text-white">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}