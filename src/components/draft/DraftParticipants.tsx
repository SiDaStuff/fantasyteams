import { Clock, Crown } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { TeamLogo } from '@/components/draft/TeamLogo';
import { cn } from '@/lib/cn';
import type { Draft, DraftPick, LeagueMember } from '@/types';

export interface DraftParticipantsProps {
  draft: Draft;
  members: LeagueMember[];
  picks: DraftPick[];
  myUid: string | null;
  /** League commissioner id (for the crown). */
  commissionerId: string;
  /** Optional compact variant for the left sidebar. */
  compact?: boolean;
}

/** Participants in draft order with their drafted teams. */
export function DraftParticipants({ draft, members, picks, myUid, commissionerId, compact = false }: DraftParticipantsProps) {
  // Keep the commissioner's configured order; members missing from order land last.
  const ordered = [...draft.order, ...members.filter((m) => !draft.order.includes(m.userId)).map((m) => m.userId)];

  return (
    <ol className="space-y-1.5">
      {members
        .slice()
        .sort((a, b) => ordered.indexOf(a.userId) - ordered.indexOf(b.userId) || a.joinedAt.getTime() - b.joinedAt.getTime())
        .map((member) => {
          const myTeams = picks.filter((pick) => pick.userId === member.userId);
          const onClock = draft.status !== 'completed' && draft.currentPickUserId === member.userId && draft.status === 'live';
          const isMe = member.userId === myUid;

          return (
            <li
              key={member.userId}
              className={cn(
                'rounded-xl border px-3 py-2.5 transition-colors',
                onClock
                  ? 'border-electric-400/60 bg-electric-500/10'
                  : 'border-line bg-navy-900/50',
              )}
            >
              <div className="flex items-center gap-2.5">
                <Avatar name={member.displayName} src={member.photoURL} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-white">
                    {member.displayName}
                    {member.userId === commissionerId ? <Crown className="h-3.5 w-3.5 text-gold-400" /> : null}
                    {isMe ? <span className="rounded bg-electric-500/15 px-1.5 py-0.5 text-[10px] font-bold text-electric-300">You</span> : null}
                  </p>
                  <p className="text-xs text-slate-500">{myTeams.length} teams</p>
                </div>
                {onClock ? (
                  <Badge variant="electric" icon={<Clock className="h-3 w-3" />}>
                    On the clock
                  </Badge>
                ) : (
                  <span className="text-xs font-semibold tabular-nums text-slate-500">
                    {draft.order.indexOf(member.userId) + 1}
                  </span>
                )}
              </div>

              {myTeams.length > 0 ? (
                <div className={cn('mt-2 flex flex-wrap gap-1', compact && 'gap-0.5')}>
                  {myTeams.map((pick) => (
                    <TeamLogo key={pick.pickNumber} teamId={pick.nflTeamId} size={compact ? 'xs' : 'sm'} />
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
    </ol>
  );
}