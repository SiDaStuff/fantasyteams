import {
  ArrowRight,
  Calendar,
  ChartLine,
  Check,
  Crown,
  Flag,
  KeyRound,
  Link2,
  ListOrdered,
  Send,
  Shield,
  Sparkles,
  Swords,
  Timer,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/context/AuthContext';

export function Landing() {
  const { status } = useAuth();
  const signedIn = status === 'authenticated';

  return (
    <div className="overflow-x-clip">
      {/* ─────────────────────────── Hero ─────────────────────────── */}
      <section className="bg-grid relative">
        <div className="mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:px-8">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="animate-fade-up">
              <div className="animate-fade-in flex items-center gap-2">
                <Badge variant="electric" icon={<Zap className="h-3.5 w-3.5" />}>
                  2026 · NFL Season
                </Badge>
              </div>

              <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
                Draft Teams.
                <br />
                Chase Wins.
                <br />
                <span className="text-gradient">Become Champion.</span>
              </h1>

              <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-400">
                Fantasy Teams is a private league where friends draft entire{' '}
                <span className="font-semibold text-slate-200">NFL franchises</span> instead of
                individual players. Every regular-season win scores a point. The best-owned
                roster of teams becomes champion.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                {signedIn ? (
                  <>
                    <Button to="/leagues/new" size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
                      Create a league
                    </Button>
                    <Button to="/join" size="lg" variant="outline" rightIcon={<KeyRound className="h-4 w-4" />}>
                      Join with a code
                    </Button>
                  </>
                ) : (
                  <>
                    <Button to="/register" size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
                      Create your first league
                    </Button>
                    <Button to="/login" size="lg" variant="outline" rightIcon={<KeyRound className="h-4 w-4" />}>
                      Join with a code
                    </Button>
                  </>
                )}
              </div>

              <ul className="mt-9 flex flex-wrap gap-x-7 gap-y-2.5 text-sm text-slate-400">
                {['Private leagues', 'Snake & linear drafts', 'Live standings'].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-electric-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Hero visual: a stylized draft-board preview */}
            <div className="animate-scale-in relative lg:justify-self-end" style={{ animationDelay: '120ms' }}>
              <div className="pointer-events-none absolute -inset-10 rounded-full bg-electric-500/20 blur-3xl" aria-hidden />
              <HeroMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────── Stats strip ─────────────────────────── */}
      <section className="border-y border-line/60 bg-navy-900/60">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 md:grid-cols-4 lg:px-8">
          <Stat value="32" label="NFL franchises up for grabs" />
          <Stat value="2–16" label="Owners per private league" />
          <Stat value="17" label="Weeks in the regular season" />
          <Stat value="1" label="Champion per season" />
        </div>
      </section>

      {/* ─────────────────────────── How it works ─────────────────────────── */}
      <section id="how-it-works" className="scroll-mt-24 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="How it works"
            title="Four steps to a winner"
            description="Set up a league, run the draft, and score the real games."
          />

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Step
              step="01"
              icon={<Trophy className="h-6 w-6" />}
              title="Create a league"
              description="Name your league, pick the season and size, and invite your friends with a private code."
            />
            <Step
              step="02"
              icon={<Swords className="h-6 w-6" />}
              title="Hold a live draft"
              description="When everyone's ready, the commissioner starts a snake draft. Each NFL team can be drafted once."
            />
            <Step
              step="03"
              icon={<Flag className="h-6 w-6" />}
              title="Score real wins"
              description="Every regular-season victory by a team you drafted is one point for your franchise."
            />
            <Step
              step="04"
              icon={<Crown className="h-6 w-6" />}
              title="Crown a champion"
              description="The owner with the most combined wins at season's end hoists the trophy. Bragging rights for a year."
            />
          </div>
        </div>
      </section>

      {/* ─────────────────────────── Features ─────────────────────────── */}
      <section id="features" className="scroll-mt-24 bg-navy-900/40 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="What you get"
            title="Built for the full season"
            description="Draft, score, and settle the bragging rights — all in one place."
          />

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Feature
              icon={<Shield className="h-6 w-6" />}
              title="Private by default"
              description="Invite-only leagues. A six-character code keeps out randoms, and every spot is locked once the draft starts."
            />
            <Feature
              icon={<ListOrdered className="h-6 w-6" />}
              title="Draft your way"
              description="Randomized order each league, with the classic snake format (1 → N → N → 1) or a straight linear draft."
            />
            <Feature
              icon={<Timer className="h-6 w-6" />}
              title="Paced picks"
              description="Keep drafts moving with a per-pick timer from 30 to 120 seconds. The clock is in the commissioner's hands."
            />
            <Feature
              icon={<ChartLine className="h-6 w-6" />}
              title="Real NFL results"
              description="Your scoreboard is the league schedule — every win adds to your total, every week, all season long."
            />
            <Feature
              icon={<Users className="h-6 w-6" />}
              title="Multiplayer & cross-device"
              description="Play on desktop or phone. Everyone sees the same board at the same time."
            />
            <Feature
              icon={<Zap className="h-6 w-6" />}
              title="Show up ready"
              description="The lobby tracks who's ready. The commissioner starts when the room is set."
            />
          </div>
        </div>
      </section>

      {/* ─────────────────────────── CTA ─────────────────────────── */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="panel animate-fade-up relative overflow-hidden rounded-3xl px-6 py-14 text-center sm:px-14">
            <div className="pointer-events-none absolute inset-x-0 -top-32 mx-auto h-64 w-2/3 rounded-full bg-electric-500/25 blur-3xl" aria-hidden />
            <div className="relative">
              <Sparkles className="mx-auto h-8 w-8 text-gold-400" />
              <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Ready to build your dynasty?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-slate-400">
                Round up the crew, claim your franchises, and let the NFL decide who's boss.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button to={signedIn ? '/leagues/new' : '/register'} size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
                  Start a league
                </Button>
                <Button to="/join" size="lg" variant="secondary" leftIcon={<Link2 className="h-4 w-4" />}>
                  I have an invite
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ─────────────────────────── Sub-components ─────────────────────────── */

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="font-display text-3xl font-bold text-white sm:text-4xl">
        <span className="text-gradient">{value}</span>
      </p>
      <p className="mt-1 text-sm text-slate-400">{label}</p>
    </div>
  );
}

import type { ReactNode } from 'react';

function Step({ step, icon, title, description }: { step: string; icon: ReactNode; title: string; description: string }) {
  return (
    <div className="panel panel-hover group relative rounded-2xl p-6">
      <span className="font-display absolute right-5 top-5 text-sm font-semibold text-slate-600 transition-colors group-hover:text-electric-400/60">
        {step}
      </span>
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-electric-400/20 bg-electric-500/10 text-electric-300 transition-colors group-hover:bg-electric-500/20">
        {icon}
      </div>
      <h3 className="mt-5 font-display text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{description}</p>
    </div>
  );
}

function Feature({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="panel rounded-2xl p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-electric-400/30">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-gold-400/20 bg-gold-400/8 text-gold-400">
        {icon}
      </div>
      <h3 className="mt-4 font-display text-base font-semibold text-white">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{description}</p>
    </div>
  );
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-electric-400">{eyebrow}</p>
      <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h2>
      <p className="mt-4 text-lg text-slate-400">{description}</p>
    </div>
  );
}

/** Stylized, non-functional preview of the arena product. */
function HeroMockup() {
  const members = [
    { name: 'Alex Drake', ready: true },
    { name: 'Mia Chen', ready: true },
    { name: 'Jamal Reid', ready: false },
    { name: 'Sofia Ruiz', ready: true },
  ];

  return (
    <div className="relative w-full max-w-md">
      {/* League card */}
      <div className="panel animate-float rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-display text-lg font-semibold text-white">Sunday Night Wars</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
              <Calendar className="h-3.5 w-3.5" /> 2026 season · 8 owners
            </p>
          </div>
          <Badge variant="electric">
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-electric-300" />
            Waiting for players
          </Badge>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-navy-900/70 px-3.5 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <Send className="h-4 w-4 text-electric-400" />
            <span className="font-mono text-sm font-semibold tracking-[0.25em] text-white">K7XQ2M</span>
          </div>
          <span className="text-xs text-slate-500">Share this code</span>
        </div>

        <div className="mt-4 space-y-2">
          {members.map((member) => (
            <div key={member.name} className="flex items-center gap-3 rounded-xl bg-navy-900/50 px-3 py-2">
              <Avatar name={member.name} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-200">{member.name}</span>
              {member.ready ? (
                <Badge variant="success">
                  <Check className="h-3 w-3" /> Ready
                </Badge>
              ) : (
                <Badge variant="neutral">Setting up</Badge>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
          <div className="rounded-xl border border-line bg-navy-900/50 py-2.5">
            <p className="text-slate-500">Draft format</p>
            <p className="mt-0.5 flex items-center justify-center gap-1 font-semibold text-white">
              <ListOrdered className="h-3.5 w-3.5 text-electric-400" /> Snake
            </p>
          </div>
          <div className="rounded-xl border border-line bg-navy-900/50 py-2.5">
            <p className="text-slate-500">Pick timer</p>
            <p className="mt-0.5 flex items-center justify-center gap-1 font-semibold text-white">
              <Timer className="h-3.5 w-3.5 text-electric-400" /> 90s
            </p>
          </div>
        </div>
      </div>

      {/* Floating win-count chip */}
      <div className="panel absolute -right-3 -top-6 hidden rounded-2xl px-4 py-3 sm:block" style={{ animation: 'float 9s ease-in-out 1s infinite' }}>
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-electric-500/15 text-electric-300">
            <Trophy className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Projected champion</p>
            <p className="text-sm font-bold text-white">Chiefs · 15 wins</p>
          </div>
        </div>
      </div>

      {/* Floating pick chip */}
      <div className="panel absolute -bottom-6 -left-4 hidden rounded-2xl px-4 py-3 sm:block" style={{ animation: 'float 8s ease-in-out 0.5s infinite' }}>
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-400/15 text-gold-400">
            <Crown className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Pick 1 of 8</p>
            <p className="text-sm font-bold text-white">Eagles · NFC East</p>
          </div>
        </div>
      </div>
    </div>
  );
}