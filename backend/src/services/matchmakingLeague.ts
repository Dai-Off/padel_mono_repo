/** Ligas globales de matchmaking (doc 10). Distintas de `league_seasons` por club. */

export const LEAGUE_ORDER = ['bronce', 'plata', 'oro', 'elite'] as const;
export type LeagueName = (typeof LEAGUE_ORDER)[number];

export function leagueIndex(liga: string | null | undefined): number {
  const s = String(liga ?? 'bronce').toLowerCase();
  const i = (LEAGUE_ORDER as readonly string[]).indexOf(s);
  return i >= 0 ? i : 0;
}

export function maxLeagueSpread(ids: string[], ligaById: Map<string, string>): number {
  if (!ids.length) return 0;
  const idx = ids.map((id) => leagueIndex(ligaById.get(id)));
  return Math.max(...idx) - Math.min(...idx);
}

/** Máximo 1 salto de liga (bronce↔plata OK, bronce↔oro no). */
export function leaguesMatchmakingCompatible(ids: string[], ligaById: Map<string, string>): boolean {
  return maxLeagueSpread(ids, ligaById) <= 1;
}

/** Asignación inicial por elo 0–7 (valores provisionales doc 10). */
export function ligaFromElo(elo: number): LeagueName {
  if (elo < 2) return 'bronce';
  if (elo < 4) return 'plata';
  if (elo < 5.5) return 'oro';
  return 'elite';
}

export type LeagueEloBand = {
  code: string;
  sort_order: number;
  elo_min: number;
  elo_max: number;
};

/** Liga según filas de `matchmaking_leagues` (orden por sort_order). */
export function ligaFromEloWithBands(elo: number, bands: LeagueEloBand[]): string {
  if (!bands.length) return ligaFromElo(elo);
  const sorted = [...bands].sort((a, b) => a.sort_order - b.sort_order);
  for (const r of sorted) {
    if (elo >= r.elo_min && elo < r.elo_max) return r.code;
  }
  const last = sorted[sorted.length - 1];
  if (last && elo >= last.elo_min) return last.code;
  return sorted[0].code;
}

export function higherLigaRank(a: string, b: string): string {
  return leagueIndex(a) >= leagueIndex(b) ? a : b;
}

/**
 * Doc 10 §3.2: si la liga MM y la banda de elo divergen en 2+ escalones, alinear con el elo tras el partido.
 */
export function reconcileLigaWithElo(currentLiga: string, newElo: number, bands: LeagueEloBand[] | null): string {
  const eloLiga = bands?.length ? ligaFromEloWithBands(newElo, bands) : ligaFromElo(newElo);
  if (Math.abs(leagueIndex(eloLiga) - leagueIndex(currentLiga)) >= 2) return eloLiga;
  return currentLiga;
}
