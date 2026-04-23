import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { getTodayRange } from '../routes/learningTimezone';
import type { SeasonPassSeasonRow } from './seasonPassSeasonConfig';
import {
  computeSeasonPassLessonSpDelta,
  streakForSeasonPassLessonPreview,
} from '../routes/learningStreaks';

export type SeasonPassMissionPayload = {
  id: string;
  slug: string;
  period: 'daily' | 'weekly' | 'monthly';
  icon: string;
  title: string;
  description: string;
  sp_reward: number;
  reward_hint: string | null;
  target: number;
  current: number;
  done: boolean;
  period_end_iso: string | null;
  expires_label: string | null;
};

export type SeasonPassSpHowRowPayload = {
  icon: string;
  label: string;
  sp_hint: string;
};

async function evaluateCondition(
  supabase: SupabaseClient,
  conditionKey: string,
  playerId: string,
  timezone: string
): Promise<{ current: number; done: boolean }> {
  if (conditionKey === 'daily_lesson') {
    const { start, end } = getTodayRange(timezone);
    const { data } = await supabase
      .from('learning_sessions')
      .select('id')
      .eq('player_id', playerId)
      .gte('completed_at', start)
      .lte('completed_at', end)
      .limit(1)
      .maybeSingle();
    const done = !!data;
    return { current: done ? 1 : 0, done };
  }
  return { current: 0, done: false };
}

function formatDailyExpires(endIso: string, timezone: string): string {
  try {
    const d = new Date(endIso);
    return d.toLocaleString('es-ES', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export type BuildMissionsResult = {
  missions: SeasonPassMissionPayload[];
  /** SP de una lección hoy con la racha actual (misma fórmula que el grant). */
  daily_lesson_sp_preview: number;
};

export async function buildMissionsForPlayer(
  playerId: string,
  season: SeasonPassSeasonRow,
  timezone: string
): Promise<BuildMissionsResult> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: defs, error } = await supabase
    .from('season_pass_mission_definitions')
    .select(
      'id, slug, icon, title, description, period, target_count, sp_reward, sort_order, condition_key, reward_hint'
    )
    .eq('season_slug', season.slug)
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);

  const { data: streakRow } = await supabase
    .from('learning_streaks')
    .select('current_streak, last_lesson_completed_at')
    .eq('player_id', playerId)
    .maybeSingle();
  const previewStreak = streakForSeasonPassLessonPreview(timezone, streakRow ?? null);
  const lessonSpWithStreak = computeSeasonPassLessonSpDelta(season.lesson_sp_base, previewStreak);

  const { end } = getTodayRange(timezone);
  const rows = defs ?? [];
  const out: SeasonPassMissionPayload[] = [];

  for (const raw of rows) {
    const def = raw as {
      id: string;
      slug: string;
      icon: string;
      title: string;
      description: string;
      period: string;
      target_count: number;
      sp_reward: number;
      sort_order: number;
      condition_key: string;
      reward_hint: string | null;
    };
    const target = Math.max(1, Number(def.target_count ?? 1));
    const ev = await evaluateCondition(supabase, def.condition_key, playerId, timezone);
    const current = Math.min(target, Math.max(0, ev.current));
    const done = ev.done && current >= target;
    const period = def.period as 'daily' | 'weekly' | 'monthly';
    const baseSpReward = Number(def.sp_reward ?? 0);
    const spReward =
      def.condition_key === 'daily_lesson' ? lessonSpWithStreak : baseSpReward;
    out.push({
      id: String(def.id),
      slug: def.slug,
      period,
      icon: def.icon,
      title: def.title,
      description: def.description,
      sp_reward: spReward,
      reward_hint: def.reward_hint ?? null,
      target,
      current,
      done,
      period_end_iso: period === 'daily' ? end : null,
      expires_label: period === 'daily' ? formatDailyExpires(end, timezone) : null,
    });
  }
  return { missions: out, daily_lesson_sp_preview: lessonSpWithStreak };
}

export async function listSpHowRows(seasonSlug: string): Promise<SeasonPassSpHowRowPayload[]> {
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('season_pass_sp_how_rows')
    .select('icon, label, sp_hint')
    .eq('season_slug', seasonSlug)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    icon: String((r as { icon: string }).icon),
    label: String((r as { label: string }).label),
    sp_hint: String((r as { sp_hint: string }).sp_hint),
  }));
}

export function computeTrackLevels(
  currentLevel: number,
  maxLevel: number,
  radius: number
): number[] {
  const lo = Math.max(1, currentLevel - radius);
  const hi = Math.min(maxLevel, currentLevel + radius);
  const arr: number[] = [];
  for (let i = lo; i <= hi; i += 1) arr.push(i);
  return arr;
}
