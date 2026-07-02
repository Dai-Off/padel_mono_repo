/**
 * Invitaciones de pareja para matchmaking competitivo (premade duo).
 * A invita a B; al aceptar (o al "buscar" de A) se encola a ambos en
 * `matchmaking_pool` con `paired_with_id` mutuo, compartiendo las prefs de A.
 * El inflado de nivel del débil vive en el ciclo de matchmaking, no aquí.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { PREMADE_MAX_GAP, parseAvailabilitySlots, type AvailabilitySlot } from './matchmakingShared';
import { getMatchmakingBlockUntil } from './matchmakingService';

/** Vigencia de una invitación de pareja (es una intención de jugar juntos, no una búsqueda). */
const PAIR_INVITE_DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Tras un rechazo, el invitador no puede volver a invitar al mismo jugador durante este tiempo. */
export const PAIR_INVITE_REINVITE_COOLDOWN_MS = 60 * 60 * 1000;

export type PairInvitePrefs = {
  /** Franjas de disponibilidad (fuente de verdad del horario). */
  availability_slots: AvailabilitySlot[];
  /** Derivados min/max de availability_slots, para las columnas del pool. */
  available_from: string;
  available_until: string;
  club_id: string | null;
  preferred_club_ids: string[];
  max_distance_km: number | null;
  preferred_side: string | null;
  gender: string;
  search_lat: number | null;
  search_lng: number | null;
};

type Fail = { ok: false; status: number; error: string };
type Ok<T> = { ok: true } & T;

/** Valida y normaliza las prefs de cola (espejo de POST /matchmaking/join). */
export function normalizePairPrefs(body: Record<string, unknown>): { ok: true; prefs: PairInvitePrefs } | Fail {
  const slotsParsed = parseAvailabilitySlots(body.availability_slots);
  if (!slotsParsed.ok) {
    return { ok: false, status: 400, error: slotsParsed.error };
  }

  let preferred_club_ids: string[] = [];
  if (body.preferred_club_ids != null) {
    if (!Array.isArray(body.preferred_club_ids)) {
      return { ok: false, status: 400, error: 'preferred_club_ids debe ser un array de UUID' };
    }
    preferred_club_ids = [
      ...new Set(
        (body.preferred_club_ids as unknown[])
          .map((id) => (typeof id === 'string' ? id.trim() : ''))
          .filter((id) => id.length > 0),
      ),
    ].slice(0, 20);
  }

  const maxKm = body.max_distance_km != null ? Number(body.max_distance_km) : null;
  const lat = body.search_lat != null ? Number(body.search_lat) : null;
  const lng = body.search_lng != null ? Number(body.search_lng) : null;
  if (maxKm != null && Number.isFinite(maxKm) && maxKm > 0) {
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { ok: false, status: 400, error: 'search_lat y search_lng son obligatorios cuando indicas max_distance_km' };
    }
  }

  const side =
    typeof body.preferred_side === 'string' && ['drive', 'backhand', 'any'].includes(body.preferred_side)
      ? body.preferred_side
      : null;
  const g = typeof body.gender === 'string' ? body.gender : 'any';
  if (!['male', 'female', 'mixed', 'any'].includes(g)) {
    return { ok: false, status: 400, error: 'gender debe ser male, female, mixed o any' };
  }

  let resolvedClubId: string | null = null;
  let poolPreferredClubIds: string[] = [];
  if (typeof body.club_id === 'string' && body.club_id.trim()) {
    resolvedClubId = body.club_id.trim();
  } else if (preferred_club_ids.length === 1) {
    resolvedClubId = preferred_club_ids[0]!;
  } else if (preferred_club_ids.length > 1) {
    poolPreferredClubIds = preferred_club_ids;
  }

  return {
    ok: true,
    prefs: {
      availability_slots: slotsParsed.slots,
      available_from: slotsParsed.from,
      available_until: slotsParsed.until,
      club_id: resolvedClubId,
      preferred_club_ids: poolPreferredClubIds,
      max_distance_km: maxKm != null && Number.isFinite(maxKm) ? maxKm : null,
      preferred_side: side,
      gender: g,
      search_lat: lat != null && Number.isFinite(lat) ? lat : null,
      search_lng: lng != null && Number.isFinite(lng) ? lng : null,
    },
  };
}

/** Vigencia por defecto de la invitación (desacoplada de las prefs de búsqueda). */
export function computeDefaultInviteExpiry(): string {
  return new Date(Date.now() + PAIR_INVITE_DEFAULT_TTL_MS).toISOString();
}

async function eloOf(supabase: SupabaseClient, ids: string[]): Promise<Map<string, number>> {
  const { data } = await supabase.from('players').select('id, elo_rating').in('id', ids);
  const m = new Map<string, number>();
  for (const r of (data ?? []) as { id: string; elo_rating: number | null }[]) {
    m.set(r.id, Number(r.elo_rating ?? 0));
  }
  return m;
}

/** Elegibilidad: ambos onboarded, gap de elo ≤ PREMADE_MAX_GAP, ninguno ya en cola. */
export async function assertPairEligible(
  supabase: SupabaseClient,
  inviterId: string,
  inviteeId: string,
): Promise<Ok<unknown> | Fail> {
  if (inviterId === inviteeId) return { ok: false, status: 400, error: 'No puedes invitarte a ti mismo' };

  const { data: players } = await supabase
    .from('players')
    .select('id, onboarding_completed, elo_rating')
    .in('id', [inviterId, inviteeId]);
  const byId = new Map((players ?? []).map((p) => [(p as { id: string }).id, p as { onboarding_completed?: boolean; elo_rating?: number | null }]));
  const a = byId.get(inviterId);
  const b = byId.get(inviteeId);
  if (!b) return { ok: false, status: 400, error: 'El jugador invitado no existe' };
  if (!a?.onboarding_completed || !b.onboarding_completed) {
    return { ok: false, status: 403, error: 'Ambos jugadores deben completar el cuestionario de nivelación' };
  }

  const gap = Math.abs(Number(a.elo_rating ?? 0) - Number(b.elo_rating ?? 0));
  if (gap > PREMADE_MAX_GAP) {
    return { ok: false, status: 400, error: `La diferencia de nivel con tu compañero es demasiado alta (máx ${PREMADE_MAX_GAP})` };
  }

  // Ninguno de los dos puede tener el matchmaking bloqueado por sanción.
  const [blockA, blockB] = await Promise.all([
    getMatchmakingBlockUntil(inviterId),
    getMatchmakingBlockUntil(inviteeId),
  ]);
  if (blockA || blockB) {
    return { ok: false, status: 403, error: 'Tú o tu compañero tenéis el matchmaking bloqueado temporalmente por sanción' };
  }

  // Nota: estar en cola NO impide invitar ni aceptar (es solo una intención de jugar juntos).
  // El bloqueo por estar en cola se aplica únicamente al encolar (enqueueBothPaired).
  return { ok: true };
}

/** True si el invitado rechazó una invitación de este invitador dentro del cooldown. */
export async function recentRejectionExists(
  supabase: SupabaseClient,
  inviterId: string,
  inviteeId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - PAIR_INVITE_REINVITE_COOLDOWN_MS).toISOString();
  const { data } = await supabase
    .from('matchmaking_pair_invites')
    .select('id')
    .eq('inviter_player_id', inviterId)
    .eq('invitee_player_id', inviteeId)
    .eq('status', 'rejected')
    .gt('resolved_at', since)
    .limit(1);
  return (data ?? []).length > 0;
}

function poolRowFromPrefs(playerId: string, partnerId: string, prefs: PairInvitePrefs) {
  return {
    player_id: playerId,
    paired_with_id: partnerId,
    club_id: prefs.club_id,
    preferred_club_ids: prefs.preferred_club_ids,
    max_distance_km: prefs.max_distance_km,
    preferred_side: prefs.preferred_side,
    gender: prefs.gender,
    available_from: prefs.available_from,
    available_until: prefs.available_until,
    availability_slots: prefs.availability_slots,
    status: 'searching' as const,
    search_lat: prefs.search_lat,
    search_lng: prefs.search_lng,
    expansion_offer: null,
    expansion_cycle_index: 0,
    last_expansion_prompt_at: null,
  };
}

/**
 * Encola a los dos miembros con paired_with_id mutuo. Revalida que ninguno esté ya en cola.
 * `callerId` (quien dispara la búsqueda) permite afinar el mensaje: "tú" vs "tu compañero".
 */
export async function enqueueBothPaired(
  supabase: SupabaseClient,
  inviterId: string,
  inviteeId: string,
  prefs: PairInvitePrefs,
  callerId?: string,
): Promise<Ok<unknown> | Fail> {
  const { data: inPool } = await supabase
    .from('matchmaking_pool')
    .select('player_id')
    .in('player_id', [inviterId, inviteeId]);
  const poolIds = new Set((inPool ?? []).map((r) => (r as { player_id: string }).player_id));
  if (poolIds.size > 0) {
    const callerInPool = callerId != null && poolIds.has(callerId);
    const error = callerInPool
      ? 'Ya estás en la cola de matchmaking. Sal de la búsqueda actual para buscar con tu compañero.'
      : 'Tu compañero ya está buscando partido. Espera a que termine para buscar juntos.';
    return { ok: false, status: 409, error };
  }

  const { error } = await supabase
    .from('matchmaking_pool')
    .insert([poolRowFromPrefs(inviterId, inviteeId, prefs), poolRowFromPrefs(inviteeId, inviterId, prefs)]);
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true };
}

export type ActionablePairInvite = {
  id: string;
  role: 'invitee' | 'inviter';
  status: string;
  other_player_id: string;
  other_player_name: string;
  other_player_avatar: string | null;
  expires_at: string;
  /** Diferencia de elo (0-7) entre ambos; >1 implica inflado del débil al buscar. */
  level_gap: number;
  /** Liga del jugador de mayor nivel: el partido se busca a este nivel. */
  target_liga: string;
};

/** Invitaciones que el jugador puede accionar: pendientes recibidas y aceptadas que él envió. */
export async function getActionablePairInvites(
  supabase: SupabaseClient,
  playerId: string,
): Promise<ActionablePairInvite[]> {
  const nowIso = new Date().toISOString();
  // Todas las invitaciones activas (pending/accepted) en las que participa el jugador,
  // como invitador o invitado. El cliente las categoriza por role + status.
  const { data } = await supabase
    .from('matchmaking_pair_invites')
    .select('id, inviter_player_id, invitee_player_id, status, expires_at')
    .or(`invitee_player_id.eq.${playerId},inviter_player_id.eq.${playerId}`)
    .in('status', ['pending', 'accepted'])
    .gt('expires_at', nowIso);

  const rows = (data ?? []) as {
    id: string;
    inviter_player_id: string;
    invitee_player_id: string;
    status: string;
    expires_at: string;
  }[];
  if (!rows.length) return [];

  const otherIds = [...new Set(rows.map((r) => (r.invitee_player_id === playerId ? r.inviter_player_id : r.invitee_player_id)))];
  const { data: pdata } = await supabase
    .from('players')
    .select('id, first_name, last_name, elo_rating, liga, avatar_url')
    .in('id', [playerId, ...otherIds]);
  const byId = new Map(
    (pdata ?? []).map((p) => {
      const r = p as { id: string; first_name?: string | null; last_name?: string | null; elo_rating?: number | null; liga?: string | null; avatar_url?: string | null };
      return [r.id, r];
    }),
  );
  const nameOf = (id: string): string => {
    const r = byId.get(id);
    return [r?.first_name, r?.last_name].filter(Boolean).join(' ').trim() || 'Jugador';
  };
  const meElo = Number(byId.get(playerId)?.elo_rating ?? 0);
  const meLiga = String(byId.get(playerId)?.liga ?? 'bronce');

  return rows.map((r) => {
    const isInvitee = r.invitee_player_id === playerId;
    const otherId = isInvitee ? r.inviter_player_id : r.invitee_player_id;
    const otherElo = Number(byId.get(otherId)?.elo_rating ?? 0);
    const otherLiga = String(byId.get(otherId)?.liga ?? 'bronce');
    return {
      id: r.id,
      role: isInvitee ? ('invitee' as const) : ('inviter' as const),
      status: r.status,
      other_player_id: otherId,
      other_player_name: nameOf(otherId),
      other_player_avatar: byId.get(otherId)?.avatar_url ?? null,
      expires_at: r.expires_at,
      level_gap: Math.abs(meElo - otherElo),
      target_liga: meElo >= otherElo ? meLiga : otherLiga,
    };
  });
}
