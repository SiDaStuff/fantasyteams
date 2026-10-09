import type { ReactNode } from 'react';
import { CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react';

type AlertVariant = 'error' | 'success' | 'info' | 'warning';

const CONFIG: Record<AlertVariant, { icon: typeof Info; classes: string; iconClasses: string }> = {
  error: {
    icon: CircleX,
    classes: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
    iconClasses: 'text-rose-400',
  },
  success: {
    icon: CircleCheck,
    classes: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    iconClasses: 'text-emerald-400',
  },
  info: {
    icon: Info,
    classes: 'border-electric-400/30 bg-electric-500/10 text-electric-200',
    iconClasses: 'text-electric-300',
  },
  warning: {
    icon: TriangleAlert,
    classes: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    iconClasses: 'text-amber-400',
  },
};

export interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children?: ReactNode;
  className?: string;
}

export function Alert({ variant = 'info', title, children, className = '' }: AlertProps) {
  const { icon: Icon, classes, iconClasses } = CONFIG[variant];
  return (
    <div role={variant === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${classes} ${className}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconClasses}`} aria-hidden />
      <div className="min-w-0 text-sm leading-relaxed">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}