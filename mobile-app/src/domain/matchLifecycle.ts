/**
 * Reglas de visibilidad de partidos (listados, unirse, futuras preguntas post-partido).
 * Mantener alineado con backend/src/lib/matchLifecycle.ts
 */

export type MatchListPhase = 'upcoming' | 'live' | 'past';

function parseMs(iso: string | null | undefined): number | null {
  if (iso == null || iso === '') return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

const TERMINAL_STATUSES = new Set(['cancelled', 'finished', 'completed']);

export function getMatchListPhase(
  nowMs: number,
  matchStatus: string,
  startAt?: string | null,
  endAt?: string | null
): MatchListPhase {
  const s = String(matchStatus || '').toLowerCase();
  if (TERMINAL_STATUSES.has(s)) return 'past';

  const endMs = parseMs(endAt);
  const startMs = parseMs(startAt);
  if (endMs != null && nowMs >= endMs) return 'past';
  if (startMs != null && endMs != null && nowMs >= startMs && nowMs < endMs) return 'live';
  return 'upcoming';
}

export function isMatchActiveForDiscovery(phase: MatchListPhase): boolean {
  return phase === 'upcoming' || phase === 'live';
}

/** bookings puede venir como objeto o array (Supabase expand). */
export function getMatchBooking<
  T extends { start_at?: string | null; end_at?: string | null; status?: string | null; deleted_at?: string | null },
>(m: { bookings?: T | T[] | null }): T | null {
  const raw = m.bookings;
  if (raw == null) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

export function countFilledMatchPlayers(
  matchPlayers?: Array<{ players?: { id?: string } | null } | null> | null,
): number {
  return (matchPlayers ?? []).filter((mp) => Boolean(mp?.players?.id)).length;
}

/** Solo partidos con 4 jugadores y no cancelados pueden registrar resultado. */
export function canRecordMatchScore(
  matchStatus: string | null | undefined,
  filledPlayerCount: number,
): boolean {
  const s = String(matchStatus ?? '').toLowerCase();
  if (s === 'cancelled') return false;
  return filledPlayerCount >= 4;
}

type HomeMisPartidoRow = {
  status: string;
  has_my_feedback?: boolean;
  match_players?: Array<{ players?: { id?: string } | null } | null> | null;
  bookings?:
    | { start_at?: string | null; end_at?: string | null; status?: string | null; deleted_at?: string | null }
    | Array<{ start_at?: string | null; end_at?: string | null; status?: string | null; deleted_at?: string | null }>
    | null;
};

/** Carrusel home: excluir reservas borradas/canceladas y pasados incompletos sin feedback. */
export function shouldIncludeInHomeMisPartidos(
  m: HomeMisPartidoRow,
  nowMs: number = Date.now(),
): boolean {
  const b = getMatchBooking(m);
  if (!b?.start_at || !b?.end_at) return false;
  if (b.deleted_at != null) return false;

  const matchStatus = m.status;
  if (String(matchStatus).toLowerCase() === 'cancelled') return false;
  if (String(b.status ?? '').toLowerCase() === 'cancelled') return false;

  const phase = getMatchListPhase(nowMs, matchStatus, b.start_at, b.end_at);
  if (phase === 'past' && m.has_my_feedback === true) return false;

  const filled = countFilledMatchPlayers(m.match_players);
  if (phase === 'past' && !canRecordMatchScore(matchStatus, filled)) return false;

  return true;
}

/** Carrusel home (PartidoItem mapeado): misma regla que PartidoDetailScreen. */
export function isPartidoCancelled(p: {
  matchStatus?: string;
  bookingStatus?: string;
}): boolean {
  if (String(p.matchStatus ?? '').toLowerCase() === 'cancelled') return true;
  if (String(p.bookingStatus ?? '').toLowerCase() === 'cancelled') return true;
  return false;
}

export function shouldIncludePartidoInHomeCarousel(p: {
  matchPhase?: MatchListPhase;
  hasMyFeedback?: boolean;
  matchStatus?: string;
  bookingStatus?: string;
  players: Array<{ isFree: boolean }>;
}): boolean {
  if (isPartidoCancelled(p)) return false;
  if (p.matchPhase !== 'past') return true;
  if (p.hasMyFeedback) return false;
  const filled = p.players.filter((x) => !x.isFree).length;
  return canRecordMatchScore(p.matchStatus, filled);
}

export function isMatchEnrichedActiveForDiscovery(m: {
  status: string;
  bookings?:
    | { start_at?: string | null; end_at?: string | null }
    | { start_at?: string | null; end_at?: string | null }[]
    | null;
}): boolean {
  const b = getMatchBooking(m);
  const phase = getMatchListPhase(Date.now(), m.status, b?.start_at, b?.end_at);
  return isMatchActiveForDiscovery(phase);
}
