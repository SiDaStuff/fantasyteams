import { cn } from '@/lib/cn';
import type { NflGameStatus } from '@/types';

const LABELS: Record<NflGameStatus, string> = {
  scheduled: 'Upcoming',
  in_progress: 'Live',
  halftime: 'Halftime',
  final: 'Final',
  postponed: 'PPD',
};

const TONE: Record<NflGameStatus, string> = {
  scheduled: 'text-slate-500',
  in_progress: 'text-rose-300',
  halftime: 'text-rose-300',
  final: 'text-slate-400',
  postponed: 'text-amber-300',
};

/** Compact text status for a game. */
export function GameStatusBadge({ status, className = '' }: { status: NflGameStatus; className?: string }) {
  return (
    <span className={cn('text-xs font-medium', TONE[status], className)}>{LABELS[status]}</span>
  );
}
