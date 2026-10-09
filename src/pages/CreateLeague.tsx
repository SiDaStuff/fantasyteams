import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Calendar, ListOrdered, Settings2, Timer, Trophy, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/cn';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import {
  DRAFT_PICK_TIMERS,
  MAX_PARTICIPANTS,
  MIN_PARTICIPANTS,
  SEASON_DEFAULT,
  SEASON_MAX,
  SEASON_MIN,
  type DraftFormat,
  type DraftPickTimer,
} from '@/types';
import {
  isDraftFormat,
  isDraftPickTimer,
  validateLeagueName,
  validateParticipantCount,
  validateSeason,
} from '@/lib/validators';
import { formatDraftFormat, formatTimer } from '@/lib/format';

const SEASON_OPTIONS = Array.from({ length: SEASON_MAX - SEASON_MIN + 1 }, (_, i) => SEASON_MIN + i);

export function CreateLeague() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [name, setName] = useState('');
  const [season, setSeason] = useState(SEASON_DEFAULT);
  const [maxParticipants, setMaxParticipants] = useState(8);
  const [draftFormat, setDraftFormat] = useState<DraftFormat>('snake');
  const [timer, setTimer] = useState<DraftPickTimer>(60);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const displayName = profile?.displayName ?? user?.displayName ?? 'Commissioner';

  const valid = useMemo(() => {
    return (
      !validateLeagueName(name) &&
      !validateSeason(season) &&
      !validateParticipantCount(maxParticipants) &&
      isDraftFormat(draftFormat) &&
      isDraftPickTimer(timer)
    );
  }, [name, season, maxParticipants, draftFormat, timer]);

  function validate(): boolean {
    const next: Record<string, string> = {};
    const nameError = validateLeagueName(name);
    const seasonError = validateSeason(season);
    const countError = validateParticipantCount(maxParticipants);
    if (nameError) next.name = nameError;
    if (seasonError) next.season = seasonError;
    if (countError) next.maxParticipants = countError;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const result = await api.createLeague({
        name: name.trim(),
        season,
        maxParticipants,
        draftFormat,
        draftPickTimerSeconds: timer,
      });
      toast.push('success', 'League created', `${name.trim()} is live — share your invite code.`);
      navigate(`/leagues/${result.leagueId}`);
    } catch (error) {
      setFormError(apiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="animate-fade-up">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-electric-400">
          <Trophy className="h-4 w-4" />
          New league
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">Start a private league</h1>
        <p className="mt-2 max-w-2xl text-slate-400">
          Set the rules and invite your friends. You'll be the commissioner.
        </p>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Form */}
        <form onSubmit={handleSubmit} className="animate-fade-up space-y-7" noValidate>
          {formError ? <Alert variant="error">{formError}</Alert> : null}

          {/* Identity */}
          <Panel className="rounded-2xl">
            <FormSectionTitle icon={<Settings2 className="h-4 w-4" />} title="Identity" subtitle="What do we call this group of champions?" />
            <Input
              label="League name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sunday Night Wars"
              maxLength={60}
              error={errors.name}
              hint={`${name.trim().length}/60 characters — commissioner: ${displayName}`}
            />

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-200" htmlFor="season">
                  NFL season
                </label>
                <select
                  id="season"
                  value={season}
                  onChange={(e) => setSeason(Number(e.target.value))}
                  className="focus-ring w-full rounded-xl border border-line bg-navy-900/80 px-3.5 text-sm text-white h-11"
                >
                  {SEASON_OPTIONS.map((y) => (
                    <option key={y} value={y} className="bg-navy-900">
                      {y} season
                    </option>
                  ))}
                </select>
                {errors.season ? <p className="mt-1.5 text-xs font-medium text-rose-400">{errors.season}</p> : null}
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-200" htmlFor="maxParticipants">
                    Maximum owners
                  </label>
                  <span className="text-xs text-slate-500">{maxParticipants}</span>
                </div>
                <input
                  id="maxParticipants"
                  type="range"
                  min={MIN_PARTICIPANTS}
                  max={MAX_PARTICIPANTS}
                  step={1}
                  value={maxParticipants}
                  onChange={(e) => setMaxParticipants(Number(e.target.value))}
                  className="h-11 w-full accent-electric-500"
                />
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>{MIN_PARTICIPANTS} min</span>
                  <span>{MAX_PARTICIPANTS} max</span>
                </div>
                {errors.maxParticipants ? <p className="mt-1 text-xs font-medium text-rose-400">{errors.maxParticipants}</p> : null}
              </div>
            </div>
          </Panel>

          {/* Draft settings */}
          <Panel className="rounded-2xl">
            <FormSectionTitle icon={<ListOrdered className="h-4 w-4" />} title="Draft setup" subtitle="How the room runs on draft night." />

            {/* Draft format */}
            <div>
              <p className="mb-2 text-sm font-medium text-slate-200">Draft format</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormatCard
                  active={draftFormat === 'snake'}
                  onClick={() => setDraftFormat('snake')}
                  title="Snake"
                  description="Order reverses each round — 1 → N → N → 1. The classic."
                />
                <FormatCard
                  active={draftFormat === 'linear'}
                  onClick={() => setDraftFormat('linear')}
                  title="Linear"
                  description="Same order every round. First pick keeps the advantage."
                />
              </div>
            </div>

            {/* Pick timer */}
            <div className="mt-6">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-200">
                <Timer className="h-4 w-4 text-electric-400" />
                Pick timer
              </p>
              <div className="grid grid-cols-4 gap-2">
                {DRAFT_PICK_TIMERS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTimer(t)}
                    className={cn(
                      'focus-ring h-11 rounded-xl border text-sm font-semibold transition-all',
                      timer === t
                        ? 'border-electric-400/60 bg-electric-500/15 text-electric-300 shadow-[0_0_20px_-6px_rgba(31,125,255,0.5)]'
                        : 'border-line bg-navy-900/70 text-slate-400 hover:border-navy-500 hover:text-white',
                    )}
                  >
                    {formatTimer(t)}
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          <Button type="submit" size="lg" fullWidth isLoading={submitting} disabled={!valid} rightIcon={<ArrowRight className="h-4 w-4" />}>
            Create league &amp; open lobby
          </Button>
        </form>

        {/* Live preview */}
        <aside className="animate-fade-up lg:sticky lg:top-24 lg:self-start" style={{ animationDelay: '120ms' }}>
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-electric-400" />
            Live preview
          </p>
          <Panel hover className="rounded-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-display text-xl font-semibold text-white">
                  {name.trim() || 'Untitled League'}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                  <Calendar className="h-3.5 w-3.5" />
                  {season} NFL season · {maxParticipants} owners max
                </p>
              </div>
              <Badge variant="warning" icon={<span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-amber-300" />}>
                Waiting
              </Badge>
            </div>

            <div className="mt-4 rounded-xl bg-navy-900/70 p-3.5">
              <p className="flex items-center gap-2 text-sm">
                <Timer className="h-4 w-4 text-electric-400" />
                <span className="text-slate-400">Draft:</span>
                <span className="font-semibold text-white">{formatDraftFormat(draftFormat)}</span>
                <span className="mx-1 text-slate-600">·</span>
                <span className="font-semibold text-white">{formatTimer(timer)} per pick</span>
              </p>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  1/{maxParticipants} owners
                </span>
                <span>You'll be the commissioner</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-navy-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-electric-500 to-ice-400"
                  style={{ width: `${Math.max((1 / maxParticipants) * 100, 6)}%` }}
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-navy-900/50 px-3 py-2.5">
              <Avatar name={displayName} src={profile?.photoURL ?? user?.photoURL} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                <p className="text-xs text-slate-500">Commissioner</p>
              </div>
              <Badge variant="gold">You</Badge>
            </div>

            <div className="mt-4 rounded-xl border border-dashed border-line p-3 text-center text-xs text-slate-500">
              Invite link &amp; join code appear here after creation
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';

function FormSectionTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-electric-400/20 bg-electric-500/10 text-electric-300">
        {icon}
      </div>
      <div>
        <h2 className="font-display text-base font-semibold text-white">{title}</h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function FormatCard({ active, onClick, title, description }: { active: boolean; onClick: () => void; title: string; description: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'focus-ring rounded-xl border p-4 text-left transition-all',
        active
          ? 'border-electric-400/60 bg-electric-500/12 shadow-[0_0_30px_-8px_rgba(31,125,255,0.5)]'
          : 'border-line bg-navy-900/70 hover:border-navy-500',
      )}
    >
      <p className={cn('font-display text-sm font-semibold', active ? 'text-electric-300' : 'text-white')}>{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">{description}</p>
    </button>
  );
}