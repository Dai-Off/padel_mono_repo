import { getSupabaseServiceRoleClient } from './supabase';
import { getAccountDeletionGraceMs } from './accountDeletionConfig';
import { anonymizePlayer } from './anonymizePlayer';

export type AccountDeletionJobResult = {
  processed: number;
  succeeded: number;
  failed: number;
  errors: { playerId: string; error: string }[];
};

export async function runAccountDeletionJob(): Promise<AccountDeletionJobResult> {
  const supabase = getSupabaseServiceRoleClient();
  const cutoff = new Date(Date.now() - getAccountDeletionGraceMs()).toISOString();

  const { data: pending, error } = await supabase
    .from('players')
    .select('id, auth_user_id, deletion_requested_at')
    .eq('status', 'pending_deletion')
    .not('deletion_requested_at', 'is', null)
    .lte('deletion_requested_at', cutoff);

  if (error) throw new Error(error.message);

  const result: AccountDeletionJobResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    errors: [],
  };

  for (const row of pending ?? []) {
    const playerId = (row as { id: string }).id;
    const authUserId = (row as { auth_user_id: string | null }).auth_user_id;
    const requestedAt = (row as { deletion_requested_at: string }).deletion_requested_at;
    result.processed++;

    const anon = await anonymizePlayer(playerId);
    if (anon.ok) {
      result.succeeded++;
      await supabase.from('deletion_log').insert({
        player_id: playerId,
        auth_user_id: authUserId,
        event_type: 'completed',
        requested_at: requestedAt,
        processed_at: new Date().toISOString(),
      });
    } else {
      result.failed++;
      result.errors.push({ playerId, error: anon.error });
      await supabase.from('deletion_log').insert({
        player_id: playerId,
        auth_user_id: authUserId,
        event_type: 'failed',
        requested_at: requestedAt,
        processed_at: new Date().toISOString(),
        error_message: anon.error.slice(0, 500),
      });
    }
  }

  return result;
}
