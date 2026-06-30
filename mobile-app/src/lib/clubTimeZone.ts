/** Zona por defecto alineada con el backend (`clubTimezoneOrDefault`). */
export const DEFAULT_CLUB_TIMEZONE = 'Europe/Madrid';

/** @deprecated Usar `clubIanaTimeZone()` o `DEFAULT_CLUB_TIMEZONE`. */
export const CLUB_IANA_TIMEZONE = DEFAULT_CLUB_TIMEZONE;

let activeClubTimeZone = DEFAULT_CLUB_TIMEZONE;

/** Fija la zona horaria del club cargado (registro en BD). */
export function setClubTimeZone(tz: string | null | undefined): void {
  if (typeof tz !== 'string') return;
  const t = tz.trim();
  if (!t) return;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: t }).format(new Date());
    activeClubTimeZone = t;
  } catch {
    // zona inválida: mantener la activa
  }
}

export function clubIanaTimeZone(): string {
  return activeClubTimeZone;
}

function formatInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}`;
}

/** Día calendario YYYY-MM-DD de `date` en una zona IANA concreta. */
export function dayKeyInTimeZone(date: Date, timeZone: string): string {
  const tz = timeZone?.trim() || activeClubTimeZone;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Convierte fecha+hora civil en una zona IANA concreta a ISO UTC. */
export function zonedLocalDateTimeToUtcIso(
  dateStr: string,
  timeHHmm: string,
  timeZone: string,
): string {
  const tz = timeZone?.trim() || activeClubTimeZone;
  const local = `${dateStr}T${timeHHmm.length === 5 ? `${timeHHmm}:00` : timeHHmm}`;
  const parseAsUtc = (s: string) => new Date(`${s}Z`);
  const targetMs = parseAsUtc(local).getTime();
  let guess = new Date(targetMs);
  let drift = parseAsUtc(formatInTimeZone(guess, tz)).getTime() - targetMs;
  guess = new Date(targetMs - drift);
  drift = parseAsUtc(formatInTimeZone(guess, tz)).getTime() - targetMs;
  return new Date(guess.getTime() - drift).toISOString();
}

/**
 * Convierte fecha+hora civil a ISO UTC en la zona indicada (o la del club activo).
 * Para reservas siempre pasá `clubs.timezone`.
 */
export function clubLocalDateTimeToUtcIso(
  dateStr: string,
  timeHHmm: string,
  timeZone: string = activeClubTimeZone,
): string {
  return zonedLocalDateTimeToUtcIso(dateStr, timeHHmm, timeZone);
}

export function dayKeyInClubTz(date: Date = new Date()): string {
  return dayKeyInTimeZone(date, activeClubTimeZone);
}

/** Límites UTC de un día calendario del club (offset 0 = hoy en la zona del club). */
export function clubCalendarDayBounds(dayOffsetFromToday: number): {
  dayKey: string;
  dateFrom: string;
  dateTo: string;
} {
  const todayKey = dayKeyInClubTz(new Date());
  const dayKey = addDaysToClubKey(todayKey, dayOffsetFromToday);
  return {
    dayKey,
    dateFrom: clubLocalDateTimeToUtcIso(dayKey, '00:00'),
    dateTo: clubLocalDateTimeToUtcIso(dayKey, '23:59'),
  };
}

export function addDaysToClubKey(baseKey: string, days: number): string {
  const [y, m, d] = baseKey.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Etiqueta de fecha/hora para tarjetas de partido (zona del club o la de la reserva). */
export function formatPartidoDateTimeLabel(
  startAtIso: string,
  timeZone?: string | null,
): string {
  const start = new Date(startAtIso);
  if (Number.isNaN(start.getTime())) return '—';
  const tz = timeZone?.trim() || activeClubTimeZone;
  const weekday = new Intl.DateTimeFormat('es-ES', {
    timeZone: tz,
    weekday: 'long',
  }).format(start);
  const day = new Intl.DateTimeFormat('es-ES', {
    timeZone: tz,
    day: 'numeric',
  }).format(start);
  const month = new Intl.DateTimeFormat('es-ES', {
    timeZone: tz,
    month: 'long',
  }).format(start);
  const time = new Intl.DateTimeFormat('es-ES', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(start);
  return `${weekday}, ${day} de ${month} · ${time}`;
}

export function clubLocalMinutesFromIso(iso: string, timeZone?: string | null): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const tz = timeZone?.trim() || activeClubTimeZone;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const h = parseInt(parts.find((x) => x.type === 'hour')?.value ?? '0', 10);
  const m = parseInt(parts.find((x) => x.type === 'minute')?.value ?? '0', 10);
  return h * 60 + m;
}
