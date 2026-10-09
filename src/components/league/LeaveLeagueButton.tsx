import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/context/ToastContext';
import { api, apiErrorMessage } from '@/lib/api';

export function LeaveLeagueButton({ leagueId, disabled = false }: { leagueId: string; disabled?: boolean }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function leave() {
    if (busy) return;
    setBusy(true);
    try {
      await api.leaveLeague(leagueId);
      toast.push('success', 'You left the league');
      navigate('/dashboard', { replace: true });
    } catch (error) {
      toast.push('error', 'Could not leave league', apiErrorMessage(error));
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setOpen(true)} leftIcon={<LogOut className="h-4 w-4" />}>
        Leave league
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Leave this league?"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="danger" onClick={() => void leave()} isLoading={busy}>Leave league</Button>
          </>
        )}
      >
        <p className="text-sm leading-relaxed text-slate-300">
          You will lose access immediately. If the draft has finished, your drafted teams will become unowned for future scoring.
        </p>
      </Modal>
    </>
  );
}
