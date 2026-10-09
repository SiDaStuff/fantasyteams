import { Badge } from '@/components/ui/Badge';
import type { NflGameStatus } from '@/types';

const LABELS: Record<NflGameStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'Live',
  halftime: 'Halftime',
  final: 'Final',
  postponed: 'Postponed',
};

export function GameStatusBadge({ status, className = '' }: { status: NflGameStatus; className?: string }) {
  switch (status) {
    case 'in_progress':
    case 'halftime':
      return (
        <Badge variant="danger" className={className} icon={<span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-rose-300" />}>
          {LABELS[status]}
        </Badge>
      );
    case 'final':
      return <Badge variant="neutral" className={className}>{LABELS.final}</Badge>;
    case 'postponed':
      return <Badge variant="warning" className={className}>{LABELS.postponed}</Badge>;
    default:
      return <Badge variant="neutral" className={className}>{LABELS.scheduled}</Badge>;
  }
}