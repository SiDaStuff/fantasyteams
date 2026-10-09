import { useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { LeagueInsights, StandingRow } from '@/types';

const PALETTE = ['#4da6ff', '#22d3ee', '#f7c948', '#a78bfa', '#fb7185', '#34d399', '#fb923c', '#f472b6'];

export interface CumulativeWinsChartProps {
  insights: LeagueInsights;
  /** Owners to chart (displayName order); default: all in standings order. */
  owners?: StandingRow[];
  height?: number;
}

/** Cumulative fantasy wins per owner, week by week. */
export function CumulativeWinsChart({ insights, owners, height = 300 }: CumulativeWinsChartProps) {
  const rows = owners && owners.length > 0 ? owners : insights.standings;

  const weeklyWins = insights.weeklyWins;
  const weeks = useMemo(
    () => Object.keys(weeklyWins).map(Number).filter((week) => week > 0).sort((a, b) => a - b),
    [weeklyWins],
  );

  const data = useMemo(
    () =>
      weeks.map((week) => {
        const point: Record<string, number | string> = { week: `W${week}` };
        let cumulative = 0;
        for (const row of rows) {
          cumulative += weeklyWins[String(week)]?.[row.userId] ?? 0;
          point[row.displayName] = cumulative;
        }
        return point;
      }),
    [weeks, weeklyWins, rows],
  );

  if (data.length === 0 || rows.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">No results yet this season.</p>;
  }

  return (
    <div className="w-full" aria-label="Cumulative wins by week">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,178,235,0.12)" vertical={false} />
          <XAxis dataKey="week" stroke="#5b6b8c" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} stroke="#5b6b8c" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: '#0e1a33', border: '1px solid rgba(148,178,235,0.2)', borderRadius: 10, fontSize: 13 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {rows.map((row, index) => (
            <Line
              key={row.userId}
              type="monotone"
              dataKey={row.displayName}
              stroke={PALETTE[index % PALETTE.length]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}