import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TeamLogo } from '@/components/draft/TeamLogo';
import { divisionLabel } from '@/data/nflTeams';
import type { NFLTeam } from '@/types';

export interface PickConfirmModalProps {
  team: NFLTeam | null;
  pickLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  submitting: boolean;
}

export function PickConfirmModal({ team, pickLabel, onConfirm, onCancel, submitting }: PickConfirmModalProps) {
  return (
    <Modal
      open={team !== null}
      onClose={onCancel}
      title="Confirm pick"
      description={pickLabel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onConfirm} isLoading={submitting}>
            Confirm pick
          </Button>
        </>
      }
    >
      {team ? (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <TeamLogo teamId={team.id} size="xl" ring />
          <div>
            <h3 className="font-display text-xl font-bold text-white">{team.name}</h3>
            <p className="mt-1 text-sm text-slate-400">{divisionLabel(team)}</p>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}