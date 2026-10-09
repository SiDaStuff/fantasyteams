import { Sparkles } from 'lucide-react';
import { TeamLogo } from '@/components/draft/TeamLogo';
import type { Draft, DraftPick, LeagueMember } from '@/types';

export interface DraftFeedProps {
  draft: Draft;
  picks: DraftPick[];
  members: LeagueMember[];
}

/** Recent selections + upcoming picks (right sidebar). */
export function DraftFeed({ draft, picks, members }: DraftFeedProps) {
  const memberName = (uid: string) => members.find((member) => member.userId === uid)?.displayName ?? 'Player';
  const recent = picks.slice(-8).reverse();
  const upcomingStart = draft.currentPick + 1;
  const upcoming = Array.from({ length: Math.min(8, Math.max(0, draft.totalPicks - draft.currentPick)) }, (_, i) => upcomingStart + i);

  return (
    <div className="space-y-6">
      {/* Recent picks */}
      <section aria-label="Recent picks">
        <h3 className="mb-2.5 font-display text-sm font-semibold uppercase tracking-wider text-slate-300">Recent picks</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">No picks yet.</p>
        ) : (
          <ol className="space-y-1.5">
            {recent.map((pick) => (
              <li key={pick.pickNumber} className="flex items-center gap-2.5 rounded-lg bg-navy-900/50 px-2.5 py-2">
                <span className="w-7 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-500">
                  {pick.pickNumber}
                </span>
                <TeamLogo teamId={pick.nflTeamId} size="xs" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-white">{pick.teamName}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {pick.displayName}
                    {pick.auto ? ' · auto' : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Upcoming picks */}
      <section aria-label="Upcoming picks">
        <h3 className="mb-2.5 font-display text-sm font-semibold uppercase tracking-wider text-slate-300">Up next</h3>
        {upcoming.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Sparkles className="h-4 w-4 text-gold-400" />
            Draft complete
          </p>
        ) : (
          <ol className="space-y-1.5">
            {upcoming.map((pickNumber) => (
              <li key={pickNumber} className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5">
                <span className="w-7 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-500">
                  {pickNumber}
                </span>
                <span className="text-xs text-slate-300">{memberName(draft.pickSequence[pickNumber - 1])}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}