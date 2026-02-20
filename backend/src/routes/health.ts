import { Router, Request, Response } from 'express';
import { getSupabaseClient } from '../lib/supabase';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({ ok: true, status: 'healthy' });
});

router.get('/supabase', async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('now');
    const connected = !error;
    res.json({ ok: true, connected, serverTime: data ?? null, error: error?.message ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ ok: false, connected: false, error: message });
  }
});

export default router;
