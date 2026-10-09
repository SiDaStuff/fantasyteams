import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound, Search, Users } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { api, apiErrorCode, apiErrorMessage } from '@/lib/api';
import { normalizeLeagueCode, validateLeagueCode } from '@/lib/validators';
import { formatDraftFormat, formatTimer } from '@/lib/format';
import type { LeaguePreview } from '@/types';

type Stage = 'code' | 'preview' | 'joining' | 'error';

export function JoinLeagueModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [stage, setStage] = useState<Stage>('code');
  const [preview, setPreview] = useState<LeaguePreview | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset the flow each time the modal transitions from closed → open
  // (React's documented "adjusting state when a prop changes" pattern).
  const [previousOpen, setPreviousOpen] = useState(open);
  if (previousOpen !== open) {
    setPreviousOpen(open);
    if (open) {
      setCode('');
      setError(null);
      setPreviewFailed(false);
      setStage('code');
      setPreview(null);
      setBusy(false);
    }
  }

  async function handleLookup() {
    const validation = validateLeagueCode(code);
    if (validation) {
      setError(validation);
      setStage('error');
      setPreviewFailed(true);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await api.getLeagueByCode(normalizeLeagueCode(code));
      setPreview(result);
      setStage('preview');
    } catch (err) {
      const code = apiErrorCode(err);
      if (code === 'not-found') {
        setError('No league found with that code. Double-check it and try again.');
      } else if (code === 'unauthenticated') {
        navigate('/login', { state: { from: '/join' } });
        return;
      } else {
        setError(apiErrorMessage(err));
      }
      setPreviewFailed(true);
      setStage('error');
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
        setError('You are already a member of this league.');
      } else if (errCode === 'resource-exhausted') {
        setError('This league is full.');
      } else if (errCode === 'failed-precondition') {
        setError('This league is no longer accepting new members.');
      } else {
        setError(apiErrorMessage(err));
      }
      setStage('error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Join a league"
      description="Enter the six-character code from your commissioner."
    >
      <div className="space-y-5">
        {/* Step 1 — code entry */}
        {stage === 'code' || (stage === 'error' && previewFailed) ? (
          <div className="space-y-5">
            {stage === 'error' && error ? <Alert variant="error">{error}</Alert> : null}

            <form
              onSubmit={(event) => {
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
                  setPreviewFailed(false);
                }}
                placeholder="e.g. K7XQ2M"
                className="font-mono text-lg tracking-[0.3em] uppercase"
                maxLength={6}
                autoComplete="off"
                autoFocus
                leftIcon={<KeyRound className="h-4 w-4" />}
              />
              <Button type="submit" fullWidth size="lg" isLoading={busy} leftIcon={busy ? undefined : <Search className="h-4 w-4" />}>
                Find league
              </Button>
            </form>
          </div>
        ) : null}

        {/* Step 2 — league preview */}
        {stage === 'preview' && preview ? (
          <div className="animate-scale-in space-y-5">
            {error ? <Alert variant="error">{error}</Alert> : null}

            <div className="panel rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-semibold text-white">{preview.name}</p>
                  <p className="mt-0.5 text-sm text-slate-400">
                    {preview.season} NFL season · by {preview.commissionerName}
                  </p>
                </div>
                <Badge variant="success">Open</Badge>
              </div>

              <div className="mt-4 flex items-center gap-4 text-xs text-slate-400">
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

            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <Button variant="ghost" onClick={() => {
                setStage('code');
                setPreview(null);
                setError(null);
              }}>
                Back
              </Button>
              <Button
                className="flex-1"
                size="lg"
                isLoading={busy}
                onClick={() => void handleJoin()}
                disabled={preview.status !== 'waiting' || preview.memberCount >= preview.maxParticipants || preview.isMember}
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                {preview.isMember
                  ? 'Already a member'
                  : preview.memberCount >= preview.maxParticipants
                    ? 'League is full'
                    : `Join ${preview.name}`}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}