import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { dayKeyInTz, previousDayKey } from '../routes/learningTimezone';
import { SeasonPassSeasonRow } from './seasonPassSeasonConfig';
import { isValidTimezone } from './seasonPassPeriods';

/**
 * SP boost engine (plan §3/§6.4): one additive multiplier with several
 * sources, applied centrally by grantSeasonPassSp and capped by the season's
 * boost_cap. The player sees a single concept: "Boost activo: +X%".
 */

/** Global SP bonus from the daily lesson streak (+15/+30/+50/+70 at 3/8/21/46). */
export function streakSpBonus(streak: number): number {
  if (streak >= 46) return 0.7;
  if (streak >= 21) return 0.5;
  if (streak >= 8) return 0.3;
  if (streak >= 3) return 0.15;
  return 0;
}

export type SpBoostBreakdownRow = {
  source: 'lesson_streak' | 'pass_reward' | 'catch_up' | 'event';
  bonus: number;
  expires_at?: string | null;
};

export type ActiveSpBonus = { total: number; breakdown: SpBoostBreakdownRow[] };

const CATCH_UP_BONUS = 0.15;
const CATCH_UP_MISSION_LIMIT = 10;
const CATCH_UP_WINDOW_DAYS = 30;

export async function getActiveSpBonus(
  playerId: string,
  opts: { tz?: string; season?: SeasonPassSeasonRow | null } = {}
): Promise<ActiveSpBonus> {
  const supabase = getSupabaseServiceRoleClient();
  const breakdown: SpBoostBreakdownRow[] = [];
  const tz = opts.tz && isValidTimezone(opts.tz) ? opts.tz : 'UTC';

  // 1. lesson_streak — derived from learning_streaks, only while the streak
  // is alive (last lesson today or yesterday in the player's timezone).
  try {
    const { data } = await supabase
      .from('learning_streaks')
      .select('current_streak, last_lesson_completed_at')
      .eq('player_id', playerId)
      .maybeSingle();
    if (data?.last_lesson_completed_at) {
      const todayKey = dayKeyInTz(new Date(), tz);
      const lastKey = dayKeyInTz(new Date(data.last_lesson_completed_at), tz);
      const alive = lastKey === todayKey || lastKey === previousDayKey(todayKey);
      const bonus = alive ? streakSpBonus(Number(data.current_streak ?? 0)) : 0;
      if (bonus > 0) breakdown.push({ source: 'lesson_streak', bonus });
    }
  } catch (e) {
    console.warn('[sp-boosts] streak lookup failed:', (e as Error).message);
  }

  // 2. Consumable boosters (auto-activated on grant; time window in S1,
  // remaining_missions supported for future seasons).
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('player_sp_boosts')
      .select('source, bonus, remaining_missions, expires_at')
      .eq('player_id', playerId)
      .is('consumed_at', null);
    if (!error) {
      for (const b of data ?? []) {
        const expired = b.expires_at ? String(b.expires_at) <= nowIso : false;
        const drained = b.remaining_missions !== null && Number(b.remaining_missions) <= 0;
        if (expired || drained) continue;
        const source = String(b.source) as SpBoostBreakdownRow['source'];
        breakdown.push({ source, bonus: Number(b.bonus), expires_at: b.expires_at ?? null });
      }
    }
  } catch {
    // Table not migrated yet (093) — boosters simply contribute nothing.
  }

  // 3. catch_up — season's last month and fewer than 10 missions completed.
  const season = opts.season;
  if (season?.ends_at) {
    const end = new Date(season.ends_at).getTime();
    const now = Date.now();
    if (now < end && end - now <= CATCH_UP_WINDOW_DAYS * 86_400_000) {
      try {
        const { count } = await supabase
          .from('player_season_pass_missions')
          .select('*', { count: 'exact', head: true })
          .eq('player_id', playerId)
          .not('completed_at', 'is', null);
        if ((count ?? 0) < CATCH_UP_MISSION_LIMIT) {
          breakdown.push({ source: 'catch_up', bonus: CATCH_UP_BONUS });
        }
      } catch (e) {
        console.warn('[sp-boosts] catch-up lookup failed:', (e as Error).message);
      }
    }
  }

  const total = breakdown.reduce((acc, b) => acc + b.bonus, 0);
  return { total, breakdown };
}

/**
 * Decrement per-mission consumable boosters after a mission grant (S1 boosters
 * are time-windowed so this is a no-op; kept for future seasons per plan §6.4).
 */
export async function consumeMissionBoosts(playerId: string): Promise<void> {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('player_sp_boosts')
      .select('id, remaining_missions')
      .eq('player_id', playerId)
      .is('consumed_at', null)
      .not('remaining_missions', 'is', null)
      .gt('remaining_missions', 0);
    if (error || !data?.length) return;
    for (const b of data) {
      const left = Number(b.remaining_missions) - 1;
      await supabase
        .from('player_sp_boosts')
        .update({
          remaining_missions: left,
          ...(left <= 0 ? { consumed_at: new Date().toISOString() } : {}),
        })
        .eq('id', b.id);
    }
  } catch {
    // Table not migrated yet — nothing to consume.
  }
}
