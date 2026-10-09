import type { ScoringMode } from '@/types';

/** User-facing labels for the league's scoring mode. */
export function scoreUnit(mode: ScoringMode): string {
  return mode === 'points' ? 'points' : 'wins';
}

export function totalScoreLabel(mode: ScoringMode): string {
  return mode === 'points' ? 'Total points' : 'Total wins';
}

export function projectedScoreLabel(mode: ScoringMode): string {
  return mode === 'points' ? 'Projected points' : 'Projected wins';
}

export function behindLabel(mode: ScoringMode): string {
  return mode === 'points' ? 'Pts behind' : 'Behind';
}

export function weeklyUnitLabel(mode: ScoringMode): string {
  return mode === 'points' ? 'Pts' : 'Wins';
}