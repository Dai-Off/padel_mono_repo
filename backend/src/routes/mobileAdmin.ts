import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import mobileAdminStoreRouter from './mobileAdminStore';

const router = Router();

router.use('/store', mobileAdminStoreRouter);

/**
 * Perfil para webapp-wechat únicamente.
 * No modifica ni reemplaza GET /auth/me (web-app, mobile-app).
 */
router.get('/auth/me', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization ?? req.headers['Authorization'];
  const raw = typeof authHeader === 'string' ? authHeader : '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : raw.trim() || null;
  if (!token) {
    return res.status(401).json({
      ok: false,
      error: 'Falta el header Authorization con valor Bearer <access_token>',
    });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ ok: false, error: 'Sesión inválida o token expirado.' });
    }

    const { data: mobileAdmin, error: adminErr } = await supabase
      .from('mobile_admins')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (adminErr) {
      return res.status(500).json({ ok: false, error: adminErr.message });
    }
    if (!mobileAdmin) {
      return res.status(403).json({ ok: false, error: 'No tenés permisos de admin mobile.' });
    }

    return res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata,
      },
      roles: {
        mobile_admin_id: mobileAdmin.id,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

export default router;
