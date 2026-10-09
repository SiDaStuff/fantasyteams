import { LoaderCircle } from 'lucide-react';

export type SpinnerSize = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-10 w-10',
};

export function Spinner({ size = 'md', className = '' }: { size?: SpinnerSize; className?: string }) {
  return (
    <LoaderCircle className={`animate-spin text-electric-400 ${SIZE_CLASSES[size]} ${className}`} aria-label="Loading" />
  );
}

export function FullPageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <Spinner size="lg" />
      <p className="animate-pulse text-sm font-medium text-slate-400">{label}</p>
    </div>
  );
}