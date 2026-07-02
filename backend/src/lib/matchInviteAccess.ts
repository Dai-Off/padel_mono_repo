import type { getSupabaseServiceRoleClient } from './supabase';

type Db = ReturnType<typeof getSupabaseServiceRoleClient>;

export type PrivateMatchInviteAccess =
  | { ok: true; invite_id: string }
  | { ok: false; code: 'no_invite' | 'expired' };

/** Jugador invitado a un partido privado (invitación pendiente o aceptada; el pago confirma la plaza). */
export async function getPrivateMatchInviteAccess(
  supabase: Db,
  matchId: string,
  playerId: string,
): Promise<PrivateMatchInviteAccess> {
  const now = new Date().toISOString();
  const { data: invite, error } = await supabase
    .from('match_invites')
    .select('id, slot_index, status, expires_at')
    .eq('match_id', matchId)
    .eq('invited_player_id', playerId)
    .in('status', ['pending', 'accepted'])
    .order('invited_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !invite) {
    return { ok: false, code: 'no_invite' };
  }
  if (new Date(String(invite.expires_at)).getTime() <= Date.now()) {
    return { ok: false, code: 'expired' };
  }
  return {
    ok: true,
    invite_id: String((invite as { id: string }).id),
  };
}

/** Tras pago exitoso del invitado: la invitación pasa a aceptada (cualquier plaza libre pagada). */
export async function acceptMatchInviteAfterGuestPayment(
  supabase: Db,
  matchId: string,
  playerId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from('match_invites')
    .update({
      status: 'accepted',
      accepted_at: now,
      updated_at: now,
    })
    .eq('match_id', matchId)
    .eq('invited_player_id', playerId)
    .in('status', ['pending', 'accepted']);
}
