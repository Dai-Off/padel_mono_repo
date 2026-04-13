import { getSupabaseServiceRoleClient } from './supabase';
import { findTournamentConflict } from './tournamentConflicts';

export const MATCH_DRAFT_LOCK_MARKER = '__MATCH_DRAFT_LOCK__';

function dateToWeekday(d: Date): 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun' {
  const idx = d.getUTCDay();
  if (idx === 0) return 'sun';
  return (['mon', 'tue', 'wed', 'thu', 'fri', 'sat'][idx - 1] as 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat');
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
  const bookingOverlap = (existingBookings ?? []).some((b: { start_at: string; end_at: string; notes?: string | null }) => {
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

  const dateStr = startAt.slice(0, 10);
  const weekday = dateToWeekday(new Date(`${dateStr}T00:00:00Z`));
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
        (!c.starts_on || dateStr >= c.starts_on) && (!c.ends_on || dateStr <= c.ends_on)
    )
    .map((c: { id: string }) => c.id);
  if (validCourseIds.length) {
    const { data: days, error: dayErr } = await supabase
      .from('club_school_course_days')
      .select('course_id, weekday, start_time, end_time')
      .in('course_id', validCourseIds)
      .eq('weekday', weekday);
    if (dayErr) return dayErr.message;

    const reqStartMin = Number(startAt.slice(11, 13)) * 60 + Number(startAt.slice(14, 16));
    const reqEndMin = Number(endAt.slice(11, 13)) * 60 + Number(endAt.slice(14, 16));
    const courseOverlap = (days ?? []).some((d: { start_time: string; end_time: string }) => {
      const s = Number(String(d.start_time).slice(0, 2)) * 60 + Number(String(d.start_time).slice(3, 5));
      const e = Number(String(d.end_time).slice(0, 2)) * 60 + Number(String(d.end_time).slice(3, 5));
      return reqStartMin < e && reqEndMin > s;
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
