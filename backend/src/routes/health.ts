import { Router, Request, Response } from 'express';
import { getSupabaseClient } from '../lib/supabase';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({ ok: true, status: 'healthy' });
});

router.get('/supabase', async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabaseClient();
    // Simple ping contra la tabla players para comprobar conexión + esquema
    const { data, error } = await supabase
      .from('players')
      .select('id')
      .limit(1);

    const connected = !error;
    res.json({
      ok: true,
      connected,
      sampleCount: data?.length ?? 0,
      error: error?.message ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ ok: false, connected: false, error: message });
  }
});

export default router;
