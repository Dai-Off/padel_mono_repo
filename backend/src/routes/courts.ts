import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdmin } from '../middleware/requireClubOwnerOrAdmin';
import { ensureDefaultPricingRuleForCourt } from '../lib/pricingRulesDefaults';
import { normalizeStoredVisibilityWindows } from '../lib/courtVisibility';

const router = Router();
router.use(attachAuthContext);

const FIELDS =
  'id, created_at, club_id, name, indoor, glass_type, status, lighting, last_maintenance, display_order, is_hidden, visibility_windows';

function canAccessCourtClub(req: Request, clubId: string): boolean {
  if (req.authContext?.adminId) return true;
  return req.authContext?.allowedClubIds?.includes(clubId) ?? false;
}

/**
 * @openapi
 * /courts:
 *   get:
 *     tags: [Courts]
 *     summary: Listar pistas
 *     description: |
 *       Dueño de club o admin ven todas las pistas del club (incl. `is_hidden`).
 *       Público y jugadores sin rol de club solo ven pistas con `is_hidden=false`.
 *     parameters:
 *       - in: query
 *         name: club_id
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Lista de pistas
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value: { ok: true, courts: [] }
 *       403: { description: club_id no permitido para el dueño autenticado }
 */
/** GET /courts — listar pistas. Público (app móvil, reservas). Si hay token y es admin/dueño, se filtra por sus clubs; si no, se devuelven todas (o por club_id si se pasa). */
router.get('/', async (req: Request, res: Response) => {
  const club_id = req.query.club_id as string | undefined;
  try {
    const supabase = getSupabaseServiceRoleClient();
    let q = supabase
      .from('courts')
      .select(FIELDS)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(100);
    if (req.authContext?.adminId) {
      if (club_id) q = q.eq('club_id', club_id);
    } else if (req.authContext?.clubOwnerId && req.authContext?.allowedClubIds?.length) {
      q = q.in('club_id', req.authContext.allowedClubIds);
      if (club_id && !req.authContext.allowedClubIds.includes(club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
      if (club_id) q = q.eq('club_id', club_id);
    } else {
      if (club_id) q = q.eq('club_id', club_id);
      q = q.eq('is_hidden', false);
    }
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, courts: data ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * PUT /courts/reorder — guardar orden de pistas de un club (dueño/admin).
 * Body: { club_id, court_ids: string[] } — court_ids = todos los ids del club en el orden deseado.
 */
router.put('/reorder', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const { club_id, court_ids } = req.body ?? {};
  if (!club_id || !Array.isArray(court_ids) || court_ids.length === 0) {
    return res.status(400).json({ ok: false, error: 'club_id y court_ids (array no vacío) son obligatorios' });
  }
  if (!canAccessCourtClub(req, club_id)) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }
  const ids = court_ids.map((x: unknown) => String(x)).filter(Boolean);
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: clubCourts, error: qErr } = await supabase
      .from('courts')
      .select('id')
      .eq('club_id', club_id);
    if (qErr) return res.status(500).json({ ok: false, error: qErr.message });
    const expected = new Set((clubCourts ?? []).map((r: { id: string }) => r.id));
    if (ids.length !== expected.size || !ids.every((id) => expected.has(id))) {
      return res.status(400).json({
        ok: false,
        error: 'court_ids debe listar exactamente todas las pistas del club, sin duplicados',
      });
    }
    for (let i = 0; i < ids.length; i++) {
      const { error: uErr } = await supabase
        .from('courts')
        .update({ display_order: i })
        .eq('id', ids[i])
        .eq('club_id', club_id);
      if (uErr) return res.status(500).json({ ok: false, error: uErr.message });
    }
    const { data: updated, error: listErr } = await supabase
      .from('courts')
      .select(FIELDS)
      .eq('club_id', club_id)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (listErr) return res.status(500).json({ ok: false, error: listErr.message });
    return res.json({ ok: true, courts: updated ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /courts/{id}:
 *   get:
 *     tags: [Courts]
 *     summary: Detalle de pista
 *     description: Pistas ocultas devuelven 404 salvo admin/dueño del club de la pista.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Pista encontrada }
 *       404: { description: No existe o está oculta sin permisos }
 */
/** GET /courts/:id — detalle de una pista. Público (app móvil, reservas). */
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('courts')
      .select(FIELDS)
      .eq('id', id)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Pista no encontrada' });
    const row = data as { is_hidden?: boolean; club_id: string };
    if (row.is_hidden && !canAccessCourtClub(req, row.club_id)) {
      return res.status(404).json({ ok: false, error: 'Pista no encontrada' });
    }
    return res.json({ ok: true, court: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /courts:
 *   post:
 *     tags: [Courts]
 *     summary: Crear pista
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
 *               name: { type: string }
 *               indoor: { type: boolean }
 *               glass_type: { type: string, enum: [normal, panoramic] }
 *               lighting: { type: boolean }
 *               last_maintenance: { type: string, format: date, nullable: true }
 *               is_hidden: { type: boolean, description: 'Excluida de búsqueda pública' }
 *               visibility_windows:
 *                 type: array
 *                 nullable: true
 *                 description: 'Franjas en que la pista se muestra en grilla (día ISO 1–7, minutos 0–1440)'
 *     responses:
 *       201: { description: Creada }
 *       400: { description: visibility_windows inválido }
 */
router.post('/', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const { club_id, name, indoor, glass_type, lighting, last_maintenance, is_hidden, visibility_windows } = req.body ?? {};
  if (!club_id || !name || !String(name).trim()) {
    return res.status(400).json({ ok: false, error: 'club_id y name son obligatorios' });
  }
  if (!canAccessCourtClub(req, club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  const winNorm = normalizeStoredVisibilityWindows(visibility_windows);
  if (!winNorm.ok) return res.status(400).json({ ok: false, error: winNorm.error });
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: lastRow } = await supabase
      .from('courts')
      .select('display_order')
      .eq('club_id', club_id)
      .order('display_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = ((lastRow as { display_order?: number } | null)?.display_order ?? -1) + 1;
    const row: Record<string, unknown> = {
      club_id,
      name: String(name).trim(),
      indoor: Boolean(indoor),
      glass_type: glass_type === 'panoramic' ? 'panoramic' : 'normal',
      display_order: nextOrder,
    };
    if (lighting !== undefined) row.lighting = Boolean(lighting);
    if (last_maintenance !== undefined) row.last_maintenance = last_maintenance ?? null;
    if (is_hidden !== undefined) row.is_hidden = Boolean(is_hidden);
    if (visibility_windows !== undefined) row.visibility_windows = winNorm.value;
    const { data, error } = await supabase
      .from('courts')
      .insert(row)
      .select(FIELDS)
      .single();
    if (error) return res.status(500).json({ ok: false, error: error.message });

    // Ensure pricing_rules is not empty for this court, otherwise search availability returns no slots.
    const pr = await ensureDefaultPricingRuleForCourt(supabase as any, data.id);
    if (pr.error) {
      // Don't fail court creation: return warning so UI can notify and/or user can re-seed later.
      return res.status(201).json({ ok: true, court: data, pricing_rule_seeded: false, pricing_rule_warning: pr.error });
    }
    return res.status(201).json({ ok: true, court: data, pricing_rule_seeded: pr.created });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /courts/{id}:
 *   put:
 *     tags: [Courts]
 *     summary: Actualizar pista
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
 *               name: { type: string }
 *               indoor: { type: boolean }
 *               glass_type: { type: string, enum: [normal, panoramic] }
 *               status: { type: string, enum: [operational, maintenance] }
 *               lighting: { type: boolean }
 *               is_hidden: { type: boolean }
 *               visibility_windows: { type: array, nullable: true }
 *     responses:
 *       200: { description: Actualizada }
 *       400: { description: visibility_windows inválido }
 */
router.put('/:id', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: existing } = await supabase.from('courts').select('club_id').eq('id', id).maybeSingle();
    if (!existing || !canAccessCourtClub(req, (existing as { club_id: string }).club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a esta pista' });
  } catch {
    return res.status(500).json({ ok: false, error: 'Error al verificar pista' });
  }
  const { name, indoor, glass_type, status, lighting, last_maintenance, is_hidden, visibility_windows } = req.body ?? {};
  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = String(name).trim();
  if (indoor !== undefined) update.indoor = Boolean(indoor);
  if (glass_type !== undefined) update.glass_type = glass_type === 'panoramic' ? 'panoramic' : 'normal';
  if (status !== undefined) update.status = status === 'maintenance' ? 'maintenance' : 'operational';
  if (lighting !== undefined) update.lighting = Boolean(lighting);
  if (last_maintenance !== undefined) update.last_maintenance = last_maintenance ?? null;
  if (is_hidden !== undefined) update.is_hidden = Boolean(is_hidden);
  if (visibility_windows !== undefined) {
    const winNorm = normalizeStoredVisibilityWindows(visibility_windows);
    if (!winNorm.ok) return res.status(400).json({ ok: false, error: winNorm.error });
    update.visibility_windows = winNorm.value;
  }
  if (Object.keys(update).length === 0) {
    return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('courts')
      .update(update)
      .eq('id', id)
      .select(FIELDS)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Pista no encontrada' });
    return res.json({ ok: true, court: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.delete('/:id', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: existing } = await supabase.from('courts').select('club_id, is_hidden').eq('id', id).maybeSingle();
    if (!existing || !canAccessCourtClub(req, (existing as { club_id: string }).club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a esta pista' });

    if (!(existing as { is_hidden: boolean }).is_hidden) {
      return res.status(400).json({ ok: false, error: 'Solo se pueden eliminar físicamente las pistas ocultas.' });
    }

    // Limpiar dependencias (Pricing rules, Reservations) primero
    await supabase.from('pricing_rules').delete().eq('court_id', id);
    await supabase.from('reservations').delete().eq('court_id', id);

    const { error } = await supabase.from('courts').delete().eq('id', id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, deleted: id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
