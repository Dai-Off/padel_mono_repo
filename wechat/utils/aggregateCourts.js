/**
 * Port de mobile-app/src/domain/aggregateCourtsByClub.ts
 * @param {Array<Record<string, unknown>>} courts
 */
function pickRepresentativeCourt(group) {
  const sortedByDist = group.slice().sort((a, b) => {
    const da = a.distanceKm != null ? a.distanceKm : Infinity;
    const db = b.distanceKm != null ? b.distanceKm : Infinity;
    if (da !== db) return da - db;
    return a.minPriceCents - b.minPriceCents;
  });
  const base = sortedByDist[0];
  const minPrice = Math.min.apply(
    null,
    group.map((c) => c.minPriceCents)
  );
  const cheapest = group.find((c) => c.minPriceCents === minPrice) || base;
  const slotSet = new Set();
  for (let i = 0; i < group.length; i += 1) {
    const c = group[i];
    const slots = c.timeSlots || [];
    for (let j = 0; j < slots.length; j += 1) slotSet.add(slots[j]);
  }
  const timeSlots = Array.from(slotSet).sort();
  return Object.assign({}, base, {
    minPriceCents: minPrice,
    minPriceFormatted: cheapest.minPriceFormatted,
    timeSlots,
  });
}

function aggregateCourtsByClub(courts) {
  const map = new Map();
  for (let i = 0; i < courts.length; i += 1) {
    const c = courts[i];
    const id = c.clubId;
    const arr = map.get(id) || [];
    arr.push(c);
    map.set(id, arr);
  }
  const groups = [];
  map.forEach((group) => {
    groups.push({
      representative: pickRepresentativeCourt(group),
      courtCount: group.length,
    });
  });
  groups.sort((a, b) => {
    const da = a.representative.distanceKm != null ? a.representative.distanceKm : Infinity;
    const db = b.representative.distanceKm != null ? b.representative.distanceKm : Infinity;
    if (da !== db) return da - db;
    return String(a.representative.clubName).localeCompare(String(b.representative.clubName), 'es');
  });
  return groups;
}

module.exports = { aggregateCourtsByClub };
