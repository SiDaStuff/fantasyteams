import { useState } from 'react';
import { Ban, Crown, Megaphone, RefreshCw, Trash2, UserMinus } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { api, apiErrorMessage } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import type { LeagueMember } from '@/types';

export interface LeaderCommandsProps {
  leagueId: string;
  members: LeagueMember[];
  currentUserId: string | null;
  announcement: { text: string; by: string } | null;
  /** Enable the "remove member" command (pre-draft only). */
  canRemove: boolean;
  onChanged: () => void;
}

export function LeaderCommands({ leagueId, members, currentUserId, announcement, canRemove, onChanged }: LeaderCommandsProps) {
  const toast = useToast();
  const [text, setText] = useState(announcement?.text ?? '');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmBan, setConfirmBan] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string>('');

  // Sync the draft box when the stored announcement changes.
  const [previousText, setPreviousText] = useState(announcement?.text ?? '');
  if ((announcement?.text ?? '') !== previousText) {
    setPreviousText(announcement?.text ?? '');
    setText(announcement?.text ?? '');
  }

  async function postAnnouncement() {
    if (busy) return;
    setBusy(true);
    try {
      await api.setAnnouncement(leagueId, text.trim());
      toast.push('success', text.trim() ? 'Announcement posted' : 'Announcement removed');
      onChanged();
    } catch (error) {
      toast.push('error', 'Could not post announcement', apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function resetAllReady() {
    if (busy) return;
    setBusy(true);
    try {
      await api.resetReady(leagueId);
      toast.push('success', 'Ready statuses reset');
      onChanged();
    } catch (error) {
      toast.push('error', 'Could not reset ready statuses', apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function transfer() {
    if (busy || !targetId) return;
    setBusy(true);
    try {
      await api.transferCommissioner(leagueId, targetId);
      toast.push('success', 'Commissioner transferred');
      setTargetId('');
      onChanged();
    } catch (error) {
      toast.push('error', 'Could not transfer the commissioner role', apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: string) {
    if (busy) return;
    setBusy(true);
    try {
      await api.removeLeagueMember(leagueId, userId);
      toast.push('success', 'Member removed');
      setConfirmRemove(null);
      onChanged();
    } catch (error) {
      toast.push('error', 'Could not remove member', apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function ban(userId: string) {
    if (busy) return;
    setBusy(true);
    try {
      await api.banLeagueMember(leagueId, userId);
      toast.push('success', 'Player banned');
      setConfirmBan(null);
      onChanged();
    } catch (error) {
      toast.push('error', 'Could not ban player', apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const safeMembers = members.filter((member) => member.userId !== currentUserId);

  return (
    <div className="space-y-5">
      {/* Announcement */}
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-white">
          <Megaphone className="h-4 w-4 text-electric-300" />
          Announcement
        </p>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={280}
          rows={2}
          placeholder="Draft night is Saturday at 8pm."
          className="focus-ring w-full rounded-lg border border-line bg-navy-900 px-3.5 py-2.5 text-sm text-white placeholder-slate-500"
        />
        <div className="mt-2 flex items-center justify-end gap-3">
          <span className="text-xs text-slate-500">{text.length}/280</span>
          <Button size="sm" onClick={() => void postAnnouncement()} isLoading={busy && text.trim() !== ''}>
            {text.trim() ? 'Post' : 'Clear'}
          </Button>
        </div>
      </div>

      {/* Ready statuses */}
      <div className="rounded-lg border border-line px-3.5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
              <RefreshCw className="h-4 w-4 text-electric-300" />
              Ready statuses
            </p>
            <p className="text-xs text-slate-500">Set every player back to not ready.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void resetAllReady()} isLoading={busy}>
            Reset
          </Button>
        </div>
      </div>

      {/* Transfer */}
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-white">
          <Crown className="h-4 w-4 text-gold-400" />
          Transfer commissioner
        </p>
        <div className="flex items-center gap-2">
          <select
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
            className="focus-ring h-11 min-w-0 flex-1 rounded-lg border border-line bg-navy-900 px-3.5 text-sm text-white"
            aria-label="New commissioner"
          >
            <option value="">Choose a player…</option>
            {safeMembers.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.displayName}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={() => void transfer()} disabled={!targetId}>
            Transfer
          </Button>
        </div>
      </div>

      {/* Remove or ban member */}
      {canRemove ? (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-white">
            <UserMinus className="h-4 w-4 text-rose-400" />
            Player access
          </p>
          <div className="space-y-1.5">
            {safeMembers.length === 0 ? (
              <p className="text-xs text-slate-500">No one else to remove.</p>
            ) : (
              safeMembers.map((member) => (
                <div key={member.userId} className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2">
                  <Avatar name={member.displayName} src={member.photoURL} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{member.displayName}</span>
                  {confirmRemove === member.userId ? (
                    <>
                      <span className="text-xs font-semibold text-amber-300">Remove?</span>
                      <Button size="sm" variant="danger" onClick={() => void remove(member.userId)} isLoading={busy}>
                        Yes
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(null)} disabled={busy}>
                        No
                      </Button>
                    </>
                  ) : (
                    <>
                      {confirmBan === member.userId ? (
                        <>
                          <span className="text-xs font-semibold text-rose-300">Ban?</span>
                          <Button size="sm" variant="danger" onClick={() => void ban(member.userId)} isLoading={busy}>Yes</Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmBan(null)} disabled={busy}>No</Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => { setConfirmBan(null); setConfirmRemove(member.userId); }} disabled={busy} leftIcon={<Trash2 className="h-3.5 w-3.5" />}>
                            Kick
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setConfirmRemove(null); setConfirmBan(member.userId); }} disabled={busy} leftIcon={<Ban className="h-3.5 w-3.5" />}>
                            Ban
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
