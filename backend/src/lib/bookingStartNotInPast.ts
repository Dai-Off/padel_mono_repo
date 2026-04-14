/** Tolerancia reloj cliente/servidor y red (ms). */
const PAST_START_SKEW_MS = 90_000;

export function bookingStartIsTooFarInPast(startAtIso: string, nowMs: number = Date.now()): boolean {
  const t = new Date(startAtIso).getTime();
  if (!Number.isFinite(t)) return true;
  return t < nowMs - PAST_START_SKEW_MS;
}

export const BOOKING_START_PAST_ERROR =
  'Ese horario ya no está disponible (el inicio está en el pasado). Elige otra hora.';
