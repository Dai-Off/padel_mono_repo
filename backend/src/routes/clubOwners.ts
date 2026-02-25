import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';

const router = Router();

const SELECT_LIST =
  'id, created_at, name, email, phone, stripe_connect_account_id, kyc_status, status';
const SELECT_ONE =
  'id, created_at, updated_at, name, email, phone, stripe_connect_account_id, kyc_status, status';

router.get('/', async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('club_owners')
      .select(SELECT_LIST)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, club_owners: data ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('club_owners')
      .select(SELECT_ONE)
      .eq('id', id)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Club owner not found' });
    return res.json({ ok: true, club_owner: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { name, email, phone, stripe_connect_account_id } = req.body ?? {};
  if (!name || !email || !stripe_connect_account_id) {
    return res.status(400).json({
      ok: false,
      error: 'name, email y stripe_connect_account_id son obligatorios',
    });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('club_owners')
      .insert([{ name, email, phone: phone ?? null, stripe_connect_account_id }])
      .select(SELECT_LIST)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(201).json({ ok: true, club_owner: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, email, phone, stripe_connect_account_id, kyc_status, status } = req.body ?? {};
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) update.name = name;
  if (email !== undefined) update.email = email;
  if (phone !== undefined) update.phone = phone;
  if (stripe_connect_account_id !== undefined) update.stripe_connect_account_id = stripe_connect_account_id;
  if (kyc_status !== undefined) update.kyc_status = kyc_status;
  if (status !== undefined) update.status = status;
  if (Object.keys(update).length === 1) {
    return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('club_owners')
      .update(update)
      .eq('id', id)
      .select(SELECT_ONE)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Club owner not found' });
    return res.json({ ok: true, club_owner: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('club_owners')
      .update({ status: 'deleted', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, status')
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Club owner not found' });
    return res.json({ ok: true, club_owner: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
