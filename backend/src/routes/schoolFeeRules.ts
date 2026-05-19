import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdminOrPortalStaff } from '../middleware/requireClubOwnerOrAdminOrPortalStaff';
import { canAccessClub } from '../lib/clubAccess';
import { assertSchoolCoachStaff } from '../lib/schoolStaffRoles';

const router = Router();
router.use(attachAuthContext);

const FEE_RULE_SELECT =
  'id, club_id, staff_id, group_size, time_band, price_cents, is_active, created_at, updated_at';

/**
 * @openapi
 * /school-fee-rules:
 *   get:
 *     tags: [School]
 *     summary: Listar tarifas de clases particulares
 *     parameters:
 *       - in: query
 *         name: club_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: OK }
 */
router.get('/', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const clubId = String(req.query.club_id ?? '').trim();
  if (!clubId) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, clubId, 'escuela')) return res.status(403).json({ ok: false, error: 'Sin acceso al club' });
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('club_school_fee_rules')
    .select(FEE_RULE_SELECT)
    .eq('club_id', clubId)
    .order('staff_id', { ascending: true, nullsFirst: true })
    .order('group_size', { ascending: true });
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, rules: data ?? [] });
});

/**
 * @openapi
 * /school-fee-rules:
 *   post:
 *     tags: [School]
 *     summary: Crear o actualizar tarifa de clase particular
 *     description: |
 *       Sin `staff_id` = tarifa general del club. Con `staff_id` = tarifa del profesor.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [club_id, group_size, time_band, price_cents]
 *             properties:
 *               club_id: { type: string, format: uuid }
 *               staff_id: { type: string, format: uuid, nullable: true }
 *               group_size: { type: integer, enum: [1, 2, 3, 4] }
 *               time_band: { type: string, enum: [morning, afternoon, weekend] }
 *               price_cents: { type: integer, minimum: 0 }
 *     responses:
 *       201: { description: Creado o actualizado }
 */
router.post('/', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const clubId = String(req.body?.club_id ?? '').trim();
  const staffIdRaw = req.body?.staff_id;
  const staffId =
    staffIdRaw === null || staffIdRaw === undefined || staffIdRaw === ''
      ? null
      : String(staffIdRaw).trim();
  const groupSize = Number(req.body?.group_size);
  const timeBand = String(req.body?.time_band ?? '').trim();
  const priceCents = Number(req.body?.price_cents);
  if (!clubId) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, clubId, 'escuela')) return res.status(403).json({ ok: false, error: 'Sin acceso al club' });
  if (![1, 2, 3, 4].includes(groupSize)) return res.status(400).json({ ok: false, error: 'group_size inválido (1-4)' });
  if (!['morning', 'afternoon', 'weekend'].includes(timeBand)) {
    return res.status(400).json({ ok: false, error: 'time_band inválido' });
  }
  if (!Number.isFinite(priceCents) || priceCents < 0) return res.status(400).json({ ok: false, error: 'price_cents inválido' });

  const supabase = getSupabaseServiceRoleClient();

  if (staffId) {
    const coachErr = await assertSchoolCoachStaff(supabase, clubId, staffId);
    if (coachErr) return res.status(400).json({ ok: false, error: coachErr });
  }

  let findQuery = supabase
    .from('club_school_fee_rules')
    .select('id')
    .eq('club_id', clubId)
    .eq('group_size', groupSize)
    .eq('time_band', timeBand);
  findQuery = staffId ? findQuery.eq('staff_id', staffId) : findQuery.is('staff_id', null);

  const { data: existing, error: findErr } = await findQuery.maybeSingle();
  if (findErr) return res.status(500).json({ ok: false, error: findErr.message });

  const row = {
    club_id: clubId,
    staff_id: staffId,
    group_size: groupSize,
    time_band: timeBand,
    price_cents: Math.round(priceCents),
    is_active: req.body?.is_active !== false,
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from('club_school_fee_rules')
      .update(row)
      .eq('id', (existing as { id: string }).id)
      .select(FEE_RULE_SELECT)
      .single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, rule: data });
  }

  const { data, error } = await supabase.from('club_school_fee_rules').insert(row).select(FEE_RULE_SELECT).single();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.status(201).json({ ok: true, rule: data });
});

router.delete('/:id', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const { id } = req.params;
  const supabase = getSupabaseServiceRoleClient();
  const { data: existing, error: exErr } = await supabase
    .from('club_school_fee_rules')
    .select('id, club_id')
    .eq('id', id)
    .maybeSingle();
  if (exErr) return res.status(500).json({ ok: false, error: exErr.message });
  if (!existing) return res.status(404).json({ ok: false, error: 'Regla no encontrada' });
  if (!canAccessClub(req, (existing as { club_id: string }).club_id, 'escuela')) {
    return res.status(403).json({ ok: false, error: 'Sin acceso al club' });
  }
  const { error } = await supabase.from('club_school_fee_rules').delete().eq('id', id);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true });
});

export default router;
