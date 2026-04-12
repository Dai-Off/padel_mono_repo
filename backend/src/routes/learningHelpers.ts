import { Request, Response, NextFunction } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.authContext) {
    res.status(401).json({ ok: false, error: 'Token requerido. Envía Authorization: Bearer <access_token>.' });
    return;
  }
  next();
}

export async function getPlayerFromAuth(req: Request): Promise<{ id: string; elo_rating: number } | null> {
  const authHeader = req.headers.authorization ?? req.headers['Authorization'];
  const raw = typeof authHeader === 'string' ? authHeader : '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : raw.trim() || null;

  if (!token) return null;

  const supabase = getSupabaseServiceRoleClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user?.email) return null;

  const email = String(user.email).trim().toLowerCase();
  const { data } = await supabase
    .from('players')
    .select('id, elo_rating')
    .eq('email', email)
    .neq('status', 'deleted')
    .maybeSingle();

  return data as { id: string; elo_rating: number } | null;
}

export function canAccessClub(req: Request, clubId: string): boolean {
  if (req.authContext?.adminId) return true;
  return req.authContext?.allowedClubIds?.includes(clubId) ?? false;
}
