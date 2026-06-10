import { clubLocalDateTimeToUtcIso, dayKeyInClubTz } from '../lib/clubTimeZone';

/**
 * Instante local de inicio de franja `HH:00` o `HH:mm` en un día calendario `YYYY-MM-DD` (local).
 */
export function localSlotStart(calendarDateStr: string, slot: string): Date {
  const time = normalizeSlotTime(slot);
  return new Date(clubLocalDateTimeToUtcIso(calendarDateStr, time));
}

function normalizeSlotTime(slot: string): string {
  if (slot.includes('T')) {
    const t = slot.slice(11, 16);
    if (t.length === 5) return t;
  }
  const [hh = '00', mm = '00'] = slot.split(':');
  return `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`;
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
  const sorted = [...slots].sort((a, b) => normalizeSlotTime(a).localeCompare(normalizeSlotTime(b)));
  const todayInClub = dayKeyInClubTz(now);
  if (calendarDateStr !== todayInClub) {
    return sorted;
  }
  const t = now.getTime();
  return sorted.filter((s) => localSlotStart(calendarDateStr, s).getTime() > t);
}
