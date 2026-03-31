/**
 * Reglas de visibilidad de partidos (listados, unirse, futuras preguntas post-partido).
 * Mantener alineado con mobile-app/src/domain/matchLifecycle.ts
 */

export type MatchListPhase = 'upcoming' | 'live' | 'past';

function parseMs(iso: string | null | undefined): number | null {
  if (iso == null || iso === '') return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Estados que excluyen el partido de listados “activos”. */
const TERMINAL_STATUSES = new Set(['cancelled', 'finished', 'completed']);

/**
 * Fase del partido respecto al reloj y al estado persistido.
 * - `past`: cancelado, marcado como terminado, o franja horaria ya cerrada (end <= now).
 * - `live`: ahora está entre start y end (si hay fechas válidas).
 * - `upcoming`: aún no empezó o faltan datos para ubicarlo en vivo.
 */
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
