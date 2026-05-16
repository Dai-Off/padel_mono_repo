import type { SupabaseClient } from '@supabase/supabase-js';

/** Elimina y vuelve a crear `match_players` desde `booking_participants` + organizador (slots 0..3). */
export async function syncMatchPlayersFromBooking(
  supabase: SupabaseClient,
  matchId: string,
  bookingId: string,
): Promise<void> {
  await supabase.from('match_players').delete().eq('match_id', matchId);

  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('organizer_player_id')
    .eq('id', bookingId)
    .maybeSingle();
  if (bErr || !booking) return;

  const orgId = (booking as { organizer_player_id?: string | null }).organizer_player_id;
  const { data: parts } = await supabase
    .from('booking_participants')
    .select('player_id')
    .eq('booking_id', bookingId);

  const seen = new Set<string>();
  const ordered: string[] = [];
  if (orgId) {
    ordered.push(String(orgId));
    seen.add(String(orgId));
  }
  for (const row of parts ?? []) {
    const pid = (row as { player_id?: string }).player_id;
    if (pid && !seen.has(pid)) {
      ordered.push(pid);
      seen.add(pid);
    }
  }

  let slot = 0;
  for (const playerId of ordered.slice(0, 4)) {
    const { error } = await supabase.from('match_players').insert({
      match_id: matchId,
      player_id: playerId,
      team: 'A',
      invite_status: 'accepted',
      slot_index: slot,
    });
    if (error && error.code !== '23505') {
      console.error('[syncMatchPlayersFromBooking] insert:', error.message);
    }
    slot += 1;
  }
}

/**
 * Reservas `open_match` creadas solo con POST /bookings necesitan fila en `matches` + jugadores para la app.
 * Idempotente: si ya existe `matches` para el booking, solo sincroniza `match_players`.
 */
export async function ensureOpenMatchRecordForBooking(supabase: SupabaseClient, bookingId: string): Promise<void> {
  const { data: b, error: bErr } = await supabase
    .from('bookings')
    .select('id, reservation_type, organizer_player_id, total_price_cents')
    .eq('id', bookingId)
    .maybeSingle();
  if (bErr || !b) return;

  const row = b as {
    reservation_type?: string | null;
    organizer_player_id?: string | null;
    total_price_cents?: number | null;
  };
  if (row.reservation_type !== 'open_match' || !row.organizer_player_id) return;

  const { data: existing } = await supabase.from('matches').select('id').eq('booking_id', bookingId).maybeSingle();
  let matchId = (existing as { id?: string } | null)?.id;

  if (!matchId) {
    const { data: orgPl } = await supabase
      .from('players')
      .select('elo_rating')
      .eq('id', row.organizer_player_id)
      .maybeSingle();
    const elo = Number((orgPl as { elo_rating?: number } | null)?.elo_rating ?? 3.5);
    const eloMinIns = Math.round((elo - 0.5) * 10) / 10;
    const eloMaxIns = Math.round((elo + 0.5) * 10) / 10;

    const { data: inserted, error: mErr } = await supabase
      .from('matches')
      .insert([
        {
          booking_id: bookingId,
          visibility: 'public',
          elo_min: eloMinIns,
          elo_max: eloMaxIns,
          gender: 'any',
          competitive: true,
          type: 'open',
        },
      ])
      .select('id')
      .maybeSingle();
    if (mErr) {
      console.error('[ensureOpenMatchRecordForBooking] match insert:', mErr.message);
      return;
    }
    matchId = (inserted as { id?: string } | null)?.id;
  }

  if (!matchId) return;

  const totalCents = Number(row.total_price_cents ?? 0);
  const shareCents = Math.ceil(totalCents / 4);
  await supabase
    .from('booking_participants')
    .update({ share_amount_cents: shareCents })
    .eq('booking_id', bookingId)
    .eq('player_id', row.organizer_player_id);

  await syncMatchPlayersFromBooking(supabase, matchId, bookingId);
}
