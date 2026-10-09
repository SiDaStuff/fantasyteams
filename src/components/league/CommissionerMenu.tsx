import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, RefreshCw, Settings, Trash2 } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { LeaderCommands } from '@/components/league/LeaderCommands';
import { useToast } from '@/context/ToastContext';
import { api, apiErrorMessage } from '@/lib/api';
import { formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { League, LeagueInsights, LeagueMember, ScoringMode } from '@/types';

/**
 * Commissioner controls, gathered in one place. Rendered as a compact
 * "Manage" button in the league header; opens a modal with everything.
 */
export function CommissionerMenu({
  leagueId,
  insights,
  members,
  currentUserId,
  onSynced,
  syncing,
  setSyncing,
  onSync,
  canEditLeague = false,
  league,
}: {
  leagueId: string;
  insights: LeagueInsights | null;
  members: LeagueMember[];
  currentUserId: string | null;
  onSynced: () => void;
  syncing: boolean;
  setSyncing: (value: boolean) => void;
  onSync: () => void | Promise<void>;
  /** League name/size editing (pre-draft only). */
  canEditLeague?: boolean;
  /** League object, required when canEditLeague is true. */
  league?: League;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)} leftIcon={<Settings className="h-4 w-4" />}>
          Manage league
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void onSync()}
          isLoading={syncing}
          leftIcon={<RefreshCw className="h-4 w-4" />}
        >
          Update scores
        </Button>
      </div>

      <CommissionerModal
        open={open}
        onClose={() => setOpen(false)}
        leagueId={leagueId}
        insights={insights}
        members={members}
        currentUserId={currentUserId}
        onSynced={onSynced}
        syncing={syncing}
        setSyncing={setSyncing}
        canEditLeague={canEditLeague}
        league={league}
      />
    </>
  );
}

function CommissionerModal({
  open,
  onClose,
  leagueId,
  insights,
  members,
  currentUserId,
  onSynced,
  syncing,
  setSyncing,
  canEditLeague,
  league,
}: {
  open: boolean;
  onClose: () => void;
  leagueId: string;
  insights: LeagueInsights | null;
  members: LeagueMember[];
  currentUserId: string | null;
  onSynced: () => void;
  syncing: boolean;
  setSyncing: (value: boolean) => void;
  canEditLeague: boolean;
  league?: League;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [visible, setVisible] = useState<boolean | null>(null);
  const [scoringMode, setScoringMode] = useState<ScoringMode | null>(null);
  const [benchEnabled, setBenchEnabled] = useState<boolean | null>(null);
  const [benchSlots, setBenchSlots] = useState<number | null>(null);
  const [benchLocks, setBenchLocks] = useState<boolean | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDisband, setConfirmDisband] = useState(false);
  const [disbanding, setDisbanding] = useState(false);

  const resolvedEnabled = enabled ?? insights?.prefs.projectionsEnabled ?? league?.prefs.projectionsEnabled ?? true;
  const resolvedVisible = visible ?? insights?.prefs.projectionsVisible ?? league?.prefs.projectionsVisible ?? true;
  const resolvedMode = scoringMode ?? insights?.prefs.scoringMode ?? league?.prefs.scoringMode ?? 'wins';
  const resolvedBenchEnabled = benchEnabled ?? insights?.prefs.benchEnabled ?? league?.prefs.benchEnabled ?? false;
  const resolvedBenchSlots = benchSlots ?? insights?.prefs.benchSlots ?? league?.prefs.benchSlots ?? 1;
  const resolvedBenchLocks = benchLocks ?? insights?.prefs.benchLocksAtKickoff ?? league?.prefs.benchLocksAtKickoff ?? true;

  async function update(patch: { projectionsEnabled?: boolean; projectionsVisible?: boolean; scoringMode?: ScoringMode; benchEnabled?: boolean; benchSlots?: number; benchLocksAtKickoff?: boolean }) {
    try {
      await api.updateLeaguePrefs(leagueId, patch);
      if (patch.projectionsEnabled !== undefined) setEnabled(patch.projectionsEnabled);
      if (patch.projectionsVisible !== undefined) setVisible(patch.projectionsVisible);
      if (patch.scoringMode !== undefined) setScoringMode(patch.scoringMode);
      if (patch.benchEnabled !== undefined) setBenchEnabled(patch.benchEnabled);
      if (patch.benchSlots !== undefined) setBenchSlots(patch.benchSlots);
      if (patch.benchLocksAtKickoff !== undefined) setBenchLocks(patch.benchLocksAtKickoff);
      toast.push('success', 'Settings saved');
      onSynced();
    } catch (err) {
      toast.push('error', 'Could not save settings', apiErrorMessage(err));
    }
  }

  async function disband() {
    if (disbanding) return;
    setDisbanding(true);
    try {
      await api.disbandLeague(leagueId);
      toast.push('success', 'League disbanded');
      navigate('/dashboard', { replace: true });
    } catch (error) {
      toast.push('error', 'Could not disband league', apiErrorMessage(error));
      setDisbanding(false);
    }
  }

  async function syncNow() {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await api.syncScores(leagueId);
      toast.push(result.skipped ? 'info' : 'success', result.skipped ? 'Scores are up to date' : 'Scores synced');
      onSynced();
    } catch (err) {
      toast.push('error', 'Sync failed', apiErrorMessage(err));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="League settings" size="lg">
      <div className="space-y-6">
        {canEditLeague ? (
          <div className="border-b border-line pb-5">
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              Edit name & size
            </Button>
          </div>
        ) : null}

        <LeaderCommands
          leagueId={leagueId}
          members={members}
          currentUserId={currentUserId}
          announcement={insights?.announcement ? { text: insights.announcement.text, by: insights.announcement.by } : null}
          canRemove={league?.status !== 'drafting'}
          onChanged={onSynced}
        />

        <div className="space-y-3 border-t border-line pt-5">
          <h3 className="font-display text-sm font-semibold text-white">Scoring & projections</h3>

          <div className="rounded-lg border border-line bg-navy-900 px-3.5 py-3">
            <p className="text-sm font-semibold text-white">Scoring</p>
            <p className="text-xs text-slate-500">How each drafted team scores points.</p>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              {(
                [
                  { value: 'wins', label: 'Win = 1 point' },
                  { value: 'points', label: 'Team points scored' },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => void update({ scoringMode: option.value })}
                  aria-pressed={resolvedMode === option.value}
                  className={cn(
                    'focus-ring rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors',
                    resolvedMode === option.value
                      ? 'border-electric-400/60 bg-electric-500/15 text-electric-300'
                      : 'border-line text-slate-400 hover:border-navy-500',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <SettingRow
            label="Projections"
            hint="Rest-of-season outlook for this league."
            checked={resolvedEnabled}
            onChange={(value) => void update({ projectionsEnabled: value })}
          />
          <SettingRow
            label="Show championship odds"
            hint="Each owner's probability of finishing first."
            checked={resolvedVisible}
            onChange={(value) => void update({ projectionsVisible: value })}
          />
        </div>

        <div className="space-y-3 border-t border-line pt-5">
          <h3 className="font-display text-sm font-semibold text-white">Bench</h3>
          <SettingRow
            label="Enable bench"
            hint="Benched teams stop earning fantasy points from that NFL week forward."
            checked={resolvedBenchEnabled}
            onChange={(value) => void update({ benchEnabled: value })}
          />
          {resolvedBenchEnabled ? (
            <>
              <div className="rounded-lg border border-line bg-navy-900 px-3.5 py-3">
                <label htmlFor="benchSlots" className="flex items-center justify-between text-sm font-semibold text-white">
                  Bench slots <span className="text-electric-300">{resolvedBenchSlots}</span>
                </label>
                <input
                  id="benchSlots"
                  type="range"
                  min={1}
                  max={16}
                  value={resolvedBenchSlots}
                  onChange={(event) => setBenchSlots(Number(event.target.value))}
                  onPointerUp={() => void update({ benchSlots: resolvedBenchSlots })}
                  onKeyUp={() => void update({ benchSlots: resolvedBenchSlots })}
                  className="mt-2 h-8 w-full accent-electric-500"
                />
              </div>
              <SettingRow
                label="Lock at kickoff"
                hint="Prevent moving a team after its game begins that week."
                checked={resolvedBenchLocks}
                onChange={(value) => void update({ benchLocksAtKickoff: value })}
              />
            </>
          ) : null}
        </div>

        <div className="border-t border-line pt-5">
          <h3 className="font-display text-sm font-semibold text-white">Score sync</h3>
          <p className="mt-1 text-sm text-slate-400">
            Last update: {insights?.sync.lastSyncAt ? formatRelativeTime(insights.sync.lastSyncAt) : 'never'}
          </p>
          {insights?.sync.lastError ? <p className="mt-1 text-xs text-rose-400">Last sync failed: {insights.sync.lastError}</p> : null}
          <Button size="sm" variant="outline" className="mt-3" onClick={() => void syncNow()} isLoading={syncing} disabled={syncing}>
            Update scores now
          </Button>
          {insights?.sync.lastError ? (
            <p className="mt-2 text-xs text-slate-500">The scheduled sync retries automatically every ~30 minutes.</p>
          ) : null}
        </div>

        <p className="flex items-center gap-2 border-t border-line pt-4 text-xs text-slate-500">
          <Crown className="h-3.5 w-3.5 text-gold-400" />
          Commissioner only
        </p>

        <div className="border-t border-rose-500/20 pt-5">
          <h3 className="text-sm font-semibold text-rose-300">Danger zone</h3>
          <p className="mt-1 text-xs text-slate-500">Disbanding permanently removes the league for every player.</p>
          {confirmDisband ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-rose-300">This cannot be undone.</span>
              <Button size="sm" variant="danger" isLoading={disbanding} onClick={() => void disband()}>Disband permanently</Button>
              <Button size="sm" variant="ghost" disabled={disbanding} onClick={() => setConfirmDisband(false)}>Cancel</Button>
            </div>
          ) : (
            <Button size="sm" variant="danger" className="mt-3" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDisband(true)}>
              Disband league
            </Button>
          )}
        </div>
      </div>

      {canEditLeague && league ? <EditLeagueModal league={league} open={editOpen} onClose={() => setEditOpen(false)} onSaved={onSynced} /> : null}
    </Modal>
  );
}

/** League name + max size. */
function EditLeagueModal({ league, open, onClose, onSaved }: { league: League; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(league.name);
  const [maxParticipants, setMaxParticipants] = useState(league.maxParticipants);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previousOpen, setPreviousOpen] = useState(open);

  if (previousOpen !== open) {
    setPreviousOpen(open);
    if (open) {
      setName(league.name);
      setMaxParticipants(league.maxParticipants);
      setError(null);
    }
  }

  async function handleSave() {
    if (saving) return;
    if (name.trim().length < 3 || name.trim().length > 60) {
      setError('League name must be 3–60 characters.');
      return;
    }
    if (maxParticipants < 2 || maxParticipants > 16 || maxParticipants < league.memberCount) {
      setError(`League size must stay between 2 and 16 (and at least ${league.memberCount}).`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.updateLeagueSettings(league.id, { name: name.trim(), maxParticipants });
      toast.push('success', 'Settings saved');
      onClose();
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit league"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} isLoading={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error ? <Alert variant="error">{error}</Alert> : null}
        <Input label="League name" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
        <div>
          <label htmlFor="maxParticipants" className="mb-1.5 flex items-center justify-between text-sm font-medium text-slate-200">
            Max players
            <span className="text-xs text-slate-500">{maxParticipants}</span>
          </label>
          <input
            id="maxParticipants"
            type="range"
            min={2}
            max={16}
            step={1}
            value={maxParticipants}
            onChange={(event) => setMaxParticipants(Number(event.target.value))}
            className="h-11 w-full accent-electric-500"
          />
        </div>
      </div>
    </Modal>
  );
}

function SettingRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-navy-900 px-3.5 py-3">
      <div>
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'focus-ring relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-electric-500' : 'bg-navy-600',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}
