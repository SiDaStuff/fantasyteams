import { Button } from '@/components/ui/Button';

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionTo?: string;
}

export function EmptyState({ title, description, actionLabel, onAction, actionTo }: EmptyStateProps) {
  return (
    <div className="panel flex flex-col items-center justify-center rounded-xl px-6 py-14 text-center">
      <h3 className="font-display text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">{description}</p>
      {actionLabel && (onAction || actionTo) ? (
        <Button className="mt-6" onClick={onAction} to={actionTo}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
