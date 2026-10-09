import { TeamLogo } from '@/components/draft/TeamLogo';
import { cn } from '@/lib/cn';
import type { Draft, DraftPick, LeagueMember } from '@/types';

export interface DraftBoardProps {
  draft: Draft;
  members: LeagueMember[];
  picks: DraftPick[];
}

/** Full draft board, organized by round. */
export function DraftBoard({ draft, members, picks }: DraftBoardProps) {
  const memberCount = Math.max(draft.order.length, 1);
  const picksByNumber = new Map(picks.map((pick) => [pick.pickNumber, pick]));
  const memberName = (uid: string) => members.find((member) => member.userId === uid)?.displayName ?? 'Player';

  return (
    <div className="space-y-5">
      {Array.from({ length: draft.rounds }, (_, i) => i + 1).map((round) => {
        const start = (round - 1) * memberCount + 1;
        const end = Math.min(round * memberCount, draft.totalPicks);
        if (start > end) return null;

        return (
          <section key={round} aria-label={`Round ${round}`}>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Round {round}</h3>
              <div className="h-px flex-1 bg-line" />
            </div>

            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {Array.from({ length: end - start + 1 }, (_, offset) => start + offset).map((pickNumber) => {
                const pick = picksByNumber.get(pickNumber);
                const isCurrent = pickNumber === draft.currentPick && draft.status !== 'completed';

                return (
                  <div
                    key={pickNumber}
                    className={cn(
                      'flex min-h-14 flex-col justify-between gap-1 rounded-lg border p-2',
                      isCurrent
                        ? 'border-electric-400/60 bg-electric-500/10'
                        : pick
                          ? 'border-line bg-navy-800/40'
                          : 'border-dashed border-line/60',
                    )}
                  >
                    <span className={cn('text-[10px] font-semibold tabular-nums', isCurrent ? 'text-electric-300' : 'text-slate-500')}>
                      #{pickNumber}
                    </span>

                    {pick ? (
                      <div className="flex items-center gap-1.5">
                        <TeamLogo teamId={pick.nflTeamId} size="xs" />
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-semibold leading-tight text-white">{pick.teamAbbreviation}</p>
                          <p className="truncate text-[10px] leading-tight text-slate-500">{pick.displayName}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="truncate text-[11px] text-slate-500">{memberName(draft.order[(pickNumber - 1) % memberCount])}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
