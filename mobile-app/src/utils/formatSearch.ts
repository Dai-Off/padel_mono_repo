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
