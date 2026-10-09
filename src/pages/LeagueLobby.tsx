import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, ChevronDown, ChevronUp, Copy, Minus, Plus, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Avatar } from '@/components/ui/Avatar';
import { Alert } from '@/components/ui/Alert';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { CopyButton } from '@/components/ui/CopyButton';
import { LeagueHeader } from '@/components/layout/LeagueHeader';
import { LeagueSeason } from '@/components/league/LeagueSeason';
import { CommissionerMenu } from '@/components/league/CommissionerMenu';
import { LeaveLeagueButton } from '@/components/league/LeaveLeagueButton';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { api, apiErrorMessage } from '@/lib/api';
import { useDraft, useLeague } from '@/hooks/useLeagues';
import { DRAFT_PICK_TIMERS } from '@/types';
import { formatDraftFormat, formatTimer, pluralize } from '@/lib/format';
import { copyToClipboard } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { DraftFormat, DraftPickTimer, LeagueMember } from '@/types';

export function LeagueLobby() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const { league, members, status: leagueStatus, error: leagueError, refresh: refreshLeague } = useLeague(leagueId, 3000);
  const { room: draftRoom, status: draftStatus, error: draftError, refresh: refreshDraft } = useDraft(leagueId, 2000);

  const [readyBusy, setReadyBusy] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const startPending = useRef(false);
  const [copied, setCopied] = useState(false);

  const myUid = user?.uid ?? null;
  const isCommissioner = league?.commissionerId === myUid;
  const draft = draftRoom?.draft ?? null;

  const memberCount = members.length;
  const maxRounds = Math.min(
    league?.prefs.maxTeamsPerPlayer ?? 16,
    Math.max(1, Math.floor(32 / Math.max(memberCount, 1))),
  );

  // Draft order, reconciled against the current roster (handles late joiners).
  const effectiveOrder = useMemo(() => {
    const base = draft?.order ?? [];
    const present = base.filter((uid) => members.some((member) => member.userId === uid));
    const missing = members.filter((member) => !present.includes(member.userId)).map((member) => member.userId);
    return [...present, ...missing];
  }, [draft?.order, members]);

  const orderedMembers = useMemo(
    () =>
      members
        .slice()
        .sort(
          (a, b) =>
            effectiveOrder.indexOf(a.userId) - effectiveOrder.indexOf(b.userId) ||
            a.joinedAt.getTime() - b.joinedAt.getTime(),
        ),
    [members, effectiveOrder],
  );

  // Rounds selector stays aligned with the server value.
  const serverRounds = draft?.rounds ?? maxRounds;
  const [rounds, setRounds] = useState(serverRounds);
  const [prevRounds, setPrevRounds] = useState(serverRounds);
  if (prevRounds !== serverRounds || rounds > maxRounds) {
    setPrevRounds(serverRounds);
    setRounds(Math.min(serverRounds, maxRounds));
  }

  // Everyone moves to the live draft room the moment it starts.
  useEffect(() => {
    if (draftRoom?.league.status === 'drafting') {
      navigate(`/leagues/${leagueId}/draft`, { replace: true });
    }
  }, [draftRoom?.league.status, leagueId, navigate]);

  if (leagueStatus === 'loading' || draftStatus === 'loading' || !league) {
    return <FullPageSpinner label="Loading league…" />;
  }

  if (leagueStatus === 'error' || !league) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <Alert variant="error" title="Could not load this league">
          {leagueError ?? 'The league may have been removed, or your account is not a member.'}
        </Alert>
        <div className="mt-6 flex justify-center">
          <Button to="/dashboard" variant="secondary">
            Back to My Leagues
          </Button>
        </div>
      </div>
    );
  }

  // Post-draft: render the season view.
  if (league.status === 'active' || league.status === 'completed') {
    if (!draftRoom) return <FullPageSpinner label="Loading season…" />;
    if (draftStatus === 'error') {
      return (
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <Alert variant="error" title="Could not load the season">{draftError}</Alert>
        </div>
      );
    }
    return <LeagueSeason leagueId={league.id} room={draftRoom} />;
  }

  const me = members.find((member) => member.userId === myUid) ?? null;
  const readyCount = members.filter((member) => member.isReady).length;
  const spotsLeft = league.maxParticipants - league.memberCount;
  const inviteUrl = `${window.location.origin}/join?code=${league.joinCode}`;

  const allReady = memberCount > 0 && members.every((member) => member.isReady);
  const canStart = isCommissioner && memberCount >= 2 && allReady && rounds >= 1 && rounds <= maxRounds;

  async function toggleReady() {
    if (!league || !me || readyBusy) return;
    setReadyBusy(true);
    try {
      await api.setReady(league.id, !me.isReady);
    } catch (err) {
      toast.push('error', 'Could not update your status', apiErrorMessage(err));
    } finally {
      setReadyBusy(false);
    }
  }

  async function handleCopyInvite() {
    const ok = await copyToClipboard(inviteUrl);
    setCopied(ok);
    if (ok) toast.push('success', 'Invite link copied');
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function handleStart() {
    if (!leagueId || !canStart || startPending.current) return;
    startPending.current = true;
    setStartBusy(true);
    try {
      await api.startDraft(leagueId, rounds);
      toast.push('success', 'Draft is live');
      navigate(`/leagues/${leagueId}/draft`);
    } catch (err) {
      toast.push('error', 'Could not start the draft', apiErrorMessage(err));
      refreshLeague();
      refreshDraft();
    } finally {
      startPending.current = false;
      setStartBusy(false);
    }
  }

  async function moveOrder(uid: string, direction: -1 | 1) {
    if (!leagueId) return;
    const index = effectiveOrder.indexOf(uid);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= effectiveOrder.length) return;
    const next = [...effectiveOrder];
    [next[index], next[target]] = [next[target] as string, next[index] as string];
    await api.setDraftOrder(leagueId, next);
    refreshDraft();
  }

  async function handleShuffle() {
    if (!leagueId) return;
    await api.randomizeDraftOrder(leagueId);
    refreshDraft();
  }

  async function setRoundsAndSave(roundsValue: number) {
    if (!leagueId) return;
    setRounds(roundsValue);
    await api.updateDraftSettings(leagueId, { rounds: roundsValue });
    refreshDraft();
  }

  async function setFormat(format: DraftFormat) {
    if (!leagueId) return;
    await api.updateDraftSettings(leagueId, { draftFormat: format });
    refreshDraft();
  }

  async function setTimer(timer: DraftPickTimer) {
    if (!leagueId) return;
    await api.updateDraftSettings(leagueId, { draftPickTimerSeconds: timer });
    refreshDraft();
  }

  const startDisabledReason = !isCommissioner
    ? null
    : memberCount < 2
      ? 'Need at least 2 players.'
      : !allReady
        ? `${memberCount - readyCount} ${pluralize(memberCount - readyCount, 'player', 'players')} not ready.`
        : rounds < 1 || rounds > maxRounds
          ? 'Pick a valid round count.'
          : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <LeagueHeader leagueId={league.id} leagueName={league.name} season={league.season}>
        <nav className="-mb-px flex gap-5 overflow-x-auto" aria-label="League sections">
          <span className="shrink-0 border-b-2 border-electric-400 pb-2.5 pt-0.5 text-sm font-semibold text-white">
            Draft setup
          </span>
        </nav>
      </LeagueHeader>

      {/* Status + primary action */}
      <div className="mt-7 flex flex-col gap-4 rounded-xl border border-line bg-navy-900 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-base font-semibold text-white">Waiting for players</p>
          <p className="mt-0.5 text-sm text-slate-400">
            {readyCount} of {league.memberCount} ready
            {spotsLeft > 0 ? ` · ${spotsLeft} ${pluralize(spotsLeft, 'spot', 'spots')} open` : ' · League is full'}
          </p>
        </div>
        <Button
          onClick={() => void toggleReady()}
          disabled={!me || readyBusy}
          variant={me?.isReady ? 'secondary' : 'primary'}
        >
          {me?.isReady ? "You're ready" : "I'm ready"}
        </Button>      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Players + invite */}
        <div className="space-y-6">
          <Panel className="rounded-xl">
            <h2 className="font-display text-base font-semibold text-white">Players</h2>
            <div className="mt-3 space-y-1.5">
              {orderedMembers.map((member) => (
                <MemberRow key={member.id} member={member} isYou={member.userId === myUid} />
              ))}
            </div>
            {spotsLeft > 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                {spotsLeft} {pluralize(spotsLeft, 'open spot', 'open spots')}
              </p>
            ) : null}
          </Panel>

          <Panel className="rounded-xl">
            <h2 className="font-display text-base font-semibold text-white">Invite</h2>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-navy-800 px-4 py-3">
              <p className="font-mono text-xl font-bold tracking-[0.25em] text-white">{league.joinCode}</p>
              <CopyButton value={league.joinCode}>Copy code</CopyButton>
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-navy-800 px-3 py-2 text-xs text-slate-400">{inviteUrl}</code>
              <Button size="sm" variant="outline" onClick={() => void handleCopyInvite()} leftIcon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}>
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            </div>
          </Panel>
        </div>

        {/* Draft settings */}
        <Panel className="rounded-xl">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-white">Draft setup</h2>
            <span className="text-xs text-slate-500">
              {draft?.rounds ?? maxRounds} rounds · {draft ? draft.rounds * memberCount : maxRounds * memberCount} picks
            </span>
          </div>

          <p className="mt-4 text-xs font-medium uppercase tracking-wider text-slate-500">Order</p>
          <ol className="mt-2 space-y-1">
            {effectiveOrder.map((uid, index) => {
              const member = members.find((entry) => entry.userId === uid);
              if (!member) return null;
              return (
                <li key={uid} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                  <span className="w-5 text-center font-mono text-sm tabular-nums text-slate-500">{index + 1}</span>
                  <Avatar name={member.displayName} src={member.photoURL} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{member.displayName}</span>
                  {isCommissioner ? (
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        aria-label={`Move ${member.displayName} up`}
                        disabled={index === 0}
                        onClick={() => void moveOrder(uid, -1)}
                        className="focus-ring rounded-md p-1 text-slate-500 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-30"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${member.displayName} down`}
                        disabled={index === effectiveOrder.length - 1}
                        onClick={() => void moveOrder(uid, 1)}
                        className="focus-ring rounded-md p-1 text-slate-500 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-30"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {isCommissioner ? (
            <Button size="sm" variant="outline" className="mt-2" onClick={() => void handleShuffle()} leftIcon={<Shuffle className="h-4 w-4" />}>
              Shuffle
            </Button>
          ) : null}

          {isCommissioner ? (
            <div className="mt-5 space-y-4 border-t border-line pt-4">
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">Format</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['snake', 'linear'] as const).map((format) => (
                    <button
                      key={format}
                      type="button"
                      onClick={() => void setFormat(format)}
                      aria-pressed={league.draftFormat === format}
                      className={cn(
                        'focus-ring rounded-lg border px-3 py-2 text-sm font-semibold capitalize transition-colors',
                        league.draftFormat === format
                          ? 'border-electric-400/60 bg-electric-500/15 text-electric-300'
                          : 'border-line text-slate-400 hover:border-navy-500',
                      )}
                    >
                      {format}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">Time per pick</p>
                <div className="grid grid-cols-4 gap-2">
                  {DRAFT_PICK_TIMERS.map((seconds) => (
                    <button
                      key={seconds}
                      type="button"
                      onClick={() => void setTimer(seconds)}
                      aria-pressed={league.draftPickTimerSeconds === seconds}
                      className={cn(
                        'focus-ring h-10 rounded-lg border text-sm font-semibold transition-colors',
                        league.draftPickTimerSeconds === seconds
                          ? 'border-electric-400/60 bg-electric-500/15 text-electric-300'
                          : 'border-line text-slate-400 hover:border-navy-500',
                      )}
                    >
                      {seconds}s
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">
                  Rounds <span className="text-slate-600">· max {maxRounds}</span>
                </p>
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label="Fewer rounds"
                    disabled={rounds <= 1}
                    onClick={() => void setRoundsAndSave(Math.max(1, rounds - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-10 text-center font-mono text-lg font-bold tabular-nums text-white">{rounds}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label="More rounds"
                    disabled={rounds >= maxRounds}
                    onClick={() => void setRoundsAndSave(Math.min(maxRounds, rounds + 1))}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <span className="ml-auto text-xs text-slate-500">{rounds * memberCount} total picks</span>
                </div>
              </div>

              <div className="border-t border-line pt-4">
                {isCommissioner ? (
                  <>
                    <Button fullWidth size="lg" disabled={!canStart || startBusy} isLoading={startBusy} onClick={() => void handleStart()}>
                      {startBusy ? 'Starting draft…' : 'Start draft'}
                    </Button>
                    {startDisabledReason ? <p className="mt-2 text-center text-xs text-slate-500">{startDisabledReason}</p> : null}
                  </>
                ) : (
                  <p className="text-center text-xs text-slate-500">Waiting for the commissioner to start.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-5 border-t border-line pt-4 text-sm text-slate-400">
              {formatDraftFormat(league.draftFormat)} · {formatTimer(league.draftPickTimerSeconds)} per pick
              <p className="mt-1 text-xs text-slate-500">Waiting for the commissioner to start.</p>
            </div>
          )}
        </Panel>
      </div>

      {/* Commissioner tools (only rendered for the commissioner) */}
      {isCommissioner ? (
        <div className="mt-6">
          <CommissionerMenu
            leagueId={league.id}
            insights={null}
            members={members}
            currentUserId={myUid}
            canEditLeague
            league={league}
            onSynced={() => {
              refreshDraft();
              refreshLeague();
            }}
            syncing={false}
            setSyncing={() => undefined}
            onSync={() => undefined}
          />
        </div>
      ) : (
        <div className="mt-6 flex justify-end">
          <LeaveLeagueButton leagueId={league.id} disabled={league.status === 'drafting'} />
        </div>
      )}
    </div>
  );
}

function MemberRow({ member, isYou }: { member: LeagueMember; isYou: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-lg px-3 py-2', isYou ? 'bg-electric-500/8' : 'bg-navy-800/50')}>
      <Avatar name={member.displayName} src={member.photoURL} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">
          {member.displayName}
          {isYou ? <span className="ml-1.5 text-xs font-medium text-electric-300">You</span> : null}
        </p>
      </div>
      <span className={cn('text-xs font-medium', member.isReady ? 'text-emerald-300' : 'text-slate-500')}>
        {member.isReady ? 'Ready' : 'Not ready'}
      </span>
    </div>
  );
}
