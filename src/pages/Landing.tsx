import { ArrowRight, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';

export function Landing() {
  const { status } = useAuth();
  const signedIn = status === 'authenticated';

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
      <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
        Fantasy football with entire NFL teams.
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-400">
        Draft NFL franchises instead of players. Every win a team earns is a point for you.
        Most combined wins at the end of the season wins the league.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {signedIn ? (
          <>
            <Button to="/leagues/new" size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
              Create a league
            </Button>
            <Button to="/join" size="lg" variant="outline" leftIcon={<KeyRound className="h-4 w-4" />}>
              Join with a code
            </Button>
          </>
        ) : (
          <>
            <Button to="/register" size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
              Get started
            </Button>
            <Button to="/join" size="lg" variant="outline" leftIcon={<KeyRound className="h-4 w-4" />}>
              Join with a code
            </Button>
          </>
        )}
      </div>

      <section className="mt-16 border-t border-line pt-10">
        <h2 className="font-display text-lg font-semibold text-white">How it works</h2>
        <ol className="mt-4 space-y-3 text-sm leading-relaxed text-slate-400">
          <li className="flex gap-3">
            <span className="font-mono font-semibold text-electric-300">1.</span>
            Create a league and share the invite code with friends.
          </li>
          <li className="flex gap-3">
            <span className="font-mono font-semibold text-electric-300">2.</span>
            Draft NFL teams in a live, timed snake or linear draft.
          </li>
          <li className="flex gap-3">
            <span className="font-mono font-semibold text-electric-300">3.</span>
            Your teams score points with every regular-season win.
          </li>
          <li className="flex gap-3">
            <span className="font-mono font-semibold text-electric-300">4.</span>
            The most combined wins at season's end wins the league.
          </li>
        </ol>
      </section>

      <section className="mt-12 border-t border-line pt-10">
        <h2 className="font-display text-lg font-semibold text-white">Details</h2>
        <ul className="mt-4 space-y-2 text-sm text-slate-400">
          <li>Private leagues for 2–16 people</li>
          <li>All 32 NFL franchises, one owner each</li>
          <li>Live standings from real NFL results</li>
          <li>Commissioner tools: invitations, draft order, timing</li>
        </ul>
      </section>
    </div>
  );
}
