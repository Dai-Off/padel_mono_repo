import { clubLocalDateTimeToUtcIso, dayKeyInClubTz } from './clubTimeZone';

/** Un partido de matchmaking dura 90 min (fijo). El "hasta" del tramo = fin del partido. */
export const MATCH_DURATION_MIN = 90;
/** Los clubs solo abren slots en punto o y media, así que se elige en pasos de 30 min. */
export const SLOT_STEP_MIN = 30;
/** Rango de horas ofrecido en los pickers (el club revalida su horario real al emparejar). */
export const DAY_START_MIN = 7 * 60; // 07:00
export const DAY_END_MIN = 23 * 60; // 23:00

/** Tramo horario de un día, en hora local del club ("HH:MM", siempre :00 o :30). */
export type TimeRange = { from: string; until: string };
/** Disponibilidad de un día: fecha (clave "YYYY-MM-DD") + uno o varios tramos. */
export type DaySlots = { dateKey: string; ranges: TimeRange[] };
/** Franja absoluta enviada al backend. */
export type AvailabilitySlot = { start_at: string; end_at: string };

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToHhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Opciones "HH:MM" cada 30 min entre startMin y endMin (ambos inclusive). */
export function halfHourOptions(startMin: number, endMin: number): string[] {
  const out: string[] = [];
  for (let m = startMin; m <= endMin; m += SLOT_STEP_MIN) out.push(minutesToHhmm(m));
  return out;
}

/** Un tramo es válido si aloja al menos un partido completo (>= 90 min). */
export function isValidRange(r: TimeRange): boolean {
  return hhmmToMinutes(r.until) - hhmmToMinutes(r.from) >= MATCH_DURATION_MIN;
}

/** Tramo por defecto al añadir un día nuevo. */
export function defaultRange(): TimeRange {
  return { from: '18:00', until: '22:00' };
}

/** Disponibilidad inicial: hoy con un tramo por defecto. */
export function defaultDaySlots(): DaySlots[] {
  return [{ dateKey: dayKeyInClubTz(new Date()), ranges: [defaultRange()] }];
}

/** Resumen compacto de la disponibilidad para el recuadro de la cola (ej. "sáb 5 18:00–22:00 · dom 6 10:00–14:00"). */
export function scheduleSummary(daySlots: DaySlots[], localeTag: string): string {
  const parts: string[] = [];
  for (const day of daySlots) {
    const d = new Date(`${day.dateKey}T12:00:00`);
    const label = d.toLocaleDateString(localeTag, { weekday: 'short', day: 'numeric' }).replace('.', '');
    for (const r of day.ranges) {
      if (!isValidRange(r)) continue;
      parts.push(`${label} ${r.from}–${r.until}`);
    }
  }
  return parts.join(' · ');
}

/**
 * Convierte los tramos por día (hora local del club) a franjas UTC para el backend.
 * Descarta tramos demasiado cortos (< 90 min) y los que ya han terminado.
 */
export function computeAvailabilitySlots(daySlots: DaySlots[]): AvailabilitySlot[] {
  const nowMs = Date.now();
  const out: AvailabilitySlot[] = [];
  for (const day of daySlots) {
    for (const r of day.ranges) {
      if (!isValidRange(r)) continue;
      const start_at = clubLocalDateTimeToUtcIso(day.dateKey, r.from);
      const end_at = clubLocalDateTimeToUtcIso(day.dateKey, r.until);
      if (new Date(end_at).getTime() <= nowMs) continue;
      out.push({ start_at, end_at });
    }
  }
  return out;
}
