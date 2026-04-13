export function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDaysLocal(base: Date, days: number): Date {
  const x = new Date(base);
  x.setDate(x.getDate() + days);
  return startOfLocalDay(x);
}

export function dateKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Formato corto de fecha para chips: "27 ene" */
export function formatDateForChip(date: Date): string {
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

/** Formato de rango horario para chips: "00:00 - 23:59" */
export function formatTimeRangeForChip(start: string, end: string): string {
  return `${start} - ${end}`;
}

export const SPORT_OPTIONS = [
  { id: 'padel', label: 'Pádel' },
  { id: 'tenis', label: 'Tenis' },
  { id: 'pickleball', label: 'Pickleball' },
] as const;

export const DURATION_OPTIONS = [60, 90, 120] as const;

export const CERRAMIENTO_OPTIONS = [
  { id: 'indoor' as const, label: 'Indoor' },
  { id: 'exterior' as const, label: 'Exterior' },
  { id: 'cubierta' as const, label: 'Cubierta' },
] as const;

export const PAREDES_OPTIONS = [
  { id: 'muro' as const, label: 'Muro' },
  { id: 'cristal' as const, label: 'Cristal' },
  { id: 'panoramico' as const, label: 'Panorámico' },
] as const;

/** Presets de franja horaria (filtrado local de `timeSlots`). */
export const TIME_RANGE_PRESETS = [
  { id: 'allday' as const, label: 'Todo el día', range: null as { start: string; end: string } | null },
  { id: 'morning' as const, label: 'Mañana (8–14h)', range: { start: '08:00', end: '14:00' } },
  { id: 'afternoon' as const, label: 'Tarde (14–20h)', range: { start: '14:00', end: '20:00' } },
  { id: 'evening' as const, label: 'Noche (20–23h)', range: { start: '20:00', end: '23:00' } },
] as const;

export type TimeRangePresetId = (typeof TIME_RANGE_PRESETS)[number]['id'];

export function timeRangePresetMatches(
  presetId: TimeRangePresetId,
  range: { start: string; end: string } | null,
): boolean {
  const p = TIME_RANGE_PRESETS.find((x) => x.id === presetId);
  if (!p) return false;
  if (p.range == null) return range == null;
  if (range == null) return false;
  return p.range.start === range.start && p.range.end === range.end;
}
