import type { SupabaseClient } from '@supabase/supabase-js';

/** Partidos en los que el jugador tiene fila en `match_players` (misma métrica que Coach IA). */
export async function countPlayerMatchParticipations(
  supabase: SupabaseClient,
  playerId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('match_players')
    .select('*', { count: 'exact', head: true })
    .eq('player_id', playerId);

  if (error) throw error;
  return count ?? 0;
}
