import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdmin } from '../middleware/requireClubOwnerOrAdmin';
import { ensureDefaultPricingRuleForCourt } from '../lib/pricingRulesDefaults';

const router = Router();
router.use(attachAuthContext);

const FIELDS = 'id, created_at, club_id, name, indoor, glass_type, status, lighting, last_maintenance';

function canAccessCourtClub(req: Request, clubId: string): boolean {
  if (req.authContext?.adminId) return true;
  return req.authContext?.allowedClubIds?.includes(clubId) ?? false;
}

/** GET /courts — listar pistas. Público (app móvil, reservas). Si hay token y es admin/dueño, se filtra por sus clubs; si no, se devuelven todas (o por club_id si se pasa). */
router.get('/', async (req: Request, res: Response) => {
  const club_id = req.query.club_id as string | undefined;
  try {
    const supabase = getSupabaseServiceRoleClient();
    let q = supabase
      .from('courts')
      .select(FIELDS)
      .order('created_at', { ascending: false })
      .limit(100);
    if (req.authContext?.adminId) {
      if (club_id) q = q.eq('club_id', club_id);
    } else if (req.authContext?.clubOwnerId && req.authContext?.allowedClubIds?.length) {
      q = q.in('club_id', req.authContext.allowedClubIds);
      if (club_id && !req.authContext.allowedClubIds.includes(club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
      if (club_id) q = q.eq('club_id', club_id);
    } else {
      if (club_id) q = q.eq('club_id', club_id);
    }
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, courts: data ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

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
    return res.json({ ok: true, court: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.post('/', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const { club_id, name, indoor, glass_type, lighting, last_maintenance } = req.body ?? {};
  if (!club_id || !name || !String(name).trim()) {
    return res.status(400).json({ ok: false, error: 'club_id y name son obligatorios' });
  }
  if (!canAccessCourtClub(req, club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  try {
    const supabase = getSupabaseServiceRoleClient();
    const row: Record<string, unknown> = {
      club_id,
      name: String(name).trim(),
      indoor: Boolean(indoor),
      glass_type: glass_type === 'panoramic' ? 'panoramic' : 'normal',
    };
    if (lighting !== undefined) row.lighting = Boolean(lighting);
    if (last_maintenance !== undefined) row.last_maintenance = last_maintenance ?? null;
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

router.put('/:id', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: existing } = await supabase.from('courts').select('club_id').eq('id', id).maybeSingle();
    if (!existing || !canAccessCourtClub(req, (existing as { club_id: string }).club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a esta pista' });
  } catch {
    return res.status(500).json({ ok: false, error: 'Error al verificar pista' });
  }
  const { name, indoor, glass_type, status, lighting, last_maintenance } = req.body ?? {};
  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = String(name).trim();
  if (indoor !== undefined) update.indoor = Boolean(indoor);
  if (glass_type !== undefined) update.glass_type = glass_type === 'panoramic' ? 'panoramic' : 'normal';
  if (status !== undefined) update.status = status === 'maintenance' ? 'maintenance' : 'operational';
  if (lighting !== undefined) update.lighting = Boolean(lighting);
  if (last_maintenance !== undefined) update.last_maintenance = last_maintenance ?? null;
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
    const { data: existing } = await supabase.from('courts').select('club_id').eq('id', id).maybeSingle();
    if (!existing || !canAccessCourtClub(req, (existing as { club_id: string }).club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a esta pista' });
    const { error } = await supabase.from('courts').delete().eq('id', id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, deleted: id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
