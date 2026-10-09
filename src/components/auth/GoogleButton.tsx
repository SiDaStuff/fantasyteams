import { useState } from 'react';
import { GoogleLogo } from '@/components/brand/GoogleLogo';

export function GoogleButton({
  onClick,
  loading,
  label = 'Continue with Google',
}: {
  onClick: () => Promise<void> | void;
  loading: boolean;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const isBusy = busy || loading;

  async function handleClick() {
    setBusy(true);
    try {
      await onClick();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isBusy}
      className="focus-ring flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-white text-sm font-semibold text-navy-900 transition-all hover:bg-slate-100 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60"
    >
      {isBusy ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-navy-900/20 border-t-navy-900" />
      ) : (
        <GoogleLogo className="h-4.5 w-4.5" />
      )}
      {label}
    </button>
  );
}