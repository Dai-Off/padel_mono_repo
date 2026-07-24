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

export type OpenMatchSyncOpts = {
  elo_min?: number | null;
  elo_max?: number | null;
};

/**
 * Reservas `open_match` creadas solo con POST /bookings necesitan fila en `matches` + jugadores para la app.
 * Idempotente: si ya existe `matches` para el booking, solo sincroniza `match_players`.
 * Permite partidos publicados por el club sin organizador (0 jugadores) para compartir link / unirse desde la app.
 */
export async function ensureOpenMatchRecordForBooking(
  supabase: SupabaseClient,
  bookingId: string,
  opts?: OpenMatchSyncOpts,
): Promise<void> {
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
  if (row.reservation_type !== 'open_match') return;

  const { data: existing } = await supabase.from('matches').select('id').eq('booking_id', bookingId).maybeSingle();
  let matchId = (existing as { id?: string } | null)?.id;

  if (!matchId) {
    const { data: inserted, error: mErr } = await supabase
      .from('matches')
      .insert([
        {
          booking_id: bookingId,
          visibility: 'public',
          elo_min: opts?.elo_min ?? null,
          elo_max: opts?.elo_max ?? null,
          gender: 'any',
          competitive: false,
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
  } else if (opts && (opts.elo_min !== undefined || opts.elo_max !== undefined)) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (opts.elo_min !== undefined) patch.elo_min = opts.elo_min;
    if (opts.elo_max !== undefined) patch.elo_max = opts.elo_max;
    await supabase.from('matches').update(patch).eq('id', matchId);
  }

  if (!matchId) return;

  if (row.organizer_player_id) {
    const totalCents = Number(row.total_price_cents ?? 0);
    const shareCents = Math.ceil(totalCents / 4);
    await supabase
      .from('booking_participants')
      .update({ share_amount_cents: shareCents })
      .eq('booking_id', bookingId)
      .eq('player_id', row.organizer_player_id);
  }

  await syncMatchPlayersFromBooking(supabase, matchId, bookingId);
}

/** Repara partidos abiertos cuyo listado quedó sin jugadores pese a tener organizador/participantes en la reserva. */
export async function repairOpenMatchPlayersIfNeeded(
  supabase: SupabaseClient,
  matchId: string,
  bookingId: string,
): Promise<boolean> {
  const { data: mps, error: mpErr } = await supabase
    .from('match_players')
    .select('players (id)')
    .eq('match_id', matchId);
  if (mpErr) {
    console.error('[repairOpenMatchPlayersIfNeeded] match_players:', mpErr.message);
    return false;
  }
  const filled = (mps ?? []).filter((row) => {
    const raw = (row as { players?: { id?: string } | { id?: string }[] | null }).players;
    const p = Array.isArray(raw) ? raw[0] : raw;
    return Boolean(p?.id);
  }).length;
  if (filled > 0) return false;

  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('organizer_player_id, reservation_type')
    .eq('id', bookingId)
    .maybeSingle();
  if (bErr || !booking) return false;

  const row = booking as { organizer_player_id?: string | null; reservation_type?: string | null };
  if (row.reservation_type !== 'open_match') return false;

  if (!row.organizer_player_id) {
    const { count: partCount, error: pErr } = await supabase
      .from('booking_participants')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', bookingId);
    if (pErr || (partCount ?? 0) === 0) return false;
  }

  await syncMatchPlayersFromBooking(supabase, matchId, bookingId);
  return true;
}
