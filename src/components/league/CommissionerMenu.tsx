import { useState } from 'react';
import { Crown, RefreshCw, Settings } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { LeaderCommands } from '@/components/league/LeaderCommands';
import { useToast } from '@/context/ToastContext';
import { api, apiErrorMessage } from '@/lib/api';
import { formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { LeagueInsights, LeagueMember, ScoringMode } from '@/types';

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
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2">
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
}) {
  const toast = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [visible, setVisible] = useState<boolean | null>(null);
  const [scoringMode, setScoringMode] = useState<ScoringMode | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const resolvedEnabled = enabled ?? insights?.prefs.projectionsEnabled ?? true;
  const resolvedVisible = visible ?? insights?.prefs.projectionsVisible ?? true;
  const resolvedMode = scoringMode ?? insights?.prefs.scoringMode ?? 'wins';

  async function update(patch: { projectionsEnabled?: boolean; projectionsVisible?: boolean; scoringMode?: ScoringMode }) {
    try {
      await api.updateLeaguePrefs(leagueId, patch);
      if (patch.projectionsEnabled !== undefined) setEnabled(patch.projectionsEnabled);
      if (patch.projectionsVisible !== undefined) setVisible(patch.projectionsVisible);
      if (patch.scoringMode !== undefined) setScoringMode(patch.scoringMode);
      toast.push('success', 'Settings saved');
      onSynced();
    } catch (err) {
      toast.push('error', 'Could not save settings', apiErrorMessage(err));
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
          canRemove={false}
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
