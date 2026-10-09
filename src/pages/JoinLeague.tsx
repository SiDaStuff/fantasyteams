import { useState, type FormEvent } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { Alert } from '@/components/ui/Alert';
import { FirebaseSetupNotice } from '@/components/layout/FirebaseSetupNotice';
import { api, apiErrorCode, apiErrorMessage } from '@/lib/api';
import { normalizeLeagueCode, validateLeagueCode } from '@/lib/validators';
import { useAuth } from '@/context/AuthContext';
import { isFirebaseConfigured } from '@/lib/firebase';
import type { LeaguePreview } from '@/types';

type Stage = 'code' | 'preview';

export function JoinLeague() {
  const { status } = useAuth();
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
        setError('No league found with that code.');
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
        navigate(`/leagues/${preview.leagueId}`);
        return;
      } else if (errCode === 'resource-exhausted') {
        setError('This league is full.');
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
    <div className="flex min-h-[75vh] items-start justify-center px-4 py-16 sm:px-6">
      <div className="w-full max-w-md">
        <h1 className="font-display text-2xl font-bold tracking-tight text-white">Join a league</h1>

        <Panel className="mt-6 rounded-xl p-6">
          {!signedIn ? (
            <div className="space-y-4">
              <Alert variant="info">Sign in to join with your invite code.</Alert>
              <Button to="/login" size="lg" fullWidth>
                Sign in
              </Button>
              <p className="text-center text-xs text-slate-500">
                New here?{' '}
                <Link to="/register" className="font-semibold text-electric-300 hover:text-electric-200">
                  Create an account
                </Link>
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {error ? <Alert variant="error">{error}</Alert> : null}

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
                  placeholder="6 characters"
                  className="font-mono text-lg tracking-[0.3em] uppercase"
                  maxLength={6}
                  autoComplete="off"
                  autoFocus
                  leftIcon={<KeyRound className="h-4 w-4" />}
                />
                <Button type="submit" fullWidth size="lg" isLoading={busy && stage === 'code'}>
                  Find league
                </Button>
              </form>

              {stage === 'preview' && preview ? (
                <div className="animate-fade-in space-y-5 border-t border-line pt-5">
                  <div>
                    <p className="truncate font-display text-lg font-semibold text-white">{preview.name}</p>
                    <p className="mt-0.5 text-sm text-slate-400">
                      {preview.memberCount}/{preview.maxParticipants} players · {preview.season} season
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setStage('code');
                        setPreview(null);
                        setError(null);
                        setSearchParams({}, { replace: true });
                      }}
                    >
                      Back
                    </Button>
                    <Button
                      className="flex-1"
                      size="lg"
                      isLoading={busy}
                      onClick={() => void handleJoin()}
                      disabled={preview.status !== 'waiting' || preview.memberCount >= preview.maxParticipants}
                    >
                      {preview.isMember
                        ? 'Open league'
                        : preview.memberCount >= preview.maxParticipants
                          ? 'League is full'
                          : 'Join league'}
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
