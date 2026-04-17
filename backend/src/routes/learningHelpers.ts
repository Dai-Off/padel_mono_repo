import { Request, Response, NextFunction } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.authContext) {
    res.status(401).json({ ok: false, error: 'Token requerido. Envía Authorization: Bearer <access_token>.' });
    return;
  }
  next();
}

export async function getPlayerFromAuth(authUserId: string): Promise<{ id: string; elo_rating: number; onboarding_completed: boolean } | null> {
  const supabase = getSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('players')
    .select('id, elo_rating, onboarding_completed')
    .eq('auth_user_id', authUserId)
    .neq('status', 'deleted')
    .maybeSingle();
  return data as { id: string; elo_rating: number; onboarding_completed: boolean } | null;
}

export function requireOnboarding(player: { onboarding_completed: boolean }): string | null {
  if (!player.onboarding_completed) {
    return 'Debes completar el cuestionario de nivelacion antes de acceder al modulo de aprendizaje';
  }
  return null;
}

export function canAccessClub(req: Request, clubId: string): boolean {
  if (req.authContext?.adminId) return true;
  return req.authContext?.allowedClubIds?.includes(clubId) ?? false;
}
