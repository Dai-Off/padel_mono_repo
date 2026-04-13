import { toDateStringLocal } from '../utils/dateLocal';

/**
 * Instante local de inicio de franja `HH:00` o `HH:mm` en un día calendario `YYYY-MM-DD` (local).
 */
export function localSlotStart(calendarDateStr: string, slot: string): Date {
  const [yy, mm, dd] = calendarDateStr.split('-').map(Number);
  const [hh, min = 0] = slot.split(':').map(Number);
  return new Date(yy, mm - 1, dd, hh, min, 0, 0);
}

/**
 * Si `calendarDateStr` es hoy en el dispositivo, elimina franjas cuyo inicio ya pasó respecto a `now`.
 * Otros días: devuelve slots ordenados sin recortar.
 */
export function filterSlotsStartingAfterNow(
  calendarDateStr: string,
  slots: string[],
  now: Date = new Date(),
): string[] {
  const sorted = [...slots].sort((a, b) => a.localeCompare(b));
  if (calendarDateStr !== toDateStringLocal(now)) {
    return sorted;
  }
  const t = now.getTime();
  return sorted.filter((s) => localSlotStart(calendarDateStr, s).getTime() > t);
}
