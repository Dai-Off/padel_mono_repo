import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Tema de perfil equipado, resuelto desde `unlockables`. `colors` = paleta base
 * [top, bottom, accent]; `animationType` = motor de fondo animado del cliente.
 */
export type ThemeAttrs = {
  id: string;
  rarity: string;
  colors: string[] | null;
  animationType: string | null;
};

type CatRow = { id: string; rarity: string; colors: unknown; animation_type: string | null };

function toThemeAttrs(c: CatRow): ThemeAttrs {
  return {
    id: c.id,
    rarity: c.rarity,
    colors: Array.isArray(c.colors) ? (c.colors as string[]) : null,
    animationType: c.animation_type,
  };
}

/**
 * Tema equipado (resuelto) por jugador, batcheado en 2 queries.
 * Map<playerId, ThemeAttrs | null>: `null` cuando no tiene tema.
 */
export async function getEquippedThemes(
  supabase: SupabaseClient,
  playerIds: string[],
): Promise<Map<string, ThemeAttrs | null>> {
  const ids = [...new Set(playerIds.filter((x): x is string => typeof x === 'string' && x.length > 0))];
  const result = new Map<string, ThemeAttrs | null>();
  if (ids.length === 0) return result;

  const { data: customizations } = await supabase
    .from('player_profile_customization')
    .select('player_id, theme_id')
    .in('player_id', ids);

  const themeIdByPlayer = new Map<string, string>();
  const themeIds = new Set<string>();
  for (const row of customizations ?? []) {
    const r = row as { player_id: string; theme_id: string | null };
    if (r.theme_id) {
      themeIdByPlayer.set(r.player_id, r.theme_id);
      themeIds.add(r.theme_id);
    } else {
      result.set(r.player_id, null);
    }
  }

  const byId = new Map<string, ThemeAttrs>();
  if (themeIds.size > 0) {
    const { data: cat } = await supabase
      .from('unlockables')
      .select('id, rarity, colors, animation_type')
      .in('id', [...themeIds]);
    for (const c of cat ?? []) byId.set((c as CatRow).id, toThemeAttrs(c as CatRow));
  }

  for (const id of ids) {
    const themeId = themeIdByPlayer.get(id);
    result.set(id, themeId ? byId.get(themeId) ?? null : null);
  }
  return result;
}
