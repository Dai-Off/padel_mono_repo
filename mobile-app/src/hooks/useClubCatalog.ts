import { useCallback, useEffect, useState } from 'react';
import { fetchSearchCourts, type SearchCourtResult } from '../api/search';
import { toDateStringLocal } from '../utils/dateLocal';

export type ClubCatalogItem = {
  id: string;
  name: string;
  city: string;
  address: string;
  distanceKm: number | null;
  imageUrl: string | null;
  sports: Set<string>;
  hasIndoor: boolean;
  hasOutdoor: boolean;
};

function buildCatalog(results: SearchCourtResult[]): ClubCatalogItem[] {
  const map = new Map<string, ClubCatalogItem>();
  for (const r of results) {
    const sport = (r.sport ?? 'padel').toLowerCase();
    const existing = map.get(r.clubId);
    if (existing) {
      existing.sports.add(sport);
      if (r.indoor) existing.hasIndoor = true;
      else existing.hasOutdoor = true;
      if (
        r.distanceKm != null &&
        (existing.distanceKm == null || r.distanceKm < existing.distanceKm)
      ) {
        existing.distanceKm = r.distanceKm;
      }
      continue;
    }
    map.set(r.clubId, {
      id: r.clubId,
      name: r.clubName,
      city: r.city,
      address: r.address,
      distanceKm: r.distanceKm,
      imageUrl: r.imageUrl,
      sports: new Set([sport]),
      hasIndoor: !!r.indoor,
      hasOutdoor: !r.indoor,
    });
  }
  return [...map.values()].sort((a, b) => {
    const da = a.distanceKm ?? Infinity;
    const db = b.distanceKm ?? Infinity;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name, 'es');
  });
}

export function useClubCatalog() {
  const [clubs, setClubs] = useState<ClubCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const today = toDateStringLocal(now);
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = toDateStringLocal(tomorrow);
      const [todayRows, tomorrowRows] = await Promise.all([
        fetchSearchCourts({ dateFrom: today, dateTo: today }),
        fetchSearchCourts({ dateFrom: tomorrowStr, dateTo: tomorrowStr }),
      ]);
      setClubs(buildCatalog([...todayRows, ...tomorrowRows]));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los clubes');
      setClubs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { clubs, loading, error, reload };
}
