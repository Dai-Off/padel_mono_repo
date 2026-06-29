import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isStripePaymentIntentId,
  refundStripeBookingPaymentForPlayer,
  refundStripeBookingPaymentTransactions,
} from '../services/paymentRefundService';
import { scaleCentsByPercent } from './refundPercent';

export type CashRefundDisposition = 'cash_hand' | 'wallet';

export type CashRefundMap = Record<string, CashRefundDisposition>;

export type RefundOptions = {
  concept: string;
  cashRefundAction?: CashRefundDisposition;
  now?: string;
  /** Si false, no se ejecuta ningún reembolso (política de cancelación). */
  refundEligible?: boolean;
  /** 0–100. Por defecto 100 si hay reembolso. */
  refundPercent?: number;
};

export type BookingParticipantPaymentRow = {
  player_id: string;
  payment_method?: string | null;
  payment_status?: string | null;
  paid_amount_cents?: number | null;
  wallet_amount_cents?: number | null;
  share_amount_cents?: number | null;
  players?:
    | { first_name?: string | null; last_name?: string | null; email?: string | null }
    | { first_name?: string | null; last_name?: string | null; email?: string | null }[]
    | null;
};

export type ParticipantRefundSummary = {
  paidTotalCents: number;
  refundCents: number;
  refundPercent: number;
  cashAtCounter: boolean;
  hadPayment: boolean;
};

export type CashRefundCandidate = {
  player_id: string;
  first_name: string;
  last_name: string;
  cash_amount_cents: number;
};

async function playerHasSucceededStripeTx(
  supabase: SupabaseClient,
  bookingId: string,
  playerId: string,
): Promise<boolean> {
  const { data: txs } = await supabase
    .from('payment_transactions')
    .select('stripe_payment_intent_id, status')
    .eq('booking_id', bookingId)
    .eq('payer_player_id', playerId)
    .eq('status', 'succeeded');
  return (txs ?? []).some((t) =>
    isStripePaymentIntentId((t as { stripe_payment_intent_id?: string }).stripe_payment_intent_id),
  );
}

function playerDisplayName(row: BookingParticipantPaymentRow): { first_name: string; last_name: string } {
  const raw = row.players;
  const p = Array.isArray(raw) ? raw[0] : raw;
  return {
    first_name: String(p?.first_name ?? '').trim(),
    last_name: String(p?.last_name ?? '').trim(),
  };
}

/** Jugadores con efectivo cobrado en mostrador que requieren decisión del admin. */
export function listCashRefundCandidates(
  participants: BookingParticipantPaymentRow[],
  stripePlayerIds: Set<string>,
  filterPlayerId?: string,
): CashRefundCandidate[] {
  const out: CashRefundCandidate[] = [];
  for (const row of participants) {
    if (!row.player_id) continue;
    if (filterPlayerId && row.player_id !== filterPlayerId) continue;
    if (stripePlayerIds.has(row.player_id)) continue;
    if (String(row.payment_status ?? '') !== 'paid') continue;
    if (String(row.payment_method ?? '') !== 'cash') continue;
    const cashCents = Number(row.paid_amount_cents ?? 0);
    if (cashCents <= 0) continue;
    const name = playerDisplayName(row);
    out.push({
      player_id: row.player_id,
      first_name: name.first_name,
      last_name: name.last_name,
      cash_amount_cents: cashCents,
    });
  }
  return out;
}

export function validateCashRefundMap(
  candidates: CashRefundCandidate[],
  cashRefunds?: CashRefundMap | null,
): { ok: true } | { ok: false; error: string; missing_player_ids: string[] } {
  if (candidates.length === 0) return { ok: true };
  const map = cashRefunds ?? {};
  const missing = candidates
    .filter((c) => map[c.player_id] !== 'cash_hand' && map[c.player_id] !== 'wallet')
    .map((c) => c.player_id);
  if (missing.length > 0) {
    return {
      ok: false,
      error: 'Indica para cada jugador con pago en efectivo si devuelves en mostrador o acreditas al monedero.',
      missing_player_ids: missing,
    };
  }
  return { ok: true };
}

export async function collectStripePlayerIds(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<Set<string>> {
  const { data: txs } = await supabase
    .from('payment_transactions')
    .select('payer_player_id, stripe_payment_intent_id, status')
    .eq('booking_id', bookingId)
    .eq('status', 'succeeded');
  const ids = new Set<string>();
  for (const tx of txs ?? []) {
    const row = tx as { payer_player_id?: string; stripe_payment_intent_id?: string };
    if (row.payer_player_id && isStripePaymentIntentId(row.stripe_payment_intent_id)) {
      ids.add(row.payer_player_id);
    }
  }
  return ids;
}

export function totalParticipantPaidCents(row: BookingParticipantPaymentRow): number {
  const direct = Number(row.paid_amount_cents ?? 0) + Number(row.wallet_amount_cents ?? 0);
  if (direct > 0) return direct;
  if (String(row.payment_status ?? '') === 'paid') {
    return Number(row.share_amount_cents ?? 0);
  }
  return 0;
}

export function bookingParticipantsHavePayments(
  participants: BookingParticipantPaymentRow[],
  stripePlayerIds?: Set<string>,
): boolean {
  if (participants.some((p) => totalParticipantPaidCents(p) > 0)) return true;
  if (!stripePlayerIds) return false;
  return participants.some((p) => p.player_id && stripePlayerIds.has(p.player_id));
}

export async function fetchBookingParticipantsForRefund(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<BookingParticipantPaymentRow[]> {
  const { data, error } = await supabase
    .from('booking_participants')
    .select(
      'player_id, payment_method, payment_status, paid_amount_cents, wallet_amount_cents, share_amount_cents, players:players!booking_participants_player_id_fkey(first_name, last_name, email)',
    )
    .eq('booking_id', bookingId);
  if (error) throw new Error(error.message);
  return (data ?? []) as BookingParticipantPaymentRow[];
}

export function summarizeParticipantRefund(
  row: BookingParticipantPaymentRow,
  stripePlayerIds: Set<string>,
  opts: {
    refundEligible: boolean;
    refundPercent: number;
    cashRefundAction?: CashRefundDisposition;
  },
): ParticipantRefundSummary {
  const wallet = Number(row.wallet_amount_cents ?? 0);
  const paid = Number(row.paid_amount_cents ?? 0);
  const paidTotalCents = wallet + paid;
  const refundPercent = Math.max(0, Math.min(100, opts.refundPercent));

  if (!opts.refundEligible || refundPercent <= 0 || String(row.payment_status ?? '') !== 'paid') {
    return {
      paidTotalCents,
      refundCents: 0,
      refundPercent: 0,
      cashAtCounter: false,
      hadPayment: paidTotalCents > 0 && String(row.payment_status ?? '') === 'paid',
    };
  }

  const hadStripe = stripePlayerIds.has(row.player_id);
  const method = String(row.payment_method ?? '');
  let refundCents = scaleCentsByPercent(wallet, refundPercent);
  let cashAtCounter = false;

  if (hadStripe) {
    refundCents += scaleCentsByPercent(paid, refundPercent);
  } else if (method === 'cash' && paid > 0) {
    const paidRefund = scaleCentsByPercent(paid, refundPercent);
    if (opts.cashRefundAction === 'wallet') {
      refundCents += paidRefund;
    } else if (opts.cashRefundAction === 'cash_hand') {
      refundCents += paidRefund;
      cashAtCounter = paidRefund > 0;
    }
  } else if (paid > 0) {
    refundCents += scaleCentsByPercent(paid, refundPercent);
  }

  return {
    paidTotalCents,
    refundCents,
    refundPercent,
    cashAtCounter,
    hadPayment: true,
  };
}

function walletCreditForParticipant(
  row: BookingParticipantPaymentRow,
  hadStripe: boolean,
  cashRefundAction?: CashRefundDisposition,
  refundPercent = 100,
): number {
  let cents = scaleCentsByPercent(Number(row.wallet_amount_cents ?? 0), refundPercent);
  if (hadStripe) return cents;

  const paid = Number(row.paid_amount_cents ?? 0);
  if (paid <= 0) return cents;

  const method = String(row.payment_method ?? '');
  const paidRefund = scaleCentsByPercent(paid, refundPercent);
  if (method === 'cash') {
    if (cashRefundAction === 'wallet') cents += paidRefund;
    return cents;
  }
  if (method === 'card' || method === 'wallet' || method === '') {
    cents += paidRefund;
  }
  return cents;
}

/** Reembolsa un participante: Stripe automático; efectivo según disposición; tarjeta manual → monedero. */
export async function refundBookingParticipant(
  supabase: SupabaseClient,
  bookingId: string,
  clubId: string,
  row: BookingParticipantPaymentRow,
  options: RefundOptions,
): Promise<{ errors: string[]; walletCreditedCents: number; refunded: boolean }> {
  const errors: string[] = [];
  const now = options.now ?? new Date().toISOString();

  if (options.refundEligible === false) {
    return { errors: [], walletCreditedCents: 0, refunded: false };
  }

  const refundPercent = Math.max(0, Math.min(100, options.refundPercent ?? 100));
  if (refundPercent <= 0) {
    return { errors: [], walletCreditedCents: 0, refunded: false };
  }

  if (String(row.payment_status ?? '') !== 'paid') {
    return { errors: [], walletCreditedCents: 0, refunded: false };
  }

  const stripeRef = await refundStripeBookingPaymentForPlayer(
    supabase,
    bookingId,
    clubId,
    row.player_id,
    refundPercent,
  );
  errors.push(...stripeRef.errors);

  const hadStripe =
    stripeRef.stripeRefunded > 0 ||
    (await playerHasSucceededStripeTx(supabase, bookingId, row.player_id));

  const method = String(row.payment_method ?? '');
  const paid = Number(row.paid_amount_cents ?? 0);
  if (method === 'cash' && paid > 0 && !hadStripe && !options.cashRefundAction) {
    errors.push(`Falta disposición de efectivo para jugador ${row.player_id}`);
    return { errors, walletCreditedCents: 0, refunded: false };
  }

  const walletCents = walletCreditForParticipant(row, hadStripe, options.cashRefundAction, refundPercent);
  if (walletCents > 0) {
    const { error: insErr } = await supabase.from('wallet_transactions').insert({
      player_id: row.player_id,
      club_id: clubId,
      amount_cents: walletCents,
      concept: options.concept,
      type: 'refund',
      booking_id: bookingId,
      created_at: now,
    });
    if (insErr) errors.push(insErr.message);
  }

  const refunded = stripeRef.stripeRefunded > 0 || walletCents > 0;
  return { errors, walletCreditedCents: walletCents, refunded };
}

/** Reembolsa todos los participantes pagados de una reserva (cancelación admin). */
export async function refundAllBookingParticipants(
  supabase: SupabaseClient,
  bookingId: string,
  clubId: string,
  cashRefunds: CashRefundMap | undefined,
  concept: string,
  refundPercent = 0,
): Promise<{ errors: string[]; refunded: boolean }> {
  const percent = Math.max(0, Math.min(100, refundPercent));
  if (percent <= 0) {
    return { errors: [], refunded: false };
  }

  const now = new Date().toISOString();
  const stripeRef = await refundStripeBookingPaymentTransactions(supabase, bookingId, clubId, percent);
  const errors = [...stripeRef.errors];

  const stripeIds = await collectStripePlayerIds(supabase, bookingId);
  const participants = await fetchBookingParticipantsForRefund(supabase, bookingId);
  const cashCandidates = listCashRefundCandidates(participants, stripeIds);
  const validation = validateCashRefundMap(cashCandidates, cashRefunds);
  if (!validation.ok) {
    return { errors: [validation.error], refunded: false };
  }

  let anyWallet = false;
  for (const row of participants) {
    if (String(row.payment_status ?? '') !== 'paid') continue;
    const hadStripe = stripeIds.has(row.player_id);
    const action = cashRefunds?.[row.player_id];
    const walletCents = walletCreditForParticipant(row, hadStripe, action, percent);
    if (walletCents > 0) {
      anyWallet = true;
      const { error: insErr } = await supabase.from('wallet_transactions').insert({
        player_id: row.player_id,
        club_id: clubId,
        amount_cents: walletCents,
        concept,
        type: 'refund',
        booking_id: bookingId,
        created_at: now,
      });
      if (insErr) errors.push(insErr.message);
    }
  }

  return { errors, refunded: stripeRef.stripeRefunded > 0 || anyWallet };
}
