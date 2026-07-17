import { dayKeyInTz, zonedTimeToUtc } from '../routes/learningTimezone';

export type MissionPeriodKind = 'daily' | 'weekly' | 'monthly';

export type MissionPeriod = {
  kind: MissionPeriodKind;
  /** Local period start day ("YYYY-MM-DD") — the assignment key in player_season_pass_missions. */
  period_start: string;
  /** Local day right AFTER the period ends (exclusive bound for date columns). */
  period_end_exclusive: string;
  /** UTC instant range for timestamptz filters: [start_iso, end_iso). */
  start_iso: string;
  end_iso: string;
};

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Date-only arithmetic on "YYYY-MM-DD" keys (UTC-based, DST-free). */
export function addDaysToKey(key: string, days: number): string {
  const d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function mondayKeyOf(dayKey: string): string {
  const dow = new Date(dayKey + 'T00:00:00Z').getUTCDay(); // 0=Sun..6=Sat
  return addDaysToKey(dayKey, dow === 0 ? -6 : 1 - dow);
}

function firstOfMonthKey(dayKey: string): string {
  return dayKey.slice(0, 8) + '01';
}

function firstOfNextMonthKey(dayKey: string): string {
  const d = new Date(dayKey.slice(0, 8) + '01T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function utcRange(
  startKey: string,
  endKeyExclusive: string,
  tz: string
): { start_iso: string; end_iso: string } {
  if (!isValidTimezone(tz)) {
    return {
      start_iso: `${startKey}T00:00:00.000Z`,
      end_iso: `${endKeyExclusive}T00:00:00.000Z`,
    };
  }
  return {
    start_iso: zonedTimeToUtc(`${startKey}T00:00:00`, tz).toISOString(),
    end_iso: zonedTimeToUtc(`${endKeyExclusive}T00:00:00`, tz).toISOString(),
  };
}

function boundsFor(kind: MissionPeriodKind, startKey: string): { start: string; end: string } {
  if (kind === 'daily') return { start: startKey, end: addDaysToKey(startKey, 1) };
  if (kind === 'weekly') return { start: startKey, end: addDaysToKey(startKey, 7) };
  return { start: startKey, end: firstOfNextMonthKey(startKey) };
}

/** Current period for the player's timezone (day / ISO week starting Monday / calendar month). */
export function currentPeriod(kind: MissionPeriodKind, tz: string, now: Date = new Date()): MissionPeriod {
  const safeTz = isValidTimezone(tz) ? tz : 'UTC';
  const todayKey = dayKeyInTz(now, safeTz);
  const startKey =
    kind === 'daily' ? todayKey : kind === 'weekly' ? mondayKeyOf(todayKey) : firstOfMonthKey(todayKey);
  const { start, end } = boundsFor(kind, startKey);
  const range = utcRange(start, end, safeTz);
  return { kind, period_start: start, period_end_exclusive: end, ...range };
}

/** Rebuild the period of an existing assignment row from its stored period_start. */
export function periodForRow(kind: MissionPeriodKind, periodStartKey: string, tz: string): MissionPeriod {
  const { start, end } = boundsFor(kind, periodStartKey);
  const range = utcRange(start, end, isValidTimezone(tz) ? tz : 'UTC');
  return { kind, period_start: start, period_end_exclusive: end, ...range };
}
