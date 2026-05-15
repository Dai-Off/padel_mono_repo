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
    showUnavailable: true,
    sortBy: 'distancia',
    maxDistanceKm: 50,
    duration: 90,
    cerramiento: null,
    paredes: null,
  }));

  const { results, listResults, resultCount, loading, fetchError, refetch } =
    useSearchCourts(filters);

  const applyFilters = useCallback((newFilters: SearchFiltersState) => {
    setFilters(newFilters);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      sport: null,
      date: null,
      timeRange: null,
      showUnavailable: true,
      sortBy: 'distancia',
      maxDistanceKm: 50,
      duration: 90,
      cerramiento: null,
      paredes: null,
    });
  }, []);

  const sportLabel =
    filters.sport === 'padel'
      ? 'Pádel'
      : filters.sport === 'tenis'
        ? 'Tenis'
        : filters.sport === 'pickleball'
          ? 'Pickleball'
          : 'Deporte';
  const dateLabel = filters.date == null ? 'Hoy' : formatDateForChip(filters.date);
  const timeRangeLabel = filters.timeRange
    ? formatTimeRangeForChip(filters.timeRange.start, filters.timeRange.end)
    : 'Todo el día';

  return {
    filters,
    setFilters,
    applyFilters,
    clearFilters,
    results,
    listResults,
    resultCount,
    loading,
    fetchError,
    refetch,
    sportLabel,
    dateLabel,
    timeRangeLabel,
  };
}
