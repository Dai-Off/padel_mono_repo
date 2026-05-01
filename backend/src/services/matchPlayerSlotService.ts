import { getSupabaseServiceRoleClient } from '../lib/supabase';

type Db = ReturnType<typeof getSupabaseServiceRoleClient>;

function teamFromSlot(slot: number): 'A' | 'B' {
  return slot <= 1 ? 'A' : 'B';
}

function takenSlotsFromRows(rows: { slot_index?: number | null }[] | null | undefined): Set<number> {
  const taken = new Set<number>();
  for (const r of rows ?? []) {
    const s = r.slot_index;
    if (s != null && s >= 0 && s <= 3) taken.add(s);
  }
  return taken;
}

function firstFreeSlot(taken: Set<number>): number | null {
  for (let i = 0; i < 4; i++) {
    if (!taken.has(i)) return i;
  }
  return null;
}

/**
 * Tras pago exitoso de un guest: inserta en `match_players` en un cupo libre.
 * Si el slot preferido (metadata Stripe) ya fue tomado por carrera, usa el primer libre 0-3.
 */
export async function insertGuestMatchPlayerAfterPayment(
  supabase: Db,
  matchId: string,
  playerId: string,
  preferredSlot: number | null | undefined
): Promise<
  { ok: true; slot_index: number; reassigned: boolean } | { ok: false; error: string; code: string }
> {
  const { data: already } = await supabase
    .from('match_players')
    .select('slot_index')
    .eq('match_id', matchId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (already) {
    const s = (already as { slot_index?: number | null }).slot_index;
    const idx = s != null && s >= 0 && s <= 3 ? s : 0;
    return { ok: true, slot_index: idx, reassigned: false };
  }

  const { data: slotRows, error: slotErr } = await supabase
    .from('match_players')
    .select('slot_index')
    .eq('match_id', matchId);
  if (slotErr) {
    return { ok: false, error: slotErr.message, code: 'read_slots' };
  }
  const taken = takenSlotsFromRows(slotRows as { slot_index?: number | null }[]);
  if (taken.size >= 4) {
    return { ok: false, error: 'El partido no tiene plazas libres', code: 'match_full' };
  }

  const pref =
    preferredSlot != null && Number.isFinite(preferredSlot)
      ? Math.trunc(Number(preferredSlot))
      : null;
  const preferOk = pref != null && pref >= 0 && pref <= 3 && !taken.has(pref);
  const resolved = preferOk ? pref : firstFreeSlot(taken);
  if (resolved == null) {
    return { ok: false, error: 'No hay slot disponible', code: 'no_slot' };
  }
  const reassigned = !preferOk;

  const team = teamFromSlot(resolved);
  const { error: err } = await supabase.from('match_players').insert({
    match_id: matchId,
    player_id: playerId,
    team,
    invite_status: 'accepted',
    slot_index: resolved,
  });

  if (err) {
    const isUnique =
      (err as { code?: string }).code === '23505' || String(err.message).toLowerCase().includes('duplicate');
    if (isUnique) {
      const { data: again } = await supabase
        .from('match_players')
        .select('slot_index')
        .eq('match_id', matchId);
      const taken2 = takenSlotsFromRows(again as { slot_index?: number | null }[]);
      const free = firstFreeSlot(taken2);
      if (free == null) {
        return { ok: false, error: 'El partido completó durante el pago', code: 'match_full' };
      }
      const team2 = teamFromSlot(free);
      const { error: err2 } = await supabase.from('match_players').insert({
        match_id: matchId,
        player_id: playerId,
        team: team2,
        invite_status: 'accepted',
        slot_index: free,
      });
      if (err2) {
        return { ok: false, error: err2.message, code: 'insert_failed' };
      }
      return { ok: true, slot_index: free, reassigned: true };
    }
    return { ok: false, error: err.message, code: 'insert_failed' };
  }

  return { ok: true, slot_index: resolved, reassigned };
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
