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

/** Horas de inicio con N franjas libres consecutivas de 1 h (como devuelve /search/courts). */
function slotStartsWithConsecutiveHours(slots: string[], neededSlots: number): string[] {
  if (neededSlots <= 1) return slots;
  const minSet = new Set(slots.map(slotToMinutes));
  return slots.filter((slot) => {
    const start = slotToMinutes(slot);
    for (let i = 0; i < neededSlots; i += 1) {
      if (!minSet.has(start + i * 60)) return false;
    }
    return true;
  });
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

/**
 * Ajusta `timeSlots` para las tarjetas de club. **Nunca elimina pistas/clubes** del listado.
 * `showUnavailable: true` → franjas sin filtrar por duración/hora (solo oculta horas ya pasadas hoy).
 */
export function decorateSearchCourtSlots(
  courts: SearchCourtResult[],
  filters: SearchFiltersState,
  options?: { now?: Date },
): SearchCourtResult[] {
  const now = options?.now ?? new Date();
  const calendarKey =
    filters.date != null ? toDateStringLocal(filters.date) : toDateStringLocal(now);
  const needed = neededSlotsForDurationMinutes(filters.duration);
  const strictSlots = !filters.showUnavailable;

  return courts.map((c) => {
    let slots = [...(c.timeSlots ?? [])];
    slots = filterSlotsStartingAfterNow(calendarKey, slots, now);
    if (strictSlots) {
      if (filters.timeRange) {
        slots = slotsInTimeRange(slots, filters.timeRange.start, filters.timeRange.end);
      }
      slots = slotStartsWithConsecutiveHours(slots, needed);
    }
    return { ...c, timeSlots: slots };
  });
}

/** @deprecated Usar decorateSearchCourtSlots */
export const applySearchCourtFilters = decorateSearchCourtSlots;
