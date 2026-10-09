import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Activity, ArrowLeft, Pause, Play, Users, Zap } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { CountdownTimer } from '@/components/draft/CountdownTimer';
import { AvailableTeamsGrid } from '@/components/draft/AvailableTeamsGrid';
import { DraftBoard } from '@/components/draft/DraftBoard';
import { DraftFeed } from '@/components/draft/DraftFeed';
import { DraftParticipants } from '@/components/draft/DraftParticipants';
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

  // Move everyone to the league overview when the last pick lands.
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
            Back to dashboard
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

  const participantsPanel = (
    <DraftParticipants draft={draft} members={room.members} picks={picks} myUid={myUid} commissionerId={league.commissionerId} />
  );
  const feedPanel = <DraftFeed draft={draft} picks={picks} members={room.members} />;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Link
            to={`/leagues/${leagueId}`}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-slate-400 transition-colors hover:text-electric-300"
          >
            <ArrowLeft className="h-4 w-4" />
            Lobby
          </Link>
          <span className="h-5 w-px bg-line" />
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-white">{league.name}</h1>
            <p className="text-xs text-slate-500">
              {league.season} · {draft.format === 'snake' ? 'Snake' : 'Linear'} draft · {draft.rounds} rounds
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {draft.status === 'live' ? (
            <Badge variant="electric" icon={<span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-electric-300" />}>
              Live
            </Badge>
          ) : draft.status === 'paused' ? (
            <Badge variant="warning">Paused</Badge>
          ) : (
            <Badge variant="neutral">Not started</Badge>
          )}

          {isCommissioner && draft.status === 'live' ? (
            <Button size="sm" variant="outline" onClick={() => void handlePause()} leftIcon={<Pause className="h-4 w-4" />}>
              Pause
            </Button>
          ) : null}
          {isCommissioner && draft.status === 'paused' ? (
            <Button size="sm" variant="secondary" onClick={() => void handleResume()} leftIcon={<Play className="h-4 w-4" />}>
              Resume
            </Button>
          ) : null}
        </div>
      </div>

      {/* Progress */}
      <div className="mt-4 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-navy-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-electric-500 to-ice-400 transition-all duration-500"
            style={{ width: `${Math.max(progress * 100, 2)}%` }}
          />
        </div>
        <span className="text-xs font-semibold tabular-nums text-slate-400">
          {picks.length}/{draft.totalPicks} picks
        </span>
      </div>

      {/* Paused banner */}
      {draft.status === 'paused' ? (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-200">
          <Pause className="h-4 w-4" />
          Draft paused by the commissioner
        </div>
      ) : null}

      <div className="mt-6 grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
        {/* Left sidebar — participants (desktop) */}
        <aside className="hidden self-start lg:block">
          <div className="panel sticky top-24 rounded-2xl p-4">
            <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wider text-slate-300">
              <Users className="h-4 w-4 text-electric-400" />
              Participants
            </h2>
            {participantsPanel}
          </div>
        </aside>

        {/* Center — the floor */}
        <main className="min-w-0">
          {/* On the clock banner */}
          <div
            className={cn(
              'panel animate-scale-in rounded-2xl p-4 sm:p-5',
              myTurn && 'border-electric-400/40 shadow-[0_0_40px_-12px_rgba(31,125,255,0.55)]',
            )}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-xl border',
                    myTurn ? 'border-electric-400/50 bg-electric-500/15 text-electric-300' : 'border-line bg-navy-800 text-slate-400',
                  )}
                >
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Round {round} · Pick {draft.currentPick} of {draft.totalPicks}
                  </p>
                  {myTurn ? (
                    <p className="font-display text-lg font-bold text-white">You're on the clock</p>
                  ) : onClockMember ? (
                    <p className="flex items-center gap-2 font-display text-lg font-bold text-white">
                      <Avatar name={onClockMember.displayName} src={onClockMember.photoURL} size="sm" />
                      {onClockMember.displayName}
                    </p>
                  ) : (
                    <p className="font-display text-lg font-bold text-white">Waiting for the draft</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <CountdownTimer deadline={draft.pickDeadline} paused={draft.status === 'paused'} idleLabel="—" />
                {myTurn ? (
                  <span className="rounded-lg bg-electric-500/15 px-3 py-1.5 text-sm font-semibold text-electric-300">
                    Pick a team
                  </span>
                ) : draftLive ? (
                  <span className="hidden text-xs text-slate-500 sm:block">Browsing only</span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Available teams */}
          <section className="mt-5" aria-label="Available teams">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-slate-300">Available teams</h2>
              {myTurn ? <Badge variant="success">Your turn</Badge> : null}
            </div>
            <AvailableTeamsGrid
              teams={NFL_TEAMS}
              takenTeamIds={takenTeamIds}
              takenBy={takenBy}
              canPick={myTurn}
              onSelect={(team) => setPendingTeam(team)}
            />
          </section>
        </main>

        {/* Right sidebar — feed (desktop) */}
        <aside className="hidden self-start lg:block">
          <div className="panel sticky top-24 rounded-2xl p-4">
            <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wider text-slate-300">
              <Activity className="h-4 w-4 text-electric-400" />
              Draft feed
            </h2>
            {feedPanel}
          </div>
        </aside>
      </div>

      {/* Mobile collapsible panels */}
      <div className="mt-5 space-y-4 lg:hidden">
        <MobileDraftPanel title="Participants" icon={<Users className="h-4 w-4" />}>
          {participantsPanel}
        </MobileDraftPanel>
        <MobileDraftPanel title="Draft feed" icon={<Activity className="h-4 w-4" />}>
          {feedPanel}
        </MobileDraftPanel>
      </div>

      {/* Full board */}
      <section className="mt-10" aria-label="Draft board">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-white">Draft board</h2>
          <span className="text-xs text-slate-500">{picks.length} of {draft.totalPicks} selected</span>
        </div>
        <div className="panel rounded-2xl p-4 sm:p-5">
          <DraftBoard draft={draft} members={room.members} picks={picks} />
        </div>
      </section>

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

function MobileDraftPanel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="panel rounded-2xl">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="focus-ring flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wider text-slate-300">
          {icon}
          {title}
        </span>
        <span className={cn('text-slate-400 transition-transform', open && 'rotate-180')}>▾</span>
      </button>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </div>
  );
}