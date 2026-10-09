import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { cn } from '@/lib/cn';
import { api, apiErrorMessage } from '@/lib/api';
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

const SEASON_OPTIONS = Array.from({ length: SEASON_MAX - SEASON_MIN + 1 }, (_, i) => SEASON_MIN + i);

export function CreateLeague() {
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
      toast.push('success', 'League created', 'Share your invite code to add players.');
      navigate(`/leagues/${result.leagueId}`);
    } catch (error) {
      setFormError(apiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">Create a league</h1>

      <form onSubmit={handleSubmit} className="animate-fade-up mt-8 space-y-6" noValidate>
        {formError ? <Alert variant="error">{formError}</Alert> : null}

        <Input
          label="League name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Sunday League"
          maxLength={60}
          error={errors.name}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-200" htmlFor="season">
              Season
            </label>
            <select
              id="season"
              value={season}
              onChange={(e) => setSeason(Number(e.target.value))}
              className="focus-ring h-11 w-full rounded-lg border border-line bg-navy-900 px-3.5 text-sm text-white"
            >
              {SEASON_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            {errors.season ? <p className="mt-1.5 text-xs font-medium text-rose-400">{errors.season}</p> : null}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-slate-200" htmlFor="maxParticipants">
                Players
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
            {errors.maxParticipants ? <p className="mt-1 text-xs font-medium text-rose-400">{errors.maxParticipants}</p> : null}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-200">Draft format</p>
          <div className="grid grid-cols-2 gap-2">
            <FormatOption
              active={draftFormat === 'snake'}
              onClick={() => setDraftFormat('snake')}
              title="Snake"
              description="Order reverses each round"
            />
            <FormatOption
              active={draftFormat === 'linear'}
              onClick={() => setDraftFormat('linear')}
              title="Linear"
              description="Same order every round"
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-200">Time per pick</p>
          <div className="grid grid-cols-4 gap-2">
            {DRAFT_PICK_TIMERS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTimer(t)}
                aria-pressed={timer === t}
                className={cn(
                  'focus-ring h-10 rounded-lg border text-sm font-semibold transition-colors',
                  timer === t
                    ? 'border-electric-400/60 bg-electric-500/15 text-electric-300'
                    : 'border-line text-slate-400 hover:border-navy-500',
                )}
              >
                {t}s
              </button>
            ))}
          </div>
        </div>

        <Button type="submit" size="lg" fullWidth isLoading={submitting} disabled={!valid}>
          Create league
        </Button>
      </form>
    </div>
  );
}

function FormatOption({ active, onClick, title, description }: { active: boolean; onClick: () => void; title: string; description: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'focus-ring rounded-xl border p-3.5 text-left transition-colors',
        active ? 'border-electric-400/60 bg-electric-500/10' : 'border-line hover:border-navy-500',
      )}
    >
      <p className={cn('text-sm font-semibold', active ? 'text-electric-300' : 'text-white')}>{title}</p>
      <p className="mt-0.5 text-xs text-slate-500">{description}</p>
    </button>
  );
}
