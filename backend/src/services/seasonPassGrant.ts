import { getActiveSeasonRow, SeasonPassSeasonRow } from './seasonPassSeasonConfig';
import { addSeasonPassSp, computeSeasonPass, getOrCreateSeasonPassRow } from './seasonPassService';
import { GrantedReward, grantLevelRewards } from './seasonPassRewards';
import { consumeMissionBoosts, getActiveSpBonus } from './seasonPassBoosts';

export type SeasonPassGrantResult = {
  granted_sp: number;
  sp_total: number;
  boost_applied: number;
  level_from: number;
  level_to: number;
  /** Level rewards delivered by this grant (phase 2), for celebration UIs. */
  rewards_granted: GrantedReward[];
};

export type SeasonPassGrantContext = {
  source: 'mission' | 'level_reward' | 'admin';
  missionId?: string;
  /** Player timezone: needed to judge whether the lesson streak is alive. */
  tz?: string;
};

/**
 * Single entry point for ALL season pass SP grants (plan §6.4). Applies the
 * active boost capped by the season's boost_cap, adds the SP (already capped
 * at max_level by addSeasonPassSp) and reports level crossings so callers can
 * trigger level-up rewards/celebrations.
 */
export async function grantSeasonPassSp(
  playerId: string,
  baseSp: number,
  ctx: SeasonPassGrantContext,
  seasonArg?: SeasonPassSeasonRow
): Promise<SeasonPassGrantResult> {
  const season = seasonArg ?? (await getActiveSeasonRow());
  if (!season) throw new Error('No hay temporada activa en season_pass_seasons');

  const { total } = await getActiveSpBonus(playerId, { tz: ctx.tz, season });
  const cap = Math.max(1, Number(season.boost_cap ?? 2));
  const boost = Math.min(Math.max(0, total), cap - 1);
  const finalSp = Math.max(0, Math.round(Math.max(0, baseSp) * (1 + boost)));

  const before = await getOrCreateSeasonPassRow(playerId);
  let spTotal = before.sp;
  if (finalSp > 0) {
    const r = await addSeasonPassSp(playerId, finalSp);
    spTotal = r.sp;
    // Per-mission consumable boosters tick down (no-op with S1's time windows).
    if (ctx.source === 'mission' && ctx.missionId) await consumeMissionBoosts(playerId);
  }

  const levelFrom = computeSeasonPass(before.sp, season.sp_per_level, season.max_level).level;
  let levelTo = computeSeasonPass(spTotal, season.sp_per_level, season.max_level).level;

  // Phase 2: crossing levels delivers the track rewards (free always, elite
  // if purchased). Direct-SP rewards can push further levels — refresh after.
  let rewardsGranted: GrantedReward[] = [];
  if (levelTo > levelFrom) {
    try {
      const tiers: ('free' | 'elite')[] = before.has_elite ? ['free', 'elite'] : ['free'];
      rewardsGranted = await grantLevelRewards(playerId, season, levelFrom, levelTo, tiers);
      if (rewardsGranted.some((r) => r.reward_type === 'sp')) {
        const refreshed = await getOrCreateSeasonPassRow(playerId);
        spTotal = refreshed.sp;
        levelTo = computeSeasonPass(spTotal, season.sp_per_level, season.max_level).level;
      }
    } catch (e) {
      console.warn('[season-pass] level rewards failed:', (e as Error).message);
    }
  }

  return {
    granted_sp: spTotal - before.sp,
    sp_total: spTotal,
    boost_applied: boost,
    level_from: levelFrom,
    level_to: levelTo,
    rewards_granted: rewardsGranted,
  };
}
