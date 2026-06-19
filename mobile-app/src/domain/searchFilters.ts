import {
  CERRAMIENTO_OPTIONS,
  DURATION_OPTIONS,
  PAREDES_OPTIONS,
  SPORT_OPTIONS,
  TIME_RANGE_PRESETS,
} from '../utils/formatSearch';
import type { TranslateFn } from './partidosFilters';

export type SearchSortOption = 'distancia' | 'precio';
export type SearchDurationOption = 60 | 90 | 120;
export type SearchCerramientoOption = 'indoor' | 'exterior' | 'cubierta';
export type SearchParedesOption = 'muro' | 'cristal' | 'panoramico';

export type SearchFiltersState = {
  sport: string | null;
  date: Date | null;
  timeRange: { start: string; end: string } | null;
  showUnavailable: boolean;
  sortBy: SearchSortOption;
  maxDistanceKm: number;
  duration: SearchDurationOption;
  cerramiento: SearchCerramientoOption | null;
  paredes: SearchParedesOption | null;
};

export const SEARCH_DISTANCE_MAX_KM = 50;

export function getInitialSearchFilters(): SearchFiltersState {
  return {
    sport: null,
    date: null,
    timeRange: null,
    showUnavailable: true,
    sortBy: 'distancia',
    maxDistanceKm: SEARCH_DISTANCE_MAX_KM,
    duration: 90,
    cerramiento: null,
    paredes: null,
  };
}

export function sportLabelForFilters(sport: string | null, t: TranslateFn): string {
  if (sport === 'padel') return t('common.sportPadel');
  if (sport === 'tenis') return t('common.sportTenis');
  if (sport === 'pickleball') return t('common.sportPickleball');
  return t('search.filterSport');
}

/** Filtros avanzados distintos del valor por defecto (badge en icono de filtros). */
export function countAdvancedSearchFilters(filters: SearchFiltersState): number {
  let n = 0;
  if (!filters.showUnavailable) n += 1;
  if (filters.sortBy !== 'distancia') n += 1;
  if (filters.maxDistanceKm < SEARCH_DISTANCE_MAX_KM) n += 1;
  if (filters.duration !== 90) n += 1;
  if (filters.cerramiento != null) n += 1;
  if (filters.paredes != null) n += 1;
  return n;
}

export { SPORT_OPTIONS, DURATION_OPTIONS, CERRAMIENTO_OPTIONS, PAREDES_OPTIONS, TIME_RANGE_PRESETS };
