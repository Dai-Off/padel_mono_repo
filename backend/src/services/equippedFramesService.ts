import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Atributos del marco equipado, resueltos desde el catálogo `unlockables`.
 * Mismo shape que consume el front (`FrameAttrs` en AvatarWithFrame).
 */
export type FrameAttrs = {
  rarity: string;
  style: string | null;
  animationType: string | null;
  colors: string[] | null;
};

type CatRow = {
  id: string;
  rarity: string;
  style: string | null;
  animation_type: string | null;
  colors: unknown;
};

function toFrameAttrs(c: CatRow): FrameAttrs {
  return {
    rarity: c.rarity,
    style: c.style,
    animationType: c.animation_type,
    colors: Array.isArray(c.colors) ? (c.colors as string[]) : null,
  };
}

/**
 * Marco equipado (resuelto) por jugador, batcheado en 2 queries.
 * Devuelve un Map<playerId, FrameAttrs | null>: `null` cuando el jugador no
 * tiene marco o tiene 'none'. Sólo incluye los ids solicitados que existan.
 *
 * Reutilizable por cualquier endpoint de listas para pintar el "pack" de avatar
 * con marco sin N+1 queries.
 */
export async function getEquippedFrames(
  supabase: SupabaseClient,
  playerIds: string[],
): Promise<Map<string, FrameAttrs | null>> {
  const ids = [...new Set(playerIds.filter((x): x is string => typeof x === 'string' && x.length > 0))];
  const result = new Map<string, FrameAttrs | null>();
  if (ids.length === 0) return result;

  // 1) frame_id equipado por jugador.
  const { data: customizations } = await supabase
    .from('player_profile_customization')
    .select('player_id, frame_id')
    .in('player_id', ids);

  const frameIdByPlayer = new Map<string, string>();
  const frameIds = new Set<string>();
  for (const row of customizations ?? []) {
    const r = row as { player_id: string; frame_id: string | null };
    const frameId = r.frame_id && r.frame_id !== 'none' ? r.frame_id : null;
    if (frameId) {
      frameIdByPlayer.set(r.player_id, frameId);
      frameIds.add(frameId);
    } else {
      result.set(r.player_id, null);
    }
  }

  // 2) atributos de los marcos referenciados.
  const framesById = new Map<string, FrameAttrs>();
  if (frameIds.size > 0) {
    const { data: cat } = await supabase
      .from('unlockables')
      .select('id, rarity, style, animation_type, colors')
      .in('id', [...frameIds]);
    for (const c of cat ?? []) {
      const row = c as CatRow;
      framesById.set(row.id, toFrameAttrs(row));
    }
  }

  for (const id of ids) {
    const frameId = frameIdByPlayer.get(id);
    result.set(id, frameId ? framesById.get(frameId) ?? null : null);
  }
  return result;
}
