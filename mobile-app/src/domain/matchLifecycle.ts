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

/** bookings puede venir como objeto o array (Supabase). */
export function isMatchEnrichedActiveForDiscovery(m: {
  status: string;
  bookings?:
    | { start_at?: string | null; end_at?: string | null }
    | { start_at?: string | null; end_at?: string | null }[]
    | null;
}): boolean {
  const raw = m.bookings;
  const b = Array.isArray(raw) ? raw[0] : raw;
  const phase = getMatchListPhase(Date.now(), m.status, b?.start_at, b?.end_at);
  return isMatchActiveForDiscovery(phase);
}
