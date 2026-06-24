import type { SupabaseClient } from '@supabase/supabase-js';

const DEMO_EMAIL_SUFFIX = '@padel-demo.local';

export function isDemoPlayerEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.trim().toLowerCase().endsWith(DEMO_EMAIL_SUFFIX);
}

/** Quita jugadores demo de una reserva para dejar plazas a usuarios reales. */
export async function evictDemoPlayersFromBooking(
  supabase: SupabaseClient,
  bookingId: string,
  opts?: { keepPlayerIds?: string[] },
): Promise<number> {
  const keep = new Set(opts?.keepPlayerIds ?? []);
  const { data: parts, error: pErr } = await supabase
    .from('booking_participants')
    .select('player_id, players!booking_participants_player_id_fkey(email)')
    .eq('booking_id', bookingId);
  if (pErr) throw new Error(pErr.message);

  const demoIds: string[] = [];
  for (const row of parts ?? []) {
    const pid = (row as { player_id?: string }).player_id;
    if (!pid || keep.has(pid)) continue;
    const pl = (row as { players?: { email?: string } | { email?: string }[] }).players;
    const player = Array.isArray(pl) ? pl[0] : pl;
    if (isDemoPlayerEmail(player?.email)) demoIds.push(pid);
  }
  if (demoIds.length === 0) return 0;

  const { data: match } = await supabase.from('matches').select('id').eq('booking_id', bookingId).maybeSingle();
  const matchId = (match as { id?: string } | null)?.id;

  for (const pid of demoIds) {
    if (matchId) {
      await supabase.from('match_players').delete().eq('match_id', matchId).eq('player_id', pid);
    }
    await supabase.from('booking_participants').delete().eq('booking_id', bookingId).eq('player_id', pid);
  }

  return demoIds.length;
}

export async function evictDemoPlayersWhenRealJoins(
  supabase: SupabaseClient,
  bookingId: string,
  realPlayerId: string,
): Promise<number> {
  const { data: player, error } = await supabase
    .from('players')
    .select('email')
    .eq('id', realPlayerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (isDemoPlayerEmail((player as { email?: string } | null)?.email)) return 0;
  return evictDemoPlayersFromBooking(supabase, bookingId, { keepPlayerIds: [realPlayerId] });
}
