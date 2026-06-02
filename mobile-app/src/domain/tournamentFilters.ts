import type { PublicTournamentRow } from '../api/tournaments';
import {
  formatFormatLabel,
  matchesFormatFilter,
  matchesLevelFilter,
  matchesSearch,
  type TournamentFormatFilter,
  type TournamentLevelFilter,
} from './tournamentDisplay';

export type TournamentFiltersState = {
  format: TournamentFormatFilter;
  level: TournamentLevelFilter;
  joinableOnly: boolean;
};

export function getInitialTournamentFilters(): TournamentFiltersState {
  return {
    format: 'all',
    level: 'all',
    joinableOnly: true,
  };
}

export type TournamentFilterContext = {
  searchQuery: string;
  activeTab: 'disponibles' | 'inscritas' | 'solicitudes';
  canJoin: (row: PublicTournamentRow) => boolean;
};

export function filterTournamentRows(
  items: PublicTournamentRow[],
  filters: TournamentFiltersState,
  ctx: TournamentFilterContext,
): PublicTournamentRow[] {
  const now = Date.now();
  return items
    .filter((row) => String(row.status ?? '').toLowerCase() !== 'cancelled')
    .filter((row) => {
      const endMs = new Date(String(row.end_at ?? '')).getTime();
      if (!Number.isFinite(endMs)) return true;
      return endMs >= now;
    })
    .filter(
      (row) =>
        matchesSearch(row, ctx.searchQuery) &&
        matchesFormatFilter(row, filters.format) &&
        matchesLevelFilter(row, filters.level) &&
        (ctx.activeTab !== 'disponibles' ||
          !filters.joinableOnly ||
          ctx.canJoin(row)),
    )
    .sort((a, b) => {
      const da = new Date(String(a.start_at ?? '')).getTime();
      const db = new Date(String(b.start_at ?? '')).getTime();
      if (!Number.isFinite(da) && !Number.isFinite(db)) return 0;
      if (!Number.isFinite(da)) return 1;
      if (!Number.isFinite(db)) return -1;
      return da - db;
    });
}

export function countTournamentActiveFilters(
  filters: TournamentFiltersState,
  options?: { includeJoinable?: boolean },
): number {
  let n = 0;
  if (filters.format !== 'all') n += 1;
  if (filters.level !== 'all') n += 1;
  if (options?.includeJoinable !== false && !filters.joinableOnly) n += 1;
  return n;
}

export function formatFilterChipLabel(filters: TournamentFiltersState): string {
  return filters.format === 'all' ? 'Formato' : formatFormatLabel(filters.format);
}

export function levelChipLabel(filters: TournamentFiltersState): string {
  if (filters.level === 'all') return 'Nivel';
  if (filters.level === 'principiante') return 'Principiante';
  if (filters.level === 'medio') return 'Medio';
  return 'Avanzado';
}

export function joinableChipLabel(joinableOnly: boolean): string {
  return joinableOnly ? 'Solo me puedo unir' : 'Todas';
}

export const TOURNAMENT_FORMAT_OPTIONS: TournamentFormatFilter[] = [
  'all',
  'liga',
  'americano',
  'eliminatoria',
  'torneo',
];

export const TOURNAMENT_LEVEL_OPTIONS: TournamentLevelFilter[] = [
  'all',
  'principiante',
  'medio',
  'avanzado',
];
