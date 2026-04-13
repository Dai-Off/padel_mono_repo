import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();

function getStripe(): Stripe | null {
  if (!stripeSecretKey) return null;
  return new Stripe(stripeSecretKey);
}

/** Pagos con tarjeta vía app (Stripe PaymentIntent). Excluye IDs manual_ y mock_ de la web. */
export function isStripePaymentIntentId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith('pi_');
}

type ServiceSupabase = SupabaseClient;

type PaymentTxRow = {
  id: string;
  booking_id: string | null;
  tournament_id: string | null;
  payer_player_id: string;
  amount_cents: number;
  stripe_payment_intent_id: string;
  status: string;
};

/**
 * Solo pagos móviles / Stripe (`pi_*`): reembolso en pasarela y `payment_transactions.status = refunded`.
 * Las filas `manual_*`, `mock_*`, etc. no se modifican (las gestiona la web / panel).
 */
export async function refundStripeBookingPaymentTransactions(
  supabase: ServiceSupabase,
  bookingId: string,
  _clubId: string,
): Promise<{ errors: string[]; stripeRefunded: number }> {
  return refundStripeTransactionsInternal(supabase, {
    bookingId,
  });
}

/** Reembolsa solo los pagos Stripe de un jugador en una reserva (baja individual). */
export async function refundStripeBookingPaymentForPlayer(
  supabase: ServiceSupabase,
  bookingId: string,
  _clubId: string,
  payerPlayerId: string,
): Promise<{ errors: string[]; stripeRefunded: number }> {
  return refundStripeTransactionsInternal(supabase, {
    bookingId,
    payerPlayerId,
  });
}

/**
 * Inscripciones de torneo pagadas con Stripe (`pi_*`) — cancelación de torneo o baja de jugador.
 */
export async function refundStripeTournamentPaymentTransactions(
  supabase: ServiceSupabase,
  tournamentId: string,
  _clubId: string,
): Promise<{ errors: string[]; stripeRefunded: number }> {
  return refundStripeTransactionsInternal(supabase, {
    tournamentId,
  });
}

export async function refundStripeTournamentPaymentForPlayer(
  supabase: ServiceSupabase,
  tournamentId: string,
  _clubId: string,
  payerPlayerId: string,
): Promise<{ errors: string[]; stripeRefunded: number }> {
  return refundStripeTransactionsInternal(supabase, {
    tournamentId,
    payerPlayerId,
  });
}

async function refundStripeTransactionsInternal(
  supabase: ServiceSupabase,
  filter: {
    bookingId?: string;
    tournamentId?: string;
    payerPlayerId?: string;
  },
): Promise<{ errors: string[]; stripeRefunded: number }> {
  const errors: string[] = [];
  let stripeRefunded = 0;
  const now = new Date().toISOString();

  let q = supabase.from('payment_transactions').select('*').eq('status', 'succeeded');
  if (filter.bookingId) q = q.eq('booking_id', filter.bookingId);
  if (filter.tournamentId) q = q.eq('tournament_id', filter.tournamentId);
  if (filter.payerPlayerId) q = q.eq('payer_player_id', filter.payerPlayerId);

  const { data: txs, error: fetchErr } = await q;
  if (fetchErr) {
    return { errors: [fetchErr.message], stripeRefunded: 0 };
  }

  const stripe = getStripe();

  for (const raw of txs ?? []) {
    const tx = raw as PaymentTxRow;
    if (!isStripePaymentIntentId(tx.stripe_payment_intent_id)) {
      continue;
    }

    if (tx.amount_cents <= 0) {
      await supabase
        .from('payment_transactions')
        .update({ status: 'refunded', updated_at: now })
        .eq('id', tx.id);
      continue;
    }

    if (!stripe) {
      errors.push(
        `No se pudo reembolsar pago ${tx.id}: STRIPE_SECRET_KEY no configurada (intent ${tx.stripe_payment_intent_id})`,
      );
      continue;
    }
    try {
      await stripe.refunds.create(
        {
          payment_intent: tx.stripe_payment_intent_id,
        },
        { idempotencyKey: `refund_pi_${tx.id}`.slice(0, 255) },
      );
      stripeRefunded += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/already been refunded|already refunded/i.test(msg)) {
        stripeRefunded += 1;
      } else {
        errors.push(`Stripe reembolso ${tx.stripe_payment_intent_id}: ${msg}`);
        continue;
      }
    }
    const { error: upErr } = await supabase
      .from('payment_transactions')
      .update({ status: 'refunded', updated_at: now })
      .eq('id', tx.id);
    if (upErr) errors.push(`Actualizar tx ${tx.id} a refunded: ${upErr.message}`);
  }

  return { errors, stripeRefunded };
}

export async function resolveClubIdForBooking(
  supabase: ServiceSupabase,
  bookingId: string,
): Promise<string | null> {
  const { data: bookingRow } = await supabase
    .from('bookings')
    .select('courts(club_id)')
    .eq('id', bookingId)
    .maybeSingle();
  const courts = bookingRow?.courts as { club_id?: string } | { club_id?: string }[] | null | undefined;
  const c = Array.isArray(courts) ? courts[0] : courts;
  return c?.club_id ?? null;
}
