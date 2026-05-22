import type { SupabaseClient } from '@supabase/supabase-js';

export function computeBookingStatus(
  totalPriceCents: number,
  participants: Array<{ paid_amount_cents?: number; wallet_amount_cents?: number }>,
): 'pending_payment' | 'confirmed' {
  const totalPaid = participants.reduce(
    (sum, p) => sum + (p.paid_amount_cents ?? 0) + (p.wallet_amount_cents ?? 0),
    0,
  );
  if (totalPaid >= totalPriceCents && totalPriceCents > 0) return 'confirmed';
  return 'pending_payment';
}

export async function upsertManualPayments(
  supabase: SupabaseClient,
  bookingId: string,
  participants: Array<{ player_id: string; paid_amount_cents?: number; wallet_amount_cents?: number; payment_method?: string | null }>,
): Promise<void> {
  const { error: delErr } = await supabase
    .from('payment_transactions')
    .delete()
    .eq('booking_id', bookingId)
    .like('stripe_payment_intent_id', 'manual_%');
  if (delErr) console.error('[upsertManualPayments] delete error:', delErr.message);

  for (const p of participants) {
    const cashCardCents = p.paid_amount_cents ?? 0;
    const walletCents = p.wallet_amount_cents ?? 0;
    const totalPaid = cashCardCents + walletCents;
    if (totalPaid <= 0) continue;

    const method = p.payment_method === 'wallet' ? 'wallet'
      : p.payment_method === 'card' ? 'card' : 'cash';
    const uniqueId = `manual_${method}_${bookingId}_${p.player_id}`;
    const { error: insErr } = await supabase.from('payment_transactions').insert({
      booking_id: bookingId,
      payer_player_id: p.player_id,
      amount_cents: totalPaid,
      currency: 'EUR',
      stripe_payment_intent_id: uniqueId,
      status: 'succeeded',
    });
    if (insErr) console.error('[upsertManualPayments] insert error:', insErr.message, { uniqueId, totalPaid });
  }
}

export async function checkWalletBalances(
  supabase: SupabaseClient,
  clubId: string,
  participants: Array<{ player_id: string; wallet_amount_cents?: number; payment_method?: string | null }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (const p of participants) {
    const walletCents = p.wallet_amount_cents ?? 0;
    if (p.payment_method !== 'wallet' || walletCents <= 0) continue;

    const { data: txs, error } = await supabase
      .from('wallet_transactions')
      .select('amount_cents')
      .eq('player_id', p.player_id)
      .eq('club_id', clubId);
    if (error) return { ok: false, error: `Error al consultar saldo: ${error.message}` };

    const balance = (txs ?? []).reduce((sum: number, t: { amount_cents: number }) => sum + t.amount_cents, 0);
    if (balance < walletCents) {
      return {
        ok: false,
        error: `Saldo bono insuficiente (disponible ${balance} céntimos, requerido ${walletCents})`,
      };
    }
  }
  return { ok: true };
}

export type BookingChargeScope = 'full' | 'player_share';

export async function resolveBookingChargeCents(
  supabase: SupabaseClient,
  bookingId: string,
  playerId: string,
  scope: BookingChargeScope,
): Promise<{ amountCents: number; currency: string; clubId: string; totalPriceCents: number } | { error: string }> {
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id, status, total_price_cents, currency, organizer_player_id, courts(club_id), booking_participants(player_id, share_amount_cents, paid_amount_cents, wallet_amount_cents), payment_transactions(amount_cents, status, payer_player_id)')
    .eq('id', bookingId)
    .maybeSingle();

  if (bookingErr) return { error: bookingErr.message };
  if (!booking) return { error: 'Turno no encontrado' };
  if (String((booking as any).status ?? '') === 'cancelled') {
    return { error: 'No se puede cobrar un turno cancelado' };
  }

  const court = Array.isArray((booking as any).courts) ? (booking as any).courts[0] : (booking as any).courts;
  const clubId = String(court?.club_id ?? '');
  if (!clubId) return { error: 'Club del turno no encontrado' };

  const participantIds = new Set<string>();
  if ((booking as any).organizer_player_id) participantIds.add(String((booking as any).organizer_player_id));
  for (const participant of (booking as any).booking_participants ?? []) {
    if (participant?.player_id) participantIds.add(String(participant.player_id));
  }
  if (!participantIds.has(playerId)) {
    return { error: 'El jugador no figura en ese turno' };
  }

  const totalPriceCents = Math.max(0, Math.trunc(Number((booking as any).total_price_cents ?? 0)));
  const currency = String((booking as any).currency ?? 'EUR') || 'EUR';

  const paidOnBooking = ((booking as any).payment_transactions ?? [])
    .filter((t: any) => t.status === 'succeeded')
    .reduce((sum: number, t: any) => sum + Math.trunc(Number(t.amount_cents ?? 0)), 0);

  const participant = ((booking as any).booking_participants ?? []).find(
    (p: any) => String(p.player_id) === playerId,
  );
  const playerPaid = (participant?.paid_amount_cents ?? 0) + (participant?.wallet_amount_cents ?? 0);

  let amountCents = 0;
  if (scope === 'full') {
    amountCents = Math.max(0, totalPriceCents - paidOnBooking);
  } else {
    const share = Math.max(0, Math.trunc(Number(participant?.share_amount_cents ?? 0)));
    const fallbackShare = share > 0 ? share : (totalPriceCents > 0 ? Math.ceil(totalPriceCents / 4) : 0);
    amountCents = Math.max(0, fallbackShare - playerPaid);
  }

  if (amountCents <= 0) {
    return { error: scope === 'full' ? 'El turno ya está pagado' : 'La parte de este jugador ya está pagada' };
  }

  return { amountCents, currency, clubId, totalPriceCents };
}
