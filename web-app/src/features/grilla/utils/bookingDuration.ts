import { isOpenMatchType } from './reservationTypeSlug';

/** Duraciones para reserva de pista privada y tipos similares (grilla manual). */
export const COURT_BOOKING_DURATION_OPTIONS = [30, 60, 90, 120] as const;

/** Partidos públicos/privados en app: siempre 90 min. */
export const OPEN_MATCH_DURATION_MIN = 90;

export function durationOptionsForReservationType(
  reservationType: string | null | undefined,
): readonly number[] {
  if (isOpenMatchType(reservationType)) {
    return [OPEN_MATCH_DURATION_MIN];
  }
  return COURT_BOOKING_DURATION_OPTIONS;
}

/** Normaliza minutos desde start/end de la BD para el formulario de edición. */
export function resolveBookingDurationMinutes(
  startAt: string | Date,
  endAt: string | Date,
  reservationType: string | null | undefined,
): number {
  if (isOpenMatchType(reservationType)) {
    return OPEN_MATCH_DURATION_MIN;
  }
  const startMs = new Date(startAt).getTime();
  const endMs = new Date(endAt).getTime();
  const raw = (endMs - startMs) / 60000;
  const rounded = Math.round(raw / 30) * 30;
  if (!Number.isFinite(rounded) || rounded < 30) return 60;
  return Math.min(240, Math.max(30, rounded));
}
