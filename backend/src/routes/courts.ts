import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';

const router = Router();

const SELECT_LIST = 'id, created_at, club_id, name, indoor, glass_type, status, lighting, last_maintenance';
const SELECT_ONE = 'id, created_at, club_id, name, indoor, glass_type, status, lighting, last_maintenance';

router.get('/', async (req: Request, res: Response) => {
  const club_id = req.query.club_id as string | undefined;
  try {
    const supabase = getSupabaseServiceRoleClient();
    let q = supabase
      .from('courts')
      .select(SELECT_LIST)
      .order('created_at', { ascending: false })
      .limit(50);
    if (club_id) q = q.eq('club_id', club_id);
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, courts: data ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('courts')
      .select(SELECT_ONE)
      .eq('id', id)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Court not found' });
    return res.json({ ok: true, court: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { club_id, name, indoor, glass_type, lighting, last_maintenance } = req.body ?? {};
  if (!club_id || !name) {
    return res.status(400).json({ ok: false, error: 'club_id y name son obligatorios' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('courts')
      .insert([
        {
          club_id,
          name,
          indoor: Boolean(indoor),
          glass_type: glass_type === 'panoramic' ? 'panoramic' : 'normal',
          lighting: lighting !== undefined ? Boolean(lighting) : false,
          last_maintenance: last_maintenance ?? null,
        },
      ])
      .select(SELECT_ONE)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(201).json({ ok: true, court: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, indoor, glass_type, status, lighting, last_maintenance } = req.body ?? {};
  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (indoor !== undefined) update.indoor = Boolean(indoor);
  if (glass_type !== undefined) update.glass_type = glass_type === 'panoramic' ? 'panoramic' : 'normal';
  if (status !== undefined) update.status = status;
  if (lighting !== undefined) update.lighting = Boolean(lighting);
  if (last_maintenance !== undefined) update.last_maintenance = last_maintenance;
  if (Object.keys(update).length === 0) {
    return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('courts')
      .update(update)
      .eq('id', id)
      .select(SELECT_ONE)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Court not found' });
    return res.json({ ok: true, court: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { error } = await supabase.from('courts').delete().eq('id', id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, deleted: id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
