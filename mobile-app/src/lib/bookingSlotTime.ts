import { clubLocalDateTimeToUtcIso, DEFAULT_CLUB_TIMEZONE } from './clubTimeZone';

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
 * El fin siempre se calcula como inicio + `durationMinutes` (la duración elegida
 * por el usuario). No se usa `endAtUtc` de la API para persistir: puede venir
 * con el turno por defecto del club (p. ej. 90 min) aunque el usuario haya
 * elegido 120 min en reserva de pista.
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
    const start_at = slot.startAtUtc;
    const end_at = new Date(
      new Date(start_at).getTime() + durationMin * 60 * 1000,
    ).toISOString();
    return { start_at, end_at };
  }

  const start_at = clubLocalDateTimeToUtcIso(slot.dateStr, slot.time, clubTz);
  const end_at = new Date(new Date(start_at).getTime() + durationMin * 60 * 1000).toISOString();
  return { start_at, end_at };
}
