import { cn } from '@/lib/cn';

export interface LogoProps {
  withText?: boolean;
  size?: number;
  className?: string;
}

/** Fantasy Teams brand mark — a shield cradling a lightning bolt. */
export function LogoMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="ft-shield" x1="8" y1="4" x2="40" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#85C4FF" />
          <stop offset="0.5" stopColor="#1F7DFF" />
          <stop offset="1" stopColor="#0B5EE0" />
        </linearGradient>
        <linearGradient id="ft-bolt" x1="27" y1="14" x2="20" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#BFE3FF" />
        </linearGradient>
      </defs>

      <path
        d="M24 3 41 9.6v12.05C41 32.3 33.85 40.6 24 44.2 14.15 40.6 7 32.3 7 21.65V9.6L24 3Z"
        fill="url(#ft-shield)"
        stroke="rgba(133,196,255,0.55)"
        strokeWidth="1.5"
      />
      <path d="M24 6.5 38.5 12v9.6c0 9.05-6.15 16.2-14.5 19.6-8.35-3.4-14.5-10.55-14.5-19.6V12L24 6.5Z" fill="rgba(7,13,29,0.55)" />

      <path
        d="M26.4 12 17.5 25.5h4.8L21 32l8.9-13.5h-4.8l1.3-6.5Z"
        fill="url(#ft-bolt)"
      />
    </svg>
  );
}

export function Logo({ withText = true, size = 36, className = '' }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} />
      {withText ? (
        <span className="font-display text-lg font-bold tracking-tight text-white">
          Fantasy<span className="text-gradient">Teams</span>
        </span>
      ) : null}
    </span>
  );
}