import { getSupabaseServiceRoleClient } from '../lib/supabase';

export type SeasonPassSeasonRow = {
  slug: string;
  title: string;
  subtitle: string;
  ends_at: string;
  active: boolean;
  sp_per_level: number;
  lesson_sp_base: number;
  max_level: number;
  track_radius: number;
  hero_chip_label: string | null;
  elite_card_subtitle: string | null;
  mission_period_tabs: unknown;
  elite_modal_bullets: unknown;
};

/**
 * Temporada activa (`active = true`). Debe existir al menos una fila (migración 050).
 */
export async function getActiveSeasonRow(): Promise<SeasonPassSeasonRow | null> {
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('season_pass_seasons')
    .select(
      'slug, title, subtitle, ends_at, active, sp_per_level, lesson_sp_base, max_level, track_radius, hero_chip_label, elite_card_subtitle, mission_period_tabs, elite_modal_bullets'
    )
    .eq('active', true)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return data as unknown as SeasonPassSeasonRow;
}
