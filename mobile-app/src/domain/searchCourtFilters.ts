import type { SearchCourtResult } from '../api/search';
import type { SearchFiltersState } from '../components/search/SearchFiltersSheet';
import { filterSlotsStartingAfterNow } from './localSlotAvailability';
import { toDateStringLocal } from '../utils/dateLocal';

function slotToMinutes(slot: string): number {
  const [h, m = '0'] = slot.split(':');
  const hh = parseInt(h, 10);
  const mm = parseInt(m, 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return 0;
  return hh * 60 + mm;
}

/** N franjas libres consecutivas de 1 h (como devuelve /search/courts). */
function hasConsecutiveHourSlots(slots: string[], neededSlots: number): boolean {
  if (neededSlots <= 0) return true;
  const mins = [...new Set(slots.map(slotToMinutes))].sort((a, b) => a - b);
  if (neededSlots === 1) return mins.length > 0;
  let run = 1;
  for (let i = 1; i < mins.length; i += 1) {
    if (mins[i] === mins[i - 1] + 60) {
      run += 1;
      if (run >= neededSlots) return true;
    } else {
      run = 1;
    }
  }
  return run >= neededSlots;
}

function slotsInTimeRange(slots: string[], start: string, end: string): string[] {
  const s = slotToMinutes(start);
  const e = slotToMinutes(end);
  return slots.filter((slot) => {
    const m = slotToMinutes(slot);
    return m >= s && m < e;
  });
}

function neededSlotsForDurationMinutes(duration: number): number {
  return Math.max(1, Math.ceil(duration / 60));
}

const DEFAULT_MAX_DISTANCE_KM = 50;

/**
 * Post-filtrado local de resultados de /search/courts (la API solo filtra fecha, indoor, cristal).
 * `now` en hora local del dispositivo: para el día de búsqueda que sea «hoy», oculta franjas ya pasadas.
 */
export function applySearchCourtFilters(
  courts: SearchCourtResult[],
  filters: SearchFiltersState,
  options?: { now?: Date },
): SearchCourtResult[] {
  const now = options?.now ?? new Date();
  const calendarKey =
    filters.date != null ? toDateStringLocal(filters.date) : toDateStringLocal(now);
  const needed = neededSlotsForDurationMinutes(filters.duration);

  let out = courts.map((c) => ({ ...c, timeSlots: [...(c.timeSlots ?? [])] }));

  out = out.map((c) => {
    let slots = filterSlotsStartingAfterNow(calendarKey, c.timeSlots, now);
    if (filters.timeRange) {
      slots = slotsInTimeRange(slots, filters.timeRange.start, filters.timeRange.end);
    }
    return { ...c, timeSlots: slots };
  });

  out = out.filter((c) => {
    const fitsDuration = hasConsecutiveHourSlots(c.timeSlots, needed);
    if (fitsDuration) return true;
    if (filters.showUnavailable) {
      return true;
    }
    return false;
  });

  out = out.map((c) => {
    if (!hasConsecutiveHourSlots(c.timeSlots, needed) && filters.showUnavailable) {
      return { ...c, timeSlots: [] };
    }
    return c;
  });

  const maxKm = filters.maxDistanceKm;
  if (maxKm < DEFAULT_MAX_DISTANCE_KM) {
    out = out.filter((c) => c.distanceKm == null || c.distanceKm <= maxKm);
  }

  if (filters.sport && filters.sport !== 'padel') {
    return [];
  }

  return out;
}
