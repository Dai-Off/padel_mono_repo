import type { Request } from 'express';
import { getSupabaseServiceRoleClient } from './supabase';

export async function getPlayerIdFromBearer(req: Request): Promise<{ playerId: string; error?: string }> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return { playerId: '', error: 'Token requerido' };

  const supabase = getSupabaseServiceRoleClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user?.email) return { playerId: '', error: 'Sesión inválida o expirada' };

  const email = String(user.email).trim().toLowerCase();
  const { data: player, error: errPlayer } = await supabase
    .from('players')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (errPlayer) return { playerId: '', error: errPlayer.message };
  if (!player) return { playerId: '', error: 'No existe jugador con tu email' };

  return { playerId: player.id as string };
}

export async function getPlayerAuthFromBearer(
  req: Request
): Promise<{ playerId: string; authUserId: string; error?: string }> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return { playerId: '', authUserId: '', error: 'Token requerido' };

  const supabase = getSupabaseServiceRoleClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user?.id || !user?.email) {
    return { playerId: '', authUserId: '', error: 'Sesión inválida o expirada' };
  }

  const email = String(user.email).trim().toLowerCase();
  const { data: player, error: errPlayer } = await supabase
    .from('players')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (errPlayer) return { playerId: '', authUserId: '', error: errPlayer.message };
  if (!player) return { playerId: '', authUserId: '', error: 'No existe jugador con tu email' };

  return { playerId: player.id as string, authUserId: user.id };
}
