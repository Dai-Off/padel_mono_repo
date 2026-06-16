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
  t: (key: string, params?: Record<string, string | number>) => string;
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
        matchesSearch(row, ctx.searchQuery, ctx.t) &&
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

export function formatFilterChipLabel(
  filters: TournamentFiltersState,
  t: (key: string) => string,
): string {
  return filters.format === 'all' ? t('torneos.filterFormatDefault') : formatFormatLabel(filters.format, t);
}

export function levelChipLabel(
  filters: TournamentFiltersState,
  t: (key: string) => string,
): string {
  if (filters.level === 'all') return t('torneos.filterLevelDefault');
  if (filters.level === 'principiante') return t('torneos.filterLevelBeginner');
  if (filters.level === 'medio') return t('torneos.filterLevelMedium');
  return t('torneos.filterLevelAdvanced');
}

export function joinableChipLabel(joinableOnly: boolean, t: (key: string) => string): string {
  return joinableOnly ? t('torneos.filterJoinableOnly') : t('torneos.filterJoinableAll');
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
