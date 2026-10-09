import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyToClipboard } from '@/lib/format';

export interface CopyButtonProps {
  value: string;
  /** Optional label shown beside the icon. */
  children?: string;
  className?: string;
  onCopied?: () => void;
}

export function CopyButton({ value, children, className = '', onCopied }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await copyToClipboard(value);
    setCopied(ok);
    if (ok) onCopied?.();
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`focus-ring inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
        copied
          ? 'bg-emerald-500/15 text-emerald-300'
          : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
      } ${className}`}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}