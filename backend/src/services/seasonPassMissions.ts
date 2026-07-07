import { getSupabaseServiceRoleClient } from '../lib/supabase';

// Mission evaluation/assignment lives in seasonPassEngine.ts (season pass v2).
// This module keeps the season-level presentation helpers.

export type SeasonPassSpHowRowPayload = {
  icon: string;
  label: string;
  sp_hint: string;
};

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
