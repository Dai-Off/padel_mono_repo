import { Request, Response, NextFunction } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';

function getToken(req: Request): string | null {
  const authHeader = req.headers.authorization ?? req.headers['Authorization'];
  const raw = typeof authHeader === 'string' ? authHeader : '';
  if (raw.startsWith('Bearer ')) return raw.slice(7).trim();
  return raw.trim() || null;
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ ok: false, error: 'Token requerido. Envía Authorization: Bearer <access_token>.' });
    return;
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      res.status(401).json({ ok: false, error: 'Sesión inválida o token expirado.' });
      return;
    }
    const { data: admin } = await supabase
      .from('admins')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (!admin) {
      res.status(403).json({ ok: false, error: 'Se requieren permisos de admin.' });
      return;
    }
    next();
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
}
