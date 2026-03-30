import type { SearchCourtResult } from '../api/search';

export type SearchClubGroup = {
  representative: SearchCourtResult;
  courtCount: number;
};

/** Una fila por club: representante para abrir detalle y número de pistas en el club. */
export function aggregateCourtsByClub(courts: SearchCourtResult[]): SearchClubGroup[] {
  const map = new Map<string, SearchCourtResult[]>();
  for (const c of courts) {
    const arr = map.get(c.clubId) ?? [];
    arr.push(c);
    map.set(c.clubId, arr);
  }
  const groups: SearchClubGroup[] = [];
  for (const [, group] of map) {
    groups.push({
      representative: pickRepresentativeCourt(group),
      courtCount: group.length,
    });
  }
  groups.sort((a, b) => {
    const da = a.representative.distanceKm ?? Infinity;
    const db = b.representative.distanceKm ?? Infinity;
    if (da !== db) return da - db;
    return a.representative.clubName.localeCompare(b.representative.clubName, 'es');
  });
  return groups;
}

function pickRepresentativeCourt(group: SearchCourtResult[]): SearchCourtResult {
  const sortedByDist = [...group].sort((a, b) => {
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
