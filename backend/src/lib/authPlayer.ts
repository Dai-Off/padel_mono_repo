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
  if (error || !user?.id) return { playerId: '', error: 'Sesión inválida o expirada' };

  const { data: byAuth, error: errAuth } = await supabase
    .from('players')
    .select('id')
    .eq('auth_user_id', user.id)
    .neq('status', 'deleted')
    .maybeSingle();
  if (errAuth) return { playerId: '', error: errAuth.message };
  if (byAuth) return { playerId: byAuth.id as string };

  const email = user.email ? String(user.email).trim().toLowerCase() : '';
  if (!email) return { playerId: '', error: 'No existe jugador vinculado a esta cuenta' };

  const { data: player, error: errPlayer } = await supabase
    .from('players')
    .select('id')
    .eq('email', email)
    .neq('status', 'deleted')
    .maybeSingle();
  if (errPlayer) return { playerId: '', error: errPlayer.message };
  if (!player) return { playerId: '', error: 'No existe jugador vinculado a esta cuenta' };

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
  if (error || !user?.id) {
    return { playerId: '', authUserId: '', error: 'Sesión inválida o expirada' };
  }

  const { data: byAuth, error: errAuth } = await supabase
    .from('players')
    .select('id')
    .eq('auth_user_id', user.id)
    .neq('status', 'deleted')
    .maybeSingle();
  if (errAuth) return { playerId: '', authUserId: '', error: errAuth.message };
  if (byAuth) return { playerId: byAuth.id as string, authUserId: user.id };

  const email = user.email ? String(user.email).trim().toLowerCase() : '';
  if (!email) return { playerId: '', authUserId: '', error: 'No existe jugador vinculado a esta cuenta' };

  const { data: player, error: errPlayer } = await supabase
    .from('players')
    .select('id')
    .eq('email', email)
    .neq('status', 'deleted')
    .maybeSingle();
  if (errPlayer) return { playerId: '', authUserId: '', error: errPlayer.message };
  if (!player) return { playerId: '', authUserId: '', error: 'No existe jugador vinculado a esta cuenta' };

  return { playerId: player.id as string, authUserId: user.id };
}
