import { clubLocalDateTimeToUtcIso } from './clubTimeZone';

/** Misma zona por defecto que el backend (`clubTimezoneOrDefault`). */
const DEFAULT_CLUB_TIMEZONE = 'Europe/Madrid';

export type SlotBookingTimeInput = {
  dateStr: string;
  time: string;
  durationMinutes: number;
  /** UTC del inicio según /availability/slots (preferido). */
  startAtUtc?: string;
  /** UTC del fin según /availability/slots. */
  endAtUtc?: string;
  /** Zona IANA del club (`clubs.timezone`). */
  clubTimezone?: string;
};

/**
 * Resuelve el rango UTC de una reserva a partir del slot elegido.
 * Prioriza los instantes que devuelve la API (zona del club); si no hay,
 * convierte fecha+hora civil usando la zona del club, no la del dispositivo.
 */
export function resolveSlotStartEndUtc(slot: SlotBookingTimeInput): {
  start_at: string;
  end_at: string;
} {
  const durationMin =
    Number.isFinite(slot.durationMinutes) && slot.durationMinutes > 0
      ? slot.durationMinutes
      : 90;
  const clubTz = slot.clubTimezone?.trim() || DEFAULT_CLUB_TIMEZONE;

  if (slot.startAtUtc) {
    const end_at =
      slot.endAtUtc ??
      new Date(new Date(slot.startAtUtc).getTime() + durationMin * 60 * 1000).toISOString();
    return { start_at: slot.startAtUtc, end_at };
  }

  const start_at = clubLocalDateTimeToUtcIso(slot.dateStr, slot.time, clubTz);
  const end_at = new Date(new Date(start_at).getTime() + durationMin * 60 * 1000).toISOString();
  return { start_at, end_at };
}
