import type { SupabaseClient } from '@supabase/supabase-js';

export type CourtContentionStatus = 'competing' | 'won' | 'lost';

export type BookingContentionRow = {
  id: string;
  court_id: string;
  start_at: string;
  end_at: string;
  status: string;
  reservation_type?: string | null;
  court_contention_status?: CourtContentionStatus | null;
  contention_third_paid_at?: string | null;
  created_at?: string;
};

const NON_CONTENTION_RESERVATION_TYPES = new Set([
  'blocked',
  'tournament',
  'pozo',
  'school_group',
  'school_individual',
  'school_course',
  'flat_rate',
  'fixed_recurring',
]);

function overlaps(startMs: number, endMs: number, otherStart: string, otherEnd: string): boolean {
  const s = new Date(otherStart).getTime();
  const e = new Date(otherEnd).getTime();
  return startMs < e && endMs > s;
}

/** Bookings that occupy the court exclusively (not in open competition). */
export function bookingBlocksCourtForAvailability(booking: {
  status?: string | null;
  reservation_type?: string | null;
  court_contention_status?: CourtContentionStatus | null;
}): boolean {
  if (booking.status === 'cancelled') return false;
  const rt = booking.reservation_type ?? '';
  if (NON_CONTENTION_RESERVATION_TYPES.has(rt)) return true;
  if (booking.court_contention_status === 'competing') return false;
  if (booking.court_contention_status === 'lost') return false;
  if (booking.court_contention_status === 'won') return true;
  if (
    !booking.court_contention_status &&
    booking.status === 'pending_payment' &&
    (rt === 'open_match' || rt === 'standard')
  ) {
    return false;
  }
  return true;
}

/** Whether a new mobile/web match booking can overlap this existing row. */
export function existingBookingBlocksNewContentionMatch(booking: BookingContentionRow): boolean {
  if (booking.status === 'cancelled') return false;
  const rt = booking.reservation_type ?? '';
  if (NON_CONTENTION_RESERVATION_TYPES.has(rt)) return true;
  if (booking.court_contention_status === 'competing') return false;
  if (booking.court_contention_status === 'won') return true;
  if (booking.court_contention_status === 'lost') return false;
  if (booking.status === 'confirmed') return true;
  if (
    !booking.court_contention_status &&
    booking.status === 'pending_payment' &&
    (rt === 'open_match' || rt === 'standard')
  ) {
    return false;
  }
  return false;
}

export async function countPaidParticipants(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('booking_participants')
    .select('id', { count: 'exact', head: true })
    .eq('booking_id', bookingId)
    .eq('payment_status', 'paid');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function getThirdPaidTimestamp(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<string | null> {
  const { data: parts, error: pErr } = await supabase
    .from('booking_participants')
    .select('id, player_id, payment_status, created_at')
    .eq('booking_id', bookingId)
    .eq('payment_status', 'paid')
    .order('created_at', { ascending: true });
  if (pErr) throw new Error(pErr.message);
  if (!parts || parts.length < 3) return null;

  const third = parts[2] as { player_id?: string; created_at?: string };
  const playerId = third.player_id;
  if (playerId) {
    const { data: txs } = await supabase
      .from('payment_transactions')
      .select('updated_at, created_at')
      .eq('booking_id', bookingId)
      .eq('payer_player_id', playerId)
      .eq('status', 'succeeded')
      .order('updated_at', { ascending: true })
      .limit(1);
    const tx = txs?.[0] as { updated_at?: string; created_at?: string } | undefined;
    if (tx?.updated_at) return tx.updated_at;
    if (tx?.created_at) return tx.created_at;
  }
  return third.created_at ?? new Date().toISOString();
}

export async function refundAllPaidParticipantsToWallet(
  supabase: SupabaseClient,
  bookingId: string,
  concept: string,
): Promise<void> {
  const { data: participants, error: pErr } = await supabase
    .from('booking_participants')
    .select('player_id, paid_amount_cents, wallet_amount_cents, share_amount_cents, payment_status')
    .eq('booking_id', bookingId)
    .eq('payment_status', 'paid');
  if (pErr) throw new Error(pErr.message);
  if (!participants?.length) return;

  const { data: bookingRow, error: bErr } = await supabase
    .from('bookings')
    .select('courts(club_id)')
    .eq('id', bookingId)
    .maybeSingle();
  if (bErr) throw new Error(bErr.message);
  const clubId = (bookingRow?.courts as { club_id?: string } | null)?.club_id;
  if (!clubId) return;

  const { data: txs } = await supabase
    .from('payment_transactions')
    .select('payer_player_id, amount_cents')
    .eq('booking_id', bookingId)
    .eq('status', 'succeeded');
  const txByPlayer = new Map<string, number>();
  for (const t of txs ?? []) {
    const pid = (t as { payer_player_id?: string }).payer_player_id;
    if (!pid) continue;
    txByPlayer.set(pid, (txByPlayer.get(pid) ?? 0) + Number((t as { amount_cents?: number }).amount_cents ?? 0));
  }

  const now = new Date().toISOString();
  const rows = participants
    .map((p: { player_id: string; paid_amount_cents?: number; wallet_amount_cents?: number; share_amount_cents?: number }) => {
      const fromBp = (p.paid_amount_cents ?? 0) + (p.wallet_amount_cents ?? 0);
      const fromTx = txByPlayer.get(p.player_id) ?? 0;
      const refundCents = fromBp > 0 ? fromBp : fromTx > 0 ? fromTx : (p.share_amount_cents ?? 0);
      if (refundCents <= 0) return null;
      return {
        player_id: p.player_id,
        club_id: clubId,
        amount_cents: refundCents,
        concept,
        type: 'refund' as const,
        booking_id: bookingId,
        created_at: now,
      };
    })
    .filter(Boolean);

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from('wallet_transactions').insert(rows);
    if (insErr) throw new Error(insErr.message);
  }
}

export async function cancelContentionLoser(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      court_contention_status: 'lost',
      cancelled_at: now,
      cancellation_reason: 'Otro grupo completó el partido antes en esta pista',
      updated_at: now,
    })
    .eq('id', bookingId);

  const { data: match } = await supabase
    .from('matches')
    .select('id')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (match?.id) {
    await supabase
      .from('matches')
      .update({ status: 'cancelled', updated_at: now })
      .eq('id', match.id);
  }
}

async function findOverlappingBookings(
  supabase: SupabaseClient,
  courtId: string,
  startAt: string,
  endAt: string,
): Promise<BookingContentionRow[]> {
  const startMs = new Date(startAt).getTime();
  const endMs = new Date(endAt).getTime();

  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, court_id, start_at, end_at, status, reservation_type, court_contention_status, contention_third_paid_at, created_at',
    )
    .eq('court_id', courtId)
    .neq('status', 'cancelled')
    .is('deleted_at', null);
  if (error) throw new Error(error.message);

  return (data ?? []).filter((b: BookingContentionRow) =>
    overlaps(startMs, endMs, b.start_at, b.end_at),
  ) as BookingContentionRow[];
}

export async function assertCourtSlotAvailableForNewContentionMatch(
  supabase: SupabaseClient,
  courtId: string,
  startAt: string,
  endAt: string,
): Promise<string | null> {
  const overlapping = await findOverlappingBookings(supabase, courtId, startAt, endAt);
  for (const b of overlapping) {
    if (existingBookingBlocksNewContentionMatch(b)) {
      return 'Esa pista ya está reservada para ese horario. Elige otra hora.';
    }
  }
  return null;
}

type ContenderSnapshot = BookingContentionRow & { paidCount: number; thirdPaidAt: string };

async function buildContenderSnapshot(
  supabase: SupabaseClient,
  booking: BookingContentionRow,
): Promise<ContenderSnapshot | null> {
  const paidCount = await countPaidParticipants(supabase, booking.id);
  if (paidCount < 3) return null;

  let thirdPaidAt = booking.contention_third_paid_at ?? null;
  if (!thirdPaidAt) {
    thirdPaidAt = await getThirdPaidTimestamp(supabase, booking.id);
    if (thirdPaidAt) {
      await supabase
        .from('bookings')
        .update({ contention_third_paid_at: thirdPaidAt, updated_at: new Date().toISOString() })
        .eq('id', booking.id)
        .eq('court_contention_status', 'competing');
    }
  }
  if (!thirdPaidAt) return null;

  return { ...booking, paidCount, thirdPaidAt };
}

function pickWinner(contenders: ContenderSnapshot[]): ContenderSnapshot {
  return [...contenders].sort((a, b) => {
    const tA = new Date(a.thirdPaidAt).getTime();
    const tB = new Date(b.thirdPaidAt).getTime();
    if (tA !== tB) return tA - tB;
    const cA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const cB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return cA - cB;
  })[0];
}

/**
 * When a booking reaches 3 paid participants, resolve the race for the court slot.
 * Idempotent: safe to call after every participant payment.
 */
export async function resolveCourtContention(
  supabase: SupabaseClient,
  triggerBookingId: string,
): Promise<void> {
  const { data: trigger, error: tErr } = await supabase
    .from('bookings')
    .select(
      'id, court_id, start_at, end_at, status, reservation_type, court_contention_status, contention_third_paid_at, created_at',
    )
    .eq('id', triggerBookingId)
    .maybeSingle();
  if (tErr) throw new Error(tErr.message);
  if (!trigger) return;

  const row = trigger as BookingContentionRow;
  if (row.court_contention_status === 'won' || row.court_contention_status === 'lost') return;
  if (row.status === 'cancelled') return;

  const paidOnTrigger = await countPaidParticipants(supabase, triggerBookingId);
  if (paidOnTrigger < 3) return;

  const overlapping = await findOverlappingBookings(
    supabase,
    row.court_id,
    row.start_at,
    row.end_at,
  );

  const contenders: ContenderSnapshot[] = [];
  for (const b of overlapping) {
    if (b.court_contention_status === 'won' || b.court_contention_status === 'lost') continue;
    if (b.status === 'cancelled') continue;
    const snap = await buildContenderSnapshot(supabase, b);
    if (snap) contenders.push(snap);
  }

  if (contenders.length === 0) return;

  const winner = pickWinner(contenders);
  const now = new Date().toISOString();

  await supabase
    .from('bookings')
    .update({
      court_contention_status: 'won',
      contention_third_paid_at: winner.thirdPaidAt,
      status: 'confirmed',
      updated_at: now,
    })
    .eq('id', winner.id)
    .in('court_contention_status', ['competing', null]);

  for (const b of overlapping) {
    if (b.id === winner.id) continue;
    if (b.court_contention_status === 'lost' || b.status === 'cancelled') continue;

    await cancelContentionLoser(supabase, b.id);
    await refundAllPaidParticipantsToWallet(
      supabase,
      b.id,
      'Reembolso: otro grupo completó el partido antes en esta pista',
    );
  }
}

/** Set competing status on new match bookings (split-payment flow). */
export function contentionStatusForNewMatchBooking(
  reservationType: string,
  isPayFull: boolean,
): CourtContentionStatus | null {
  if (isPayFull) return null;
  if (reservationType === 'open_match' || reservationType === 'standard') {
    return 'competing';
  }
  return null;
}
