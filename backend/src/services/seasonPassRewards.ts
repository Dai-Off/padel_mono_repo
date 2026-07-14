import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { SeasonPassSeasonRow } from './seasonPassSeasonConfig';
import { addSeasonPassSp, computeSeasonPass, getOrCreateSeasonPassRow } from './seasonPassService';
import { grantRerollTokens } from './seasonPassRerollTokens';

export type SeasonPassRewardTier = 'free' | 'elite';

export type SeasonPassRewardRow = {
  id: string;
  season_slug: string;
  level: number;
  tier: SeasonPassRewardTier;
  reward_type: 'unlockable' | 'sp_boost' | 'sp' | 'reroll_token';
  unlockable_id: string | null;
  boost_config: Record<string, unknown> | null;
  sp_amount: number | null;
  reroll_tokens: number | null;
  display: Record<string, unknown>;
  sort_order: number;
  unlockable: {
    id: string;
    kind: string;
    title: string;
    rarity: string;
    icon: string | null;
    animation_type: string | null;
    style: string | null;
    colors: unknown;
  } | null;
};

/** Render descriptor for mobile (procedural render: rarity colors, frame presets). */
export type RewardDisplay = {
  kind: string; // trophy | badge | title | frame | sp | sp_boost
  label: string;
  icon: string | null;
  rarity: string | null;
  colors: unknown;
  animation_type: string | null;
  style: string | null;
};

let rewardsCache: { seasonSlug: string; at: number; rows: SeasonPassRewardRow[] } | null = null;
const REWARDS_CACHE_MS = 60_000;

export async function loadSeasonRewards(seasonSlug: string): Promise<SeasonPassRewardRow[]> {
  if (
    rewardsCache &&
    rewardsCache.seasonSlug === seasonSlug &&
    Date.now() - rewardsCache.at < REWARDS_CACHE_MS
  ) {
    return rewardsCache.rows;
  }
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('season_pass_rewards')
    .select(
      'id, season_slug, level, tier, reward_type, unlockable_id, boost_config, sp_amount, reroll_tokens, display, sort_order, unlockable:unlockables(id, kind, title, rarity, icon, animation_type, style, colors)'
    )
    .eq('season_slug', seasonSlug)
    .order('level', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as SeasonPassRewardRow[];
  rewardsCache = { seasonSlug, at: Date.now(), rows };
  return rows;
}

export function buildRewardDisplay(r: SeasonPassRewardRow): RewardDisplay {
  if (r.reward_type === 'unlockable' && r.unlockable) {
    return {
      kind: r.unlockable.kind,
      label: r.unlockable.title,
      icon: r.unlockable.icon,
      rarity: r.unlockable.rarity,
      colors: r.unlockable.colors ?? null,
      animation_type: r.unlockable.animation_type,
      style: r.unlockable.style,
    };
  }
  const d = r.display ?? {};
  const fallbackLabel = r.sp_amount ? `+${r.sp_amount} SP` : '';
  return {
    kind: r.reward_type,
    label: typeof d.label === 'string' ? d.label : fallbackLabel,
    icon: typeof d.icon === 'string' ? d.icon : '🎁',
    rarity: typeof d.rarity === 'string' ? d.rarity : null,
    colors: d.colors ?? null,
    animation_type: null,
    style: null,
  };
}

export type GrantedReward = {
  reward_id: string;
  level: number;
  tier: SeasonPassRewardTier;
  reward_type: string;
  display: RewardDisplay;
};

/** Aplica el efecto de una recompensa (sin tocar el ledger). */
async function applyRewardEffect(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  playerId: string,
  season: SeasonPassSeasonRow,
  r: SeasonPassRewardRow
): Promise<void> {
  if (r.reward_type === 'unlockable' && r.unlockable_id) {
    const { error } = await supabase.from('player_unlockables').upsert(
      { player_id: playerId, unlockable_id: r.unlockable_id },
      { onConflict: 'player_id,unlockable_id', ignoreDuplicates: true }
    );
    if (error) console.warn('[season-pass claim] unlock failed:', error.message);
  } else if (r.reward_type === 'sp' && r.sp_amount) {
    try {
      await addSeasonPassSp(playerId, r.sp_amount);
    } catch (e) {
      console.warn('[season-pass claim] sp grant failed:', (e as Error).message);
    }
  } else if (r.reward_type === 'sp_boost') {
    // Se auto-activa al reclamar, con ventana temporal.
    const cfg = r.boost_config ?? {};
    const bonus = Number(cfg.bonus ?? 0);
    const hours = Number(cfg.expires_hours ?? 48);
    if (bonus > 0) {
      const expiresAt = new Date(Date.now() + hours * 3_600_000).toISOString();
      const { error } = await supabase.from('player_sp_boosts').insert({
        player_id: playerId,
        source: 'pass_reward',
        bonus,
        expires_at: expiresAt,
      });
      if (error) console.warn('[season-pass claim] boost grant failed:', error.message);
    }
  } else if (r.reward_type === 'reroll_token' && r.reroll_tokens) {
    await grantRerollTokens(playerId, season.slug, r.reroll_tokens, r.id);
  }
}

/**
 * Claim manual (bloque C): reclama UNA recompensa. Idempotente vía el ledger
 * (unique player+reward): solo aplica el efecto si la fila se creó ahora.
 * Devuelve el GrantedReward si se reclamó, null si ya estaba reclamada.
 */
export async function claimReward(
  playerId: string,
  season: SeasonPassSeasonRow,
  r: SeasonPassRewardRow
): Promise<GrantedReward | null> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: claimed, error } = await supabase
    .from('player_season_pass_reward_grants')
    .upsert(
      { player_id: playerId, reward_id: r.id, notified_at: new Date().toISOString() },
      { onConflict: 'player_id,reward_id', ignoreDuplicates: true }
    )
    .select('id');
  if (error) {
    console.warn('[season-pass claim] ledger failed:', error.message);
    return null;
  }
  if (!claimed || claimed.length === 0) return null; // ya reclamada
  await applyRewardEffect(supabase, playerId, season, r);
  return {
    reward_id: r.id,
    level: r.level,
    tier: r.tier,
    reward_type: r.reward_type,
    display: buildRewardDisplay(r),
  };
}

export type ClaimResult =
  | { ok: true; reward: GrantedReward }
  | { ok: false; code: 'not_found' | 'locked' | 'needs_elite' | 'already_claimed' };

/** Reclama una recompensa por id, validando nivel alcanzado y carril disponible. */
export async function claimSingleReward(
  playerId: string,
  season: SeasonPassSeasonRow,
  rewardId: string
): Promise<ClaimResult> {
  const all = await loadSeasonRewards(season.slug);
  const r = all.find((x) => x.id === rewardId);
  if (!r) return { ok: false, code: 'not_found' };
  const row = await getOrCreateSeasonPassRow(playerId);
  const level = computeSeasonPass(row.sp, season.sp_per_level, season.max_level).level;
  if (r.level > level) return { ok: false, code: 'locked' };
  if (r.tier === 'elite' && !row.has_elite) return { ok: false, code: 'needs_elite' };
  const granted = await claimReward(playerId, season, r);
  if (!granted) return { ok: false, code: 'already_claimed' };
  return { ok: true, reward: granted };
}

/** Reclama TODAS las reclamables (nivel alcanzado, carril disponible, no reclamadas). */
export async function claimAllRewards(
  playerId: string,
  season: SeasonPassSeasonRow
): Promise<GrantedReward[]> {
  const all = await loadSeasonRewards(season.slug);
  const row = await getOrCreateSeasonPassRow(playerId);
  const level = computeSeasonPass(row.sp, season.sp_per_level, season.max_level).level;
  const grantedIds = await listGrantedRewardIds(playerId);
  const tiers: SeasonPassRewardTier[] = row.has_elite ? ['free', 'elite'] : ['free'];
  const claimable = all
    .filter((r) => r.level <= level && tiers.includes(r.tier) && !grantedIds.has(r.id))
    .sort((a, b) => a.level - b.level);
  const out: GrantedReward[] = [];
  for (const r of claimable) {
    const g = await claimReward(playerId, season, r);
    if (g) out.push(g);
  }
  return out;
}

/** Reward ids already granted to the player (for track status in /me). */
export async function listGrantedRewardIds(playerId: string): Promise<Set<string>> {
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('player_season_pass_reward_grants')
    .select('reward_id')
    .eq('player_id', playerId);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => String(r.reward_id)));
}

/** Ack de recompensas celebradas. Returns how many rows were acked. */
export async function ackRewardGrants(playerId: string, rewardIds: string[]): Promise<number> {
  if (rewardIds.length === 0) return 0;
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('player_season_pass_reward_grants')
    .update({ notified_at: new Date().toISOString() })
    .eq('player_id', playerId)
    .in('reward_id', rewardIds)
    .is('notified_at', null)
    .select('id');
  if (error) throw new Error(error.message);
  return (data ?? []).length;
}
