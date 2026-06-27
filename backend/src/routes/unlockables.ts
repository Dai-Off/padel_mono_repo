import { Router, Request, Response } from 'express';
import { getPlayerIdFromBearer } from '../lib/authPlayer';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { evaluateAndGrant, getCompletedCourses } from '../services/unlockablesEngine';

const router = Router();

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
 * @openapi
 * /players/me/achievements:
 *   get:
 *     tags: [Players]
 *     summary: Vitrina de logros del jugador (trofeos/insignias conseguidos + cursos completados)
 */
router.get('/me/achievements', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });
  const supabase = getSupabaseServiceRoleClient();

  try {
    // Otorga lo recién conseguido antes de leer.
    await evaluateAndGrant(supabase, playerId!);

    const { data: owned, error: e1 } = await supabase
      .from('player_unlockables')
      .select('unlocked_at, is_public, progress, unlockables!inner(id, kind, title, description, rarity, icon, sport)')
      .eq('player_id', playerId)
      .in('unlockables.kind', ['trophy', 'badge'])
      .order('unlocked_at', { ascending: false });
    if (e1) return res.status(500).json({ ok: false, error: e1.message });

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

    // Cursos completados (derivados de learning), presentados como type 'course'.
    const courses = await getCompletedCourses(supabase, playerId!);
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

    return res.json({ ok: true, achievements: [...achievements, ...courseAchievements] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

/**
 * @openapi
 * /players/me/achievements/{id}/visibility:
 *   patch:
 *     tags: [Players]
 *     summary: Alterna la visibilidad pública de un logro conseguido
 */
router.patch('/me/achievements/:id/visibility', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });
  const supabase = getSupabaseServiceRoleClient();
  const { id } = req.params;

  const { data: row, error: e1 } = await supabase
    .from('player_unlockables')
    .select('is_public')
    .eq('player_id', playerId)
    .eq('unlockable_id', id)
    .maybeSingle();
  if (e1) return res.status(500).json({ ok: false, error: e1.message });
  if (!row) return res.status(404).json({ ok: false, error: 'No conseguido' });

  const next = !(row as { is_public: boolean }).is_public;
  const { error: e2 } = await supabase
    .from('player_unlockables')
    .update({ is_public: next })
    .eq('player_id', playerId)
    .eq('unlockable_id', id);
  if (e2) return res.status(500).json({ ok: false, error: e2.message });

  return res.json({ ok: true, is_public: next });
});

/**
 * @openapi
 * /players/me/unlocks/pending:
 *   get:
 *     tags: [Players]
 *     summary: Desbloqueables recién conseguidos y no mostrados aún (modal global)
 */
router.get('/me/unlocks/pending', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });
  const supabase = getSupabaseServiceRoleClient();

  try {
    // Evalúa primero, así un poll desde cualquier pantalla detecta lo nuevo.
    await evaluateAndGrant(supabase, playerId!);

    const { data, error } = await supabase
      .from('player_unlockables')
      .select('unlocked_at, unlockables!inner(id, kind, title, description, rarity, icon, animation_type, style)')
      .eq('player_id', playerId)
      .is('notified_at', null)
      .order('unlocked_at', { ascending: true });
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const pending = (data ?? [])
      .map((row) => {
        const u = pickEmbed((row as { unlockables: unknown }).unlockables);
        if (!u) return null;
        return {
          id: u.id,
          kind: u.kind,
          title: u.title,
          description: u.description ?? '',
          icon: u.icon ?? null,
          rarity: u.rarity,
          animationType: u.animation_type ?? null,
          style: u.style ?? null,
        };
      })
      .filter(Boolean);

    return res.json({ ok: true, pending });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

/**
 * @openapi
 * /players/me/unlocks/seen:
 *   post:
 *     tags: [Players]
 *     summary: Marca como mostrados (notified) los desbloqueables indicados
 */
router.post('/me/unlocks/seen', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });
  const supabase = getSupabaseServiceRoleClient();

  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).map(String) : [];
  if (!ids.length) return res.json({ ok: true, updated: 0 });

  const { data, error } = await supabase
    .from('player_unlockables')
    .update({ notified_at: new Date().toISOString() })
    .eq('player_id', playerId)
    .is('notified_at', null)
    .in('unlockable_id', ids)
    .select('unlockable_id');
  if (error) return res.status(500).json({ ok: false, error: error.message });

  return res.json({ ok: true, updated: (data ?? []).length });
});

export default router;
