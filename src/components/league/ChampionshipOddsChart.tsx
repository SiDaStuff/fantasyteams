import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ProjectionOwnerRow } from '@/types';

const BAR_COLOR = '#4da6ff';

export interface ChampionshipOddsChartProps {
  owners: ProjectionOwnerRow[];
  /** Colors per owner (index-aligned with `owners`). */
  colors?: string[];
}

/** Horizontal bar chart of championship probabilities. */
export function ChampionshipOddsChart({ owners, colors }: ChampionshipOddsChartProps) {
  const data = useMemo(
    () =>
      owners
        .slice()
        .sort((a, b) => b.championshipProbability - a.championshipProbability)
        .map((owner, index) => ({
          name: owner.displayName,
          odds: Math.round(owner.championshipProbability * 1000) / 10,
          ownerId: owner.userId,
          fill: colors?.[index] ?? BAR_COLOR,
        })),
    [owners, colors],
  );

  if (data.length === 0) return null;

  return (
    <div className="w-full" aria-label="Championship odds by owner">
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 42)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,178,235,0.12)" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(value: number) => `${Math.round(value)}%`} stroke="#5b6b8c" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" width={120} stroke="#5b6b8c" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: 'rgba(31,125,255,0.08)' }}
            contentStyle={{ background: '#0e1a33', border: '1px solid rgba(148,178,235,0.2)', borderRadius: 10, fontSize: 13 }}
            formatter={(value, name) => [`${value}%`, name]}
          />
          <Bar dataKey="odds" radius={[0, 6, 6, 0]} barSize={22} isAnimationActive={false}>
            {data.map((entry) => (
              <Cell key={entry.ownerId} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}