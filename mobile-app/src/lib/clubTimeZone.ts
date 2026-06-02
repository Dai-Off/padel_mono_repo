export const CLUB_IANA_TIMEZONE = 'Europe/Madrid';

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

/** Convierte fecha+hora civil del club (Europe/Madrid) a ISO UTC. */
export function clubLocalDateTimeToUtcIso(dateStr: string, timeHHmm: string): string {
  const local = `${dateStr}T${timeHHmm.length === 5 ? `${timeHHmm}:00` : timeHHmm}`;
  const parseAsUtc = (s: string) => new Date(`${s}Z`);
  const targetMs = parseAsUtc(local).getTime();
  let guess = new Date(targetMs);
  let drift = parseAsUtc(formatInTimeZone(guess, CLUB_IANA_TIMEZONE)).getTime() - targetMs;
  guess = new Date(targetMs - drift);
  drift = parseAsUtc(formatInTimeZone(guess, CLUB_IANA_TIMEZONE)).getTime() - targetMs;
  return new Date(guess.getTime() - drift).toISOString();
}

export function dayKeyInClubTz(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLUB_IANA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Límites UTC de un día calendario del club (offset 0 = hoy en Madrid). */
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
