import { useCallback, useState } from 'react';
import { type SearchFiltersState } from '../components/search/SearchFiltersSheet';
import {
  formatDateForChip,
  formatTimeRangeForChip,
} from '../utils/formatSearch';
import { useSearchCourts } from './useSearchCourts';

export function useMatchSearch() {
  const [filters, setFilters] = useState<SearchFiltersState>(() => ({
    sport: null,
    date: null,
    timeRange: null,
    showUnavailable: false,
    sortBy: 'distancia',
    maxDistanceKm: 50,
    duration: 90,
    cerramiento: null,
    paredes: null,
  }));

  const { results, resultCount, loading } = useSearchCourts(filters);

  const applyFilters = useCallback((newFilters: SearchFiltersState) => {
    setFilters(newFilters);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      sport: null,
      date: null,
      timeRange: null,
      showUnavailable: false,
      sortBy: 'distancia',
      maxDistanceKm: 50,
      duration: 90,
      cerramiento: null,
      paredes: null,
    });
  }, []);

  const sportLabel = filters.sport
    ? filters.sport === 'padel'
      ? 'Pádel'
      : filters.sport === 'tenis'
        ? 'Tenis'
        : 'Pickleball'
    : 'Deporte';
  const dateLabel = filters.date ? formatDateForChip(filters.date) : 'Fecha';
  const timeRangeLabel = filters.timeRange
    ? formatTimeRangeForChip(filters.timeRange.start, filters.timeRange.end)
    : 'Hora';

  return {
    filters,
    setFilters,
    applyFilters,
    clearFilters,
    results,
    resultCount,
    loading,
    sportLabel,
    dateLabel,
    timeRangeLabel,
  };
}
