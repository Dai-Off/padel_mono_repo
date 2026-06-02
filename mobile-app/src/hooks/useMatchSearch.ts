import { useCallback, useMemo, useState } from 'react';
import {
  getInitialSearchFilters,
  sportLabelForFilters,
  type SearchFiltersState,
} from '../domain/searchFilters';
import {
  formatDateForChip,
  formatTimeRangeForChip,
  TIME_RANGE_PRESETS,
} from '../utils/formatSearch';
import { useSearchCourts } from './useSearchCourts';

export function useMatchSearch() {
  const [filters, setFilters] = useState<SearchFiltersState>(getInitialSearchFilters);

  const { results, listResults, resultCount, loading, fetchError, refetch } =
    useSearchCourts(filters);

  const applyFilters = useCallback((newFilters: SearchFiltersState) => {
    setFilters(newFilters);
  }, []);

  const patchFilters = useCallback((patch: Partial<SearchFiltersState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(getInitialSearchFilters());
  }, []);

  const sportLabel = sportLabelForFilters(filters.sport);
  const dateLabel = filters.date == null ? 'Hoy' : formatDateForChip(filters.date);
  const timeRangeLabel = (() => {
    if (!filters.timeRange) return 'Todo el día';
    const preset = TIME_RANGE_PRESETS.find(
      (p) =>
        p.range != null &&
        p.range.start === filters.timeRange!.start &&
        p.range.end === filters.timeRange!.end,
    );
    if (preset) {
      const short = preset.label.split(' (')[0];
      return short;
    }
    return formatTimeRangeForChip(filters.timeRange.start, filters.timeRange.end);
  })();

  const chipActive = useMemo(
    () => ({
      sport: filters.sport != null,
      date: filters.date != null,
      time: filters.timeRange != null,
    }),
    [filters.sport, filters.date, filters.timeRange],
  );

  return {
    filters,
    setFilters,
    applyFilters,
    patchFilters,
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
    chipActive,
  };
}
