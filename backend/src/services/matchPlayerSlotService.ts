import { getSupabaseServiceRoleClient } from '../lib/supabase';

type Db = ReturnType<typeof getSupabaseServiceRoleClient>;

/**
 * Resultado de la RPC `claim_match_slot` definida en la DB.
 */
type ClaimSlotResult =
  | { ok: true; slot_index: number; reassigned: boolean }
  | { ok: false; error: string; code: string };

/**
 * Tras pago exitoso de un guest: inserta en `match_players` en un cupo libre.
 *
 * Utiliza la RPC `claim_match_slot` que adquiere un advisory lock por match_id,
 * garantizando asignación atómica sin race conditions aunque dos jugadores
 * intenten unirse al mismo slot simultáneamente.
 */
export async function insertGuestMatchPlayerAfterPayment(
  supabase: Db,
  matchId: string,
  playerId: string,
  preferredSlot: number | null | undefined
): Promise<
  { ok: true; slot_index: number; reassigned: boolean } | { ok: false; error: string; code: string }
> {
  const pref =
    preferredSlot != null && Number.isFinite(Number(preferredSlot))
      ? Math.trunc(Number(preferredSlot))
      : null;

  const { data, error } = await supabase.rpc('claim_match_slot', {
    p_match_id: matchId,
    p_player_id: playerId,
    p_preferred: pref,
  });

  if (error) {
    console.error('[matchPlayerSlotService] RPC claim_match_slot error:', error);
    return { ok: false, error: error.message, code: 'rpc_error' };
  }

  const result = data as ClaimSlotResult;

  if (!result.ok) {
    console.warn('[matchPlayerSlotService] claim_match_slot failed:', result.error, result.code, {
      matchId,
      playerId,
      preferredSlot: pref,
    });
  }

  return result;
}

/**
 * Si un guest figura `paid` en el booking pero no tiene fila en `match_players` (bug histórico / carrera),
 * lo inserta en el primer slot libre. Llamar tras GET /matches/:id?expand=1 con usuario autenticado.
 */
export async function tryRepairPaidGuestMissingFromMatch(
  supabase: Db,
  matchId: string,
  bookingId: string,
  playerId: string
): Promise<boolean> {
  const { data: bp } = await supabase
    .from('booking_participants')
    .select('role, payment_status')
    .eq('booking_id', bookingId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (!bp) return false;
  const role = String((bp as { role?: string }).role ?? '');
  const st = String((bp as { payment_status?: string }).payment_status ?? '');
  if (role !== 'guest' || st !== 'paid') return false;

  const { data: inMatch } = await supabase
    .from('match_players')
    .select('id')
    .eq('match_id', matchId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (inMatch) return false;

  const r = await insertGuestMatchPlayerAfterPayment(supabase, matchId, playerId, null);
  if (r.ok) {
    if (r.reassigned) {
      console.warn('[matchPlayerSlotService] repair: guest placed in first free slot', {
        matchId,
        playerId,
        slot_index: r.slot_index,
      });
    }
    return true;
  }
  console.error('[matchPlayerSlotService] repair failed:', r.error, r.code, { matchId, playerId });
  return false;
}
