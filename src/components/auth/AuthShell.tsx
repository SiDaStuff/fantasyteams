import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-[75vh] items-start justify-center px-4 py-16 sm:px-6">
      <div className="w-full max-w-md">
        <div className="animate-fade-up flex flex-col items-center text-center">
          <Link to="/" className="focus-ring rounded-xl" aria-label="Fantasy Teams home">
            <Logo size={40} />
          </Link>
          <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-white">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-sm text-slate-400">{subtitle}</p> : null}
        </div>

        <div className="panel animate-fade-up mt-7 rounded-xl p-6" style={{ animationDelay: '80ms' }}>
          {children}
        </div>

        <div className="animate-fade-up mt-5 text-center text-sm text-slate-400" style={{ animationDelay: '120ms' }}>
          {footer}
        </div>
      </div>
    </div>
  );
}
