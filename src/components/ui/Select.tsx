import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}

export function Select({ label, hint, error, children, className = '', id, ...rest }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;

  return (
    <div>
      {label ? (
        <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-slate-200">
          {label}
        </label>
      ) : null}

      <div className="relative">
        <select
          id={selectId}
          aria-invalid={Boolean(error)}
          className={[
            'focus-ring w-full appearance-none rounded-xl border border-line bg-navy-900/80 px-3.5 text-sm text-white',
            'h-11 pr-10 transition-colors hover:border-navy-500 focus-visible:border-electric-400/60',
            error ? 'border-rose-500/60' : '',
            className,
          ].join(' ')}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </div>

      {error ? <p className="mt-1.5 text-xs font-medium text-rose-400">{error}</p> : hint ? (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}