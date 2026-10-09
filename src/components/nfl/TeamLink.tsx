import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

export interface TeamLinkProps {
  teamId: string;
  /** Optional league context so the profile can show the fantasy owner. */
  league?: string | null;
  children: ReactNode;
  className?: string;
}

/** Renders NFL team references as links to their profile page. */
export function TeamLink({ teamId, league, children, className = '' }: TeamLinkProps) {
  const to = `/nfl/teams/${teamId}${league ? `?league=${encodeURIComponent(league)}` : ''}`;
  return (
    <Link
      to={to}
      onClick={(event) => event.stopPropagation()}
      className={`focus-ring inline-flex items-center rounded underline-offset-2 transition-colors hover:text-electric-300 hover:underline ${className}`}
    >
      {children}
    </Link>
  );
}