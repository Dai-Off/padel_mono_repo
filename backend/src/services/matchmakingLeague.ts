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

/** Tope de diferencia de liga permitido al emparejar. La preferencia por misma
 *  liga se aplica como penalización ponderada del score en matchmakingService. */
export const MAX_LEAGUE_SPREAD = 2;

/** Compatible si los 4 jugadores están dentro de MAX_LEAGUE_SPREAD escalones. */
export function leaguesMatchmakingCompatible(ids: string[], ligaById: Map<string, string>): boolean {
  return maxLeagueSpread(ids, ligaById) <= MAX_LEAGUE_SPREAD;
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
  /** LP a descontar al ascender DESDE esta liga; null/ausente = constante de código. */
  lps_to_promote?: number | null;
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

/** Sube un escalón de liga (tope elite). */
export function nextLiga(l: string): LeagueName {
  const i = leagueIndex(l);
  return i >= LEAGUE_ORDER.length - 1 ? LEAGUE_ORDER[LEAGUE_ORDER.length - 1] : LEAGUE_ORDER[i + 1];
}

/** Baja un escalón de liga (suelo bronce). */
export function prevLiga(l: string): LeagueName {
  const i = leagueIndex(l);
  return i <= 0 ? LEAGUE_ORDER[0] : LEAGUE_ORDER[i - 1];
}
