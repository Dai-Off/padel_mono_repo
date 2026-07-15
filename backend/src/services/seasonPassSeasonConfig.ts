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
  boost_cap: number;
  hero_chip_label: string | null;
  elite_card_subtitle: string | null;
  mission_period_tabs: unknown;
  elite_modal_bullets: unknown;
};

// Config de temporada: cambia raras veces (y en dev se reinicia el backend al
// tocar el SQL), así que la cacheamos brevemente para no releerla en cada /me
// ni en cada acción. TTL corto para no arrastrar cambios demasiado tiempo.
let seasonCache: { at: number; row: SeasonPassSeasonRow | null } | null = null;
const SEASON_CACHE_MS = 60_000;

/**
 * Temporada activa (`active = true`). Debe existir al menos una fila (migración 050).
 */
export async function getActiveSeasonRow(): Promise<SeasonPassSeasonRow | null> {
  if (seasonCache && Date.now() - seasonCache.at < SEASON_CACHE_MS) return seasonCache.row;
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('season_pass_seasons')
    .select(
      'slug, title, subtitle, ends_at, active, sp_per_level, lesson_sp_base, max_level, track_radius, boost_cap, hero_chip_label, elite_card_subtitle, mission_period_tabs, elite_modal_bullets'
    )
    .eq('active', true)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data ? (data as unknown as SeasonPassSeasonRow) : null;
  seasonCache = { at: Date.now(), row };
  return row;
}
