import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdmin } from '../middleware/requireClubOwnerOrAdmin';

const router = Router();
router.use(attachAuthContext);

function canAccessClub(req: Request, clubId: string): boolean {
  if (req.authContext?.adminId) return true;
  return req.authContext?.allowedClubIds?.includes(clubId) ?? false;
}

router.get('/', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const clubId = String(req.query.club_id ?? '').trim();
  if (!clubId) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, clubId)) return res.status(403).json({ ok: false, error: 'Sin acceso al club' });
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('club_school_fee_rules')
    .select('id, club_id, group_size, time_band, price_cents, is_active, created_at, updated_at')
    .eq('club_id', clubId)
    .order('group_size', { ascending: true });
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, rules: data ?? [] });
});

router.post('/', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const clubId = String(req.body?.club_id ?? '').trim();
  const groupSize = Number(req.body?.group_size);
  const timeBand = String(req.body?.time_band ?? '').trim();
  const priceCents = Number(req.body?.price_cents);
  if (!clubId) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, clubId)) return res.status(403).json({ ok: false, error: 'Sin acceso al club' });
  if (![2, 3, 4].includes(groupSize)) return res.status(400).json({ ok: false, error: 'group_size inválido' });
  if (!['morning', 'afternoon', 'weekend'].includes(timeBand)) return res.status(400).json({ ok: false, error: 'time_band inválido' });
  if (!Number.isFinite(priceCents) || priceCents < 0) return res.status(400).json({ ok: false, error: 'price_cents inválido' });

  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('club_school_fee_rules')
    .upsert(
      {
        club_id: clubId,
        group_size: groupSize,
        time_band: timeBand,
        price_cents: Math.round(priceCents),
        is_active: req.body?.is_active !== false,
      },
      { onConflict: 'club_id,group_size,time_band' }
    )
    .select('id, club_id, group_size, time_band, price_cents, is_active, created_at, updated_at')
    .single();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.status(201).json({ ok: true, rule: data });
});

router.delete('/:id', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const supabase = getSupabaseServiceRoleClient();
  const { data: existing, error: exErr } = await supabase
    .from('club_school_fee_rules')
    .select('id, club_id')
    .eq('id', id)
    .maybeSingle();
  if (exErr) return res.status(500).json({ ok: false, error: exErr.message });
  if (!existing) return res.status(404).json({ ok: false, error: 'Regla no encontrada' });
  if (!canAccessClub(req, (existing as { club_id: string }).club_id)) return res.status(403).json({ ok: false, error: 'Sin acceso al club' });
  const { error } = await supabase.from('club_school_fee_rules').delete().eq('id', id);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true });
});

export default router;
