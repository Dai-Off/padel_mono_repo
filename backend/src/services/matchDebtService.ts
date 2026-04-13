import { getSupabaseServiceRoleClient } from '../lib/supabase';

const BATCH_SIZE = 50;

type OverdueRow = {
  id: string;
  booking_id: string;
  bookings: {
    id: string;
    organizer_player_id: string | null;
    court_id: string;
    courts: { club_id: string } | { club_id: string }[] | null;
  } | { id: string; organizer_player_id: string | null; court_id: string; courts: { club_id: string } | { club_id: string }[] | null }[];
};

/**
 * Procesa un lote de matches cuya ventana de 2h venció sin que todos los participantes pagasen.
 * Carga la deuda residual al organizador vía wallet_transactions (type=organizer_debt) y marca
 * los participantes impagos como paid/organizer_debt. Cierra el booking y libera el índice.
 */
export async function settleOverdueMatchPayments(): Promise<{ processed: number; charged: number }> {
  const supabase = getSupabaseServiceRoleClient();
  const nowIso = new Date().toISOString();

  const { data: rows, error } = await supabase
    .from('matches')
    .select('id, booking_id, bookings!inner(id, organizer_player_id, court_id, courts(club_id))')
    .eq('status', 'finished')
    .eq('payment_settled', false)
    .lte('payment_deadline_at', nowIso)
    .limit(BATCH_SIZE);

  if (error) {
    console.error('[settleOverdueMatchPayments] select failed:', error.message);
    return { processed: 0, charged: 0 };
  }
  if (!rows || rows.length === 0) return { processed: 0, charged: 0 };

  let charged = 0;

  for (const r of rows as OverdueRow[]) {
    const b = Array.isArray(r.bookings) ? r.bookings[0] : r.bookings;
    if (!b) continue;
    const courts = Array.isArray(b.courts) ? b.courts[0] : b.courts;
    const clubId = courts?.club_id;
    const organizerId = b.organizer_player_id;

    if (!organizerId) {
      console.warn('[settleOverdueMatchPayments] skipping match without organizer', r.id);
      await supabase
        .from('matches')
        .update({ payment_settled: true, updated_at: nowIso })
        .eq('id', r.id);
      continue;
    }

    const { data: pending } = await supabase
      .from('booking_participants')
      .select('id, player_id, share_amount_cents')
      .eq('booking_id', b.id)
      .eq('payment_status', 'pending');

    const pendingList = pending ?? [];
    const totalDebt = pendingList.reduce(
      (acc: number, p: { share_amount_cents: number }) => acc + Number(p.share_amount_cents || 0),
      0
    );

    if (pendingList.length === 0 || totalDebt <= 0) {
      await supabase
        .from('matches')
        .update({ payment_settled: true, updated_at: nowIso })
        .eq('id', r.id);
      continue;
    }

    const { error: txErr } = await supabase.from('wallet_transactions').insert([
      {
        player_id: organizerId,
        club_id: clubId ?? null,
        amount_cents: -totalDebt,
        type: 'organizer_debt',
        concept: 'Deuda por partido impago (CU-4.1)',
        booking_id: b.id,
        notes: `match_id=${r.id}`,
      },
    ]);
    if (txErr) {
      console.error('[settleOverdueMatchPayments] wallet insert failed:', txErr.message);
      continue;
    }

    for (const p of pendingList) {
      await supabase
        .from('booking_participants')
        .update({
          payment_status: 'paid',
          payment_method: 'organizer_debt',
          paid_amount_cents: p.share_amount_cents,
        })
        .eq('id', p.id);
    }

    await supabase
      .from('bookings')
      .update({ status: 'completed', updated_at: nowIso })
      .eq('id', b.id)
      .neq('status', 'cancelled');

    await supabase
      .from('matches')
      .update({ payment_settled: true, updated_at: nowIso })
      .eq('id', r.id);

    charged += 1;
  }

  return { processed: rows.length, charged };
}
