/** Respaldo si el dispositivo no expone su zona horaria. */
const FALLBACK_TIMEZONE = 'Europe/Madrid';

function detectDeviceTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.trim() ? tz.trim() : FALLBACK_TIMEZONE;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

/**
 * Zona horaria usada para las operaciones del club. Se detecta automáticamente
 * desde el dispositivo (no se fuerza una zona fija); el jugador está en la
 * ciudad del club, así que coincide con la zona horaria del club. Si el runtime
 * no la expone, cae a un respaldo válido.
 */
export const CLUB_IANA_TIMEZONE = detectDeviceTimeZone();

export function clubIanaTimeZone(): string {
  return CLUB_IANA_TIMEZONE;
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

/** Convierte fecha+hora civil en una zona IANA concreta a ISO UTC. */
export function zonedLocalDateTimeToUtcIso(
  dateStr: string,
  timeHHmm: string,
  timeZone: string,
): string {
  const tz = timeZone?.trim() || CLUB_IANA_TIMEZONE;
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
 * Convierte fecha+hora civil a ISO UTC. Por defecto usa la zona del dispositivo;
 * para reservas pasá la zona del club (`clubs.timezone`) para que coincida con el backend.
 */
export function clubLocalDateTimeToUtcIso(
  dateStr: string,
  timeHHmm: string,
  timeZone: string = CLUB_IANA_TIMEZONE,
): string {
  return zonedLocalDateTimeToUtcIso(dateStr, timeHHmm, timeZone);
}

export function dayKeyInClubTz(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLUB_IANA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Límites UTC de un día calendario del club (offset 0 = hoy en la zona del club). */
export function clubCalendarDayBounds(dayOffsetFromToday: number): {
  dayKey: string;
  dateFrom: string;
  dateTo: string;
} {
  const todayKey = dayKeyInClubTz(new Date());
  const [y, m, d] = todayKey.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d + dayOffsetFromToday));
  const dayKey = target.toISOString().slice(0, 10);
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

/** Hora civil del club (HH:mm) como minutos desde medianoche. */
/** Etiqueta de fecha/hora para tarjetas de partido (hora local del club/dispositivo). */
export function formatPartidoDateTimeLabel(startAtIso: string): string {
  const start = new Date(startAtIso);
  if (Number.isNaN(start.getTime())) return '—';
  const weekday = new Intl.DateTimeFormat('es-ES', {
    timeZone: CLUB_IANA_TIMEZONE,
    weekday: 'long',
  }).format(start);
  const day = new Intl.DateTimeFormat('es-ES', {
    timeZone: CLUB_IANA_TIMEZONE,
    day: 'numeric',
  }).format(start);
  const month = new Intl.DateTimeFormat('es-ES', {
    timeZone: CLUB_IANA_TIMEZONE,
    month: 'long',
  }).format(start);
  const time = new Intl.DateTimeFormat('es-ES', {
    timeZone: CLUB_IANA_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(start);
  return `${weekday}, ${day} de ${month} · ${time}`;
}

export function clubLocalMinutesFromIso(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLUB_IANA_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const h = parseInt(parts.find((x) => x.type === 'hour')?.value ?? '0', 10);
  const m = parseInt(parts.find((x) => x.type === 'minute')?.value ?? '0', 10);
  return h * 60 + m;
}
