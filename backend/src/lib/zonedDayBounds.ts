/**
 * Límites de día civil en una zona IANA, como instantes UTC ISO para consultas timestamptz.
 */

export function ymdInTimeZone(utcMs: number, timeZone: string): { y: number; m: number; d: number } {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = f.formatToParts(new Date(utcMs));
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const d = Number(parts.find((p) => p.type === 'day')?.value);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error(`Invalid zoned date parts for timeZone=${timeZone}`);
  }
  return { y, m, d };
}

function dayKey(y: number, m: number, d: number): number {
  return y * 10_000 + m * 100 + d;
}

/** Menor instante UTC en el que la fecha civil en `timeZone` coincide con dateStr (YYYY-MM-DD). */
export function startOfZonedDayUtcIso(dateStr: string, timeZone: string): string {
  const [Y, M, D] = dateStr.split('-').map((x) => Number(x));
  if (!Y || !M || !D) throw new Error(`Invalid dateStr: ${dateStr}`);
  const target = dayKey(Y, M, D);
  let lo = Date.UTC(Y, M - 1, D - 1, 8, 0, 0);
  let hi = Date.UTC(Y, M - 1, D + 1, 16, 0, 0);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const { y, m, d } = ymdInTimeZone(mid, timeZone);
    const midKey = dayKey(y, m, d);
    if (midKey < target) lo = mid + 1;
    else hi = mid;
  }
  return new Date(lo).toISOString();
}

export function nextCalendarDateStr(dateStr: string): string {
  const [Y, M, D] = dateStr.split('-').map((x) => Number(x));
  const dt = new Date(Date.UTC(Y, M - 1, D));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function zonedDayRangeUtcIso(dateStr: string, timeZone: string): { start: string; endExclusive: string } {
  const start = startOfZonedDayUtcIso(dateStr, timeZone);
  const endExclusive = startOfZonedDayUtcIso(nextCalendarDateStr(dateStr), timeZone);
  return { start, endExclusive };
}
