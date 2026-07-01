/** Partidos públicos/privados (open_match): duración fija, sin usar el turno mínimo del club. */
export const OPEN_MATCH_DURATION_MIN = 90;

export function resolveOpenMatchEndAt(startAt: string): string {
  const startMs = new Date(startAt).getTime();
  return new Date(startMs + OPEN_MATCH_DURATION_MIN * 60 * 1000).toISOString();
}

/** Normaliza el rango horario de un open_match a exactamente 90 minutos. */
export function resolveOpenMatchTimeRange(
  start_at: string,
  end_at: string,
  reservationType: string,
): { start_at: string; end_at: string } {
  if (reservationType !== 'open_match') {
    return { start_at, end_at };
  }
  return { start_at, end_at: resolveOpenMatchEndAt(start_at) };
}
