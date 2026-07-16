import type { SupabaseClient } from '@supabase/supabase-js';
import { dayKeyInTz, formatInTimeZone, zonedTimeToUtc } from '../routes/learningTimezone';
import { clubTimezoneOrDefault } from './clubTimezone';

export type DayOperatingHours = {
  openMin: number;
  closeMin: number;
  closed: boolean;
};

const WEEKDAY_CODES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type WeekdayCode = (typeof WEEKDAY_CODES)[number];

const NUM_TO_WEEKDAY: Record<string, WeekdayCode> = {
  '0': 'sun',
  '1': 'mon',
  '2': 'tue',
  '3': 'wed',
  '4': 'thu',
  '5': 'fri',
  '6': 'sat',
};

const DEFAULT_OPEN_MIN = 7 * 60;
const DEFAULT_CLOSE_MIN = 23 * 60;

export function parseClockToMinutes(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function minutesToClock(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export type WeeklyScheduleEntry = { open: string; close: string; closed: boolean };

/**
 * Construye un horario semanal uniforme (mismos open/close para los 7 días) a
 * partir de una franja única (ej. alta de club: "08:00"–"20:00"). Las claves
 * mon..sun coinciden con las que esperan el editor del panel y
 * resolveDayOperatingHours. Devuelve null si la franja es inválida, para que el
 * llamador pueda omitir el campo y dejar el default de la columna.
 */
export function buildUniformWeeklySchedule(
  openTime: unknown,
  closeTime: unknown,
): Record<string, WeeklyScheduleEntry> | null {
  const openMin = parseClockToMinutes(openTime);
  const closeMin = parseClockToMinutes(closeTime);
  if (openMin == null || closeMin == null || closeMin <= openMin) return null;
  const open = minutesToClock(openMin);
  const close = minutesToClock(closeMin);
  const out: Record<string, WeeklyScheduleEntry> = {};
  for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const) {
    out[day] = { open, close, closed: false };
  }
  return out;
}

export function weekdayCodeInTz(isoUtc: string, timeZone: string): WeekdayCode {
  const d = new Date(isoUtc);
  const short = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(d);
  const map: Record<string, WeekdayCode> = {
    Mon: 'mon',
    Tue: 'tue',
    Wed: 'wed',
    Thu: 'thu',
    Fri: 'fri',
    Sat: 'sat',
    Sun: 'sun',
  };
  return map[short] ?? 'mon';
}

/** Día de la semana (`mon`..`sun`) para una fecha civil YYYY-MM-DD en la zona del club. */
export function weekdayCodeForCalendarDate(dateStr: string, timeZone: string): WeekdayCode {
  const tz = clubTimezoneOrDefault(timeZone);
  const noonUtc = zonedTimeToUtc(`${dateStr}T12:00:00`, tz);
  return weekdayCodeInTz(noonUtc.toISOString(), tz);
}

function readDayEntry(weeklySchedule: unknown, weekday: WeekdayCode): unknown {
  if (!weeklySchedule || typeof weeklySchedule !== 'object') return null;
  const ws = weeklySchedule as Record<string, unknown>;
  if (weekday in ws) return ws[weekday];
  const idx = WEEKDAY_CODES.indexOf(weekday);
  if (idx >= 0 && String(idx) in ws) return ws[String(idx)];
  // Horario guardado como ISO 1=lun … 7=dom (ClubSettings)
  const isoKey = weekday === 'sun' ? '7' : idx > 0 ? String(idx) : null;
  if (isoKey && isoKey in ws) return ws[isoKey];
  return null;
}

export function resolveDayOperatingHours(
  weeklySchedule: unknown,
  weekday: WeekdayCode,
): DayOperatingHours {
  const entry = readDayEntry(weeklySchedule, weekday);
  if (entry == null) {
    return { openMin: DEFAULT_OPEN_MIN, closeMin: DEFAULT_CLOSE_MIN, closed: false };
  }
  if (typeof entry === 'string') {
    const parts = entry.split(/[-–—]/).map((p) => p.trim());
    const openMin = parseClockToMinutes(parts[0]);
    const closeMin = parseClockToMinutes(parts[1]);
    if (openMin == null || closeMin == null || closeMin <= openMin) {
      return { openMin: DEFAULT_OPEN_MIN, closeMin: DEFAULT_CLOSE_MIN, closed: false };
    }
    return { openMin, closeMin, closed: false };
  }
  if (typeof entry === 'object' && !Array.isArray(entry)) {
    const obj = entry as Record<string, unknown>;
    if (obj.closed === true || obj.is_closed === true) {
      return { openMin: DEFAULT_OPEN_MIN, closeMin: DEFAULT_CLOSE_MIN, closed: true };
    }
    const openMin =
      parseClockToMinutes(obj.open ?? obj.open_time ?? obj.start) ?? DEFAULT_OPEN_MIN;
    const closeMin =
      parseClockToMinutes(obj.close ?? obj.close_time ?? obj.end) ?? DEFAULT_CLOSE_MIN;
    if (closeMin <= openMin) {
      return { openMin: DEFAULT_OPEN_MIN, closeMin: DEFAULT_CLOSE_MIN, closed: false };
    }
    return { openMin, closeMin, closed: false };
  }
  return { openMin: DEFAULT_OPEN_MIN, closeMin: DEFAULT_CLOSE_MIN, closed: false };
}

function localMinutesFromIso(isoUtc: string, timeZone: string): number {
  const wall = formatInTimeZone(new Date(isoUtc), timeZone);
  const hh = Number(wall.slice(11, 13));
  const mm = Number(wall.slice(14, 16));
  return hh * 60 + mm;
}

export function bookingWithinOperatingHours(params: {
  weeklySchedule: unknown;
  startAt: string;
  endAt: string;
  timeZone?: string;
  /** Bloqueos administrativos pueden ignorar el horario de apertura. */
  skipForBlocked?: boolean;
}): { ok: true } | { ok: false; error: string } {
  if (params.skipForBlocked) return { ok: true };

  const tz = clubTimezoneOrDefault(params.timeZone);
  const startMs = new Date(params.startAt).getTime();
  const endMs = new Date(params.endAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    return { ok: false, error: 'Rango horario inválido' };
  }

  const weekday = weekdayCodeInTz(params.startAt, tz);
  const hours = resolveDayOperatingHours(params.weeklySchedule, weekday);
  if (hours.closed) {
    return { ok: false, error: 'El club está cerrado este día' };
  }

  const startMin = localMinutesFromIso(params.startAt, tz);
  const endMin = localMinutesFromIso(params.endAt, tz);
  const endDay = dayKeyInTz(new Date(params.endAt), tz);
  const startDay = dayKeyInTz(new Date(params.startAt), tz);
  if (endDay !== startDay) {
    return { ok: false, error: 'La reserva no puede cruzar medianoche; divídela en dos turnos' };
  }

  if (startMin < hours.openMin) {
    const openStr = `${String(Math.floor(hours.openMin / 60)).padStart(2, '0')}:${String(hours.openMin % 60).padStart(2, '0')}`;
    return { ok: false, error: `La reserva no puede empezar antes de la apertura del club (${openStr})` };
  }
  if (endMin > hours.closeMin) {
    const closeStr = `${String(Math.floor(hours.closeMin / 60)).padStart(2, '0')}:${String(hours.closeMin % 60).padStart(2, '0')}`;
    return { ok: false, error: `La reserva no puede terminar después del cierre del club (${closeStr})` };
  }

  return { ok: true };
}

export async function assertBookingWithinClubOperatingHours(
  supabase: SupabaseClient,
  params: {
    courtId: string;
    startAt: string;
    endAt: string;
    reservationType?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const skipForBlocked =
    params.reservationType === 'blocked' ||
    params.reservationType === 'tournament' ||
    params.reservationType === 'school_individual' ||
    (typeof params.reservationType === 'string' && params.reservationType.startsWith('custom_'));
  const { data: court, error: cErr } = await supabase
    .from('courts')
    .select('club_id')
    .eq('id', params.courtId)
    .maybeSingle();
  if (cErr) return { ok: false, error: cErr.message };
  if (!court?.club_id) return { ok: false, error: 'Pista no encontrada' };

  const { data: club, error: clubErr } = await supabase
    .from('clubs')
    .select('weekly_schedule, timezone')
    .eq('id', court.club_id)
    .maybeSingle();
  if (clubErr) return { ok: false, error: clubErr.message };

  const clubRow = club as { weekly_schedule?: unknown; timezone?: string | null } | null;
  return bookingWithinOperatingHours({
    weeklySchedule: clubRow?.weekly_schedule,
    startAt: params.startAt,
    endAt: params.endAt,
    timeZone: clubTimezoneOrDefault(clubRow?.timezone),
    skipForBlocked,
  });
}
