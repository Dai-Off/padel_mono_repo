import { getSupabaseServiceRoleClient } from '../lib/supabase';

// Mission evaluation/assignment lives in seasonPassEngine.ts (season pass v2).
// This module keeps the season-level presentation helpers.

export type SeasonPassSpHowRowPayload = {
  icon: string;
  label: string;
  sp_hint: string;
};

// Contenido estático de la temporada ("cómo ganar SP"): se cachea brevemente
// porque no cambia entre requests (mismo criterio que la season row / rewards).
const spHowCache = new Map<string, { at: number; rows: SeasonPassSpHowRowPayload[] }>();
const SP_HOW_CACHE_MS = 60_000;

export async function listSpHowRows(seasonSlug: string): Promise<SeasonPassSpHowRowPayload[]> {
  const cached = spHowCache.get(seasonSlug);
  if (cached && Date.now() - cached.at < SP_HOW_CACHE_MS) return cached.rows;
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('season_pass_sp_how_rows')
    .select('icon, label, sp_hint')
    .eq('season_slug', seasonSlug)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []).map((r) => ({
    icon: String((r as { icon: string }).icon),
    label: String((r as { label: string }).label),
    sp_hint: String((r as { sp_hint: string }).sp_hint),
  }));
  spHowCache.set(seasonSlug, { at: Date.now(), rows });
  return rows;
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
