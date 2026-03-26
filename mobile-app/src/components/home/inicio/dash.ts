/** Valor vacío unificado para campos sin datos de backend. */
export const DASH = '-';

export function dash(
  value: string | number | null | undefined,
  empty: string = DASH
): string {
  if (value === null || value === undefined) return empty;
  const s = String(value).trim();
  return s === '' ? empty : s;
}
