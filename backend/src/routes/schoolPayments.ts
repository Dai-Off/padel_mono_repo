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

router.get('/charges', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const clubId = String(req.query.club_id ?? '').trim();
  if (!clubId) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, clubId)) return res.status(403).json({ ok: false, error: 'Sin acceso al club' });
  const status = String(req.query.status ?? '').trim();
  const overdue = String(req.query.overdue ?? '').trim() === 'true';
  const today = new Date().toISOString().slice(0, 10);
  const supabase = getSupabaseServiceRoleClient();

  let q = supabase
    .from('club_school_charges')
    .select('id, club_id, source_type, source_id, enrollment_id, student_player_id, student_name, amount_cents, due_date, status, paid_at, created_at, updated_at')
    .eq('club_id', clubId)
    .order('due_date', { ascending: true });
  if (status) q = q.eq('status', status);
  if (overdue) q = q.eq('status', 'pending').lt('due_date', today);
  const { data, error } = await q;
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, charges: data ?? [] });
});

router.post('/charges', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const clubId = String(req.body?.club_id ?? '').trim();
  const sourceType = String(req.body?.source_type ?? '').trim();
  const amountCents = Number(req.body?.amount_cents);
  const dueDate = String(req.body?.due_date ?? '').trim();
  if (!clubId) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, clubId)) return res.status(403).json({ ok: false, error: 'Sin acceso al club' });
  if (!['course', 'private'].includes(sourceType)) return res.status(400).json({ ok: false, error: 'source_type inválido' });
  if (!Number.isFinite(amountCents) || amountCents < 0) return res.status(400).json({ ok: false, error: 'amount_cents inválido' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return res.status(400).json({ ok: false, error: 'due_date inválido' });

  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('club_school_charges')
    .insert({
      club_id: clubId,
      source_type: sourceType,
      source_id: req.body?.source_id || null,
      enrollment_id: req.body?.enrollment_id || null,
      student_player_id: req.body?.student_player_id || null,
      student_name: req.body?.student_name || null,
      amount_cents: Math.round(amountCents),
      due_date: dueDate,
      status: 'pending',
    })
    .select('id, club_id, source_type, source_id, enrollment_id, student_player_id, student_name, amount_cents, due_date, status, paid_at, created_at, updated_at')
    .single();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.status(201).json({ ok: true, charge: data });
});

router.put('/charges/:id/mark-paid', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const supabase = getSupabaseServiceRoleClient();
  const { data: existing, error: exErr } = await supabase
    .from('club_school_charges')
    .select('id, club_id')
    .eq('id', id)
    .maybeSingle();
  if (exErr) return res.status(500).json({ ok: false, error: exErr.message });
  if (!existing) return res.status(404).json({ ok: false, error: 'Cargo no encontrado' });
  if (!canAccessClub(req, (existing as { club_id: string }).club_id)) return res.status(403).json({ ok: false, error: 'Sin acceso al club' });
  const { data, error } = await supabase
    .from('club_school_charges')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, club_id, source_type, source_id, enrollment_id, student_player_id, student_name, amount_cents, due_date, status, paid_at, created_at, updated_at')
    .single();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, charge: data });
});

router.put('/charges/:id/cancel', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const supabase = getSupabaseServiceRoleClient();
  const { data: existing, error: exErr } = await supabase
    .from('club_school_charges')
    .select('id, club_id')
    .eq('id', id)
    .maybeSingle();
  if (exErr) return res.status(500).json({ ok: false, error: exErr.message });
  if (!existing) return res.status(404).json({ ok: false, error: 'Cargo no encontrado' });
  if (!canAccessClub(req, (existing as { club_id: string }).club_id)) return res.status(403).json({ ok: false, error: 'Sin acceso al club' });
  const { data, error } = await supabase
    .from('club_school_charges')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .select('id, club_id, source_type, source_id, enrollment_id, student_player_id, student_name, amount_cents, due_date, status, paid_at, created_at, updated_at')
    .single();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, charge: data });
});

export default router;
