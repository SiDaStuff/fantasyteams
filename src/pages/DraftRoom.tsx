import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, Pause, Play } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { CountdownTimer } from '@/components/draft/CountdownTimer';
import { AvailableTeamsGrid } from '@/components/draft/AvailableTeamsGrid';
import { DraftBoard } from '@/components/draft/DraftBoard';
import { DraftParticipants } from '@/components/draft/DraftParticipants';
import { DraftFeed } from '@/components/draft/DraftFeed';
import { PickConfirmModal } from '@/components/draft/PickConfirmModal';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useDraft } from '@/hooks/useLeagues';
import { api, apiErrorCode, apiErrorMessage } from '@/lib/api';
import { NFL_TEAMS } from '@/data/nflTeams';
import { cn } from '@/lib/cn';
import type { NFLTeam } from '@/types';

export function DraftRoom() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const { room, status, error, refresh } = useDraft(leagueId, 1000);

  const [pendingTeam, setPendingTeam] = useState<NFLTeam | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const myUid = user?.uid ?? null;
  const draft = room?.draft ?? null;
  const league = room?.league ?? null;
  const picks = useMemo(() => room?.picks ?? [], [room?.picks]);
  const isCommissioner = room?.isCommissioner ?? false;

  const takenTeamIds = useMemo(() => new Set(picks.map((pick) => pick.nflTeamId)), [picks]);
  const takenBy = useMemo(() => new Map(picks.map((pick) => [pick.nflTeamId, pick.displayName])), [picks]);
  const memberCount = Math.max(draft?.order.length ?? 1, 1);

  // Return to the league when the last pick lands.
  useEffect(() => {
    if (draft?.status === 'completed') {
      toast.push('success', 'Draft complete');
      navigate(`/leagues/${leagueId}`, { replace: true });
    }
  }, [draft?.status, leagueId, navigate, toast]);

  if (status === 'loading' || !room || !draft || !league) {
    return <FullPageSpinner label="Opening the draft room…" />;
  }

  if (status === 'error') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <Alert variant="error" title="Couldn't load this draft">
          {error ?? 'Refresh to try again.'}
        </Alert>
        <div className="mt-6 flex justify-center">
          <Button to="/dashboard" variant="secondary" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Back to My Leagues
          </Button>
        </div>
      </div>
    );
  }

  const myTurn = draft.status === 'live' && draft.currentPickUserId === myUid;
  const draftLive = draft.status === 'live';
  const onClockMember = room.members.find((member) => member.userId === draft.currentPickUserId) ?? null;
  const round = Math.min(Math.ceil(draft.currentPick / memberCount), draft.rounds);
  const progress = draft.totalPicks > 0 ? picks.length / draft.totalPicks : 0;

  async function handleConfirmPick() {
    if (!pendingTeam || !leagueId) return;
    setSubmitting(true);
    try {
      await api.submitPick(leagueId, pendingTeam.id);
      setPendingTeam(null);
      refresh();
    } catch (err) {
      const code = apiErrorCode(err);
      toast.push('error', code === 'turn-expired' ? 'Pick timed out' : 'Pick not accepted', apiErrorMessage(err));
      setPendingTeam(null);
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePause() {
    if (!leagueId) return;
    try {
      await api.pauseDraft(leagueId);
      refresh();
    } catch (err) {
      toast.push('error', 'Could not pause the draft', apiErrorMessage(err));
    }
  }

  async function handleResume() {
    if (!leagueId) return;
    try {
      await api.resumeDraft(leagueId);
      refresh();
    } catch (err) {
      toast.push('error', 'Could not resume the draft', apiErrorMessage(err));
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Compact header */}
      <div className="flex items-center justify-between gap-3">
        <Link
          to={`/leagues/${leagueId}`}
          className="focus-ring inline-flex items-center gap-1 text-sm text-slate-400 transition-colors hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          {league.name}
        </Link>

        <div className="flex items-center gap-2">
          {draft.status === 'paused' ? <span className="text-xs font-medium text-amber-300">Paused</span> : null}
          {isCommissioner && draft.status === 'live' ? (
            <Button size="sm" variant="ghost" onClick={() => void handlePause()} leftIcon={<Pause className="h-3.5 w-3.5" />}>
              Pause
            </Button>
          ) : null}
          {isCommissioner && draft.status === 'paused' ? (
            <Button size="sm" variant="secondary" onClick={() => void handleResume()} leftIcon={<Play className="h-3.5 w-3.5" />}>
              Resume
            </Button>
          ) : null}
        </div>
      </div>

      {/* On the clock — the primary status bar */}
      <div
        className={cn(
          'mt-4 flex flex-col gap-3 rounded-xl border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between',
          myTurn ? 'border-electric-400/60 bg-electric-500/10' : 'border-line bg-navy-900',
        )}
      >
        <div className="flex items-center gap-3">
          {myTurn ? (
            <div>
              <p className="font-display text-lg font-bold text-electric-300">You're up.</p>
              <p className="text-xs text-slate-400">
                Round {round} · Pick {draft.currentPick} of {draft.totalPicks}
              </p>
            </div>
          ) : draftLive && onClockMember ? (
            <div className="flex items-center gap-2.5">
              <Avatar name={onClockMember.displayName} src={onClockMember.photoURL} size="sm" />
              <div>
                <p className="font-display text-base font-bold text-white">{onClockMember.displayName} is up</p>
                <p className="text-xs text-slate-400">
                  Round {round} · Pick {draft.currentPick} of {draft.totalPicks}
                </p>
              </div>
            </div>
          ) : (
            <div>
              <p className="font-display text-base font-bold text-white">Waiting to start</p>
              <p className="text-xs text-slate-400">
                Round {round} · Pick {draft.currentPick} of {draft.totalPicks}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          {draftLive ? <CountdownTimer deadline={draft.pickDeadline} paused={false} /> : null}
          <span className="hidden font-mono text-xs tabular-nums text-slate-500 sm:block">
            {picks.length}/{draft.totalPicks}
          </span>
        </div>
      </div>

      {/* Progress */}
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-navy-800">
        <div
          className="h-full rounded-full bg-electric-500 transition-all duration-500"
          style={{ width: `${Math.max(progress * 100, 2)}%` }}
        />
      </div>

      {draft.status === 'paused' ? (
        <p className="mt-3 text-sm font-medium text-amber-200">Draft paused by the commissioner.</p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        {/* Main — available teams */}
        <main className="min-w-0">
          <AvailableTeamsGrid
            teams={NFL_TEAMS}
            takenTeamIds={takenTeamIds}
            takenBy={takenBy}
            canPick={myTurn}
            onSelect={(team) => setPendingTeam(team)}
          />
        </main>

        {/* Rail — participants + recent picks */}
        <aside className="hidden self-start lg:block">
          <div className="sticky top-20 space-y-6">
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Draft order</h2>
              <DraftParticipants draft={draft} members={room.members} picks={picks} myUid={myUid} commissionerId={league.commissionerId} compact />
            </div>
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Recent picks</h2>
              <DraftFeed draft={draft} picks={picks} members={room.members} />
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile collapsible rail */}
      <MobileRail draft={draft} members={room.members} picks={picks} myUid={myUid} commissionerId={league.commissionerId} />

      {/* Full board */}
      <MobileSection title="Draft board" label="board">
        <DraftBoard draft={draft} members={room.members} picks={picks} />
      </MobileSection>

      <PickConfirmModal
        team={pendingTeam}
        pickLabel={`Pick ${draft.currentPick} · Round ${round}`}
        onConfirm={() => void handleConfirmPick()}
        onCancel={() => setPendingTeam(null)}
        submitting={submitting}
      />
    </div>
  );
}

/** Collapsible participants + feed on mobile. */
function MobileRail({
  draft,
  members,
  picks,
  myUid,
  commissionerId,
}: {
  draft: NonNullable<Parameters<typeof DraftParticipants>[0]['draft']>;
  members: Parameters<typeof DraftParticipants>[0]['members'];
  picks: Parameters<typeof DraftParticipants>[0]['picks'];
  myUid: string | null;
  commissionerId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-6 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="focus-ring flex w-full items-center justify-between border-y border-line/60 py-3 text-sm font-semibold text-slate-300"
      >
        Players & picks
        {open ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
      </button>
      {open ? (
        <div className="animate-fade-in space-y-5 pt-4">
          <DraftParticipants draft={draft} members={members} picks={picks} myUid={myUid} commissionerId={commissionerId} />
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Recent picks</h3>
            <DraftFeed draft={draft} picks={picks} members={members} showUpcoming={false} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Collapsible section (used for the full board on mobile; always visible on desktop). */
function MobileSection({ title, label, children }: { title: string; label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-8" aria-label={label}>
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="focus-ring flex w-full items-center justify-between border-y border-line/60 py-3 text-sm font-semibold text-slate-300"
        >
          {title}
          {open ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
        </button>
        {open ? <div className="animate-fade-in pt-4">{children}</div> : null}
      </div>
      <div className="hidden lg:block">
        <h2 className="mb-3 font-display text-lg font-semibold text-white">{title}</h2>
        {children}
      </div>
    </section>
  );
}
