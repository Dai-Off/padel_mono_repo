import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { getTodayRange } from '../routes/learningTimezone';
import {
  computeSeasonPassLessonSpDelta,
  streakForSeasonPassLessonPreview,
} from '../routes/learningStreaks';
import { addSeasonPassSp, getOrCreateSeasonPassRow } from './seasonPassService';
import { getActiveSeasonRow } from './seasonPassSeasonConfig';

/**
 * Si el jugador completó la lección hoy (zona) pero `player_season_pass.sp` sigue en 0
 * (p. ej. falló el grant cuando aún no existía temporada en BD), suma el SP una vez
 * usando la misma fórmula que `learningDailyLesson` (base × 1 + multiplicador de racha).
 */
export async function ensureLessonSpGrantedForToday(playerId: string, timezone: string): Promise<void> {
  const season = await getActiveSeasonRow();
  if (!season) return;

  const row = await getOrCreateSeasonPassRow(playerId);
  if (row.sp > 0) return;

  const supabase = getSupabaseServiceRoleClient();
  const { start, end } = getTodayRange(timezone);
  const { data: sess } = await supabase
    .from('learning_sessions')
    .select('id')
    .eq('player_id', playerId)
    .gte('completed_at', start)
    .lte('completed_at', end)
    .maybeSingle();
  if (!sess) return;

  const { data: streak } = await supabase
    .from('learning_streaks')
    .select('current_streak, last_lesson_completed_at')
    .eq('player_id', playerId)
    .maybeSingle();

  const previewStreak = streakForSeasonPassLessonPreview(timezone, streak ?? null);
  const delta = computeSeasonPassLessonSpDelta(season.lesson_sp_base, previewStreak);
  if (delta <= 0) return;

  try {
    await addSeasonPassSp(playerId, delta);
  } catch (e) {
    console.warn('[season-pass/lesson-sp-repair]', (e as Error).message);
  }
}
