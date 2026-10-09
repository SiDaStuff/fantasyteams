/** General-purpose display helpers. */

export function formatDate(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatRelativeTime(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return '—';

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);

  const units: Array<[divisor: number, label: string]> = [
    [60, 'second'],
    [3600, 'minute'],
    [86400, 'hour'],
    [604800, 'day'],
    [2592000, 'week'],
    [31536000, 'month'],
    [Infinity, 'year'],
  ];

  let chosen = units[units.length - 1];
  for (let i = 0; i < units.length - 1; i += 1) {
    const [divisor] = units[i];
    if (abs < divisor) {
      chosen = units[Math.max(0, i - 1)];
      break;
    }
  }

  const [divisor, label] = chosen;
  const count = Math.max(1, Math.round(abs / divisor));
  const suffix = `${count} ${label}${count === 1 ? '' : 's'}`;
  return seconds >= 0 ? `in ${suffix}` : `${suffix} ago`;
}

/** Deterministic gradient for an avatar without an image. */
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #1f7dff 0%, #22d3ee 100%)',
  'linear-gradient(135deg, #7c3aed 0%, #22d3ee 100%)',
  'linear-gradient(135deg, #0b5ee0 0%, #f7c948 100%)',
  'linear-gradient(135deg, #f43f5e 0%, #f7c948 100%)',
  'linear-gradient(135deg, #10b981 0%, #22d3ee 100%)',
];

export function avatarGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

/** Initials for text avatars, e.g. "Fantasy Teams" → "FT". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export function formatDraftFormat(format: 'snake' | 'linear'): string {
  return format === 'snake' ? 'Snake' : 'Linear';
}

export function formatTimer(seconds: number): string {
  return `${seconds}s`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers without the async clipboard API.
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      return true;
    } catch {
      return false;
    }
  }
}