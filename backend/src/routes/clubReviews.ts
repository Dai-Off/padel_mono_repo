import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdmin } from '../middleware/requireClubOwnerOrAdmin';

const router = Router();
router.use(attachAuthContext);

function getToken(req: Request): string | null {
  const authHeader = req.headers.authorization ?? req.headers['Authorization'];
  const raw = typeof authHeader === 'string' ? authHeader : '';
  if (raw.startsWith('Bearer ')) return raw.slice(7).trim();
  return raw.trim() || null;
}

function canAccessClub(req: Request, clubId: string): boolean {
  if (req.authContext?.adminId) return true;
  return req.authContext?.allowedClubIds?.includes(clubId) ?? false;
}

type ReviewRow = {
  id: string;
  created_at: string;
  updated_at: string;
  club_id: string;
  player_id: string;
  rating: number;
  comment: string | null;
};

function buildSummary(rows: { rating: number }[]) {
  const count = rows.length;
  const dist: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  if (count === 0) {
    return {
      average: null as number | null,
      count: 0,
      distribution: dist,
    };
  }
  const sum = rows.reduce((s, r) => s + r.rating, 0);
  for (const r of rows) {
    const k = String(Math.min(5, Math.max(1, r.rating)));
    dist[k] = (dist[k] ?? 0) + 1;
  }
  return {
    average: Math.round((sum / count) * 10) / 10,
    count,
    distribution: dist,
  };
}

async function resolvePlayerIdFromToken(token: string): Promise<string | null> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user?.id) return null;
  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('auth_user_id', user.id)
    .neq('status', 'deleted')
    .maybeSingle();
  return player?.id ?? null;
}

/**
 * @openapi
 * /club-reviews:
 *   get:
 *     tags: [Club reviews]
 *     summary: Listar reseñas del club (dueño / admin)
 *     description: |
 *       Devuelve todas las reseñas del `club_id` con datos del jugador (nombre),
 *       media, total y distribución por estrellas. Requiere JWT de administrador o dueño con acceso al club.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: club_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               summary: { average: 4.8, count: 234, distribution: { "1": 2, "2": 3, "3": 15, "4": 58, "5": 156 } }
 *               reviews: [{ id: "uuid", rating: 5, comment: "…", created_at: "2026-01-28T12:00:00Z", player: { id: "uuid", first_name: "Ana", last_name: "García" } }]
 *       400: { description: Falta club_id }
 *       401: { description: Sin token }
 *       403: { description: Sin acceso al club }
 */
router.get('/', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const club_id = String(req.query.club_id ?? '').trim();
  if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, club_id)) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: reviews, error } = await supabase
      .from('club_reviews')
      .select('id, created_at, updated_at, club_id, player_id, rating, comment')
      .eq('club_id', club_id)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ ok: false, error: error.message });

    const rows = (reviews ?? []) as ReviewRow[];
    const summary = buildSummary(rows);

    const playerIds = [...new Set(rows.map((r) => r.player_id))];
    let playersMap = new Map<string, { first_name: string; last_name: string }>();
    if (playerIds.length > 0) {
      const { data: players, error: pe } = await supabase
        .from('players')
        .select('id, first_name, last_name')
        .in('id', playerIds);
      if (pe) return res.status(500).json({ ok: false, error: pe.message });
      for (const p of players ?? []) {
        playersMap.set(p.id, { first_name: p.first_name, last_name: p.last_name });
      }
    }

    const out = rows.map((r) => {
      const p = playersMap.get(r.player_id);
      return {
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        created_at: r.created_at,
        updated_at: r.updated_at,
        player: p
          ? { id: r.player_id, first_name: p.first_name, last_name: p.last_name }
          : { id: r.player_id, first_name: '', last_name: '' },
      };
    });

    return res.json({ ok: true, summary, reviews: out });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /club-reviews:
 *   post:
 *     tags: [Club reviews]
 *     summary: Crear o actualizar mi reseña (jugador)
 *     description: |
 *       El usuario autenticado debe tener fila en `players` con `auth_user_id` vinculado.
 *       Si ya existe reseña para ese club y jugador, se actualiza (misma restricción única).
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [club_id, rating]
 *             properties:
 *               club_id: { type: string, format: uuid }
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               comment: { type: string, nullable: true }
 *           example:
 *             club_id: "11111111-1111-1111-1111-111111111111"
 *             rating: 5
 *             comment: "Excelentes instalaciones."
 *     responses:
 *       200:
 *         description: Reseña guardada
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               review: { id: "uuid", club_id: "…", player_id: "…", rating: 5, comment: "…", created_at: "…", updated_at: "…" }
 *       400: { description: Datos inválidos }
 *       401: { description: Sin token o sesión inválida }
 *       403: { description: El usuario no es un jugador registrado con cuenta }
 *       404: { description: Club no existe }
 */
router.post('/', async (req: Request, res: Response) => {
  const token = getToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token requerido. Envía Authorization: Bearer <access_token>.' });
  }

  const club_id = typeof req.body?.club_id === 'string' ? req.body.club_id.trim() : '';
  const rating = Number(req.body?.rating);
  const comment =
    typeof req.body?.comment === 'string' ? req.body.comment.trim().slice(0, 4000) : null;

  if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ ok: false, error: 'rating debe ser un entero entre 1 y 5' });
  }

  try {
    const playerId = await resolvePlayerIdFromToken(token);
    if (!playerId) {
      return res.status(403).json({
        ok: false,
        error: 'Solo los jugadores con cuenta vinculada pueden dejar reseñas',
      });
    }

    const supabase = getSupabaseServiceRoleClient();
    const { data: club, error: ce } = await supabase.from('clubs').select('id').eq('id', club_id).maybeSingle();
    if (ce) return res.status(500).json({ ok: false, error: ce.message });
    if (!club) return res.status(404).json({ ok: false, error: 'Club no encontrado' });

    const now = new Date().toISOString();
    const { data: existing, error: exErr } = await supabase
      .from('club_reviews')
      .select('id')
      .eq('club_id', club_id)
      .eq('player_id', playerId)
      .maybeSingle();

    if (exErr) return res.status(500).json({ ok: false, error: exErr.message });

    if (existing?.id) {
      const { data: saved, error } = await supabase
        .from('club_reviews')
        .update({ rating, comment: comment || null, updated_at: now })
        .eq('id', existing.id)
        .select('id, created_at, updated_at, club_id, player_id, rating, comment')
        .single();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json({ ok: true, review: saved });
    }

    const { data: saved, error } = await supabase
      .from('club_reviews')
      .insert({
        club_id,
        player_id: playerId,
        rating,
        comment: comment || null,
      })
      .select('id, created_at, updated_at, club_id, player_id, rating, comment')
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, review: saved });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /club-reviews/{id}:
 *   patch:
 *     tags: [Club reviews]
 *     summary: Editar mi reseña por id (jugador, solo propia)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               comment: { type: string, nullable: true }
 *     responses:
 *       200: { description: Actualizada }
 *       400: { description: Sin cambios válidos }
 *       401: { description: Sin token }
 *       403: { description: No es tu reseña }
 *       404: { description: No existe }
 */
router.patch('/:id', async (req: Request, res: Response) => {
  const token = getToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token requerido. Envía Authorization: Bearer <access_token>.' });
  }

  const id = String(req.params.id ?? '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'id inválido' });

  const ratingRaw = req.body?.rating;
  const hasRating = ratingRaw !== undefined && ratingRaw !== null;
  const rating = hasRating ? Number(ratingRaw) : null;
  const hasComment = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'comment');
  const comment =
    hasComment && typeof req.body?.comment === 'string'
      ? req.body.comment.trim().slice(0, 4000)
      : hasComment
        ? null
        : undefined;

  if (hasRating && (!Number.isInteger(rating) || rating! < 1 || rating! > 5)) {
    return res.status(400).json({ ok: false, error: 'rating debe ser un entero entre 1 y 5' });
  }
  if (!hasRating && !hasComment) {
    return res.status(400).json({ ok: false, error: 'Envía rating y/o comment' });
  }

  try {
    const playerId = await resolvePlayerIdFromToken(token);
    if (!playerId) {
      return res.status(403).json({ ok: false, error: 'Solo jugadores con cuenta pueden editar reseñas' });
    }

    const supabase = getSupabaseServiceRoleClient();
    const { data: existing, error: fe } = await supabase
      .from('club_reviews')
      .select('id, player_id')
      .eq('id', id)
      .maybeSingle();

    if (fe) return res.status(500).json({ ok: false, error: fe.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Reseña no encontrada' });
    if (existing.player_id !== playerId) {
      return res.status(403).json({ ok: false, error: 'No puedes editar esta reseña' });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (hasRating) patch.rating = rating;
    if (hasComment) patch.comment = comment;

    const { data: updated, error } = await supabase
      .from('club_reviews')
      .update(patch)
      .eq('id', id)
      .select('id, created_at, updated_at, club_id, player_id, rating, comment')
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, review: updated });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /club-reviews/{id}:
 *   delete:
 *     tags: [Club reviews]
 *     summary: Eliminar mi reseña (jugador, solo propia)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Eliminada }
 *       401: { description: Sin token }
 *       403: { description: No es tu reseña }
 *       404: { description: No existe }
 */
router.delete('/:id', async (req: Request, res: Response) => {
  const token = getToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token requerido. Envía Authorization: Bearer <access_token>.' });
  }

  const id = String(req.params.id ?? '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'id inválido' });

  try {
    const playerId = await resolvePlayerIdFromToken(token);
    if (!playerId) {
      return res.status(403).json({ ok: false, error: 'Solo jugadores con cuenta pueden eliminar reseñas' });
    }

    const supabase = getSupabaseServiceRoleClient();
    const { data: existing, error: fe } = await supabase
      .from('club_reviews')
      .select('id, player_id')
      .eq('id', id)
      .maybeSingle();

    if (fe) return res.status(500).json({ ok: false, error: fe.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Reseña no encontrada' });
    if (existing.player_id !== playerId) {
      return res.status(403).json({ ok: false, error: 'No puedes eliminar esta reseña' });
    }

    const { error } = await supabase.from('club_reviews').delete().eq('id', id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
