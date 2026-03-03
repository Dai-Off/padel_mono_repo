import { useCallback, useEffect, useState } from 'react';
import { fetchSearchCourts, type SearchCourtResult } from '../api/search';
import type { SearchFiltersState } from '../components/search/SearchFiltersSheet';

export function useSearchCourts(filters: SearchFiltersState) {
  const [results, setResults] = useState<SearchCourtResult[]>([]);
  const [loading, setLoading] = useState(true);

  const search = useCallback(async () => {
    setLoading(true);
    try {
      const dateFrom =
        filters.date?.toISOString().slice(0, 10) ??
        new Date().toISOString().slice(0, 10);
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
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [filters.date, filters.cerramiento, filters.paredes]);

  useEffect(() => {
    search();
  }, [search]);

  return { results, resultCount: results.length, loading };
}
