import { normalizeReservationTypeSlug } from './reservationTypeSlug';

const NON_CONTENTION_TYPES = new Set([
  'blocked',
  'tournament',
  'pozo',
  'school_group',
  'school_individual',
  'school_course',
  'flat_rate',
  'fixed_recurring',
]);

/** Alineado con backend `existingBookingBlocksNewContentionMatch` + disponibilidad real de pista. */
export function existingBookingBlocksOverlapEdit(booking: {
  status?: string | null;
  reservation_type?: string | null;
  booking_type?: string | null;
  court_contention_status?: string | null;
}): boolean {
  const status = String(booking.status ?? '').toLowerCase();
  if (status === 'cancelled') return false;

  const contention = booking.court_contention_status ?? null;
  if (contention === 'competing' || contention === 'lost') return false;
  if (contention === 'won') return true;
  if (status === 'confirmed') return true;

  const rt = normalizeReservationTypeSlug(booking.reservation_type || booking.booking_type || 'standard');
  if (NON_CONTENTION_TYPES.has(rt)) return true;
  if (status === 'pending_payment' && (rt === 'open_match' || rt === 'standard')) return false;
  return false;
}

export function timeRangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStartIso: string,
  bEndIso: string,
): boolean {
  const bStart = new Date(bStartIso);
  const bEnd = new Date(bEndIso);
  return aStart < bEnd && aEnd > bStart;
}

function sameInstant(a: string, b: string): boolean {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  return Number.isFinite(ta) && Number.isFinite(tb) && ta === tb;
}

export function hasBookingScheduleChanged(
  existing: { start_at: string; end_at: string; court_id?: string },
  next: {
    startAtIso: string;
    endAtIso: string;
    courtId?: string;
  },
): boolean {
  if (!sameInstant(next.startAtIso, existing.start_at)) return true;
  if (!sameInstant(next.endAtIso, existing.end_at)) return true;
  if (next.courtId != null && existing.court_id != null && next.courtId !== existing.court_id) return true;
  return false;
}
