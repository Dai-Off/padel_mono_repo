/** Duraciones permitidas para reserva de pista privada (Pistas → Reservar). */
export const COURT_RESERVATION_DURATION_OPTIONS = [30, 60, 90, 120] as const;

export type CourtReservationDuration = (typeof COURT_RESERVATION_DURATION_OPTIONS)[number];

export function isCourtReservationDuration(value: number): value is CourtReservationDuration {
  return (COURT_RESERVATION_DURATION_OPTIONS as readonly number[]).includes(value);
}

/** Duración inicial: la del club si está en la lista; si no, 60 min. */
export function defaultCourtReservationDuration(
  clubSlotDurationMin?: number | null,
): CourtReservationDuration {
  const club = Number(clubSlotDurationMin);
  if (isCourtReservationDuration(club)) return club;
  return 60;
}

/** Paso entre inicios de turno al consultar disponibilidad (media hora). */
export function courtReservationSlotStepMinutes(_durationMinutes: number): number {
  return 30;
}
