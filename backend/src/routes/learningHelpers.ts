import { Request, Response, NextFunction } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.authContext) {
    res.status(401).json({ ok: false, error: 'Token requerido. Envía Authorization: Bearer <access_token>.' });
    return;
  }
  next();
}

export async function getPlayerFromAuth(authUserId: string): Promise<{ id: string; elo_rating: number } | null> {
  const supabase = getSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('players')
    .select('id, elo_rating')
    .eq('auth_user_id', authUserId)
    .neq('status', 'deleted')
    .maybeSingle();
  return data as { id: string; elo_rating: number } | null;
}

export function canAccessClub(req: Request, clubId: string): boolean {
  if (req.authContext?.adminId) return true;
  return req.authContext?.allowedClubIds?.includes(clubId) ?? false;
}
