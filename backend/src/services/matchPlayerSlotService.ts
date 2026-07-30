import Stripe from 'stripe';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { evictDemoPlayersWhenRealJoins } from '../lib/demoPlayerEvict';
import { acceptMatchInviteAfterGuestPayment } from '../lib/matchInviteAccess';
import { isStripePaymentIntentId } from './paymentRefundService';

type Db = ReturnType<typeof getSupabaseServiceRoleClient>;

export type ClaimSlotResult =
  | { ok: true; slot_index: number; reassigned: boolean }
  | { ok: false; error: string; code: string };

export type GuestJoinAfterPaymentResult =
  | { ok: true; match_id: string; slot_index: number; reassigned: boolean }
  | { ok: false; error: string; code: string };

export type GuestJoinCapacityResult =
  | { ok: true; remaining: number; code?: 'already_in_match' }
  | { ok: false; error: string; code: 'match_full' | 'slot_taken' | 'rpc_error' };

type CapacityRpcResult = {
  ok?: boolean;
  code?: string;
  error?: string;
  remaining?: number;
};

async function countJoinCapacityInApp(
  supabase: Db,
  matchId: string,
  bookingId: string,
  playerId: string,
  slotIndex: number | null | undefined,
): Promise<GuestJoinCapacityResult> {
  const { data: inMatch } = await supabase
    .from('match_players')
    .select('id')
    .eq('match_id', matchId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (inMatch) {
    return { ok: true, remaining: 0, code: 'already_in_match' };
  }

  const { data: slotRows, error: slotErr } = await supabase
    .from('match_players')
    .select('slot_index')
    .eq('match_id', matchId);
  if (slotErr) {
    return { ok: false, error: slotErr.message, code: 'rpc_error' };
  }
  const filled = (slotRows ?? []).length;
  if (filled >= 4) {
    return { ok: false, error: 'El partido ya está completo', code: 'match_full' };
  }

  if (slotIndex != null && slotIndex >= 0 && slotIndex <= 3) {
    const taken = takenSlotsFromRows(slotRows as { slot_index?: number | null }[]);
    if (taken.has(slotIndex)) {
      return { ok: false, error: 'Esa plaza ya está ocupada', code: 'slot_taken' };
    }
  }

  const staleCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: pendingTx, error: txErr } = await supabase
    .from('payment_transactions')
    .select('payer_player_id')
    .eq('booking_id', bookingId)
    .in('status', ['requires_action', 'processing'])
    .gt('created_at', staleCutoff);
  if (txErr) {
    return { ok: false, error: txErr.message, code: 'rpc_error' };
  }

  const inMatchIds = new Set(
    (
      await supabase.from('match_players').select('player_id').eq('match_id', matchId)
    ).data?.map((r) => String((r as { player_id: string }).player_id)) ?? [],
  );

  const inFlightPayers = new Set<string>();
  for (const row of pendingTx ?? []) {
    const pid = String((row as { payer_player_id?: string }).payer_player_id ?? '');
    if (!pid || pid === playerId || inMatchIds.has(pid)) continue;
    inFlightPayers.add(pid);
  }

  const remaining = 4 - filled - inFlightPayers.size;
  if (remaining <= 0) {
    return {
      ok: false,
      error: 'El partido ya no tiene plazas (otros jugadores están pagando)',
      code: 'match_full',
    };
  }
  return { ok: true, remaining };
}

/** Comprueba si un guest puede iniciar unión (incluye pagos en curso). */
export async function assertGuestCanJoinMatch(
  supabase: Db,
  matchId: string,
  bookingId: string,
  playerId: string,
  slotIndex?: number | null,
): Promise<GuestJoinCapacityResult> {
  const pref =
    slotIndex != null && Number.isFinite(Number(slotIndex))
      ? Math.trunc(Number(slotIndex))
      : null;

  const { data, error } = await supabase.rpc('assert_guest_can_join_match', {
    p_match_id: matchId,
    p_booking_id: bookingId,
    p_player_id: playerId,
    p_slot_index: pref,
  });

  if (error) {
    if (isRpcUnavailableError(error.message, (error as { code?: string }).code)) {
      return countJoinCapacityInApp(supabase, matchId, bookingId, playerId, pref);
    }
    return { ok: false, error: error.message, code: 'rpc_error' };
  }

  const result = data as CapacityRpcResult;
  if (result.ok === false) {
    const code = result.code === 'slot_taken' ? 'slot_taken' : 'match_full';
    return { ok: false, error: result.error ?? 'No hay plazas', code };
  }
  if (result.code === 'already_in_match') {
    return { ok: true, remaining: 0, code: 'already_in_match' };
  }
  return { ok: true, remaining: Number(result.remaining ?? 0) };
}

/** Registra payment_intent bajo lock de capacidad (evita >4 pagos simultáneos). */
export async function registerGuestJoinPaymentIntent(
  supabase: Db,
  params: {
    bookingId: string;
    matchId: string;
    playerId: string;
    stripePaymentIntentId: string;
    amountCents: number;
    currency: string;
    slotIndex?: number | null;
  },
): Promise<GuestJoinCapacityResult> {
  const pref =
    params.slotIndex != null && Number.isFinite(Number(params.slotIndex))
      ? Math.trunc(Number(params.slotIndex))
      : null;

  const { data, error } = await supabase.rpc('register_guest_join_payment_intent', {
    p_booking_id: params.bookingId,
    p_match_id: params.matchId,
    p_player_id: params.playerId,
    p_stripe_pi_id: params.stripePaymentIntentId,
    p_amount_cents: params.amountCents,
    p_currency: params.currency,
    p_slot_index: pref,
  });

  if (error) {
    if (isRpcUnavailableError(error.message, (error as { code?: string }).code)) {
      const cap = await countJoinCapacityInApp(
        supabase,
        params.matchId,
        params.bookingId,
        params.playerId,
        pref,
      );
      if (!cap.ok) return cap;
      const { error: insErr } = await supabase.from('payment_transactions').insert({
        booking_id: params.bookingId,
        payer_player_id: params.playerId,
        amount_cents: params.amountCents,
        currency: params.currency,
        stripe_payment_intent_id: params.stripePaymentIntentId,
        status: 'requires_action',
      });
      if (insErr) {
        return { ok: false, error: insErr.message, code: 'rpc_error' };
      }
      return cap;
    }
    return { ok: false, error: error.message, code: 'rpc_error' };
  }

  const result = data as CapacityRpcResult;
  if (result.ok === false) {
    const code = result.code === 'slot_taken' ? 'slot_taken' : 'match_full';
    return { ok: false, error: result.error ?? 'No hay plazas', code };
  }
  return { ok: true, remaining: Number(result.remaining ?? 0) };
}

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

function normalizePreferredSlot(preferredSlot: number | null | undefined): number | null {
  if (preferredSlot == null || !Number.isFinite(Number(preferredSlot))) return null;
  const n = Math.trunc(Number(preferredSlot));
  return n >= 0 && n <= 3 ? n : null;
}

/** Si el guest ya está en el partido pero en otra plaza, lo mueve a la elegida si está libre. */
async function ensureGuestInPreferredSlot(
  supabase: Db,
  matchId: string,
  playerId: string,
  currentSlot: number,
  preferredSlot: number | null | undefined,
): Promise<{ slot_index: number; reassigned: boolean }> {
  const pref = normalizePreferredSlot(preferredSlot);
  if (pref == null || pref === currentSlot) {
    return { slot_index: currentSlot, reassigned: false };
  }

  const { data: occupant, error: occErr } = await supabase
    .from('match_players')
    .select('player_id')
    .eq('match_id', matchId)
    .eq('slot_index', pref)
    .maybeSingle();
  if (occErr) {
    console.warn('[matchPlayerSlotService] ensureGuestInPreferredSlot read:', occErr.message);
    return { slot_index: currentSlot, reassigned: false };
  }
  const occupantId = String((occupant as { player_id?: string } | null)?.player_id ?? '');
  if (occupantId && occupantId !== playerId) {
    return { slot_index: currentSlot, reassigned: false };
  }

  const { error: updErr } = await supabase
    .from('match_players')
    .update({ slot_index: pref, team: teamFromSlot(pref) })
    .eq('match_id', matchId)
    .eq('player_id', playerId);
  if (updErr) {
    console.warn('[matchPlayerSlotService] ensureGuestInPreferredSlot update:', updErr.message);
    return { slot_index: currentSlot, reassigned: false };
  }
  return { slot_index: pref, reassigned: true };
}

function isRpcUnavailableError(message: string, code?: string): boolean {
  const m = message.toLowerCase();
  if (code === 'PGRST202' || code === '42883') return true;
  return (
    m.includes('claim_match_slot') &&
    (m.includes('does not exist') || m.includes('could not find') || m.includes('not found'))
  );
}

/**
 * Fallback en Node si la RPC no está desplegada en Supabase.
 * Reintenta en 23505 (carrera) buscando el primer slot libre.
 */
async function claimSlotInApp(
  supabase: Db,
  matchId: string,
  playerId: string,
  preferredSlot: number | null | undefined,
): Promise<ClaimSlotResult> {
  const { data: already } = await supabase
    .from('match_players')
    .select('slot_index')
    .eq('match_id', matchId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (already) {
    const s = (already as { slot_index?: number | null }).slot_index;
    const idx = s != null && s >= 0 && s <= 3 ? s : 0;
    const resolved = await ensureGuestInPreferredSlot(
      supabase,
      matchId,
      playerId,
      idx,
      preferredSlot,
    );
    return {
      ok: true,
      slot_index: resolved.slot_index,
      reassigned: resolved.reassigned,
    };
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
      (err as { code?: string }).code === '23505' ||
      String(err.message).toLowerCase().includes('duplicate');
    if (isUnique) {
      const { data: again } = await supabase
        .from('match_players')
        .select('slot_index')
        .eq('match_id', matchId)
        .eq('player_id', playerId)
        .maybeSingle();
      if (again) {
        const s = (again as { slot_index?: number | null }).slot_index;
        const idx = s != null && s >= 0 && s <= 3 ? s : 0;
        return { ok: true, slot_index: idx, reassigned: false };
      }

      const { data: againSlots } = await supabase
        .from('match_players')
        .select('slot_index')
        .eq('match_id', matchId);
      const taken2 = takenSlotsFromRows(againSlots as { slot_index?: number | null }[]);
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
 * Tras pago exitoso de un guest: inserta en `match_players` en un cupo libre.
 * Prefiere la RPC `claim_match_slot` (lock atómico); si no existe, usa fallback en app.
 */
export async function insertGuestMatchPlayerAfterPayment(
  supabase: Db,
  matchId: string,
  playerId: string,
  preferredSlot: number | null | undefined,
): Promise<ClaimSlotResult> {
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
    const errCode = (error as { code?: string }).code;
    if (isRpcUnavailableError(error.message, errCode)) {
      console.warn('[matchPlayerSlotService] claim_match_slot RPC no disponible, usando fallback en app');
      return claimSlotInApp(supabase, matchId, playerId, preferredSlot);
    }
    console.error('[matchPlayerSlotService] RPC claim_match_slot error:', error);
    return claimSlotInApp(supabase, matchId, playerId, preferredSlot);
  }

  const result = data as ClaimSlotResult;
  if (!result?.ok) {
    console.warn('[matchPlayerSlotService] claim_match_slot failed:', result?.error, result?.code, {
      matchId,
      playerId,
      preferredSlot: pref,
    });
  }
  return result;
}

/**
 * Tras marcar booking_participant como paid: asegura fila en match_players.
 */
export async function guestJoinMatchAfterPayment(
  supabase: Db,
  bookingId: string,
  playerId: string,
  preferredSlot: number | null | undefined,
): Promise<GuestJoinAfterPaymentResult> {
  const { data: match, error: matchErr } = await supabase
    .from('matches')
    .select('id, visibility')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (matchErr) {
    return { ok: false, error: matchErr.message, code: 'read_match' };
  }
  if (!match?.id) {
    return { ok: false, error: 'Partido no encontrado para esta reserva', code: 'no_match' };
  }

  const { data: existing } = await supabase
    .from('match_players')
    .select('slot_index')
    .eq('match_id', match.id)
    .eq('player_id', playerId)
    .maybeSingle();
  if (existing) {
    const s = (existing as { slot_index?: number | null }).slot_index;
    const idx = s != null && s >= 0 && s <= 3 ? s : 0;
    const resolved = await ensureGuestInPreferredSlot(
      supabase,
      match.id,
      playerId,
      idx,
      preferredSlot,
    );
    return {
      ok: true,
      match_id: match.id,
      slot_index: resolved.slot_index,
      reassigned: resolved.reassigned,
    };
  }

  try {
    await evictDemoPlayersWhenRealJoins(supabase, bookingId, playerId);
  } catch (evictErr) {
    console.error('[guestJoinMatchAfterPayment] evictDemoPlayers:', (evictErr as Error).message);
  }

  const ins = await insertGuestMatchPlayerAfterPayment(supabase, match.id, playerId, preferredSlot);
  if (!ins.ok) {
    return ins;
  }

  const { data: bookingOrg } = await supabase
    .from('bookings')
    .select('organizer_player_id')
    .eq('id', bookingId)
    .maybeSingle();
  if (bookingOrg && !(bookingOrg as { organizer_player_id?: string | null }).organizer_player_id) {
    await supabase
      .from('bookings')
      .update({ organizer_player_id: playerId, updated_at: new Date().toISOString() })
      .eq('id', bookingId);
    await supabase
      .from('booking_participants')
      .update({ role: 'organizer' })
      .eq('booking_id', bookingId)
      .eq('player_id', playerId);
  }

  if (String((match as { visibility?: string }).visibility ?? '').toLowerCase() === 'private') {
    await acceptMatchInviteAfterGuestPayment(supabase, match.id, playerId);
  }
  return { ok: true, match_id: match.id, slot_index: ins.slot_index, reassigned: ins.reassigned };
}

export function parsePreferredSlotIndex(raw: unknown): number | null {
  const n = raw != null ? parseInt(String(raw), 10) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 3 ? n : null;
}

export function parsePreferredSlotFromMeta(
  meta: Record<string, string | undefined> | null | undefined,
): number | null {
  if (!meta) return null;
  return parsePreferredSlotIndex(meta.slot_index);
}

function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key ? new Stripe(key) : null;
}

/** Plaza elegida al crear/reutilizar el PaymentIntent (metadata Stripe). */
export async function resolveGuestPreferredSlotFromBooking(
  supabase: Db,
  bookingId: string,
  playerId: string,
  explicitSlot?: number | null,
): Promise<number | null> {
  const fromRequest = parsePreferredSlotIndex(explicitSlot);
  if (fromRequest != null) return fromRequest;

  const stripe = getStripeClient();
  if (!stripe) return null;

  const { data: txs } = await supabase
    .from('payment_transactions')
    .select('stripe_payment_intent_id')
    .eq('booking_id', bookingId)
    .eq('payer_player_id', playerId)
    .in('status', ['succeeded', 'requires_action', 'processing'])
    .order('created_at', { ascending: false })
    .limit(5);

  for (const tx of txs ?? []) {
    const piId = String((tx as { stripe_payment_intent_id?: string }).stripe_payment_intent_id ?? '');
    if (!isStripePaymentIntentId(piId)) continue;
    try {
      const pi = await stripe.paymentIntents.retrieve(piId);
      const slot = parsePreferredSlotFromMeta(
        pi.metadata as Record<string, string | undefined>,
      );
      if (slot != null) return slot;
    } catch {
      /* siguiente PI */
    }
  }
  return null;
}

/**
 * Si un guest figura `paid` en el booking pero no tiene fila en `match_players` (bug histórico / carrera),
 * lo inserta respetando la plaza del PaymentIntent. Llamar tras GET /matches/:id?expand=1 con usuario autenticado.
 */
export async function tryRepairPaidGuestMissingFromMatch(
  supabase: Db,
  matchId: string,
  bookingId: string,
  playerId: string,
  preferredSlot?: number | null,
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

  const slot =
    (await resolveGuestPreferredSlotFromBooking(supabase, bookingId, playerId, preferredSlot)) ??
    null;
  const r = await insertGuestMatchPlayerAfterPayment(supabase, matchId, playerId, slot);
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
