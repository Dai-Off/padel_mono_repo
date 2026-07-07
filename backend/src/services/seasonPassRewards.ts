import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { SeasonPassSeasonRow } from './seasonPassSeasonConfig';
import { addSeasonPassSp, computeSeasonPass, getOrCreateSeasonPassRow } from './seasonPassService';

export type SeasonPassRewardTier = 'free' | 'elite';

export type SeasonPassRewardRow = {
  id: string;
  season_slug: string;
  level: number;
  tier: SeasonPassRewardTier;
  reward_type: 'unlockable' | 'sp_boost' | 'sp';
  unlockable_id: string | null;
  boost_config: Record<string, unknown> | null;
  sp_amount: number | null;
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
      'id, season_slug, level, tier, reward_type, unlockable_id, boost_config, sp_amount, display, sort_order, unlockable:unlockables(id, kind, title, rarity, icon, animation_type, style, colors)'
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

/**
 * Grant every reward in levels (fromLevel, toLevel] for the given tiers.
 * Idempotent: the grant ledger's unique key claims each reward exactly once
 * (concurrent evaluations skip already-claimed rows). Effects:
 * - unlockable → row in player_unlockables (UnlockModalHost picks it up)
 * - sp → direct SP without boosts (plan §6.3); if that SP crosses more
 *   levels, the loop grants those too (bounded)
 * - sp_boost → phase 3 (ignored with a warning until player_sp_boosts ships)
 */
export async function grantLevelRewards(
  playerId: string,
  season: SeasonPassSeasonRow,
  fromLevel: number,
  toLevel: number,
  tiers: SeasonPassRewardTier[]
): Promise<GrantedReward[]> {
  const supabase = getSupabaseServiceRoleClient();
  const all = await loadSeasonRewards(season.slug);
  const granted: GrantedReward[] = [];

  let lo = fromLevel;
  let hi = toLevel;
  for (let iter = 0; iter < 5 && hi > lo; iter += 1) {
    const candidates = all.filter(
      (r) => r.level > lo && r.level <= hi && tiers.includes(r.tier)
    );
    let grantedSp = 0;

    for (const r of candidates) {
      // Claim: empty result = someone else (or a past run) already granted it.
      const { data: claimed, error: claimErr } = await supabase
        .from('player_season_pass_reward_grants')
        .upsert(
          { player_id: playerId, reward_id: r.id },
          { onConflict: 'player_id,reward_id', ignoreDuplicates: true }
        )
        .select('id');
      if (claimErr) {
        console.warn('[season-pass rewards] claim failed:', claimErr.message);
        continue;
      }
      if (!claimed || claimed.length === 0) continue;

      if (r.reward_type === 'unlockable' && r.unlockable_id) {
        const { error: unlockErr } = await supabase.from('player_unlockables').upsert(
          { player_id: playerId, unlockable_id: r.unlockable_id },
          { onConflict: 'player_id,unlockable_id', ignoreDuplicates: true }
        );
        if (unlockErr) console.warn('[season-pass rewards] unlock failed:', unlockErr.message);
      } else if (r.reward_type === 'sp' && r.sp_amount) {
        try {
          await addSeasonPassSp(playerId, r.sp_amount);
          grantedSp += r.sp_amount;
        } catch (e) {
          console.warn('[season-pass rewards] sp grant failed:', (e as Error).message);
        }
      } else if (r.reward_type === 'sp_boost') {
        // Auto-activated on grant with a time window (decided 2026-07-07).
        const cfg = r.boost_config ?? {};
        const bonus = Number(cfg.bonus ?? 0);
        const hours = Number(cfg.expires_hours ?? 48);
        if (bonus > 0) {
          const expiresAt = new Date(Date.now() + hours * 3_600_000).toISOString();
          const { error: boostErr } = await supabase.from('player_sp_boosts').insert({
            player_id: playerId,
            source: 'pass_reward',
            bonus,
            expires_at: expiresAt,
          });
          if (boostErr) console.warn('[season-pass rewards] boost grant failed:', boostErr.message);
        }
      }

      granted.push({
        reward_id: r.id,
        level: r.level,
        tier: r.tier,
        reward_type: r.reward_type,
        display: buildRewardDisplay(r),
      });
    }

    if (grantedSp <= 0) break;
    lo = hi;
    const row = await getOrCreateSeasonPassRow(playerId);
    hi = computeSeasonPass(row.sp, season.sp_per_level, season.max_level).level;
  }

  return granted;
}

/**
 * Retroactive Elite grant (plan §6.3.3): on Elite purchase, deliver every
 * elite reward from level 1 up to the player's current level.
 */
export async function grantEliteRetroactiveRewards(
  playerId: string,
  season: SeasonPassSeasonRow
): Promise<GrantedReward[]> {
  const row = await getOrCreateSeasonPassRow(playerId);
  const level = computeSeasonPass(row.sp, season.sp_per_level, season.max_level).level;
  return grantLevelRewards(playerId, season, 0, level, ['elite']);
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
