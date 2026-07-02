/** Jugadores en un partido de pádel (dobles). */
export const OPEN_MATCH_PLAYERS_COUNT = 4;

/** Cuota individual: 1/4 del precio de pista (misma lógica que el backend). */
export function openMatchPlayerShareCents(totalCents: number): number {
  if (!Number.isFinite(totalCents) || totalCents <= 0) return 0;
  return Math.ceil(totalCents / OPEN_MATCH_PLAYERS_COUNT);
}

export function formatEuroCents(cents: number, spaced = false): string {
  const value = (cents / 100).toFixed(2);
  return spaced ? `${value} €` : `${value}€`;
}
