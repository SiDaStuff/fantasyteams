import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

export interface CountdownTimerProps {
  /** Authoritative server deadline. */
  deadline: Date | null;
  /** When paused the clock freezes. */
  paused: boolean;
  /** Fallback readout used when there is no live deadline (e.g. pre-draft). */
  idleLabel?: string;
  className?: string;
}

function format(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Countdown driven by the authoritative server deadline. The remaining time is
 * recomputed in an interval (not during render) and the clock re-renders
 * locally every 250ms, staying smooth without extra network calls.
 */
export function CountdownTimer({ deadline, paused, idleLabel = '—', className = '' }: CountdownTimerProps) {
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    if (!deadline) return undefined;
    const recompute = () => setRemainingMs(deadline.getTime() - Date.now());
    recompute();
    const timer = window.setInterval(recompute, 250);
    return () => window.clearInterval(timer);
  }, [deadline]);

  const seconds = Math.max(0, Math.floor(remainingMs / 1000));

  const urgent = !paused && seconds <= 5;
  const warning = !paused && seconds <= 15 && !urgent;

  return (
    <div
      className={cn(
        'rounded-lg px-3 py-1.5 font-mono text-xl font-bold tabular-nums transition-colors',
        paused && 'text-slate-500',
        urgent && 'bg-rose-500/15 text-rose-300',
        warning && 'bg-amber-500/10 text-amber-300',
        !paused && !urgent && !warning && 'bg-navy-800 text-white',
        className,
      )}
      role="timer"
      aria-label={paused ? 'Timer paused' : 'Time remaining'}
    >
      {paused ? 'Paused' : deadline ? format(remainingMs) : idleLabel}
    </div>
  );
}
