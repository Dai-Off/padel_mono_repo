import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSearchCourts, type SearchCourtResult } from '../api/search';
import type { SearchFiltersState } from '../components/search/SearchFiltersSheet';
import { applySearchCourtFilters } from '../domain/searchCourtFilters';
import { toDateStringLocal } from '../utils/dateLocal';

export function useSearchCourts(filters: SearchFiltersState) {
  const [rawResults, setRawResults] = useState<SearchCourtResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [slotNow, setSlotNow] = useState(() => new Date());

  useEffect(() => {
    setSlotNow(new Date());
    const id = setInterval(() => setSlotNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [filters.date, filters.cerramiento, filters.paredes]);

  const search = useCallback(async () => {
    setLoading(true);
    try {
      const dateFrom =
        filters.date != null
          ? toDateStringLocal(filters.date)
          : toDateStringLocal(new Date());
      const dateTo = dateFrom;
      const indoor =
        filters.cerramiento === 'indoor'
          ? true
          : filters.cerramiento === 'exterior' || filters.cerramiento === 'cubierta'
            ? false
            : undefined;
      const glassType =
        filters.paredes === 'muro'
          ? 'normal'
          : filters.paredes === 'panoramico' || filters.paredes === 'cristal'
            ? 'panoramic'
            : undefined;

      const data = await fetchSearchCourts({
        dateFrom: dateFrom ?? undefined,
        dateTo: dateTo ?? undefined,
        indoor,
        glassType,
      });
      setRawResults(data);
    } catch {
      setRawResults([]);
    } finally {
      setLoading(false);
    }
  }, [filters.date, filters.cerramiento, filters.paredes]);

  useEffect(() => {
    search();
  }, [search]);

  const results = useMemo(
    () => applySearchCourtFilters(rawResults, filters, { now: slotNow }),
    [
      rawResults,
      filters.sport,
      filters.timeRange?.start,
      filters.timeRange?.end,
      filters.showUnavailable,
      filters.maxDistanceKm,
      filters.duration,
      filters.date,
      slotNow,
    ],
  );

  return { results, resultCount: results.length, loading };
}
