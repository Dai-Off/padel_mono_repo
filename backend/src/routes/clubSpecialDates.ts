import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';

const router = Router();
router.use(attachAuthContext);

router.get('/', async (req: Request, res: Response) => {
  const club_id = req.query.club_id as string | undefined;
  if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });

  const year = req.query.year as string | undefined;

  const supabase = getSupabaseServiceRoleClient();
  let q = supabase
    .from('club_special_dates')
    .select('*')
    .eq('club_id', club_id)
    .order('date', { ascending: true });

  if (year) {
    q = q.gte('date', `${year}-01-01`).lte('date', `${year}-12-31`);
  }

  const { data, error } = await q;
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, dates: data });
});

router.get('/check', async (req: Request, res: Response) => {
  const club_id = req.query.club_id as string | undefined;
  const date = req.query.date as string | undefined;
  if (!club_id || !date) return res.status(400).json({ ok: false, error: 'club_id y date son obligatorios' });

  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('club_special_dates')
    .select('*')
    .eq('club_id', club_id)
    .eq('date', date);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({
    ok: true,
    is_holiday: (data ?? []).some((d: any) => d.type === 'holiday'),
    is_non_working: (data ?? []).some((d: any) => d.type === 'non_working'),
    entries: data,
  });
});

router.post('/', async (req: Request, res: Response) => {
  const { club_id, date, type, reason } = req.body ?? {};
  if (!club_id || !date || !type) {
    return res.status(400).json({ ok: false, error: 'club_id, date y type son obligatorios' });
  }
  if (!['holiday', 'non_working'].includes(type)) {
    return res.status(400).json({ ok: false, error: 'type debe ser "holiday" o "non_working"' });
  }

  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('club_special_dates')
    .insert({ club_id, date, type, reason: reason || null })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ ok: false, error: 'Ya existe una entrada para esa fecha y tipo' });
    }
    return res.status(500).json({ ok: false, error: error.message });
  }
  return res.status(201).json({ ok: true, entry: data });
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const supabase = getSupabaseServiceRoleClient();
  const { error } = await supabase.from('club_special_dates').delete().eq('id', id);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true });
});

export default router;
