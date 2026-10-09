import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { TeamLogo } from '@/components/draft/TeamLogo';
import { NFL_CONFERENCES, NFL_DIVISIONS } from '@/data/nflTeams';
import { cn } from '@/lib/cn';
import type { NFLTeam } from '@/types';

export interface AvailableTeamsGridProps {
  teams: NFLTeam[];
  takenTeamIds: ReadonlySet<string>;
  /** Set when the current user is on the clock. */
  canPick: boolean;
  onSelect: (team: NFLTeam) => void;
  /** Map of taken team id → display name of the player who drafted it. */
  takenBy?: ReadonlyMap<string, string>;
}

export function AvailableTeamsGrid({ teams, takenTeamIds, canPick, onSelect, takenBy }: AvailableTeamsGridProps) {
  const [query, setQuery] = useState('');
  const [conference, setConference] = useState<'All' | 'AFC' | 'NFC'>('All');
  const [division, setDivision] = useState<string>('All');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return teams.filter((team) => {
      if (conference !== 'All' && team.conference !== conference) return false;
      if (division !== 'All' && team.division !== division) return false;
      if (q && !`${team.name} ${team.city} ${team.nickname}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [teams, query, conference, division]);

  const remaining = teams.length - takenTeamIds.size;

  return (
    <div>
      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-52">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search teams"
            className="focus-ring h-10 w-full rounded-lg border border-line bg-navy-900 pl-9 pr-3 text-sm text-white placeholder-slate-500"
            aria-label="Search teams"
          />
        </label>

        <div className="flex rounded-lg border border-line p-0.5 text-xs">
          {(['All', 'AFC', 'NFC'] as const).map((conf) => (
            <button
              key={conf}
              type="button"
              onClick={() => setConference(conf)}
              className={cn(
                'rounded-md px-2.5 py-1.5 font-semibold transition-colors',
                conference === conf ? 'bg-electric-500/20 text-electric-300' : 'text-slate-400 hover:text-white',
              )}
            >
              {conf}
            </button>
          ))}
        </div>

        <select
          value={division}
          onChange={(event) => setDivision(event.target.value)}
          className="focus-ring h-10 rounded-lg border border-line bg-navy-900 px-2.5 text-sm text-white"
          aria-label="Filter by division"
        >
          <option value="All">All divisions</option>
          {NFL_CONFERENCES.flatMap((conf) =>
            NFL_DIVISIONS.map((div) => (
              <option key={`${conf}${div}`} value={div}>
                {conf} {div}
              </option>
            )),
          )}
        </select>
      </div>

      <p className="mt-3 text-xs font-medium text-slate-500">
        {remaining} of {teams.length} teams available
      </p>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="mt-2 rounded-xl border border-dashed border-line py-10 text-center text-sm text-slate-500">
          No teams match your filters.
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-4">
          {filtered.map((team) => {
            const taken = takenTeamIds.has(team.id);
            const owner = takenBy?.get(team.id);
            return (
              <button
                key={team.id}
                type="button"
                disabled={taken || !canPick}
                onClick={() => onSelect(team)}
                aria-label={taken ? `${team.name}, already drafted` : `Draft ${team.name}`}
                className={cn(
                  'focus-ring relative flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors',
                  taken
                    ? 'cursor-default border-line/50 bg-navy-900/50 opacity-60'
                    : canPick
                      ? 'cursor-pointer border-line bg-navy-900 hover:border-electric-400/60 hover:bg-navy-800'
                      : 'cursor-default border-line/50 bg-navy-900/50',
                )}
              >
                <TeamLogo teamId={team.id} size="md" />
                <span className="w-full truncate text-xs font-semibold text-white">{team.nickname}</span>
                {taken && owner ? (
                  <span className="w-full truncate text-[10px] text-emerald-300/80">{owner}</span>
                ) : (
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">{team.abbreviation}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
