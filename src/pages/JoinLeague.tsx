import { useState, type FormEvent } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound, LogIn, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Logo } from '@/components/brand/Logo';
import { FirebaseSetupNotice } from '@/components/layout/FirebaseSetupNotice';
import { api, apiErrorCode, apiErrorMessage } from '@/lib/api';
import { normalizeLeagueCode, validateLeagueCode } from '@/lib/validators';
import { formatDraftFormat, formatTimer } from '@/lib/format';
import { useAuth } from '@/context/AuthContext';
import { isFirebaseConfigured } from '@/lib/firebase';
import type { LeaguePreview } from '@/types';

type Stage = 'code' | 'preview' | 'joining';

export function JoinLeague() {
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialCode = searchParams.get('code') ?? '';
  const [code, setCode] = useState(normalizeLeagueCode(initialCode));
  const [stage, setStage] = useState<Stage>('code');
  const [preview, setPreview] = useState<LeaguePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signedIn = status === 'authenticated';

  async function handleLookup() {
    if (!signedIn) {
      navigate('/login', { state: { from: `/join?code=${code}` } });
      return;
    }
    const validation = validateLeagueCode(code);
    if (validation) {
      setError(validation);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await api.getLeagueByCode(normalizeLeagueCode(code));
      setPreview(result);
      setStage('preview');
    } catch (err) {
      const errCode = apiErrorCode(err);
      if (errCode === 'not-found') {
        setError('No league found with that code. Double-check the invite and try again.');
      } else {
        setError(apiErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.joinLeague(normalizeLeagueCode(code));
      navigate(`/leagues/${result.leagueId}`);
    } catch (err) {
      const errCode = apiErrorCode(err);
      if (errCode === 'already-exists') {
        setError('You are already a member of this league — opening it…');
        setPreview((p) => (p ? { ...p, isMember: true } : p));
        if (preview) {
          window.setTimeout(() => navigate(`/leagues/${preview.leagueId}`), 1200);
        }
      } else if (errCode === 'resource-exhausted') {
        setError('This league is already full.');
      } else if (errCode === 'failed-precondition') {
        setError('This league is no longer accepting new members.');
      } else {
        setError(apiErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  if (!isFirebaseConfigured()) {
    return (
      <div className="bg-auth min-h-[85vh] px-4 py-16">
        <FirebaseSetupNotice context="League joining" />
      </div>
    );
  }

  return (
    <div className="bg-auth flex min-h-[85vh] items-center justify-center px-4 py-14 sm:px-6">
      <div className="w-full max-w-lg">
        <div className="animate-fade-up flex flex-col items-center text-center">
          <Link to="/" className="focus-ring rounded-xl" aria-label="Fantasy Teams home">
            <Logo size={44} />
          </Link>
          <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-white">Join a league</h1>
          <p className="mt-2 text-sm text-slate-400">
            {signedIn
              ? `Signed in as ${user?.email ?? 'you'} — enter your six-character league code.`
              : 'Sign in to join a private league with your invite code.'}
          </p>
        </div>

        <Panel className="animate-fade-up mt-8 rounded-2xl p-6 sm:p-8" style={{ animationDelay: '100ms' }}>
          {!signedIn ? (
            <div className="space-y-4">
              <Alert variant="info">You need an account to join a league. Creating one takes under a minute.</Alert>
              <Button to="/login" size="lg" fullWidth leftIcon={<LogIn className="h-4 w-4" />}>
                Sign in to continue
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              {error && stage === 'code' ? <Alert variant="error">{error}</Alert> : null}

              <form
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  void handleLookup();
                }}
                className="space-y-3"
              >
                <Input
                  label="League code"
                  value={code}
                  onChange={(e) => {
                    setCode(normalizeLeagueCode(e.target.value));
                    setError(null);
                  }}
                  placeholder="e.g. K7XQ2M"
                  className="font-mono text-lg tracking-[0.3em] uppercase"
                  maxLength={6}
                  autoComplete="off"
                  autoFocus
                  leftIcon={<KeyRound className="h-4 w-4" />}
                />
                <Button type="submit" fullWidth size="lg" isLoading={busy && stage === 'code'} leftIcon={busy ? undefined : <Search className="h-4 w-4" />}>
                  Find league
                </Button>
              </form>

              {stage === 'preview' && preview ? (
                <div className="animate-scale-in space-y-5">
                  <div className="panel rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-display text-lg font-semibold text-white">{preview.name}</p>
                        <p className="mt-0.5 text-sm text-slate-400">
                          {preview.season} NFL season · by {preview.commissionerName}
                        </p>
                      </div>
                      <Badge variant={preview.status === 'waiting' ? 'success' : 'neutral'}>
                        {preview.status === 'waiting' ? 'Open' : 'Closed'}
                      </Badge>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-electric-400" />
                        {preview.memberCount}/{preview.maxParticipants} owners
                      </span>
                      <span>{formatDraftFormat(preview.draftFormat)} draft</span>
                      <span>{formatTimer(preview.draftPickTimerSeconds)} picks</span>
                    </div>

                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-navy-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-electric-500 to-ice-400"
                        style={{ width: `${Math.max((preview.memberCount / preview.maxParticipants) * 100, 5)}%` }}
                      />
                    </div>
                  </div>

                  {error && stage === 'preview' ? <Alert variant="error">{error}</Alert> : null}

                  <div className="flex flex-col-reverse gap-3 sm:flex-row">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setStage('code');
                        setPreview(null);
                        setError(null);
                        setSearchParams({}, { replace: true });
                      }}
                    >
                      Change code
                    </Button>
                    <Button
                      className="flex-1"
                      size="lg"
                      isLoading={busy && stage === 'preview'}
                      onClick={() => void handleJoin()}
                      disabled={preview.status !== 'waiting' || preview.memberCount >= preview.maxParticipants || preview.isMember}
                      rightIcon={<ArrowRight className="h-4 w-4" />}
                    >
                      {preview.isMember
                        ? 'Already a member — opening…'
                        : preview.memberCount >= preview.maxParticipants
                          ? 'League is full'
                          : `Join ${preview.name}`}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}