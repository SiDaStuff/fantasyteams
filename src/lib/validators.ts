import {
  DRAFT_PICK_TIMERS,
  LEAGUE_CODE_LENGTH,
  LEAGUE_NAME_MAX,
  LEAGUE_NAME_MIN,
  MAX_PARTICIPANTS,
  MIN_PARTICIPANTS,
  SEASON_MAX,
  SEASON_MIN,
  type DraftFormat,
  type DraftPickTimer,
} from '@/types';

/** 6-char code, case-insensitive input, unambiguous alphabet. */
export function normalizeLeagueCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, LEAGUE_CODE_LENGTH);
}

export function validateLeagueCode(value: string): string | null {
  const code = normalizeLeagueCode(value);
  if (value.trim() === '') return 'Enter a league code to continue.';
  if (code.length < LEAGUE_CODE_LENGTH) {
    return `League codes are ${LEAGUE_CODE_LENGTH} characters.`;
  }
  return null;
}

export function validateDisplayName(value: string): string | null {
  const name = value.trim();
  if (name.length < 2) return 'Your display name must be at least 2 characters.';
  if (name.length > 40) return 'Your display name must be 40 characters or fewer.';
  return null;
}

export function validateEmail(value: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    return 'Enter a valid email address.';
  }
  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length < 6) return 'Password must be at least 6 characters.';
  if (value.length > 128) return 'Password must be 128 characters or fewer.';
  return null;
}

export function validateLeagueName(value: string): string | null {
  const name = value.trim();
  if (name.length < LEAGUE_NAME_MIN) {
    return `League name must be at least ${LEAGUE_NAME_MIN} characters.`;
  }
  if (name.length > LEAGUE_NAME_MAX) {
    return `League name must be ${LEAGUE_NAME_MAX} characters or fewer.`;
  }
  return null;
}

export function validateSeason(value: number): string | null {
  if (!Number.isInteger(value) || value < SEASON_MIN || value > SEASON_MAX) {
    return `Season must be between ${SEASON_MIN} and ${SEASON_MAX}.`;
  }
  return null;
}

export function validateParticipantCount(value: number): string | null {
  if (!Number.isInteger(value) || value < MIN_PARTICIPANTS || value > MAX_PARTICIPANTS) {
    return `Leagues hold between ${MIN_PARTICIPANTS} and ${MAX_PARTICIPANTS} participants.`;
  }
  return null;
}

export function isDraftFormat(value: string): value is DraftFormat {
  return value === 'snake' || value === 'linear';
}

export function isDraftPickTimer(value: number): value is DraftPickTimer {
  return DRAFT_PICK_TIMERS.includes(value as DraftPickTimer);
}