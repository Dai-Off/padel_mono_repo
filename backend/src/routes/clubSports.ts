import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireAuthUser } from '../middleware/requireAuthUser';
import { canAccessClub, isClubOwnerOrAdmin } from '../lib/clubAccess';

const router = Router();
router.use(attachAuthContext);

const FIELDS = 'id, club_id, name, slug, allows_singles, is_active, created_at, updated_at';

function normalizeSlug(input: unknown): string {
  const source = String(input ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const slug = source.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'sport';
}

/**
 * @openapi
 * /club-sports:
 *   get:
 *     tags: [Club Sports]
 *     summary: Listar deportes por club
 *     description: Devuelve los deportes configurados para un club y si cada uno admite modalidad singles.
 *     parameters:
 *       - in: query
 *         name: club_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Lista de deportes
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value:
 *                   ok: true
 *                   sports:
 *                     - id: "4bb0d4f1-9122-4f0f-8c66-1aa6442e4000"
 *                       club_id: "11111111-1111-1111-1111-111111111111"
 *                       name: "Padel"
 *                       slug: "padel"
 *                       allows_singles: true
 *                       is_active: true
 *       400: { description: Falta club_id }
 *       403: { description: Sin permisos para el club }
 */
router.get('/', async (req: Request, res: Response) => {
  const club_id = String(req.query.club_id ?? '').trim();
  if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!isClubOwnerOrAdmin(req, club_id) && !canAccessClub(req, club_id, ['configuracion', 'grilla', 'gestion'])) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('club_sports')
      .select(FIELDS)
      .eq('club_id', club_id)
      .order('name', { ascending: true });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    const sports = (data ?? []).length
      ? (data ?? []).map((sport) => ({ ...sport, allows_singles: true }))
      : [
          {
            id: `default-${club_id}-padel`,
            club_id,
            name: 'Padel',
            slug: 'padel',
            allows_singles: true,
            is_active: true,
            created_at: null,
            updated_at: null,
          },
        ];
    return res.json({ ok: true, sports });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /club-sports:
 *   post:
 *     tags: [Club Sports]
 *     summary: Crear deporte en club
 *     description: Crea un deporte configurable para que aparezca en la gestión de canchas y reservas.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [club_id, name]
 *             properties:
 *               club_id: { type: string, format: uuid }
 *               name: { type: string, example: Padel }
 *               slug: { type: string, example: padel }
 *               allows_singles: { type: boolean, example: true }
 *               is_active: { type: boolean, example: true }
 *     responses:
 *       201: { description: Deporte creado }
 *       400: { description: club_id o name faltantes }
 *       403: { description: Sin permisos }
 */
router.post('/', requireAuthUser, async (req: Request, res: Response) => {
  const { club_id, name, slug, allows_singles, is_active } = req.body ?? {};
  const clubId = String(club_id ?? '').trim();
  const sportName = String(name ?? '').trim();
  if (!clubId || !sportName) {
    return res.status(400).json({ ok: false, error: 'club_id y name son obligatorios' });
  }
  if (!canAccessClub(req, clubId, 'configuracion')) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('club_sports')
      .insert({
        club_id: clubId,
        name: sportName,
        slug: normalizeSlug(slug ?? sportName),
        allows_singles: true,
        is_active: is_active !== false,
      })
      .select(FIELDS)
      .single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(201).json({ ok: true, sport: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /club-sports/{id}:
 *   put:
 *     tags: [Club Sports]
 *     summary: Actualizar deporte del club
 *     description: Permite editar nombre, slug, visibilidad y si permite modalidad singles.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, example: Tennis }
 *               slug: { type: string, example: tennis }
 *               allows_singles: { type: boolean, example: false }
 *               is_active: { type: boolean, example: true }
 *     responses:
 *       200: { description: Deporte actualizado }
 *       400: { description: Sin campos para actualizar }
 *       403: { description: Sin permisos }
 *       404: { description: Deporte no encontrado }
 */
router.put('/:id', requireAuthUser, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: existing, error: qErr } = await supabase
      .from('club_sports')
      .select('id, club_id')
      .eq('id', id)
      .maybeSingle();
    if (qErr) return res.status(500).json({ ok: false, error: qErr.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Deporte no encontrado' });
    if (!canAccessClub(req, existing.club_id, 'configuracion')) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }

    const body = req.body ?? {};
    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = String(body.name ?? '').trim();
    if (body.slug !== undefined || body.name !== undefined) {
      update.slug = normalizeSlug(body.slug ?? body.name);
    }
    if (body.allows_singles !== undefined) update.allows_singles = true;
    if (body.is_active !== undefined) update.is_active = Boolean(body.is_active);
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' });
    }

    const { data, error } = await supabase
      .from('club_sports')
      .update(update)
      .eq('id', id)
      .select(FIELDS)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Deporte no encontrado' });
    return res.json({ ok: true, sport: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /club-sports/{id}:
 *   delete:
 *     tags: [Club Sports]
 *     summary: Eliminar deporte del club
 *     description: Elimina un deporte configurable del club.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Deporte eliminado
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value: { ok: true, deleted: "uuid" }
 *       403: { description: Sin permisos }
 *       404: { description: Deporte no encontrado }
 */
router.delete('/:id', requireAuthUser, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: existing, error: qErr } = await supabase
      .from('club_sports')
      .select('id, club_id')
      .eq('id', id)
      .maybeSingle();
    if (qErr) return res.status(500).json({ ok: false, error: qErr.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Deporte no encontrado' });
    if (!canAccessClub(req, existing.club_id, 'configuracion')) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }
    const { error } = await supabase.from('club_sports').delete().eq('id', id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, deleted: id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
