/**
 * Fecha calendario YYYY-MM-DD en zona horaria local del dispositivo.
 * Evita desfases de `toISOString()` (UTC), relevante fuera de España o al cruzar medianoche UTC.
 */
export function toDateStringLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
