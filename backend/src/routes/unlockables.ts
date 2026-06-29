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

/**
 * @openapi
 * /players/me/unlockables:
 *   get:
 *     tags: [Players]
 *     summary: Catálogo de desbloqueables (filtrable por kind) con flag unlocked del jugador
 */
router.get('/me/unlockables', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });
  const supabase = getSupabaseServiceRoleClient();

  const kinds = String(req.query.kind ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  try {
    await evaluateAndGrant(supabase, playerId!);

    let query = supabase
      .from('unlockables')
      .select('id, kind, title, description, rarity, icon, animation_type, style, colors, unlock_type, unlock_value, sort_order')
      .eq('is_active', true);
    if (kinds.length) query = query.in('kind', kinds);
    const { data: catalog, error } = await query.order('sort_order', { ascending: true });
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const { data: owned } = await supabase
      .from('player_unlockables')
      .select('unlockable_id')
      .eq('player_id', playerId);
    const ownedSet = new Set((owned ?? []).map((o) => (o as { unlockable_id: string }).unlockable_id));

    const items = (catalog ?? []).map((row) => {
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

    return res.json({ ok: true, items });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

/**
 * @openapi
 * /players/me/profile-customization:
 *   get:
 *     tags: [Players]
 *     summary: Lo equipado por el jugador (título, marco, insignias fijadas)
 */
router.get('/me/profile-customization', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });
  const supabase = getSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from('player_profile_customization')
    .select('title_id, frame_id, pinned_badge_ids')
    .eq('player_id', playerId)
    .maybeSingle();
  if (error) return res.status(500).json({ ok: false, error: error.message });

  const row = data as { title_id: string | null; frame_id: string | null; pinned_badge_ids: string[] } | null;
  return res.json({
    ok: true,
    customization: {
      titleId: row?.title_id ?? null,
      frameId: row?.frame_id ?? null,
      pinnedBadgeIds: row?.pinned_badge_ids ?? [],
    },
  });
});

/**
 * @openapi
 * /players/me/profile-customization:
 *   put:
 *     tags: [Players]
 *     summary: Guarda lo equipado (valida desbloqueo y ≤4 insignias)
 */
router.put('/me/profile-customization', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });
  const supabase = getSupabaseServiceRoleClient();

  const body = (req.body ?? {}) as { titleId?: string | null; frameId?: string | null; pinnedBadgeIds?: unknown };
  const titleId = body.titleId ?? null;
  const frameId = body.frameId ?? null;
  const pinned = Array.isArray(body.pinnedBadgeIds) ? [...new Set(body.pinnedBadgeIds.map(String))] : [];
  if (pinned.length > 4) return res.status(400).json({ ok: false, error: 'Máximo 4 insignias' });

  // Estado y catálogo de los ids implicados
  const { data: owned } = await supabase
    .from('player_unlockables')
    .select('unlockable_id')
    .eq('player_id', playerId);
  const ownedSet = new Set((owned ?? []).map((o) => (o as { unlockable_id: string }).unlockable_id));

  const idsToCheck = [titleId, frameId, ...pinned].filter(
    (x): x is string => typeof x === 'string' && x.length > 0 && x !== 'none',
  );
  const catMap = new Map<string, { kind: string; unlock_type: string }>();
  if (idsToCheck.length) {
    const { data: cat } = await supabase.from('unlockables').select('id, kind, unlock_type').in('id', idsToCheck);
    for (const c of cat ?? []) {
      const o = c as { id: string; kind: string; unlock_type: string };
      catMap.set(o.id, { kind: o.kind, unlock_type: o.unlock_type });
    }
  }
  const isUnlocked = (id: string): boolean => {
    const c = catMap.get(id);
    return !!c && (ownedSet.has(id) || c.unlock_type === 'default');
  };

  if (titleId != null) {
    const c = catMap.get(titleId);
    if (!c || c.kind !== 'title' || !isUnlocked(titleId)) {
      return res.status(400).json({ ok: false, error: 'Título no válido o bloqueado' });
    }
  }
  if (frameId != null && frameId !== 'none') {
    const c = catMap.get(frameId);
    if (!c || c.kind !== 'frame' || !isUnlocked(frameId)) {
      return res.status(400).json({ ok: false, error: 'Marco no válido o bloqueado' });
    }
  }
  for (const id of pinned) {
    const c = catMap.get(id);
    if (!c || (c.kind !== 'trophy' && c.kind !== 'badge') || !ownedSet.has(id)) {
      return res.status(400).json({ ok: false, error: 'Insignia no válida o bloqueada' });
    }
  }

  const { error } = await supabase.from('player_profile_customization').upsert(
    {
      player_id: playerId,
      title_id: titleId,
      frame_id: frameId,
      pinned_badge_ids: pinned,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'player_id' },
  );
  if (error) return res.status(500).json({ ok: false, error: error.message });

  return res.json({ ok: true, customization: { titleId, frameId, pinnedBadgeIds: pinned } });
});

export default router;
