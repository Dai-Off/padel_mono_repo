import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { dayKeyInTz, previousDayKey } from './learningTimezone';

// ---------------------------------------------------------------------------
// Streak → XP/SP multiplier
// ---------------------------------------------------------------------------

export function getMultiplier(currentStreak: number): number {
  if (currentStreak <= 2) return 0;
  if (currentStreak <= 7) return 0.5;
  if (currentStreak <= 20) return 1.0;
  if (currentStreak <= 45) return 1.5;
  return 2.0;
}

// ---------------------------------------------------------------------------
// Individual streak
// ---------------------------------------------------------------------------

export interface StreakState {
  current_streak: number;
  longest_streak: number;
  last_lesson_completed_at: string;
}

export async function updateIndividualStreak(
  playerId: string,
  timezone: string,
): Promise<StreakState> {
  const supabase = getSupabaseServiceRoleClient();

  const { data: existing, error: readErr } = await supabase
    .from('learning_streaks')
    .select('current_streak, longest_streak, last_lesson_completed_at')
    .eq('player_id', playerId)
    .maybeSingle();

  if (readErr) throw new Error(readErr.message);

  const now = new Date();
  const todayKey = dayKeyInTz(now, timezone);
  const yesterdayKey = previousDayKey(todayKey);

  let current = 1;
  let longest = 0;

  if (existing) {
    longest = existing.longest_streak ?? 0;
    if (existing.last_lesson_completed_at) {
      const lastKey = dayKeyInTz(new Date(existing.last_lesson_completed_at), timezone);
      if (lastKey === todayKey) {
        // Already counted today — return as-is.
        return {
          current_streak: existing.current_streak,
          longest_streak: existing.longest_streak,
          last_lesson_completed_at: existing.last_lesson_completed_at,
        };
      }
      if (lastKey === yesterdayKey) {
        current = (existing.current_streak ?? 0) + 1;
      } else {
        current = 1;
      }
    }
  }

  if (current > longest) longest = current;

  const nowIso = now.toISOString();

  const { error: upsertErr } = await supabase
    .from('learning_streaks')
    .upsert(
      {
        player_id: playerId,
        current_streak: current,
        longest_streak: longest,
        last_lesson_completed_at: nowIso,
      },
      { onConflict: 'player_id' },
    );

  if (upsertErr) throw new Error(upsertErr.message);

  return {
    current_streak: current,
    longest_streak: longest,
    last_lesson_completed_at: nowIso,
  };
}

// ---------------------------------------------------------------------------
// Shared streaks
// ---------------------------------------------------------------------------

export interface SharedStreakRow {
  id: string;
  player_id_1: string;
  player_id_2: string;
  current_streak: number;
  longest_streak: number;
  player1_completed_today: boolean;
  player2_completed_today: boolean;
  last_both_completed_at: string | null;
  timezone: string;
}

export function normalizePair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function lazyResetSharedStreak(row: SharedStreakRow): boolean {
  const now = new Date();
  const todayKey = dayKeyInTz(now, row.timezone);

  if (!row.last_both_completed_at) {
    return false;
  }

  const lastKey = dayKeyInTz(new Date(row.last_both_completed_at), row.timezone);

  if (lastKey === todayKey) {
    return false;
  }

  const yesterdayKey = previousDayKey(todayKey);
  let changed = false;

  if (lastKey !== yesterdayKey) {
    row.current_streak = 0;
    changed = true;
  }

  if (row.player1_completed_today || row.player2_completed_today) {
    row.player1_completed_today = false;
    row.player2_completed_today = false;
    changed = true;
  }

  return changed;
}

export async function updateSharedStreaks(
  playerId: string,
): Promise<SharedStreakRow[]> {
  const supabase = getSupabaseServiceRoleClient();

  const { data: rows, error } = await supabase
    .from('learning_shared_streaks')
    .select('id, player_id_1, player_id_2, current_streak, longest_streak, player1_completed_today, player2_completed_today, last_both_completed_at, timezone')
    .or(`player_id_1.eq.${playerId},player_id_2.eq.${playerId}`);

  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return [];

  const updated: SharedStreakRow[] = [];

  for (const row of rows as SharedStreakRow[]) {
    lazyResetSharedStreak(row);

    const isPlayer1 = row.player_id_1 === playerId;

    const alreadyMarked = isPlayer1 ? row.player1_completed_today : row.player2_completed_today;
    if (alreadyMarked) {
      updated.push(row);
      continue;
    }

    if (isPlayer1) {
      row.player1_completed_today = true;
    } else {
      row.player2_completed_today = true;
    }

    if (row.player1_completed_today && row.player2_completed_today) {
      row.current_streak += 1;
      if (row.current_streak > row.longest_streak) {
        row.longest_streak = row.current_streak;
      }
      row.last_both_completed_at = new Date().toISOString();
    }

    const { error: updateErr } = await supabase
      .from('learning_shared_streaks')
      .update({
        current_streak: row.current_streak,
        longest_streak: row.longest_streak,
        player1_completed_today: row.player1_completed_today,
        player2_completed_today: row.player2_completed_today,
        last_both_completed_at: row.last_both_completed_at,
      })
      .eq('id', row.id);

    if (updateErr) throw new Error(updateErr.message);

    updated.push(row);
  }

  return updated;
}

export async function getPlayerStreakMultiplier(playerId: string): Promise<number> {
  const supabase = getSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('learning_streaks')
    .select('current_streak')
    .eq('player_id', playerId)
    .maybeSingle();
  return getMultiplier(data?.current_streak ?? 0);
}
