/**
 * Format a UTC instant as the wall-clock time it represents in `timezone`.
 * Returns ISO-like string "YYYY-MM-DDTHH:mm:ss" (no offset).
 */
export function formatInTimeZone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  // Some runtimes return "24" for midnight; normalize to "00".
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}`;
}

/**
 * Convert a wall-clock time (YYYY-MM-DDTHH:mm:ss) interpreted in `timezone`
 * into the corresponding UTC instant. Two-pass to handle DST transitions
 * correctly: each pass measures the drift between the guess (parsed as UTC)
 * and what that instant actually looks like in the target timezone, then
 * corrects by that drift.
 */
export function zonedTimeToUtc(localDateTime: string, timezone: string): Date {
  const parseAsUtc = (s: string) => new Date(s + 'Z');
  const targetMs = parseAsUtc(localDateTime).getTime();

  // First pass
  let guess = new Date(targetMs);
  let drift = parseAsUtc(formatInTimeZone(guess, timezone)).getTime() - targetMs;
  guess = new Date(targetMs - drift);

  // Second pass — needed when the first guess crosses a DST boundary
  drift = parseAsUtc(formatInTimeZone(guess, timezone)).getTime() - targetMs;
  guess = new Date(guess.getTime() - drift);

  return guess;
}

/**
 * Returns the local calendar day ("YYYY-MM-DD") for `date` in `timezone`.
 * Falls back to UTC date if the timezone string is invalid.
 */
export function dayKeyInTz(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Returns the day key immediately before `dayKey` ("YYYY-MM-DD" → "YYYY-MM-DD").
 * Date-only arithmetic via UTC is safe (no DST involved).
 */
export function previousDayKey(dayKey: string): string {
  const d = new Date(dayKey + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function getTodayRange(timezone: string): { start: string; end: string } {
  const now = new Date();
  const dateStr = dayKeyInTz(now, timezone);
  let timezoneIsValid = true;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
  } catch {
    timezoneIsValid = false;
  }
  if (!timezoneIsValid) {
    return { start: `${dateStr}T00:00:00.000Z`, end: `${dateStr}T23:59:59.999Z` };
  }
  const start = zonedTimeToUtc(`${dateStr}T00:00:00`, timezone).toISOString();
  const end = zonedTimeToUtc(`${dateStr}T23:59:59`, timezone).toISOString();
  return { start, end };
}

export function getCurrentWeekRange(timezone: string): { start: string; end: string } {
  const now = new Date();
  const dateStr = dayKeyInTz(now, timezone);
  const localDate = new Date(dateStr + 'T12:00:00Z');
  
  let dayOfWeek = localDate.getUTCDay();
  if (dayOfWeek === 0) dayOfWeek = 7; 
  
  const mondaySub = dayOfWeek - 1;
  const sundayAdd = 7 - dayOfWeek;
  
  const monday = new Date(localDate);
  monday.setUTCDate(monday.getUTCDate() - mondaySub);
  const mondayStr = monday.toISOString().slice(0, 10);
  
  const sunday = new Date(localDate);
  sunday.setUTCDate(sunday.getUTCDate() + sundayAdd);
  const sundayStr = sunday.toISOString().slice(0, 10);

  return {
    start: zonedTimeToUtc(`${mondayStr}T00:00:00`, timezone).toISOString(),
    end: zonedTimeToUtc(`${sundayStr}T23:59:59`, timezone).toISOString(),
  };
}
