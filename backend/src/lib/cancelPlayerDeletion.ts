import { getSupabaseServiceRoleClient } from './supabase';

/** Reverts pending_deletion → active. Returns true if cancellation happened. */
export async function cancelPlayerDeletionIfPending(
  playerId: string,
  authUserId: string | null,
): Promise<boolean> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: player } = await supabase
    .from('players')
    .select('id, status, deletion_requested_at')
    .eq('id', playerId)
    .maybeSingle();

  if (!player || (player as { status: string }).status !== 'pending_deletion') {
    return false;
  }

  const requestedAt = (player as { deletion_requested_at: string | null }).deletion_requested_at;
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('players')
    .update({
      status: 'active',
      deletion_requested_at: null,
      updated_at: now,
    })
    .eq('id', playerId)
    .eq('status', 'pending_deletion');

  if (error) {
    console.error('[cancelPlayerDeletionIfPending]', playerId, error.message);
    return false;
  }

  await supabase.from('deletion_log').insert({
    player_id: playerId,
    auth_user_id: authUserId,
    event_type: 'cancel',
    requested_at: requestedAt,
    processed_at: now,
  });

  return true;
}
