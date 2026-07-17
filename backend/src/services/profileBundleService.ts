import { getSupabaseServiceRoleClient } from '../lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getEquippedNameColors } from './equippedNameColorsService';
import { getEquippedThemes } from './equippedThemesService';

// ─────────────────────────────────────────────────────────────────────────────
// Lecturas puras de las piezas del perfil, reutilizadas por las rutas
// individuales (unlockables.ts) y por el bundle. Los logros se otorgan por
// EVENTO (evaluateAndGrant en la acción), nunca en estas lecturas.
// ─────────────────────────────────────────────────────────────────────────────

type CatalogEmbed = {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  rarity: string;
  icon: string | null;
  animation_type?: string | null;
  style?: string | null;
  sport?: string | null;
};

function pickEmbed(raw: unknown): CatalogEmbed | null {
  const e = Array.isArray(raw) ? raw[0] : raw;
  return (e as CatalogEmbed) ?? null;
}

/**
 * Logros del jugador (trofeos/insignias/cursos conseguidos). **Lectura pura**:
 * los cursos ya están materializados como unlockables `kind='course'` (otorgados
 * al completarlos), no se derivan on-read.
 */
export async function getPlayerAchievements(supabase: SupabaseClient, playerId: string) {
  const { data: owned, error } = await supabase
    .from('player_unlockables')
    .select('unlocked_at, is_public, progress, unlockables!inner(id, kind, title, description, rarity, icon, sport)')
    .eq('player_id', playerId)
    .in('unlockables.kind', ['trophy', 'badge', 'course'])
    .order('unlocked_at', { ascending: false });
  if (error) throw new Error(error.message);

  return (owned ?? [])
    .map((row) => {
      const r = row as { unlocked_at: string; is_public: boolean; progress: number | null; unlockables: unknown };
      const u = pickEmbed(r.unlockables);
      if (!u) return null;
      return {
        id: u.id,
        type: u.kind,
        title: u.title,
        description: u.description ?? '',
        icon: u.icon ?? 'trophy-outline',
        rarity: u.rarity,
        sport: u.sport ?? null,
        date: r.unlocked_at,
        isPublic: r.is_public,
        progress: r.progress ?? undefined,
      };
    })
    .filter(Boolean);
}

/** Catálogo de desbloqueables filtrado por kind, con flag `unlocked` del jugador. */
export async function getPlayerUnlockablesCatalog(
  supabase: SupabaseClient,
  playerId: string,
  kinds: string[],
) {
  let query = supabase
    .from('unlockables')
    .select('id, kind, title, description, rarity, icon, animation_type, style, colors, unlock_type, unlock_value, sort_order')
    .eq('is_active', true);
  if (kinds.length) query = query.in('kind', kinds);

  // Catálogo y "owned" en paralelo (1 round-trip en vez de 2).
  const [{ data: catalog, error }, { data: owned }] = await Promise.all([
    query.order('sort_order', { ascending: true }),
    supabase.from('player_unlockables').select('unlockable_id').eq('player_id', playerId),
  ]);
  if (error) throw new Error(error.message);

  const ownedSet = new Set((owned ?? []).map((o) => (o as { unlockable_id: string }).unlockable_id));

  return (catalog ?? []).map((row) => {
    const u = row as {
      id: string; kind: string; title: string; description: string | null; rarity: string;
      icon: string | null; animation_type: string | null; style: string | null; colors: unknown;
      unlock_type: string; unlock_value: string | null;
    };
    return {
      id: u.id,
      kind: u.kind,
      title: u.title,
      description: u.description ?? '',
      rarity: u.rarity,
      icon: u.icon ?? null,
      animationType: u.animation_type ?? null,
      style: u.style ?? null,
      colors: u.colors ?? null,
      unlockType: u.unlock_type,
      unlockValue: u.unlock_value ?? null,
      unlocked: ownedSet.has(u.id) || u.unlock_type === 'default',
    };
  });
}

/** Personalización equipada (título, marco, color de nombre, insignias fijadas). */
export async function getPlayerCustomization(supabase: SupabaseClient, playerId: string) {
  const { data, error } = await supabase
    .from('player_profile_customization')
    .select('title_id, frame_id, name_color_id, theme_id, pinned_badge_ids')
    .eq('player_id', playerId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const row = data as {
    title_id: string | null;
    frame_id: string | null;
    name_color_id: string | null;
    theme_id: string | null;
    pinned_badge_ids: string[];
  } | null;
  const [nameColor, theme] = await Promise.all([
    getEquippedNameColors(supabase, [playerId]).then((m) => m.get(playerId) ?? null),
    getEquippedThemes(supabase, [playerId]).then((m) => m.get(playerId) ?? null),
  ]);
  return {
    titleId: row?.title_id ?? null,
    frameId: row?.frame_id ?? null,
    nameColorId: row?.name_color_id ?? null,
    nameColor,
    themeId: row?.theme_id ?? null,
    theme,
    pinnedBadgeIds: row?.pinned_badge_ids ?? [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bundle del HERO: junta en 1 round-trip SOLO lo que bloquea el hero
// (personalización + marcos + logros). El radar, el peer, las stats, la
// evolución y el social van aparte y rellenan su card con skeleton, para que el
// hero no espere a nada más (ni al Coach, que crecerá en complejidad). El
// `profile` base tampoco: llega ya cacheado del HomeDataContext en el cliente.
// ─────────────────────────────────────────────────────────────────────────────

export async function assembleProfileBundle(playerId: string) {
  const supabase = getSupabaseServiceRoleClient();

  // Lectura pura: los logros se otorgan por EVENTO (ver evaluateAndGrant), no aquí.
  const [customization, frames, achievements] = await Promise.all([
    getPlayerCustomization(supabase, playerId),
    getPlayerUnlockablesCatalog(supabase, playerId, ['frame']),
    getPlayerAchievements(supabase, playerId),
  ]);

  return { customization, frames, achievements };
}
