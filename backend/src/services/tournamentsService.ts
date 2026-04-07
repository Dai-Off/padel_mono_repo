import { generateInviteToken } from '../lib/inviteToken';
import { playerMeetsTournamentGender } from '../lib/tournamentGender';
import { getSupabaseServiceRoleClient } from '../lib/supabase';

/** Metadata en PaymentIntent de Stripe para inscripción pagada a torneo. */
export const STRIPE_META_TOURNAMENT_PURPOSE = 'tournament_inscription';

function playersPerInscription(row: { player_id_2?: string | null }): number {
  return row.player_id_2 ? 2 : 1;
}

type InscriptionSlotRow = { status: string; player_id_2?: string | null };

export function slotsFromInscriptionRows(rows: InscriptionSlotRow[] | null | undefined): {
  confirmedPlayers: number;
  pendingPlayers: number;
} {
  let confirmedPlayers = 0;
  let pendingPlayers = 0;
  for (const row of rows ?? []) {
    const count = playersPerInscription(row);
    const st = String(row.status);
    if (st === 'confirmed') confirmedPlayers += count;
    if (st === 'pending') pendingPlayers += count;
  }
  return { confirmedPlayers, pendingPlayers };
}

export function aggregateSlotsByTournamentId(
  rows: Array<{ tournament_id: string; status: string; player_id_2?: string | null }>
): Map<string, { confirmedPlayers: number; pendingPlayers: number }> {
  const map = new Map<string, { confirmedPlayers: number; pendingPlayers: number }>();
  for (const row of rows) {
    const tid = row.tournament_id;
    let e = map.get(tid);
    if (!e) {
      e = { confirmedPlayers: 0, pendingPlayers: 0 };
      map.set(tid, e);
    }
    const c = playersPerInscription(row);
    const st = String(row.status);
    if (st === 'confirmed') e.confirmedPlayers += c;
    if (st === 'pending') e.pendingPlayers += c;
  }
  return map;
}

let lastGlobalInviteCleanupAt = 0;
const GLOBAL_INVITE_CLEANUP_TTL_MS = 35_000;

/** Una sola UPDATE para todos los torneos; evita N limpiezas en lecturas repetidas (polling). */
export async function cleanupExpiredTournamentInvitesGloballyIfStale(): Promise<void> {
  const now = Date.now();
  if (now - lastGlobalInviteCleanupAt < GLOBAL_INVITE_CLEANUP_TTL_MS) return;
  lastGlobalInviteCleanupAt = now;
  const supabase = getSupabaseServiceRoleClient();
  const nowIso = new Date().toISOString();
  await supabase
    .from('tournament_inscriptions')
    .update({
      status: 'expired',
      updated_at: nowIso,
      cancelled_at: nowIso,
      cancelled_reason: 'TTL expired',
    })
    .eq('status', 'pending')
    .lte('expires_at', nowIso);
}

export async function cleanupExpiredTournamentInvites(tournamentId: string): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const now = new Date().toISOString();
  await supabase
    .from('tournament_inscriptions')
    .update({
      status: 'expired',
      updated_at: now,
      cancelled_at: now,
      cancelled_reason: 'TTL expired',
    })
    .eq('tournament_id', tournamentId)
    .eq('status', 'pending')
    .lte('expires_at', now);
}

export async function getTournamentSlots(tournamentId: string): Promise<{
  confirmedPlayers: number;
  pendingPlayers: number;
}> {
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('tournament_inscriptions')
    .select('status, player_id_2')
    .eq('tournament_id', tournamentId);
  if (error) throw new Error(error.message);
  return slotsFromInscriptionRows(data as InscriptionSlotRow[]);
}

const lastTournamentStatusRefreshAt = new Map<string, number>();
const STATUS_REFRESH_COOLDOWN_MS = 18_000;

export async function refreshTournamentStatus(
  tournamentId: string,
  opts?: { force?: boolean; skipInviteCleanup?: boolean }
): Promise<void> {
  if (!opts?.force) {
    const last = lastTournamentStatusRefreshAt.get(tournamentId) ?? 0;
    if (Date.now() - last < STATUS_REFRESH_COOLDOWN_MS) return;
  }
  lastTournamentStatusRefreshAt.set(tournamentId, Date.now());

  const supabase = getSupabaseServiceRoleClient();
  if (!opts?.skipInviteCleanup) {
    await cleanupExpiredTournamentInvites(tournamentId);
  }
  const [{ data: tournament, error }, { data: insRows, error: insErr }] = await Promise.all([
    supabase
      .from('tournaments')
      .select('id, status, max_players, registration_closed_at')
      .eq('id', tournamentId)
      .maybeSingle(),
    supabase.from('tournament_inscriptions').select('status, player_id_2').eq('tournament_id', tournamentId),
  ]);
  if (error || !tournament) return;
  if (insErr) return;
  if ((tournament as { status: string }).status === 'cancelled') return;

  const nowMs = Date.now();
  const closeAt = (tournament as { registration_closed_at?: string | null }).registration_closed_at;
  const closeByTime = closeAt ? nowMs >= new Date(closeAt).getTime() : false;
  const { confirmedPlayers } = slotsFromInscriptionRows(insRows as InscriptionSlotRow[]);
  const closeByCapacity = confirmedPlayers >= Number((tournament as { max_players: number }).max_players);
  const shouldClose = closeByTime || closeByCapacity;
  const nextStatus = shouldClose ? 'closed' : 'open';
  if (nextStatus !== (tournament as { status: string }).status) {
    await supabase
      .from('tournaments')
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
        closed_at: shouldClose ? new Date().toISOString() : null,
      })
      .eq('id', tournamentId);
  }
}

/**
 * Tras pago Stripe exitoso (webhook o confirm-client): inscripción confirmada + `payment_transactions`.
 * Idempotente por `stripe_payment_intent_id`.
 */
export async function finalizeTournamentPaidJoin(params: {
  tournamentId: string;
  playerId: string;
  stripePaymentIntentId: string;
  amountCents: number;
}): Promise<{ ok: true; already_joined?: boolean } | { ok: false; error: string }> {
  const supabase = getSupabaseServiceRoleClient();
  const { tournamentId, playerId, stripePaymentIntentId, amountCents } = params;

  const { data: existingTx } = await supabase
    .from('payment_transactions')
    .select('id, status')
    .eq('stripe_payment_intent_id', stripePaymentIntentId)
    .maybeSingle();
  if (existingTx && String((existingTx as { status: string }).status) === 'succeeded') {
    return { ok: true };
  }

  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .select('id, visibility, status, max_players, invite_ttl_minutes, gender, registration_mode, price_cents')
    .eq('id', tournamentId)
    .maybeSingle();
  if (tErr || !tournament) return { ok: false, error: 'Torneo no encontrado' };

  if (String((tournament as { visibility?: string }).visibility ?? '') !== 'public') {
    return { ok: false, error: 'Solo torneos públicos permiten este pago' };
  }
  if (String((tournament as { status: string }).status) !== 'open') {
    return { ok: false, error: 'El torneo no está abierto' };
  }
  if (String((tournament as { registration_mode: string }).registration_mode) !== 'individual') {
    return { ok: false, error: 'Este torneo no admite inscripción individual pagada desde la app' };
  }
  const priceCents = Number((tournament as { price_cents: number }).price_cents ?? 0);
  if (priceCents <= 0) return { ok: false, error: 'Este torneo no tiene precio de inscripción' };
  if (amountCents !== priceCents) {
    return { ok: false, error: 'El importe del pago no coincide con el precio del torneo' };
  }

  await cleanupExpiredTournamentInvites(tournamentId);
  const slots = await getTournamentSlots(tournamentId);
  if (slots.confirmedPlayers >= Number((tournament as { max_players: number }).max_players)) {
    return { ok: false, error: 'No hay cupos disponibles' };
  }

  const { data: existingIns } = await supabase
    .from('tournament_inscriptions')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('player_id_1', playerId)
    .maybeSingle();

  const { data: joinPlayer } = await supabase
    .from('players')
    .select('gender, first_name, last_name')
    .eq('id', playerId)
    .maybeSingle();
  if (
    !playerMeetsTournamentGender(
      (tournament as { gender?: string }).gender,
      (joinPlayer as { gender?: string } | null)?.gender
    )
  ) {
    return {
      ok: false,
      error:
        'Tu género en el perfil no coincide con este torneo. Actualiza tu perfil o elige un torneo mixto.',
    };
  }

  if (existingIns) {
    const { error: txErr } = await supabase.from('payment_transactions').insert({
      booking_id: null,
      tournament_id: tournamentId,
      payer_player_id: playerId,
      amount_cents: amountCents,
      currency: 'EUR',
      stripe_payment_intent_id: stripePaymentIntentId,
      status: 'succeeded',
    });
    if (txErr && !String(txErr.message).toLowerCase().includes('duplicate')) {
      return { ok: false, error: txErr.message };
    }
    return { ok: true, already_joined: true };
  }

  const { tokenHash } = generateInviteToken();
  const expiresAt = new Date(
    Date.now() + Number((tournament as { invite_ttl_minutes: number }).invite_ttl_minutes) * 60000
  ).toISOString();
  const { error: insErr } = await supabase.from('tournament_inscriptions').insert({
    tournament_id: tournamentId,
    status: 'confirmed',
    invited_at: new Date().toISOString(),
    expires_at: expiresAt,
    confirmed_at: new Date().toISOString(),
    player_id_1: playerId,
    token_hash: tokenHash,
  });
  if (insErr) return { ok: false, error: insErr.message };

  const joinedName = joinPlayer
    ? `${(joinPlayer as { first_name?: string }).first_name ?? ''} ${(joinPlayer as { last_name?: string }).last_name ?? ''}`.trim() ||
      'Un jugador'
    : 'Un jugador';
  await supabase.from('tournament_chat_messages').insert({
    tournament_id: tournamentId,
    author_user_id: '00000000-0000-0000-0000-000000000000',
    author_name: 'Sistema',
    message: `${joinedName} se ha unido al torneo.`,
  });

  const { error: txErr } = await supabase.from('payment_transactions').insert({
    booking_id: null,
    tournament_id: tournamentId,
    payer_player_id: playerId,
    amount_cents: amountCents,
    currency: 'EUR',
    stripe_payment_intent_id: stripePaymentIntentId,
    status: 'succeeded',
  });
  if (txErr) {
    console.error('[finalizeTournamentPaidJoin] payment_transactions:', txErr);
    return { ok: false, error: 'No se pudo registrar el pago. Contacta con soporte.' };
  }

  await refreshTournamentStatus(tournamentId);
  return { ok: true };
}
