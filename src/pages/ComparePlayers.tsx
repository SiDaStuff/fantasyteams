import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
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
  const weeklyData = useMemoSafe(insights, left?.userId, right?.userId);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link
        to={`/leagues/${leagueId}`}
        className="focus-ring inline-flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-300"
      >
        <ChevronLeft className="h-4 w-4" />
        League
      </Link>

      <h1 className="animate-fade-up mt-3 font-display text-2xl font-bold tracking-tight text-white">Compare</h1>

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
        <p className="mt-8 text-sm text-slate-400">Need at least two players to compare.</p>
      ) : left && right ? (
        <div className="animate-fade-up mt-6">
          {/* Pickers */}
          <div className="grid gap-4 sm:grid-cols-2">
            <OwnerPicker label="Player" owners={owners} value={left.userId} onChange={selectLeft} />
            <OwnerPicker label="Versus" owners={owners} value={right.userId} onChange={selectRight} />
          </div>

          {/* Side-by-side summary */}
          <div className="mt-6 grid grid-cols-2 gap-6">
            <CompareColumn row={left} insights={insights} highlight />
            <CompareColumn row={right} insights={insights} />
          </div>

          {/* Weekly comparison */}
          <Panel className="mt-8 rounded-xl">
            <h3 className="text-sm font-semibold text-slate-300">Weekly wins</h3>
            <div className="mt-3">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={weeklyData} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,168,210,0.12)" vertical={false} />
                  <XAxis dataKey="week" stroke="#5b6b8c" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} stroke="#5b6b8c" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(46,125,229,0.08)' }} contentStyle={{ background: '#131b2e', border: '1px solid rgba(148,168,210,0.2)', borderRadius: 8, fontSize: 13 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="left" fill="#55a8ff" name={left.displayName} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="right" fill="#8fc6ff" name={right.displayName} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel className="mt-4 rounded-xl">
            <h3 className="text-sm font-semibold text-slate-300">Cumulative wins</h3>
            <div className="mt-3">
              <CumulativeWinsChart insights={insights} owners={[left, right]} height={240} />
            </div>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}

function useMemoSafe(insights: LeagueInsights | null, leftId: string | undefined, rightId: string | undefined) {
  return useMemo(() => {
    if (!insights) return [];
    const weeks = Object.keys(insights.weeklyWins).map(Number).filter((week) => week > 0).sort((a, b) => a - b);
    return weeks.map((week) => ({
      week: `W${week}`,
      left: insights.weeklyWins[String(week)]?.[leftId ?? ''] ?? 0,
      right: insights.weeklyWins[String(week)]?.[rightId ?? ''] ?? 0,
    }));
  }, [insights, leftId, rightId]);
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
        className="focus-ring h-11 w-full rounded-lg border border-line bg-navy-900 px-3.5 text-sm text-white"
      >
        {owners.map((owner) => (
          <option key={owner.userId} value={owner.userId}>
            {owner.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}

function CompareColumn({ row, insights, highlight = false }: { row: StandingRow; insights: LeagueInsights; highlight?: boolean }) {
  const mode = insights.prefs.scoringMode;

  return (
    <div>
      <div className={cn('flex items-center gap-3 rounded-xl border p-3.5', highlight ? 'border-electric-400/40' : 'border-line')}>
        <Avatar name={row.displayName} src={row.photoURL} size="md" />
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{row.displayName}</p>
          <p className="text-xs text-slate-500">
            #{row.rank} · {row.totalWins} {mode === 'points' ? 'pts' : 'wins'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {row.teams.map((team) => (
          <TeamLink key={team.teamId} teamId={team.teamId} league={insights.leagueId}>
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
  );
}
