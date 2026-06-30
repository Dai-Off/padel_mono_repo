import { clubLocalDateTimeToUtcIso } from '../lib/clubTimeZone';
import { toDateStringLocal } from '../utils/dateLocal';

function normalizeSlotTime(slot: string): string {
  if (slot.includes('T')) {
    const t = slot.slice(11, 16);
    if (t.length === 5) return t;
  }
  const [hh = '00', mm = '00'] = slot.split(':');
  return `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`;
}

/**
 * Instante UTC de inicio de una franja en el día calendario del club.
 * `clubTimezone` debe ser la zona del club; si no se pasa, se usa la del dispositivo.
 */
export function localSlotStartUtcMs(
  calendarDateStr: string,
  slot: string,
  options?: { clubTimezone?: string; startAtUtc?: string },
): number {
  if (options?.startAtUtc) {
    return new Date(options.startAtUtc).getTime();
  }
  const time = normalizeSlotTime(slot);
  const tz = options?.clubTimezone;
  return new Date(
    tz
      ? clubLocalDateTimeToUtcIso(calendarDateStr, time, tz)
      : clubLocalDateTimeToUtcIso(calendarDateStr, time),
  ).getTime();
}

/**
 * Si `calendarDateStr` es hoy en el dispositivo, elimina franjas cuyo inicio ya pasó
 * respecto al reloj actual (`now`). Usa `startAtUtc` de la API cuando está disponible.
 */
export function filterSlotsStartingAfterNow(
  calendarDateStr: string,
  slots: string[],
  now: Date = new Date(),
  options?: {
    clubTimezone?: string;
    startAtUtcByTime?: Record<string, string>;
  },
): string[] {
  const sorted = [...slots].sort((a, b) =>
    normalizeSlotTime(a).localeCompare(normalizeSlotTime(b)),
  );
  const todayOnDevice = toDateStringLocal(now);
  if (calendarDateStr !== todayOnDevice) {
    return sorted;
  }
  const t = now.getTime();
  return sorted.filter((s) => {
    const time = normalizeSlotTime(s);
    const startMs = localSlotStartUtcMs(calendarDateStr, time, {
      clubTimezone: options?.clubTimezone,
      startAtUtc: options?.startAtUtcByTime?.[time],
    });
    return startMs > t;
  });
}
