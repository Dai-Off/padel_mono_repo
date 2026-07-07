import { getActiveSeasonRow, SeasonPassSeasonRow } from './seasonPassSeasonConfig';
import { addSeasonPassSp, computeSeasonPass, getOrCreateSeasonPassRow } from './seasonPassService';

export type SpBoostBreakdownRow = { source: string; bonus: number };

/**
 * Active SP bonus for a player. Phase 3 (SP boost engine) plugs in here:
 * lesson_streak (derived from learning_streaks), pass_reward (player_sp_boosts)
 * and catch_up. Until then everything grants at base value.
 */
export async function getActiveSpBonus(
  _playerId: string
): Promise<{ total: number; breakdown: SpBoostBreakdownRow[] }> {
  return { total: 0, breakdown: [] };
}

export type SeasonPassGrantResult = {
  granted_sp: number;
  sp_total: number;
  boost_applied: number;
  level_from: number;
  level_to: number;
};

export type SeasonPassGrantContext = {
  source: 'mission' | 'level_reward' | 'admin';
  missionId?: string;
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
  _ctx: SeasonPassGrantContext,
  seasonArg?: SeasonPassSeasonRow
): Promise<SeasonPassGrantResult> {
  const season = seasonArg ?? (await getActiveSeasonRow());
  if (!season) throw new Error('No hay temporada activa en season_pass_seasons');

  const { total } = await getActiveSpBonus(playerId);
  const cap = Math.max(1, Number(season.boost_cap ?? 2));
  const boost = Math.min(Math.max(0, total), cap - 1);
  const finalSp = Math.max(0, Math.round(Math.max(0, baseSp) * (1 + boost)));

  const before = await getOrCreateSeasonPassRow(playerId);
  let spTotal = before.sp;
  if (finalSp > 0) {
    const r = await addSeasonPassSp(playerId, finalSp);
    spTotal = r.sp;
  }

  const levelFrom = computeSeasonPass(before.sp, season.sp_per_level, season.max_level).level;
  const levelTo = computeSeasonPass(spTotal, season.sp_per_level, season.max_level).level;
  return {
    granted_sp: spTotal - before.sp,
    sp_total: spTotal,
    boost_applied: boost,
    level_from: levelFrom,
    level_to: levelTo,
  };
}
