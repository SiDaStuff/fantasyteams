import { Clock, Crown } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
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
  /** Optional compact variant for the sidebar. */
  compact?: boolean;
}

/** Participants in draft order with their drafted teams. */
export function DraftParticipants({ draft, members, picks, myUid, commissionerId, compact = false }: DraftParticipantsProps) {
  // Keep the commissioner's configured order; members missing from order land last.
  const ordered = [...draft.order, ...members.filter((m) => !draft.order.includes(m.userId)).map((m) => m.userId)];

  return (
    <ol className="space-y-1">
      {members
        .slice()
        .sort((a, b) => ordered.indexOf(a.userId) - ordered.indexOf(b.userId) || a.joinedAt.getTime() - b.joinedAt.getTime())
        .map((member) => {
          const myTeams = picks.filter((pick) => pick.userId === member.userId);
          const onClock = draft.status === 'live' && draft.currentPickUserId === member.userId;
          const isMe = member.userId === myUid;

          return (
            <li
              key={member.userId}
              className={cn(
                'rounded-lg px-2.5 py-2 transition-colors',
                onClock ? 'bg-electric-500/10' : 'bg-navy-800/40',
              )}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-4 text-right text-xs font-semibold tabular-nums text-slate-500">
                  {ordered.indexOf(member.userId) + 1}
                </span>
                <Avatar name={member.displayName} src={member.photoURL} size="xs" />
                <p className={cn('min-w-0 flex-1 truncate text-sm font-medium', isMe ? 'text-electric-300' : 'text-white')}>
                  {member.displayName}
                  {member.userId === commissionerId ? <Crown className="ml-1.5 inline h-3 w-3 text-gold-400" /> : null}
                </p>
                {onClock ? <Clock className="h-3.5 w-3.5 shrink-0 text-electric-300" /> : null}
              </div>

              {myTeams.length > 0 ? (
                <div className={cn('mt-1.5 flex flex-wrap gap-1', compact && 'gap-0.5')}>
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
