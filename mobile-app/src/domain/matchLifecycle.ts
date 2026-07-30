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

/** Solo partidos con 4 jugadores y no cancelados pueden registrar resultado. */
export function canRecordMatchScore(
  matchStatus: string | null | undefined,
  filledPlayerCount: number,
): boolean {
  const s = String(matchStatus ?? '').toLowerCase();
  if (s === 'cancelled') return false;
  return filledPlayerCount >= 4;
}

/**
 * Ventana post-partido para iniciar el reporte de resultado. Pasada la ventana
 * el backend cierra el partido a no_result (salvo votación o disputa activas).
 * Mantener alineado con SCORE_REPORT_WINDOW_HOURS en backend/src/lib/levelingConstants.ts.
 */
export const POST_MATCH_ACTION_WINDOW_HOURS = 48;
/** Ventana de feedback tras confirmarse el marcador. Alineado con FEEDBACK_WINDOW_HOURS del backend. */
export const FEEDBACK_WINDOW_HOURS = 24;
/** Red de seguridad: nada post-partido sigue accionable pasados 7 días (estados legacy sin auto-resolución). */
export const POST_MATCH_MAX_LIFETIME_HOURS = 7 * 24;

export function isPostMatchActionWindowOpen(
  endAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  const endMs = parseMs(endAt);
  if (endMs == null) return true;
  return nowMs < endMs + POST_MATCH_ACTION_WINDOW_HOURS * 3600 * 1000;
}

/**
 * ¿Sigue abierto el flujo post-partido (finalizar: resultado + feedback) para mí?
 * - no_result → cerrado.
 * - confirmed → solo si me falta feedback y su ventana (24h desde confirmación) sigue abierta.
 * - pending_votes → abierto: la votación se resuelve sola (votos o autoconfirmación a 24h).
 * - pending (incluye disputa tras rechazo) y estados legacy → abierto; el backend
 *   lo cierra a no_result (ventana 48h + gracia de disputa) y el cap de 7 días acota el resto.
 */
export function isPostMatchFlowOpen(
  p: {
    endAt?: string | null;
    scoreStatus?: string | null;
    score_status?: string | null;
    scoreConfirmedAt?: string | null;
    hasMyFeedback?: boolean;
  },
  nowMs: number = Date.now(),
): boolean {
  const endMs = parseMs(p.endAt);
  if (endMs != null && nowMs >= endMs + POST_MATCH_MAX_LIFETIME_HOURS * 3600 * 1000) return false;

  const st = String(p.score_status ?? p.scoreStatus ?? '').toLowerCase();
  if (st === 'no_result') return false;
  if (st === 'confirmed') {
    if (p.hasMyFeedback) return false;
    const confirmedMs = parseMs(p.scoreConfirmedAt);
    if (confirmedMs != null) return nowMs < confirmedMs + FEEDBACK_WINDOW_HOURS * 3600 * 1000;
    return isPostMatchActionWindowOpen(p.endAt, nowMs);
  }
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
