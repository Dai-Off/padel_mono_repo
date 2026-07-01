import type { SupabaseClient } from '@supabase/supabase-js';
import { getMatchListPhase } from './matchLifecycle';
import { matchAffectsElo } from './openMatchRules';

export type GuestJoinEligibilityResult =
  | { ok: true }
  | { ok: false; error: string; code?: string; httpStatus?: number };

type MatchJoinRow = {
  status: string;
  competitive?: boolean;
  type?: string | null;
  elo_min?: number | null;
  elo_max?: number | null;
};

type BookingJoinRow = {
  status?: string;
  court_contention_status?: string | null;
  start_at?: string;
  end_at?: string;
};

export function timeRangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  const aS = new Date(startA).getTime();
  const aE = new Date(endA).getTime();
  const bS = new Date(startB).getTime();
  const bE = new Date(endB).getTime();
  if (!Number.isFinite(aS) || !Number.isFinite(aE) || !Number.isFinite(bS) || !Number.isFinite(bE)) {
    return false;
  }
  return aS < bE && aE > bS;
}

/** Ventanas horarias de otros partidos activos del jugador (para detectar solapamientos). */
export async function getPlayerActiveMatchTimeWindows(
  supabase: SupabaseClient,
  playerId: string,
  excludeMatchId?: string,
): Promise<Array<{ matchId: string; startAt: string; endAt: string }>> {
  const { data: myMatches } = await supabase
    .from('match_players')
    .select('match_id')
    .eq('player_id', playerId);
  const myMatchIds = (myMatches ?? [])
    .map((m: { match_id: string }) => m.match_id)
    .filter((id) => id && id !== excludeMatchId);
  if (!myMatchIds.length) return [];

  const { data: matchesWithBookings } = await supabase
    .from('matches')
    .select('id, status, bookings(start_at, end_at)')
    .in('id', myMatchIds)
    .neq('status', 'cancelled');

  const windows: Array<{ matchId: string; startAt: string; endAt: string }> = [];
  for (const m of matchesWithBookings ?? []) {
    const b = Array.isArray(m.bookings) ? m.bookings[0] : m.bookings;
    if (!b?.start_at || !b?.end_at) continue;
    windows.push({ matchId: m.id, startAt: b.start_at, endAt: b.end_at });
  }
  return windows;
}

export async function playerHasMatchScheduleConflict(
  supabase: SupabaseClient,
  params: {
    playerId: string;
    excludeMatchId: string;
    startAt: string;
    endAt: string;
  },
): Promise<boolean> {
  const windows = await getPlayerActiveMatchTimeWindows(
    supabase,
    params.playerId,
    params.excludeMatchId,
  );
  return windows.some((w) =>
    timeRangesOverlap(params.startAt, params.endAt, w.startAt, w.endAt),
  );
}

/** Validaciones de negocio previas al pago (ELO, horario, solapamientos). */
export async function validateGuestMatchJoinEligibility(
  supabase: SupabaseClient,
  params: {
    matchId: string;
    playerId: string;
    match: MatchJoinRow;
    booking: BookingJoinRow | null | undefined;
  },
): Promise<GuestJoinEligibilityResult> {
  const { matchId, playerId, match, booking } = params;

  if (match.status === 'cancelled') {
    return { ok: false, error: 'El partido está cancelado', httpStatus: 400 };
  }
  if (match.status === 'finished') {
    return { ok: false, error: 'El partido ya finalizó.', httpStatus: 400 };
  }
  if (booking?.status === 'cancelled') {
    return {
      ok: false,
      code: 'contention_lost',
      error: 'Este partido ya no tiene la pista: otro grupo completó el partido antes.',
      httpStatus: 400,
    };
  }
  if (booking?.court_contention_status === 'lost') {
    return {
      ok: false,
      code: 'contention_lost',
      error: 'Este partido ya no tiene la pista: otro grupo completó el partido antes.',
      httpStatus: 400,
    };
  }

  const { data: joinPlayer, error: errJP } = await supabase
    .from('players')
    .select('elo_rating, onboarding_completed')
    .eq('id', playerId)
    .maybeSingle();
  if (errJP) return { ok: false, error: errJP.message, httpStatus: 500 };

  const mCompetitive = !!match.competitive;
  const mType = String(match.type ?? 'open');
  if (matchAffectsElo(mCompetitive, mType) && !(joinPlayer as { onboarding_completed?: boolean })?.onboarding_completed) {
    return { ok: false, error: 'Complete el cuestionario de nivelación primero', httpStatus: 403 };
  }

  const eloJoin = Number((joinPlayer as { elo_rating?: number }).elo_rating ?? 0);
  const eloMin = match.elo_min;
  const eloMax = match.elo_max;
  if (eloMin != null && eloMax != null) {
    if (eloJoin < eloMin || eloJoin > eloMax) {
      return {
        ok: false,
        error: 'Tu nivel no está en el rango permitido para este partido',
        httpStatus: 403,
      };
    }
  }

  const joinPhase = getMatchListPhase(
    Date.now(),
    match.status,
    booking?.start_at,
    booking?.end_at,
  );
  if (joinPhase === 'past') {
    return { ok: false, error: 'El partido ya finalizó o no está disponible.', httpStatus: 400 };
  }

  const targetStart = booking?.start_at ? new Date(booking.start_at).getTime() : 0;
  const targetEnd = booking?.end_at ? new Date(booking.end_at).getTime() : 0;
  if (targetStart && targetEnd && booking?.start_at && booking?.end_at) {
    const overlaps = await playerHasMatchScheduleConflict(supabase, {
      playerId,
      excludeMatchId: matchId,
      startAt: booking.start_at,
      endAt: booking.end_at,
    });
    if (overlaps) {
      return {
        ok: false,
        code: 'schedule_conflict',
        error: 'Ya tienes un partido a esa hora. Elige otro horario.',
        httpStatus: 400,
      };
    }
  }

  return { ok: true };
}
