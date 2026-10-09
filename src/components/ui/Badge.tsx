import type { ReactNode } from 'react';

type BadgeVariant = 'electric' | 'success' | 'warning' | 'danger' | 'neutral' | 'gold';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  electric: 'border-electric-400/30 bg-electric-500/10 text-electric-300',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  danger: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  gold: 'border-gold-400/30 bg-gold-400/10 text-gold-300',
  neutral: 'border-line bg-navy-800 text-slate-300',
};

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
  icon?: ReactNode;
}

export function Badge({ children, variant = 'neutral', className = '', icon }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}