import { useCallback, useMemo, useState } from 'react';
import {
  getInitialSearchFilters,
  sportLabelForFilters,
  type SearchFiltersState,
} from '../domain/searchFilters';
import { useTranslation } from '../i18n';
import {
  formatDateForChip,
  formatTimeRangeForChip,
  TIME_RANGE_PRESETS,
} from '../utils/formatSearch';
import { useSearchCourts } from './useSearchCourts';

const TIME_PRESET_LABEL_KEYS: Record<string, string> = {
  allday: 'search.timePresetAllDay',
  morning: 'search.timePresetMorning',
  afternoon: 'search.timePresetAfternoon',
  evening: 'search.timePresetEvening',
};

export function useMatchSearch() {
  const { t, locale } = useTranslation();
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

  const sportLabel = sportLabelForFilters(filters.sport, t);
  const dateLabel =
    filters.date == null ? t('common.today') : formatDateForChip(filters.date, locale);
  const timeRangeLabel = (() => {
    if (!filters.timeRange) return t('search.timePresetAllDay');
    const preset = TIME_RANGE_PRESETS.find(
      (p) =>
        p.range != null &&
        p.range.start === filters.timeRange!.start &&
        p.range.end === filters.timeRange!.end,
    );
    if (preset) {
      const key = TIME_PRESET_LABEL_KEYS[preset.id];
      if (key) return t(key);
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
