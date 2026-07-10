import { getSupabaseServiceRoleClient } from '../lib/supabase';

/**
 * Reroll tokens (phase 4a): consumable that buys an EXTRA reroll once the free
 * per-period quota (1 daily + 1 weekly) is spent. One ledger row per token;
 * active balance = rows with consumed_at null. Granted from the pass track
 * (reward_type 'reroll_token').
 */

/** Active (unspent) reroll tokens for the player in the season. */
export async function getRerollTokenBalance(playerId: string, seasonSlug: string): Promise<number> {
  const supabase = getSupabaseServiceRoleClient();
  const { count, error } = await supabase
    .from('player_reroll_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', playerId)
    .eq('season_slug', seasonSlug)
    .is('consumed_at', null);
  if (error) {
    console.warn('[reroll tokens] balance failed:', error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Consume one token race-safely (oldest first). Returns the consumed token id,
 * or null when the player has none (or lost the race to a concurrent reroll).
 */
export async function consumeRerollToken(
  playerId: string,
  seasonSlug: string,
  assignmentId: string
): Promise<string | null> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: candidate } = await supabase
    .from('player_reroll_tokens')
    .select('id')
    .eq('player_id', playerId)
    .eq('season_slug', seasonSlug)
    .is('consumed_at', null)
    .order('granted_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!candidate) return null;

  const { data: claimed, error } = await supabase
    .from('player_reroll_tokens')
    .update({ consumed_at: new Date().toISOString(), consumed_assignment_id: assignmentId })
    .eq('id', candidate.id)
    .is('consumed_at', null)
    .select('id');
  if (error || !claimed || claimed.length === 0) return null; // lost the race
  return String(candidate.id);
}

/** Best-effort refund of a token consumed for a reroll that ultimately failed. */
export async function refundRerollToken(tokenId: string): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('player_reroll_tokens')
    .update({ consumed_at: null, consumed_assignment_id: null })
    .eq('id', tokenId);
  if (error) console.warn('[reroll tokens] refund failed:', error.message);
}

/** Grant N tokens from a track reward (idempotency is guarded upstream by the grant ledger). */
export async function grantRerollTokens(
  playerId: string,
  seasonSlug: string,
  amount: number,
  sourceRewardId: string
): Promise<void> {
  if (amount <= 0) return;
  const supabase = getSupabaseServiceRoleClient();
  const rows = Array.from({ length: amount }, () => ({
    player_id: playerId,
    season_slug: seasonSlug,
    source_reward_id: sourceRewardId,
  }));
  const { error } = await supabase.from('player_reroll_tokens').insert(rows);
  if (error) console.warn('[reroll tokens] grant failed:', error.message);
}
