import { TeamLogo } from '@/components/draft/TeamLogo';
import type { Draft, DraftPick, LeagueMember } from '@/types';

export interface DraftFeedProps {
  draft: Draft;
  picks: DraftPick[];
  members: LeagueMember[];
  /** Hide the "up next" list (used on mobile). */
  showUpcoming?: boolean;
}

/** Recent selections (+ upcoming picks on desktop). */
export function DraftFeed({ draft, picks, members, showUpcoming = true }: DraftFeedProps) {
  const recent = picks.slice(-8).reverse();
  const upcomingStart = draft.currentPick + 1;
  const upcoming = Array.from({ length: Math.min(8, Math.max(0, draft.totalPicks - draft.currentPick)) }, (_, i) => upcomingStart + i);

  return (
    <div className="space-y-5">
      <section aria-label="Recent picks">
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">No picks yet.</p>
        ) : (
          <ol className="space-y-1">
            {recent.map((pick) => (
              <li key={pick.pickNumber} className="flex items-center gap-2.5 px-2.5 py-1.5">
                <span className="w-6 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-500">
                  {pick.pickNumber}
                </span>
                <TeamLogo teamId={pick.nflTeamId} size="xs" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-white">{pick.teamAbbreviation}</p>
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

      {showUpcoming ? (
        <section aria-label="Upcoming picks">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Up next</h3>
          {upcoming.length === 0 ? (
            <p className="text-sm text-slate-500">Draft complete</p>
          ) : (
            <ol className="space-y-1">
              {upcoming.map((pickNumber) => (
                <li key={pickNumber} className="flex items-center gap-2.5 px-2.5 py-1">
                  <span className="w-6 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-500">
                    {pickNumber}
                  </span>
                  <span className="text-xs text-slate-300">
                    {members.find((member) => member.userId === draft.pickSequence[pickNumber - 1])?.displayName ?? 'Player'}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
    </div>
  );
}
