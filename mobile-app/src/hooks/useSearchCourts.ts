import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchSearchCourts, type SearchCourtResult } from '../api/search';
import type { SearchFiltersState } from '../domain/searchFilters';
import { SEARCH_DISTANCE_MAX_KM } from '../domain/searchFilters';
import { decorateSearchCourtSlots } from '../domain/searchCourtFilters';
import { toDateStringLocal } from '../utils/dateLocal';

function filterByMaxDistance(
  courts: SearchCourtResult[],
  maxDistanceKm: number,
): SearchCourtResult[] {
  if (maxDistanceKm >= SEARCH_DISTANCE_MAX_KM) return courts;
  return courts.filter((c) => {
    const d = c.distanceKm;
    if (d == null) return true;
    return d <= maxDistanceKm;
  });
}

export function useSearchCourts(filters: SearchFiltersState) {
  const [rawResults, setRawResults] = useState<SearchCourtResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [slotNow, setSlotNow] = useState(() => new Date());
  const requestSeq = useRef(0);

  useEffect(() => {
    setSlotNow(new Date());
    const id = setInterval(() => setSlotNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [filters.date, filters.cerramiento, filters.paredes]);

  const search = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setFetchError(null);
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
        sport: filters.sport ?? undefined,
      });

      if (seq !== requestSeq.current) return;
      setRawResults(data);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setFetchError(err instanceof Error ? err.message : 'Error al cargar clubes');
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
      }
    }
  }, [filters.date, filters.cerramiento, filters.paredes, filters.sport]);

  useEffect(() => {
    search();
  }, [search]);

  const listResults = useMemo(
    () => filterByMaxDistance(rawResults, filters.maxDistanceKm),
    [rawResults, filters.maxDistanceKm],
  );

  const results = useMemo(
    () => decorateSearchCourtSlots(listResults, filters, { now: slotNow }),
    [
      listResults,
      filters.showUnavailable,
      filters.timeRange?.start,
      filters.timeRange?.end,
      filters.duration,
      filters.date,
      slotNow,
    ],
  );

  return {
    results,
    listResults,
    resultCount: listResults.length,
    loading,
    fetchError,
    refetch: search,
  };
}
