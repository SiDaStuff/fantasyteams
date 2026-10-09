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
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="bg-auth flex min-h-[85vh] items-center justify-center px-4 py-14 sm:px-6">
      <div className="w-full max-w-md">
        <div className="animate-fade-up flex flex-col items-center text-center">
          <Link to="/" className="focus-ring rounded-xl" aria-label="Fantasy Teams home">
            <Logo size={44} />
          </Link>
          <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-white">{title}</h1>
          <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
        </div>

        <div className="panel animate-fade-up mt-8 rounded-2xl p-6 sm:p-8" style={{ animationDelay: '100ms' }}>
          {children}
        </div>

        <div className="animate-fade-up mt-5 text-center text-sm text-slate-400" style={{ animationDelay: '160ms' }}>
          {footer}
        </div>
      </div>
    </div>
  );
}