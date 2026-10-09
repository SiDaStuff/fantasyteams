import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Consistent header for every page inside a league:
 * back link, league name, and a right-side action slot.
 */
export function LeagueHeader({
  leagueName,
  season,
  right,
  children,
}: {
  leagueId?: string;
  leagueName: string;
  season: number;
  right?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header>
      <Link
        to="/dashboard"
        className="focus-ring inline-flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-300"
      >
        <ChevronLeft className="h-4 w-4" />
        My Leagues
      </Link>

      <div className="mt-3 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="min-w-0 break-words font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
          {leagueName}
          <span className="ml-2 whitespace-nowrap text-sm font-medium text-slate-500 sm:text-base">{season}</span>
        </h1>
        {right}
      </div>

      {children ? <div className="mt-4">{children}</div> : null}
    </header>
  );
}
