/**
 * Invitaciones de pareja para matchmaking competitivo (premade duo).
 * A invita a B; al aceptar (o al "buscar" de A) se encola a ambos en
 * `matchmaking_pool` con `paired_with_id` mutuo, compartiendo las prefs de A.
 * El inflado de nivel del débil vive en el ciclo de matchmaking, no aquí.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { PREMADE_MAX_GAP } from './matchmakingShared';
import { getMatchmakingBlockUntil } from './matchmakingService';

/** TTL por defecto de una invitación si la ventana de disponibilidad no acota antes. */
const PAIR_INVITE_TTL_MS = 6 * 60 * 60 * 1000;
/** Tras un rechazo, el invitador no puede volver a invitar al mismo jugador durante este tiempo. */
export const PAIR_INVITE_REINVITE_COOLDOWN_MS = 60 * 60 * 1000;

export type PairInvitePrefs = {
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
  const available_from = body.available_from;
  const available_until = body.available_until;
  if (typeof available_from !== 'string' || typeof available_until !== 'string') {
    return { ok: false, status: 400, error: 'available_from y available_until son obligatorios' };
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
      return { ok: false, status: 400, error: 'search_lat y search_lng son obligatorios cuando indicás max_distance_km' };
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
      available_from,
      available_until,
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

/** expires_at = fin de la ventana de disponibilidad, acotado por el TTL máximo. */
export function computeInviteExpiry(prefs: PairInvitePrefs): string {
  const cap = Date.now() + PAIR_INVITE_TTL_MS;
  const end = new Date(prefs.available_until).getTime();
  const ms = Number.isFinite(end) && end > Date.now() && end < cap ? end : cap;
  return new Date(ms).toISOString();
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
  if (inviterId === inviteeId) return { ok: false, status: 400, error: 'No podés invitarte a vos mismo' };

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

  const { data: inPool } = await supabase
    .from('matchmaking_pool')
    .select('player_id')
    .in('player_id', [inviterId, inviteeId]);
  if ((inPool ?? []).length > 0) {
    return { ok: false, status: 409, error: 'Tú o tu compañero ya estáis en la cola de matchmaking' };
  }

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
    status: 'searching' as const,
    search_lat: prefs.search_lat,
    search_lng: prefs.search_lng,
    expansion_offer: null,
    expansion_cycle_index: 0,
    last_expansion_prompt_at: null,
  };
}

/** Encola a los dos miembros con paired_with_id mutuo. Revalida que ninguno esté ya en cola. */
export async function enqueueBothPaired(
  supabase: SupabaseClient,
  inviterId: string,
  inviteeId: string,
  prefs: PairInvitePrefs,
): Promise<Ok<unknown> | Fail> {
  const { data: inPool } = await supabase
    .from('matchmaking_pool')
    .select('player_id')
    .in('player_id', [inviterId, inviteeId]);
  if ((inPool ?? []).length > 0) {
    return { ok: false, status: 409, error: 'Tú o tu compañero ya estáis en la cola de matchmaking' };
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
  const { data } = await supabase
    .from('matchmaking_pair_invites')
    .select('id, inviter_player_id, invitee_player_id, status, expires_at')
    .or(
      `and(invitee_player_id.eq.${playerId},status.eq.pending),and(inviter_player_id.eq.${playerId},status.eq.accepted),and(inviter_player_id.eq.${playerId},status.eq.pending)`,
    )
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
    .select('id, first_name, last_name, elo_rating, liga')
    .in('id', [playerId, ...otherIds]);
  const byId = new Map(
    (pdata ?? []).map((p) => {
      const r = p as { id: string; first_name?: string | null; last_name?: string | null; elo_rating?: number | null; liga?: string | null };
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
      expires_at: r.expires_at,
      level_gap: Math.abs(meElo - otherElo),
      target_liga: meElo >= otherElo ? meLiga : otherLiga,
    };
  });
}
