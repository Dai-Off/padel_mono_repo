import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdminOrPortalStaff } from '../middleware/requireClubOwnerOrAdminOrPortalStaff';
import { canAccessClub } from '../lib/clubAccess';

const router = Router();
router.use(attachAuthContext);

const FIELDS = 'id, club_id, name, price_cents, is_active, created_at, updated_at';

/**
 * @openapi
 * /school-price-types:
 *   get:
 *     tags: [School courses]
 *     summary: Listar tipos de precio de escuela
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: club_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Lista de tarifas }
 *       400: { description: club_id obligatorio }
 *       403: { description: Sin acceso }
 */
router.get('/', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const clubId = String(req.query.club_id ?? '').trim();
  if (!clubId) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, clubId, 'escuela')) return res.status(403).json({ ok: false, error: 'Sin acceso al club' });
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('club_school_price_types')
    .select(FIELDS)
    .eq('club_id', clubId)
    .order('name', { ascending: true });
  if (error) {
    if (error.code === '42P01' || error.message?.includes('does not exist')) {
      return res.json({ ok: true, price_types: [] });
    }
    return res.status(500).json({ ok: false, error: error.message });
  }
  return res.json({ ok: true, price_types: data ?? [] });
});

/**
 * @openapi
 * /school-price-types:
 *   post:
 *     tags: [School courses]
 *     summary: Crear tipo de precio de escuela
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [club_id, name, price_cents]
 *             properties:
 *               club_id: { type: string, format: uuid }
 *               name: { type: string, example: "Cursos grupales" }
 *               price_cents: { type: integer, example: 8000 }
 *     responses:
 *       201: { description: Creado }
 *       400: { description: Validación }
 */
router.post('/', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const clubId = String(req.body?.club_id ?? '').trim();
  const name = String(req.body?.name ?? '').trim();
  const priceCents = Number(req.body?.price_cents);
  if (!clubId || !name) return res.status(400).json({ ok: false, error: 'club_id y name son obligatorios' });
  if (!canAccessClub(req, clubId, 'escuela')) return res.status(403).json({ ok: false, error: 'Sin acceso al club' });
  if (!Number.isFinite(priceCents) || priceCents < 0) return res.status(400).json({ ok: false, error: 'price_cents inválido' });

  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('club_school_price_types')
    .insert({
      club_id: clubId,
      name,
      price_cents: Math.round(priceCents),
      is_active: req.body?.is_active !== false,
    })
    .select(FIELDS)
    .single();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.status(201).json({ ok: true, price_type: data });
});

/**
 * @openapi
 * /school-price-types/{id}:
 *   put:
 *     tags: [School courses]
 *     summary: Actualizar tipo de precio
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Actualizado }
 *       404: { description: No encontrado }
 */
router.put('/:id', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const { id } = req.params;
  const supabase = getSupabaseServiceRoleClient();
  const { data: existing, error: exErr } = await supabase
    .from('club_school_price_types')
    .select('id, club_id')
    .eq('id', id)
    .maybeSingle();
  if (exErr) return res.status(500).json({ ok: false, error: exErr.message });
  if (!existing) return res.status(404).json({ ok: false, error: 'Tipo de precio no encontrado' });
  const clubId = (existing as { club_id: string }).club_id;
  if (!canAccessClub(req, clubId, 'escuela')) return res.status(403).json({ ok: false, error: 'Sin acceso al club' });

  const update: Record<string, unknown> = {};
  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) return res.status(400).json({ ok: false, error: 'name no puede estar vacío' });
    update.name = name;
  }
  if (req.body?.price_cents !== undefined) {
    const priceCents = Number(req.body.price_cents);
    if (!Number.isFinite(priceCents) || priceCents < 0) return res.status(400).json({ ok: false, error: 'price_cents inválido' });
    update.price_cents = Math.round(priceCents);
  }
  if (req.body?.is_active !== undefined) update.is_active = req.body.is_active !== false;

  const { data, error } = await supabase
    .from('club_school_price_types')
    .update(update)
    .eq('id', id)
    .select(FIELDS)
    .single();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, price_type: data });
});

/**
 * @openapi
 * /school-price-types/{id}:
 *   delete:
 *     tags: [School courses]
 *     summary: Eliminar tipo de precio
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Eliminado }
 */
router.delete('/:id', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const { id } = req.params;
  const supabase = getSupabaseServiceRoleClient();
  const { data: existing, error: exErr } = await supabase
    .from('club_school_price_types')
    .select('id, club_id')
    .eq('id', id)
    .maybeSingle();
  if (exErr) return res.status(500).json({ ok: false, error: exErr.message });
  if (!existing) return res.status(404).json({ ok: false, error: 'Tipo de precio no encontrado' });
  if (!canAccessClub(req, (existing as { club_id: string }).club_id, 'escuela')) {
    return res.status(403).json({ ok: false, error: 'Sin acceso al club' });
  }
  const { error } = await supabase.from('club_school_price_types').delete().eq('id', id);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true });
});

export default router;
