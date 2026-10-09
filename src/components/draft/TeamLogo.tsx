import { useState } from 'react';
import { NFL_TEAMS_BY_ID } from '@/data/nflTeams';
import type { NFLTeam } from '@/types';

export type TeamLogoSizes = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASSES: Record<TeamLogoSizes, string> = {
  xs: 'h-6 w-6 rounded-full',
  sm: 'h-8 w-8 rounded-lg',
  md: 'h-10 w-10 rounded-lg',
  lg: 'h-14 w-14 rounded-xl',
  xl: 'h-20 w-20 rounded-2xl',
};

const FALLBACK_TEXT: Record<TeamLogoSizes, string> = {
  xs: 'text-[9px]',
  sm: 'text-[10px]',
  md: 'text-xs',
  lg: 'text-sm',
  xl: 'text-lg',
};

export interface TeamLogoProps {
  teamId: string;
  size?: TeamLogoSizes;
  /** Subtle ring in the team's primary color. */
  ring?: boolean;
  className?: string;
}

/**
 * NFL team logo with a graceful fallback: if the image can't load we draw a
 * colored monogram (nickname initials) using the team's official colors.
 */
export function TeamLogo({ teamId, size = 'md', ring = false, className = '' }: TeamLogoProps) {
  const team: NFLTeam | undefined = NFL_TEAMS_BY_ID[teamId];
  const [failed, setFailed] = useState(false);

  const base = `${SIZE_CLASSES[size]} ${ring ? 'ring-2 ring-offset-1 ring-offset-navy-950' : ''}`;

  if (!team) {
    return (
      <span
        aria-hidden
        className={`flex shrink-0 items-center justify-center bg-navy-800 font-display font-bold text-slate-400 ${base} ${className}`}
      >
        ?
      </span>
    );
  }

  if (!failed) {
    return (
      <img
        src={team.logoUrl}
        alt={team.name}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`shrink-0 bg-white object-contain p-0.5 ${base} ${ring ? 'ring-white/10' : ''} ${className}`}
      />
    );
  }

  const grayscale = team.primaryColor.toLowerCase() === '#000000';
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center font-display font-bold text-white/90 shadow-inner ${base} ${className}`}
      style={{
        backgroundImage: grayscale
          ? 'linear-gradient(135deg, #1f3052, #0a1327)'
          : `linear-gradient(135deg, ${team.primaryColor}, ${team.secondaryColor})`,
      }}
    >
      <span className={FALLBACK_TEXT[size]}>{team.nickname.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase()}</span>
    </span>
  );
}