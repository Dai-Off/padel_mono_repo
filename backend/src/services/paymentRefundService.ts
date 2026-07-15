import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { scaleCentsByPercent } from '../lib/refundPercent';

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
  refundPercent = 100,
): Promise<{ errors: string[]; stripeRefunded: number }> {
  return refundStripeTransactionsInternal(supabase, {
    bookingId,
    refundPercent,
  });
}

/** Reembolsa solo los pagos Stripe de un jugador en una reserva (baja individual). */
export async function refundStripeBookingPaymentForPlayer(
  supabase: ServiceSupabase,
  bookingId: string,
  _clubId: string,
  payerPlayerId: string,
  refundPercent = 100,
): Promise<{ errors: string[]; stripeRefunded: number }> {
  return refundStripeTransactionsInternal(supabase, {
    bookingId,
    payerPlayerId,
    refundPercent,
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

async function markTxStatus(
  supabase: ServiceSupabase,
  txId: string,
  status: 'refunded' | 'failed',
  now: string,
): Promise<string | null> {
  const { error } = await supabase
    .from('payment_transactions')
    .update({ status, updated_at: now })
    .eq('id', txId);
  return error?.message ?? null;
}

function isAlreadyRefundedError(msg: string): boolean {
  return /already been refunded|already refunded|has already been fully refunded/i.test(msg);
}

/** PI sin cargo real en Stripe (cancelado, abandonado, nunca cobrado). */
function isNoChargeToRefundError(msg: string): boolean {
  return /does not have a successful charge|does not have a charge|No such payment_intent|has been canceled|was canceled|payment_intent_unexpected_state/i.test(
    msg,
  );
}

async function resolveStripeRefundForTx(
  stripe: Stripe,
  supabase: ServiceSupabase,
  tx: PaymentTxRow,
  now: string,
  refundPercent: number,
): Promise<{ ok: true; stripeRefunded: number } | { ok: false; error: string }> {
  const refundCents = scaleCentsByPercent(tx.amount_cents, refundPercent);
  if (refundCents <= 0) {
    return { ok: true, stripeRefunded: 0 };
  }

  try {
    await stripe.refunds.create(
      {
        payment_intent: tx.stripe_payment_intent_id,
        amount: refundCents,
      },
      { idempotencyKey: `refund_pi_${tx.id}_${refundPercent}`.slice(0, 255) },
    );
    const upErr = await markTxStatus(supabase, tx.id, 'refunded', now);
    if (upErr) return { ok: false, error: `Actualizar tx ${tx.id} a refunded: ${upErr}` };
    return { ok: true, stripeRefunded: 1 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isAlreadyRefundedError(msg)) {
      const upErr = await markTxStatus(supabase, tx.id, 'refunded', now);
      if (upErr) return { ok: false, error: `Actualizar tx ${tx.id} a refunded: ${upErr}` };
      return { ok: true, stripeRefunded: 1 };
    }
    if (isNoChargeToRefundError(msg)) {
      try {
        const pi = await stripe.paymentIntents.retrieve(tx.stripe_payment_intent_id);
        if ((pi.amount_received ?? 0) > 0) {
          return { ok: false, error: `Stripe reembolso ${tx.stripe_payment_intent_id}: ${msg}` };
        }
        console.warn(
          `[paymentRefund] PI ${pi.id} sin cargo (status=${pi.status}); tx ${tx.id} marcada como refunded`,
        );
      } catch {
        console.warn(
          `[paymentRefund] PI ${tx.stripe_payment_intent_id} no recuperable; tx ${tx.id} marcada como refunded`,
        );
      }
      const upErr = await markTxStatus(supabase, tx.id, 'refunded', now);
      if (upErr) return { ok: false, error: `Actualizar tx ${tx.id} a refunded: ${upErr}` };
      return { ok: true, stripeRefunded: 0 };
    }
    return { ok: false, error: `Stripe reembolso ${tx.stripe_payment_intent_id}: ${msg}` };
  }
}

async function refundStripeTransactionsInternal(
  supabase: ServiceSupabase,
  filter: {
    bookingId?: string;
    tournamentId?: string;
    payerPlayerId?: string;
    refundPercent?: number;
  },
): Promise<{ errors: string[]; stripeRefunded: number }> {
  const errors: string[] = [];
  let stripeRefunded = 0;
  const now = new Date().toISOString();
  const refundPercent = Math.max(0, Math.min(100, filter.refundPercent ?? 100));

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
      await markTxStatus(supabase, tx.id, 'refunded', now);
      continue;
    }

    if (!stripe) {
      errors.push(
        `No se pudo reembolsar pago ${tx.id}: STRIPE_SECRET_KEY no configurada (intent ${tx.stripe_payment_intent_id})`,
      );
      continue;
    }

    const outcome = await resolveStripeRefundForTx(stripe, supabase, tx, now, refundPercent);
    if (!outcome.ok) {
      errors.push(outcome.error);
      continue;
    }
    stripeRefunded += outcome.stripeRefunded;
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
