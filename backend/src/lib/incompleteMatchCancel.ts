import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceRoleClient } from './supabase';
import {
  refundStripeBookingPaymentTransactions,
  resolveClubIdForBooking,
} from '../services/paymentRefundService';
import { releaseMatchmakingProposal } from '../services/matchmakingService';

const ACTIVE_MATCH_STATUSES = ['open', 'full', 'pending', 'in_progress'];
const REQUIRED_PLAYERS = 4;
const BATCH_SIZE = 100;

type BookingPaymentInput = {
  total_price_cents?: number | null;
  status?: string | null;
  payment_transactions?: Array<{
    status?: string;
    payer_player_id?: string | null;
    amount_cents?: number | null;
  }>;
  booking_participants?: Array<{
    paid_amount_cents?: number | null;
    wallet_amount_cents?: number | null;
    payment_status?: string | null;
    share_amount_cents?: number | null;
  }>;
};

export function computeBookingTotalPaidCents(b: BookingPaymentInput): number {
  const txByPlayer = new Map<string, number>();
  for (const t of b.payment_transactions ?? []) {
    if (t.status !== 'succeeded' || !t.payer_player_id) continue;
    txByPlayer.set(
      t.payer_player_id,
      (txByPlayer.get(t.payer_player_id) ?? 0) + (t.amount_cents ?? 0),
    );
  }
  const txTotal = Array.from(txByPlayer.values()).reduce((sum, n) => sum + n, 0);
  if (txTotal > 0) return txTotal;

  const participants = b.booking_participants ?? [];
  const bpTotal = participants.reduce(
    (sum, p) => sum + (p.paid_amount_cents ?? 0) + (p.wallet_amount_cents ?? 0),
    0,
  );
  if (bpTotal > 0) return bpTotal;

  return participants
    .filter((p) => p.payment_status === 'paid')
    .reduce((sum, p) => sum + (p.share_amount_cents ?? 0), 0);
}

export function isBookingFullyPaid(b: BookingPaymentInput): boolean {
  const total = b.total_price_cents ?? 0;
  const paid = computeBookingTotalPaidCents(b);
  if (total <= 0) return paid > 0 || b.status === 'confirmed' || b.status === 'flat_rate';
  return paid >= total;
}

/** Partido privado pagado al 100%: no se cancela automáticamente. */
export function shouldSkipIncompleteAutoCancel(visibility: string, booking: BookingPaymentInput): boolean {
  return String(visibility).toLowerCase() === 'private' && isBookingFullyPaid(booking);
}

export async function cancelIncompleteMatchWithRefunds(
  supabase: SupabaseClient,
  matchId: string,
  bookingId: string,
  matchType: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const nowIso = new Date().toISOString();
  const clubId = await resolveClubIdForBooking(supabase, bookingId);

  if (clubId) {
    const stripeRef = await refundStripeBookingPaymentTransactions(supabase, bookingId, clubId);
    if (stripeRef.errors.length > 0) {
      return {
        ok: false,
        error: `Stripe refund failed for booking ${bookingId}: ${stripeRef.errors.join('; ')}`,
      };
    }
  }

  const { error: bookingErr } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      updated_at: nowIso,
      cancelled_at: nowIso,
      cancelled_by: 'system',
      deleted_at: nowIso,
    })
    .eq('id', bookingId)
    .is('deleted_at', null);
  if (bookingErr) return { ok: false, error: bookingErr.message };

  const { error: matchErr } = await supabase
    .from('matches')
    .update({ status: 'cancelled', updated_at: nowIso })
    .eq('id', matchId);
  if (matchErr) return { ok: false, error: matchErr.message };

  if (clubId) {
    const { data: paidParticipants } = await supabase
      .from('booking_participants')
      .select('player_id, paid_amount_cents, wallet_amount_cents')
      .eq('booking_id', bookingId)
      .eq('payment_status', 'paid');

    const refundRows = (paidParticipants ?? [])
      .filter((p) => (p.paid_amount_cents ?? 0) + (p.wallet_amount_cents ?? 0) > 0)
      .map((p) => ({
        player_id: p.player_id,
        club_id: clubId,
        amount_cents: (p.paid_amount_cents ?? 0) + (p.wallet_amount_cents ?? 0),
        concept: 'Reembolso por cancelación automática (partido incompleto)',
        type: 'refund',
        booking_id: bookingId,
        created_at: nowIso,
      }));

    if (refundRows.length > 0) {
      const { error: refundErr } = await supabase.from('wallet_transactions').insert(refundRows);
      if (refundErr) {
        console.error('[cancelIncompleteMatchWithRefunds] wallet refund failed:', refundErr.message);
      }
    }
  }

  if (matchType === 'matchmaking') {
    try {
      await releaseMatchmakingProposal(matchId, { cancelBooking: false });
    } catch (e) {
      console.error('[cancelIncompleteMatchWithRefunds] releaseMatchmakingProposal:', e);
    }
  }

  return { ok: true };
}

/**
 * Cancela partidos que llegaron a su hora de inicio sin 4 jugadores.
 * Excepción: partido privado pagado al 100% (la pista ya está cubierta).
 */
export async function cancelIncompletePastMatches(): Promise<number> {
  const supabase = getSupabaseServiceRoleClient();
  const nowIso = new Date().toISOString();

  const { data: rows, error } = await supabase
    .from('matches')
    .select(
      `id, booking_id, status, visibility, type, score_status,
       match_players(id),
       bookings!inner (
         id, start_at, end_at, status, total_price_cents, deleted_at,
         booking_participants(paid_amount_cents, wallet_amount_cents, payment_status, share_amount_cents),
         payment_transactions(payer_player_id, amount_cents, status)
       )`,
    )
    .in('status', [...ACTIVE_MATCH_STATUSES, 'finished'])
    .is('bookings.deleted_at', null)
    .neq('bookings.status', 'cancelled')
    .lte('bookings.start_at', nowIso)
    .limit(BATCH_SIZE);

  if (error) {
    console.error('[cancelIncompletePastMatches] select failed:', error.message);
    return 0;
  }

  let cancelled = 0;

  for (const row of rows ?? []) {
    const playerCount = (row.match_players as unknown[] | null)?.length ?? 0;
    if (playerCount >= REQUIRED_PLAYERS) continue;

    const scoreStatus = String((row as { score_status?: string }).score_status ?? 'pending');
    if (scoreStatus === 'confirmed') continue;

    const rawBooking = row.bookings;
    const booking = Array.isArray(rawBooking) ? rawBooking[0] : rawBooking;
    if (!booking?.id) continue;

    if (shouldSkipIncompleteAutoCancel(String(row.visibility ?? ''), booking)) continue;

    const result = await cancelIncompleteMatchWithRefunds(
      supabase,
      row.id,
      booking.id,
      row.type as string | null,
    );
    if (result.ok) {
      cancelled += 1;
    } else {
      console.error('[cancelIncompletePastMatches] cancel failed:', row.id, result.error);
    }
  }

  return cancelled;
}

export async function assertMatchEligibleForScore(
  supabase: SupabaseClient,
  matchId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: match, error } = await supabase
    .from('matches')
    .select('id, status, booking_id')
    .eq('id', matchId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message };
  if (!match) return { ok: false, status: 404, error: 'Partido no encontrado' };
  if (match.status === 'cancelled') {
    return { ok: false, status: 409, error: 'El partido fue cancelado' };
  }

  const { count, error: countErr } = await supabase
    .from('match_players')
    .select('id', { count: 'exact', head: true })
    .eq('match_id', matchId);

  if (countErr) return { ok: false, status: 500, error: countErr.message };
  if ((count ?? 0) < REQUIRED_PLAYERS) {
    return {
      ok: false,
      status: 409,
      error: 'No se puede registrar resultado: el partido no llegó a 4 jugadores',
    };
  }

  if (match.booking_id) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('status, deleted_at')
      .eq('id', match.booking_id)
      .maybeSingle();
    if (booking?.deleted_at != null || booking?.status === 'cancelled') {
      return { ok: false, status: 409, error: 'La reserva del partido fue cancelada' };
    }
  }

  return { ok: true };
}
