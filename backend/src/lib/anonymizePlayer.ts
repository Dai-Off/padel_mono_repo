import { getSupabaseServiceRoleClient } from './supabase';

const DELETED_NAME = 'Usuario eliminado';

export type AnonymizePlayerResult =
  | { ok: true; playerId: string; authUserId: string | null }
  | { ok: false; playerId: string; error: string };

type PlayerRow = {
  id: string;
  auth_user_id: string | null;
  status: string;
  email: string | null;
};

async function banAuthUser(authUserId: string): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const { error } = await supabase.auth.admin.updateUserById(authUserId, {
    ban_duration: '876000h',
  });
  if (error) throw new Error(`Auth ban failed: ${error.message}`);
}

async function anonymizeAuthUser(authUserId: string, playerId: string): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const anonEmail = `deleted_${playerId.replace(/-/g, '')}@deleted.local`;

  const { error: updateErr } = await supabase.auth.admin.updateUserById(authUserId, {
    email: anonEmail,
    phone: '',
    user_metadata: { full_name: DELETED_NAME },
    ban_duration: '876000h',
  });

  if (updateErr) {
    const { error: deleteErr } = await supabase.auth.admin.deleteUser(authUserId);
    if (deleteErr) {
      throw new Error(`Auth anonymization failed: ${updateErr.message}; delete: ${deleteErr.message}`);
    }
  }
}

/** Anonymizes player PII via Supabase RPC (Postgres transaction) + Auth Admin API. */
export async function anonymizePlayer(playerId: string): Promise<AnonymizePlayerResult> {
  const supabase = getSupabaseServiceRoleClient();

  const { data: player, error: fetchErr } = await supabase
    .from('players')
    .select('id, auth_user_id, status, email')
    .eq('id', playerId)
    .maybeSingle();

  if (fetchErr || !player) {
    return { ok: false, playerId, error: fetchErr?.message ?? 'Player not found' };
  }

  const row = player as PlayerRow;
  if (row.status === 'deleted') {
    return { ok: true, playerId, authUserId: row.auth_user_id };
  }

  if (row.email?.startsWith('deleted_') && row.email.endsWith('@deleted.local')) {
    return { ok: true, playerId, authUserId: row.auth_user_id };
  }

  const authUserId = row.auth_user_id;

  if (authUserId) {
    try {
      await banAuthUser(authUserId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, playerId, error: msg };
    }
  }

  const { error: rpcErr } = await supabase.rpc('anonymize_player', { p_player_id: playerId });
  if (rpcErr) {
    return { ok: false, playerId, error: rpcErr.message };
  }

  if (authUserId) {
    try {
      await anonymizeAuthUser(authUserId, playerId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, playerId, error: `DB anonymized but auth step failed: ${msg}` };
    }
  }

  return { ok: true, playerId, authUserId };
}
