import type { SupabaseClient } from '@supabase/supabase-js';

/** Quita al jugador de la cola cuando ya pagó su plaza en un partido matchmaking. */
export async function clearMatchmakingPoolIfPlayerPaid(
  supabase: SupabaseClient,
  playerId: string,
  bookingId?: string | null,
): Promise<boolean> {
  let resolvedBookingId = bookingId?.trim() || null;

  if (!resolvedBookingId) {
    const { data: pool } = await supabase
      .from('matchmaking_pool')
      .select('proposed_match_id, status')
      .eq('player_id', playerId)
      .maybeSingle();
    const row = pool as { proposed_match_id?: string | null; status?: string } | null;
    if (!row || row.status !== 'matched' || !row.proposed_match_id) return false;

    const { data: match } = await supabase
      .from('matches')
      .select('booking_id, type')
      .eq('id', row.proposed_match_id)
      .maybeSingle();
    const m = match as { booking_id?: string | null; type?: string } | null;
    if (m?.type !== 'matchmaking' || !m.booking_id) return false;
    resolvedBookingId = m.booking_id;
  }

  const { data: matchRow } = await supabase
    .from('matches')
    .select('type')
    .eq('booking_id', resolvedBookingId)
    .maybeSingle();
  if ((matchRow as { type?: string } | null)?.type !== 'matchmaking') return false;

  const { data: part } = await supabase
    .from('booking_participants')
    .select('payment_status')
    .eq('booking_id', resolvedBookingId)
    .eq('player_id', playerId)
    .maybeSingle();
  if ((part as { payment_status?: string } | null)?.payment_status !== 'paid') return false;

  await supabase.from('matchmaking_pool').delete().eq('player_id', playerId);
  return true;
}
