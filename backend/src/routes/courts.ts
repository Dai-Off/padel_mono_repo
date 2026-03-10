import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';

const router = Router();

const FIELDS = 'id, created_at, club_id, name, indoor, glass_type, status, lighting, last_maintenance';

router.get('/', async (req: Request, res: Response) => {
  const club_id = req.query.club_id as string | undefined;
  try {
    const supabase = getSupabaseServiceRoleClient();
    let q = supabase
      .from('courts')
      .select(FIELDS)
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

router.post('/', async (req: Request, res: Response) => {
  const { club_id, name, indoor, glass_type, lighting, last_maintenance } = req.body ?? {};
  if (!club_id || !name || !String(name).trim()) {
    return res.status(400).json({ ok: false, error: 'club_id y name son obligatorios' });
  }
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
    return res.status(201).json({ ok: true, court: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
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
