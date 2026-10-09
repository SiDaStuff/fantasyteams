import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, KeyRound, Plus, Users } from 'lucide-react';
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
    <div className="app-page">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="app-kicker">League center</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">My Leagues</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">Open a league to check your teams, this week’s games, standings, and title odds.</p>
        </div>
        <Button to="/leagues/new" leftIcon={<Plus className="h-4 w-4" />} className="w-full sm:w-auto">
          Create league
        </Button>
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <Link to="/join" className="focus-ring group flex items-center gap-4 rounded-xl border border-line bg-navy-900 p-4 transition-colors hover:border-electric-400/40 hover:bg-navy-850">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-electric-500/12 text-electric-300"><KeyRound className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">Join a league</span><span className="mt-0.5 block text-xs text-slate-500">Enter an invite code from a commissioner.</span></span>
          <ArrowRight className="h-4 w-4 shrink-0 text-slate-600 transition-colors group-hover:text-electric-300" />
        </Link>
        <Link to="/nfl" className="focus-ring group flex items-center gap-4 rounded-xl border border-line bg-navy-900 p-4 transition-colors hover:border-electric-400/40 hover:bg-navy-850">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-electric-500/12 text-electric-300"><Users className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">NFL scores</span><span className="mt-0.5 block text-xs text-slate-500">Follow the active week and your drafted teams.</span></span>
          <ArrowRight className="h-4 w-4 shrink-0 text-slate-600 transition-colors group-hover:text-electric-300" />
        </Link>
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
          <section className="mt-8" aria-labelledby="league-list-title">
            <div className="mb-3 flex items-center justify-between"><h2 id="league-list-title" className="font-display text-lg font-semibold text-white">Your leagues</h2><span className="text-xs text-slate-500">{rankedLeagues.length} total</span></div>
            <div className="grid gap-3 md:grid-cols-2">
            {rankedLeagues.map((league) => (
              <LeagueRow key={league.id} league={league} />
            ))}
            </div>
          </section>
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
    <Link to={`/leagues/${league.id}`} className="focus-ring group flex min-w-0 items-center justify-between gap-4 rounded-xl border border-line bg-navy-900 p-4 transition-colors hover:border-electric-400/40 hover:bg-navy-850">
      <div className="min-w-0">
        <p className="truncate font-display text-base font-semibold text-white transition-colors group-hover:text-electric-300">
          {league.name}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {league.memberCount}/{league.maxParticipants} {pluralize(league.memberCount, 'player', 'players')} · {league.season} season
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3"><LeagueStatusBadge status={league.status} /><ArrowRight className="h-4 w-4 text-slate-600 transition-colors group-hover:text-electric-300" /></div>
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
