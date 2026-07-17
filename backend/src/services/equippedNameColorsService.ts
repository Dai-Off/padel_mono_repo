import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Atributos del color de nombre equipado, resueltos desde `unlockables`.
 * `colors`: 1 = sólido, 2+ = gradiente (el cliente interpola por carácter).
 */
export type NameColorAttrs = {
  id: string;
  rarity: string;
  colors: string[] | null;
};

type CatRow = { id: string; rarity: string; colors: unknown };

function toNameColorAttrs(c: CatRow): NameColorAttrs {
  return {
    id: c.id,
    rarity: c.rarity,
    colors: Array.isArray(c.colors) ? (c.colors as string[]) : null,
  };
}

/**
 * Color de nombre equipado (resuelto) por jugador, batcheado en 2 queries.
 * Map<playerId, NameColorAttrs | null>: `null` cuando no tiene ninguno.
 * Reutilizable por cualquier lista para pintar el nombre sin N+1.
 */
export async function getEquippedNameColors(
  supabase: SupabaseClient,
  playerIds: string[],
): Promise<Map<string, NameColorAttrs | null>> {
  const ids = [...new Set(playerIds.filter((x): x is string => typeof x === 'string' && x.length > 0))];
  const result = new Map<string, NameColorAttrs | null>();
  if (ids.length === 0) return result;

  const { data: customizations } = await supabase
    .from('player_profile_customization')
    .select('player_id, name_color_id')
    .in('player_id', ids);

  const colorIdByPlayer = new Map<string, string>();
  const colorIds = new Set<string>();
  for (const row of customizations ?? []) {
    const r = row as { player_id: string; name_color_id: string | null };
    if (r.name_color_id) {
      colorIdByPlayer.set(r.player_id, r.name_color_id);
      colorIds.add(r.name_color_id);
    } else {
      result.set(r.player_id, null);
    }
  }

  const byId = new Map<string, NameColorAttrs>();
  if (colorIds.size > 0) {
    const { data: cat } = await supabase
      .from('unlockables')
      .select('id, rarity, colors')
      .in('id', [...colorIds]);
    for (const c of cat ?? []) byId.set((c as CatRow).id, toNameColorAttrs(c as CatRow));
  }

  for (const id of ids) {
    const colorId = colorIdByPlayer.get(id);
    result.set(id, colorId ? byId.get(colorId) ?? null : null);
  }
  return result;
}
