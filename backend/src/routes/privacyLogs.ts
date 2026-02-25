import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';

const router = Router();

const ACTION_TYPES = ['accept_terms', 'revoke_marketing', 'delete_account_request', 'export_data'] as const;

// Solo escritura: registrar evento de privacidad (GDPR). Sin listado público por defecto.
router.post('/', async (req: Request, res: Response) => {
  const { user_id, action_type, ip, user_agent } = req.body ?? {};
  if (!action_type || !ip) {
    return res.status(400).json({
      ok: false,
      error: 'action_type e ip son obligatorios',
    });
  }
  if (!ACTION_TYPES.includes(action_type)) {
    return res.status(400).json({
      ok: false,
      error: `action_type debe ser uno de: ${ACTION_TYPES.join(', ')}`,
    });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('privacy_logs')
      .insert([
        {
          user_id: user_id ?? null,
          action_type,
          ip,
          user_agent: user_agent ?? null,
        },
      ])
      .select('id, occurred_at, action_type')
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(201).json({ ok: true, privacy_log: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
