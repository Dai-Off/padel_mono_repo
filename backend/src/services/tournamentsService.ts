import { getSupabaseServiceRoleClient } from '../lib/supabase';

function playersPerInscription(row: { player_id_2?: string | null }): number {
  return row.player_id_2 ? 2 : 1;
}

export async function cleanupExpiredTournamentInvites(tournamentId: string): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const now = new Date().toISOString();
  await supabase
    .from('tournament_inscriptions')
    .update({
      status: 'expired',
      updated_at: now,
      cancelled_at: now,
      cancelled_reason: 'TTL expired',
    })
    .eq('tournament_id', tournamentId)
    .eq('status', 'pending')
    .lte('expires_at', now);
}

export async function getTournamentSlots(tournamentId: string): Promise<{
  confirmedPlayers: number;
  pendingPlayers: number;
}> {
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('tournament_inscriptions')
    .select('status, player_id_2')
    .eq('tournament_id', tournamentId);
  if (error) throw new Error(error.message);

  let confirmedPlayers = 0;
  let pendingPlayers = 0;
  for (const row of data ?? []) {
    const count = playersPerInscription(row as { player_id_2?: string | null });
    const st = String((row as { status: string }).status);
    if (st === 'confirmed') confirmedPlayers += count;
    if (st === 'pending') pendingPlayers += count;
  }
  return { confirmedPlayers, pendingPlayers };
}

export async function refreshTournamentStatus(tournamentId: string): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  await cleanupExpiredTournamentInvites(tournamentId);
  const { data: tournament, error } = await supabase
    .from('tournaments')
    .select('id, status, max_players, registration_closed_at')
    .eq('id', tournamentId)
    .maybeSingle();
  if (error || !tournament) return;
  if ((tournament as { status: string }).status === 'cancelled') return;

  const nowMs = Date.now();
  const closeAt = (tournament as { registration_closed_at?: string | null }).registration_closed_at;
  const closeByTime = closeAt ? nowMs >= new Date(closeAt).getTime() : false;
  const { confirmedPlayers } = await getTournamentSlots(tournamentId);
  const closeByCapacity = confirmedPlayers >= Number((tournament as { max_players: number }).max_players);
  const shouldClose = closeByTime || closeByCapacity;
  const nextStatus = shouldClose ? 'closed' : 'open';
  if (nextStatus !== (tournament as { status: string }).status) {
    await supabase
      .from('tournaments')
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
        closed_at: shouldClose ? new Date().toISOString() : null,
      })
      .eq('id', tournamentId);
  }
}
