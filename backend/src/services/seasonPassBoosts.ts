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
const CATCH_UP_WINDOW_DAYS = 15; // recta final: temporada de 45 días → últimos 15

export async function getActiveSpBonus(
  playerId: string,
  opts: { tz?: string; season?: SeasonPassSeasonRow | null } = {}
): Promise<ActiveSpBonus> {
  const supabase = getSupabaseServiceRoleClient();
  const breakdown: SpBoostBreakdownRow[] = [];
  const tz = opts.tz && isValidTimezone(opts.tz) ? opts.tz : 'UTC';

  // El catch_up solo aplica en el último mes de la temporada: calculamos la
  // condición antes para lanzar su query solo cuando toca.
  const season = opts.season;
  const catchUpApplies = (() => {
    if (!season?.ends_at) return false;
    const end = new Date(season.ends_at).getTime();
    const now = Date.now();
    return now < end && end - now <= CATCH_UP_WINDOW_DAYS * 86_400_000;
  })();

  // Las tres fuentes son independientes → una sola tanda. Cada query de Supabase
  // resuelve {data/count, error} (no rechaza), así que un fallo por tabla sin
  // migrar degrada esa fuente sin romper las demás.
  const [streakRes, boostsRes, catchUpRes] = await Promise.all([
    supabase
      .from('learning_streaks')
      .select('current_streak, last_lesson_completed_at')
      .eq('player_id', playerId)
      .maybeSingle(),
    supabase
      .from('player_sp_boosts')
      .select('source, bonus, remaining_missions, expires_at')
      .eq('player_id', playerId)
      .is('consumed_at', null),
    catchUpApplies
      ? supabase
          .from('player_season_pass_missions')
          .select('*', { count: 'exact', head: true })
          .eq('player_id', playerId)
          .not('completed_at', 'is', null)
      : Promise.resolve({ count: null as number | null, error: null }),
  ]);

  // 1. lesson_streak — vivo si la última lección fue hoy o ayer (tz del jugador).
  const streak = streakRes.data;
  if (!streakRes.error && streak?.last_lesson_completed_at) {
    const todayKey = dayKeyInTz(new Date(), tz);
    const lastKey = dayKeyInTz(new Date(streak.last_lesson_completed_at), tz);
    const alive = lastKey === todayKey || lastKey === previousDayKey(todayKey);
    const bonus = alive ? streakSpBonus(Number(streak.current_streak ?? 0)) : 0;
    if (bonus > 0) breakdown.push({ source: 'lesson_streak', bonus });
  }

  // 2. Boosters consumibles (auto-activados al reclamar; ventana temporal en S1).
  if (!boostsRes.error) {
    const nowIso = new Date().toISOString();
    for (const b of boostsRes.data ?? []) {
      const expired = b.expires_at ? String(b.expires_at) <= nowIso : false;
      const drained = b.remaining_missions !== null && Number(b.remaining_missions) <= 0;
      if (expired || drained) continue;
      const source = String(b.source) as SpBoostBreakdownRow['source'];
      breakdown.push({ source, bonus: Number(b.bonus), expires_at: b.expires_at ?? null });
    }
  }

  // 3. catch_up — último mes de temporada y menos de 10 misiones completadas.
  if (catchUpApplies && !catchUpRes.error && (catchUpRes.count ?? 0) < CATCH_UP_MISSION_LIMIT) {
    breakdown.push({ source: 'catch_up', bonus: CATCH_UP_BONUS });
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
