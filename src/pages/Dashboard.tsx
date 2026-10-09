import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert } from '@/components/ui/Alert';
import { FirebaseSetupNotice } from '@/components/layout/FirebaseSetupNotice';
import { useMyLeagues } from '@/hooks/useLeagues';
import { isFirebaseConfigured } from '@/lib/firebase';
import { pluralize } from '@/lib/format';
import type { League } from '@/types';

export function Dashboard() {
  const { leagues, status: leaguesStatus, error } = useMyLeagues();

  const rankedLeagues = useMemo(
    () => leagues.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [leagues],
  );

  if (!isFirebaseConfigured()) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <FirebaseSetupNotice context="The app" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">My Leagues</h1>
        <div className="flex gap-2.5">
          <Button to="/join" variant="outline">
            Join with a code
          </Button>
          <Button to="/leagues/new" leftIcon={<Plus className="h-4 w-4" />}>
            Create
          </Button>
        </div>
      </div>

      {leaguesStatus === 'loading' ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-28 rounded-xl" />
          ))}
        </div>
      ) : null}

      {leaguesStatus === 'error' ? (
        <div className="mt-8">
          <Alert variant="error" title="Could not load your leagues">
            {error ?? 'Please try again in a moment.'}
          </Alert>
        </div>
      ) : null}

      {leaguesStatus === 'ready' ? (
        rankedLeagues.length > 0 ? (
          <div className="mt-6 divide-y divide-line/60 border-y border-line/60">
            {rankedLeagues.map((league) => (
              <LeagueRow key={league.id} league={league} />
            ))}
          </div>
        ) : (
          <div className="mt-12">
            <EmptyState
              title="No leagues yet"
              description="Create a league and invite friends, or join one with a code."
              actionLabel="Create a league"
              actionTo="/leagues/new"
            />
          </div>
        )
      ) : null}
    </div>
  );
}

function LeagueRow({ league }: { league: League }) {
  return (
    <Link to={`/leagues/${league.id}`} className="group flex items-center justify-between gap-4 py-4 transition-colors">
      <div className="min-w-0">
        <p className="truncate font-display text-base font-semibold text-white transition-colors group-hover:text-electric-300">
          {league.name}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {league.memberCount}/{league.maxParticipants} {pluralize(league.memberCount, 'player', 'players')} · {league.season} season
        </p>
      </div>
      <LeagueStatusBadge status={league.status} />
    </Link>
  );
}

export function LeagueStatusBadge({ status }: { status: League['status'] }) {
  switch (status) {
    case 'waiting':
      return <span className="shrink-0 text-xs font-medium text-amber-300">Waiting</span>;
    case 'drafting':
      return <span className="shrink-0 text-xs font-medium text-electric-300">Drafting</span>;
    case 'active':
      return <span className="shrink-0 text-xs font-medium text-emerald-300">In season</span>;
    case 'completed':
      return <span className="shrink-0 text-xs font-medium text-gold-300">Final</span>;
    default:
      return <span className="shrink-0 text-xs font-medium text-slate-400">{status}</span>;
  }
}
