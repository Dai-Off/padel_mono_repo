import type { SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_CLUB_CANCELLATION_HOURS = 24;
const REQUIRED_MATCH_PLAYERS = 4;

export type BookingRefundPolicy = {
  eligible: boolean;
  notice_hours: number;
  start_at: string;
  hours_until_start: number;
  /** Partido público con menos de 4 jugadores: reembolso siempre permitido. */
  incomplete_public_exempt: boolean;
  match_player_count: number;
};

export function hoursUntilBookingStart(startAt: string, nowMs = Date.now()): number {
  const start = new Date(startAt).getTime();
  if (!Number.isFinite(start)) return 0;
  return (start - nowMs) / 3_600_000;
}

export function isCancellationRefundEligible(
  startAt: string,
  noticeHours: number,
  nowMs = Date.now(),
): boolean {
  if (!noticeHours || noticeHours <= 0) return true;
  return hoursUntilBookingStart(startAt, nowMs) >= noticeHours;
}

export function isPublicBooking(
  reservationType: string | null | undefined,
  matchVisibility: string | null | undefined,
): boolean {
  const vis = String(matchVisibility ?? '').toLowerCase();
  if (vis === 'public') return true;
  const rt = String(reservationType ?? 'standard').toLowerCase();
  return rt === 'open_match' || rt === 'pozo';
}

export async function resolveClubCancellationNoticeHours(
  supabase: SupabaseClient,
  clubId: string,
): Promise<number> {
  const { data: club, error } = await supabase
    .from('clubs')
    .select('cancellation_notice_hours')
    .eq('id', clubId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const onClub = (club as { cancellation_notice_hours?: number | null } | null)?.cancellation_notice_hours;
  if (onClub != null && Number.isFinite(Number(onClub))) {
    return Math.max(0, Math.trunc(Number(onClub)));
  }

  return DEFAULT_CLUB_CANCELLATION_HOURS;
}

export async function evaluateBookingRefundPolicy(
  supabase: SupabaseClient,
  bookingId: string,
  nowMs = Date.now(),
): Promise<BookingRefundPolicy> {
  const { data: booking, error } = await supabase
    .from('bookings')
    .select(
      'start_at, reservation_type, courts(club_id), matches(id, visibility, match_players(player_id))',
    )
    .eq('id', bookingId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!booking) throw new Error('Reserva no encontrada');

  const clubId = (booking.courts as { club_id?: string } | null)?.club_id;
  const rawMatch = (booking as { matches?: unknown }).matches;
  const match = Array.isArray(rawMatch) ? rawMatch[0] : rawMatch;
  const visibility = (match as { visibility?: string } | null)?.visibility ?? null;
  const reservationType = (booking as { reservation_type?: string }).reservation_type;
  const rawPlayers = (match as { match_players?: unknown } | null)?.match_players;
  const matchPlayerCount = Array.isArray(rawPlayers) ? rawPlayers.length : 0;

  const noticeHours = clubId
    ? await resolveClubCancellationNoticeHours(supabase, clubId)
    : DEFAULT_CLUB_CANCELLATION_HOURS;
  const startAt = String((booking as { start_at: string }).start_at);
  const hoursUntilStart = hoursUntilBookingStart(startAt, nowMs);

  const incompletePublicExempt =
    isPublicBooking(reservationType, visibility) &&
    matchPlayerCount > 0 &&
    matchPlayerCount < REQUIRED_MATCH_PLAYERS;

  const eligible =
    incompletePublicExempt || isCancellationRefundEligible(startAt, noticeHours, nowMs);

  return {
    eligible,
    notice_hours: noticeHours,
    start_at: startAt,
    hours_until_start: hoursUntilStart,
    incomplete_public_exempt: incompletePublicExempt,
    match_player_count: matchPlayerCount,
  };
}

export function refundPolicyUserMessage(policy: BookingRefundPolicy): string {
  if (policy.eligible) return '';
  return `Fuera del plazo de reembolso del club: debes cancelar al menos ${policy.notice_hours} h antes del inicio. La baja se procesará sin devolución.`;
}
