import { useState } from 'react';
import { avatarGradient, initials } from '@/lib/format';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-xl',
};

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
}

export function Avatar({ name, src, size = 'md', className = '' }: AvatarProps) {
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        className={`shrink-0 rounded-full object-cover ring-1 ring-white/10 ${SIZE_CLASSES[size]} ${className}`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      aria-hidden
      style={{ backgroundImage: avatarGradient(name) }}
      className={`flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white/95 shadow-inner ring-1 ring-white/15 ${SIZE_CLASSES[size]} ${className}`}
    >
      {initials(name)}
    </span>
  );
}