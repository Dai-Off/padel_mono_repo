/** Zona horaria del club (España: Europe/Madrid, CET/CEST). */
export const CLUB_IANA_TIMEZONE = 'Europe/Madrid';

/** @deprecated Usar clubIanaTimeZone — siempre devuelve Europe/Madrid para operaciones del club. */
export function browserIanaTimeZone(): string {
  return clubIanaTimeZone();
}

export function clubIanaTimeZone(): string {
  return CLUB_IANA_TIMEZONE;
}

export function formatInClubTimeZone(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLUB_IANA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}`;
}

export function zonedTimeToUtc(localDateTime: string, timeZone: string = CLUB_IANA_TIMEZONE): Date {
  const parseAsUtc = (s: string) => new Date(`${s}Z`);
  const targetMs = parseAsUtc(localDateTime).getTime();
  let guess = new Date(targetMs);
  let drift = parseAsUtc(formatInTimeZone(guess, timeZone)).getTime() - targetMs;
  guess = new Date(targetMs - drift);
  drift = parseAsUtc(formatInTimeZone(guess, timeZone)).getTime() - targetMs;
  return new Date(guess.getTime() - drift);
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
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}`;
}

export function formatTimeHHmmInClubTz(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '00:00';
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: CLUB_IANA_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function dayKeyInClubTz(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLUB_IANA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function nowMinutesInClubTz(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLUB_IANA_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

export function clubClockLabel(): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: CLUB_IANA_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());
}

export type DayOperatingHours = {
  startHour: number;
  endHour: number;
  openMin: number;
  closeMin: number;
  closed: boolean;
};

function parseClockToMinutes(raw: unknown): number | null {
  if (raw == null) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(raw).trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function weekdayCodeForDateStr(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const short = new Intl.DateTimeFormat('en-US', { timeZone: CLUB_IANA_TIMEZONE, weekday: 'short' }).format(d);
  const map: Record<string, string> = {
    Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun',
  };
  return map[short] ?? 'mon';
}

export function gridBoundsForClubDay(weeklySchedule: unknown, dateStr: string): DayOperatingHours {
  const weekday = weekdayCodeForDateStr(dateStr);
  const ws = weeklySchedule && typeof weeklySchedule === 'object'
    ? (weeklySchedule as Record<string, unknown>)
    : {};
  const entry = ws[weekday] ?? ws[{ sun: '0', mon: '1', tue: '2', wed: '3', thu: '4', fri: '5', sat: '6' }[weekday] as string];

  let openMin = 7 * 60;
  let closeMin = 23 * 60;
  let closed = false;

  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    const obj = entry as Record<string, unknown>;
    if (obj.closed === true || obj.is_closed === true) closed = true;
    const o = parseClockToMinutes(obj.open ?? obj.open_time ?? obj.start);
    const c = parseClockToMinutes(obj.close ?? obj.close_time ?? obj.end);
    if (o != null) openMin = o;
    if (c != null) closeMin = c;
  } else if (typeof entry === 'string' && entry.includes('-')) {
    const [a, b] = entry.split(/[-–—]/).map((x) => x.trim());
    const o = parseClockToMinutes(a);
    const c = parseClockToMinutes(b);
    if (o != null) openMin = o;
    if (c != null) closeMin = c;
  }

  if (closeMin <= openMin) {
    openMin = 7 * 60;
    closeMin = 23 * 60;
  }

  return {
    openMin,
    closeMin,
    closed,
    startHour: Math.floor(openMin / 60),
    endHour: Math.ceil(closeMin / 60),
  };
}
