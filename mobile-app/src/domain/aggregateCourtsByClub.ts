import type { SearchCourtResult } from '../api/search';

export type SearchClubGroup = {
  representative: SearchCourtResult;
  courtCount: number;
};

export type AggregateCourtsSortBy = 'distancia' | 'precio';

/** Una fila por club: representante para abrir detalle y número de pistas en el club. */
export function aggregateCourtsByClub(
  courts: SearchCourtResult[],
  options?: { sortBy?: AggregateCourtsSortBy },
): SearchClubGroup[] {
  const sortBy = options?.sortBy ?? 'distancia';
  const map = new Map<string, SearchCourtResult[]>();
  for (const c of courts) {
    const arr = map.get(c.clubId) ?? [];
    arr.push(c);
    map.set(c.clubId, arr);
  }
  const groups: SearchClubGroup[] = [];
  for (const [, group] of map) {
    groups.push({
      representative: pickRepresentativeCourt(group, sortBy),
      courtCount: group.length,
    });
  }
  groups.sort((a, b) => {
    if (sortBy === 'precio') {
      const pa = a.representative.minPriceCents;
      const pb = b.representative.minPriceCents;
      if (pa !== pb) return pa - pb;
      return a.representative.clubName.localeCompare(b.representative.clubName, 'es');
    }
    const da = a.representative.distanceKm ?? Infinity;
    const db = b.representative.distanceKm ?? Infinity;
    if (da !== db) return da - db;
    return a.representative.clubName.localeCompare(b.representative.clubName, 'es');
  });
  return groups;
}

function pickRepresentativeCourt(
  group: SearchCourtResult[],
  sortBy: AggregateCourtsSortBy,
): SearchCourtResult {
  const sortedByDist = [...group].sort((a, b) => {
    if (sortBy === 'precio') {
      if (a.minPriceCents !== b.minPriceCents) return a.minPriceCents - b.minPriceCents;
      const da = a.distanceKm ?? Infinity;
      const db = b.distanceKm ?? Infinity;
      if (da !== db) return da - db;
      return a.courtName.localeCompare(b.courtName, 'es');
    }
    const da = a.distanceKm ?? Infinity;
    const db = b.distanceKm ?? Infinity;
    if (da !== db) return da - db;
    return a.minPriceCents - b.minPriceCents;
  });
  const base = sortedByDist[0]!;
  const minPrice = Math.min(...group.map((c) => c.minPriceCents));
  const cheapest = group.find((c) => c.minPriceCents === minPrice) ?? base;
  const slotSet = new Set<string>();
  for (const c of group) {
    for (const s of c.timeSlots) slotSet.add(s);
  }
  const timeSlots = [...slotSet].sort();
  return {
    ...base,
    minPriceCents: minPrice,
    minPriceFormatted: cheapest.minPriceFormatted,
    timeSlots,
  };
}
