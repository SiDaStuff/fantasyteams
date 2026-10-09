import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string | null;
  leftIcon?: ReactNode;
  /** Displays a right-aligned adornment (e.g. a copy button). */
  rightAdornment?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leftIcon, rightAdornment, containerClassName = '', className = '', id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;

  return (
    <div className={containerClassName}>
      {label ? (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-slate-200">
          {label}
        </label>
      ) : null}

      <div className="relative">
        {leftIcon ? (
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400">
            {leftIcon}
          </span>
        ) : null}

        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={[
            'focus-ring w-full rounded-xl border bg-navy-900/80 text-white placeholder-slate-500 transition-colors',
            'border-line hover:border-navy-500',
            error ? 'border-rose-500/60 focus-visible:ring-rose-400/50' : 'focus-visible:border-electric-400/60',
            leftIcon ? 'pl-10' : 'pl-3.5',
            rightAdornment ? 'pr-11' : 'pr-3.5',
            'h-11 text-sm',
            className,
          ].join(' ')}
          {...rest}
        />

        {rightAdornment ? (
          <span className="absolute inset-y-0 right-0 flex items-center pr-1.5">{rightAdornment}</span>
        ) : null}
      </div>

      {error ? (
        <p id={errorId} className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-400">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
});