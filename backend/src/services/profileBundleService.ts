import { getSupabaseServiceRoleClient } from '../lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateAndGrant, getCompletedCourses } from './unlockablesEngine';
import { getRadarAssessment } from './coachAssessmentService';
import { localizeCoachAssessmentText, parseCoachAssessmentLocale } from '../lib/coachAssessmentLanguage';
import { getCachedPeerFeedbackInsight } from './postMatchPeerFeedbackInsightService';
import { parsePeerFeedbackLocale } from '../lib/peerFeedbackLanguage';

// ─────────────────────────────────────────────────────────────────────────────
// Lecturas puras (SIN evaluateAndGrant) de las piezas del perfil. Reutilizadas
// por las rutas individuales (que llaman evaluateAndGrant aparte) y por el
// endpoint agregado /players/me/profile-bundle (que lo llama UNA sola vez).
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

/** Logros del jugador (trofeos/insignias conseguidos + cursos completados). */
export async function getPlayerAchievements(supabase: SupabaseClient, playerId: string) {
  const { data: owned, error } = await supabase
    .from('player_unlockables')
    .select('unlocked_at, is_public, progress, unlockables!inner(id, kind, title, description, rarity, icon, sport)')
    .eq('player_id', playerId)
    .in('unlockables.kind', ['trophy', 'badge'])
    .order('unlocked_at', { ascending: false });
  if (error) throw new Error(error.message);

  const achievements = (owned ?? [])
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

  const courses = await getCompletedCourses(supabase, playerId);
  const courseAchievements = courses.map((c) => ({
    id: `course_${c.courseId}`,
    type: 'course' as const,
    title: c.title,
    description: c.description ?? '',
    icon: 'book-outline',
    rarity: 'common' as const,
    sport: null,
    date: c.completedAt,
    isPublic: true,
    progress: undefined,
  }));

  return [...achievements, ...courseAchievements];
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
  const { data: catalog, error } = await query.order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);

  const { data: owned } = await supabase
    .from('player_unlockables')
    .select('unlockable_id')
    .eq('player_id', playerId);
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

/** Personalización equipada (título, marco, insignias fijadas). */
export async function getPlayerCustomization(supabase: SupabaseClient, playerId: string) {
  const { data, error } = await supabase
    .from('player_profile_customization')
    .select('title_id, frame_id, pinned_badge_ids')
    .eq('player_id', playerId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const row = data as { title_id: string | null; frame_id: string | null; pinned_badge_ids: string[] } | null;
  return {
    titleId: row?.title_id ?? null,
    frameId: row?.frame_id ?? null,
    pinnedBadgeIds: row?.pinned_badge_ids ?? [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bundle above-the-fold: junta en 1 round-trip las lecturas baratas que el hero
// y el Coach necesitan. NO incluye stats/level-history/social (más pesados, van
// aparte y rellenan su card). El `profile` base tampoco: llega ya cacheado del
// HomeDataContext en el cliente.
// ─────────────────────────────────────────────────────────────────────────────

export type ProfileBundleLocaleInput = {
  lang?: string | string[] | undefined;
  acceptLanguage?: string | undefined;
};

export async function assembleProfileBundle(playerId: string, localeInput: ProfileBundleLocaleInput) {
  const supabase = getSupabaseServiceRoleClient();

  // Otorga lo recién conseguido UNA vez (en vez de por cada endpoint).
  await evaluateAndGrant(supabase, playerId);

  const coachLocale = parseCoachAssessmentLocale(localeInput.lang, localeInput.acceptLanguage);
  const peerLocale = parsePeerFeedbackLocale(localeInput.lang, localeInput.acceptLanguage);

  const [customization, frames, achievements, radarRaw, peerInsight] = await Promise.all([
    getPlayerCustomization(supabase, playerId),
    getPlayerUnlockablesCatalog(supabase, playerId, ['frame']),
    getPlayerAchievements(supabase, playerId),
    getRadarAssessment(playerId),
    getCachedPeerFeedbackInsight(supabase, playerId, { locale: peerLocale }),
  ]);

  const coachRadar = radarRaw ? localizeCoachAssessmentText(radarRaw, coachLocale) : null;

  return { customization, frames, achievements, coachRadar, peerInsight };
}
