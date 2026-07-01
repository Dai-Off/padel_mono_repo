import type { SupabaseClient } from '@supabase/supabase-js';

/** Marca como canceladas las invitaciones activas de un partido (p. ej. al cancelar la reserva). */
export async function cancelActiveInvitesForMatch(
  supabase: SupabaseClient,
  matchId: string,
): Promise<{ error?: string }> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('match_invites')
    .update({ status: 'cancelled', updated_at: now })
    .eq('match_id', matchId)
    .in('status', ['pending', 'accepted']);
  if (error) return { error: error.message };
  return {};
}
