import { getSupabaseServiceRoleClient } from './supabase';
import { findTournamentConflict } from './tournamentConflicts';
import { dayKeyInTz, zonedTimeToUtc } from '../routes/learningTimezone';

export const MATCH_DRAFT_LOCK_MARKER = '__MATCH_DRAFT_LOCK__';

/** IANA zone for escuela/Reservas when `clubs` no trae columna; alineado con `matchmaking` y `bookings`. */
const DEFAULT_CLUB_TIMEZONE = 'Europe/Madrid';

function shortWeekdayCodeInTimeZone(d: Date, timeZone: string): 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun' {
  const s = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(d);
  const m: Record<string, 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> = {
    Mon: 'mon',
    Tue: 'tue',
    Wed: 'wed',
    Thu: 'thu',
    Fri: 'fri',
    Sat: 'sat',
    Sun: 'sun',
  };
  return m[s] ?? 'mon';
}

function padTimeToHms(t: string): string {
  const t2 = t.trim();
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(t2)) return t2;
  if (/^\d{1,2}:\d{2}$/.test(t2)) return `${t2}:00`;
  return '12:00:00';
}

/** Returns true if the booking is a match-draft lock whose expiry has passed (treat as cancelled). */
export function isExpiredMatchLock(notes: string | null | undefined): boolean {
  if (!notes || !notes.includes(MATCH_DRAFT_LOCK_MARKER)) return false;
  const m = notes.match(new RegExp(`${MATCH_DRAFT_LOCK_MARKER}:([^\\s]+)`));
  if (!m) return false;
  const ts = Date.parse(m[1]);
  if (!Number.isFinite(ts)) return false;
  return ts < Date.now();
}

export async function hasCourtConflict(courtId: string, startAt: string, endAt: string, excludeBookingId?: string): Promise<string | null> {
  const supabase = getSupabaseServiceRoleClient();
  const startMs = new Date(startAt).getTime();
  const endMs = new Date(endAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) return 'Rango horario inválido';

  let q = supabase
    .from('bookings')
    .select('id, start_at, end_at, status, notes, reservation_type')
    .eq('court_id', courtId)
    .neq('status', 'cancelled')
    .is('deleted_at', null);
  if (excludeBookingId) q = q.neq('id', excludeBookingId);
  const { data: existingBookings, error: bErr } = await q;
  if (bErr) return bErr.message;
  const bookingOverlap = (existingBookings ?? []).some((b: { start_at: string; end_at: string; notes?: string | null; reservation_type?: string | null; status?: string | null }) => {
    if (isExpiredMatchLock(b.notes)) return false;
    const s = new Date(b.start_at).getTime();
    const e = new Date(b.end_at).getTime();
    return startMs < e && endMs > s;
  });
  if (bookingOverlap) return 'La pista ya tiene una reserva en ese horario';

  const { data: court, error: cErr } = await supabase
    .from('courts')
    .select('club_id')
    .eq('id', courtId)
    .maybeSingle();
  if (cErr) return cErr.message;
  const clubId = (court as { club_id?: string } | null)?.club_id;
  if (!clubId) return null;

  // Escuela: `start_time`/`end_time` son hora reloj del club; el slot es UTC. Antes se mezclaban
  // minutos UTC (slice del ISO) con minutos "locales" y el día de la semana en UTC, generando
  // falsos positivos (p. ej. pista libre en el panel y bloqueada en matchmaking).
  const clubTz = DEFAULT_CLUB_TIMEZONE;
  const dayKey = dayKeyInTz(new Date(startAt), clubTz);
  const slotWeekday = shortWeekdayCodeInTimeZone(new Date(startAt), clubTz);

  const { data: courses, error: scErr } = await supabase
    .from('club_school_courses')
    .select('id, starts_on, ends_on, is_active')
    .eq('club_id', clubId)
    .eq('court_id', courtId)
    .eq('is_active', true);
  if (scErr) return scErr.message;
  const validCourseIds = (courses ?? [])
    .filter(
      (c: { starts_on?: string; ends_on?: string }) =>
        (!c.starts_on || dayKey >= c.starts_on) && (!c.ends_on || dayKey <= c.ends_on),
    )
    .map((c: { id: string }) => c.id);
  if (validCourseIds.length) {
    const { data: days, error: dayErr } = await supabase
      .from('club_school_course_days')
      .select('course_id, weekday, start_time, end_time')
      .in('course_id', validCourseIds)
      .eq('weekday', slotWeekday);
    if (dayErr) return dayErr.message;

    const courseOverlap = (days ?? []).some((d: { start_time: string; end_time: string }) => {
      const cStart = zonedTimeToUtc(`${dayKey}T${padTimeToHms(d.start_time)}`, clubTz).getTime();
      const cEnd = zonedTimeToUtc(`${dayKey}T${padTimeToHms(d.end_time)}`, clubTz).getTime();
      return startMs < cEnd && endMs > cStart;
    });
    if (courseOverlap) return 'La pista está ocupada por un curso de escuela en ese horario';
  }

  const tConflict = await findTournamentConflict({
    clubId,
    courtIds: [courtId],
    startAt,
    endAt,
  });
  if (tConflict) return tConflict;
  return null;
}

/** Returns the subset of courts from the given club that are free for the provided [startAt,endAt]. */
export async function getAvailableCourtIds(clubId: string, startAt: string, endAt: string, excludeBookingId?: string): Promise<{ ok: true; courtIds: string[] } | { ok: false; error: string }> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: courts, error } = await supabase
    .from('courts')
    .select('id')
    .eq('club_id', clubId);
  if (error) return { ok: false, error: error.message };
  const ids = (courts ?? []).map((c: { id: string }) => c.id);
  const results = await Promise.all(ids.map((id) => hasCourtConflict(id, startAt, endAt, excludeBookingId).then((r) => ({ id, conflict: r }))));
  return { ok: true, courtIds: results.filter((r) => r.conflict === null).map((r) => r.id) };
}
