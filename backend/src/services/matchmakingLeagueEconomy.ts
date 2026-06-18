/**
 * Economía de LP / ascenso / descenso en partidos matchmaking (doc 10 §3.3–3.5, §4 pendientes resueltos con valores provisionales).
 */
import { LEAGUE_ORDER, leagueIndex, ligaFromEloWithBands, type LeagueName, type LeagueEloBand } from './matchmakingLeague';

/** LP base victoria / derrota (provisionales; doc 10 §4.4). */
export const LP_WIN_BASE = 15;
export const LP_LOSS_BASE = 12;
/** LP necesarios netos en la temporada para ascender un escalón (se descuentan al promocionar). */
export const LP_PROMOTE_THRESHOLD = 100;
/** LP tras descenso (doc 10 §4.8 protección parcial). */
export const LP_AFTER_DEMOTE = 45;
/** Partidos MM con bloqueo de descenso tras ascender (doc 10 §3.4). */
export const MM_SHIELD_MATCHES_AFTER_PROMO = 5;
/** Ajuste cross-liga: bonus LP si gana el equipo con media de liga más baja. */
export const CROSS_LIGA_LP_PER_INDEX_GAP = 4;
/** Penalidad extra de LP si pierde el equipo con media de liga más alta. */
export const CROSS_LIGA_LOSS_EXTRA_PER_INDEX_GAP = 3;
/**
 * Acelerador de LP (gravedad hacia la liga real). Multiplica SOLO las ganancias
 * cuando el jugador está infravalorado: su liga objetivo (según elo conservador
 * post-partido) está por encima de su liga actual. Unidireccional: nunca penaliza.
 */
export const K_BOOST = 0.5;
export const BOOST_MAX = 2.5;

const EPS = 1e-9;

export type MmLeagueRow = {
  playerId: string;
  team: 'A' | 'B';
  liga: string;
  lps: number;
  mm_shield_matches: number;
  mm_peak_liga: string;
  league_season_id: string | null;
  /** Elo conservador (mu − 2σ) post-partido; modula el acelerador de LP. */
  newElo: number;
};

function avgLeagueIndexForTeam(team: 'A' | 'B', rows: MmLeagueRow[]): number {
  const t = rows.filter((r) => r.team === team);
  if (!t.length) return 0;
  return t.reduce((s, r) => s + leagueIndex(r.liga), 0) / t.length;
}

function higherLigaByIndex(a: string, b: string): string {
  return leagueIndex(a) >= leagueIndex(b) ? a : b;
}

function nextLiga(l: string): LeagueName {
  const i = leagueIndex(l);
  if (i >= LEAGUE_ORDER.length - 1) return LEAGUE_ORDER[LEAGUE_ORDER.length - 1];
  return LEAGUE_ORDER[i + 1];
}

function prevLiga(l: string): LeagueName {
  const i = leagueIndex(l);
  if (i <= 0) return LEAGUE_ORDER[0];
  return LEAGUE_ORDER[i - 1];
}

/**
 * Calcula estado de liga/LP tras un partido MM (4 jugadores). `winnerTeam` null = empate.
 */
export function computeMatchmakingLeagueUpdates(
  rows: MmLeagueRow[],
  winnerTeam: 'A' | 'B' | null,
  activeSeasonId: string,
  bands: LeagueEloBand[],
): { id: string; lps: number; liga: string; mm_shield_matches: number; mm_peak_liga: string; league_season_id: string }[] {
  const avgA = avgLeagueIndexForTeam('A', rows);
  const avgB = avgLeagueIndexForTeam('B', rows);

  const out: { id: string; lps: number; liga: string; mm_shield_matches: number; mm_peak_liga: string; league_season_id: string }[] = [];

  for (const r of rows) {
    const win = winnerTeam != null && r.team === winnerTeam;
    const loss = winnerTeam != null && r.team !== winnerTeam;
    const draw = winnerTeam == null;

    const avgMy = r.team === 'A' ? avgA : avgB;
    const avgOpp = r.team === 'A' ? avgB : avgA;

    let delta = 0;
    if (draw) {
      delta = 0;
    } else if (win) {
      const gap = Math.max(0, avgOpp - avgMy);
      const cross = gap > EPS ? Math.round(CROSS_LIGA_LP_PER_INDEX_GAP * gap) : 0;
      // Acelerador: si la liga objetivo (elo conservador post-partido) está por
      // encima de la liga actual, el infravalorado sube más rápido a su sitio.
      const ligaObjetivo = ligaFromEloWithBands(r.newElo, bands);
      const ligaGap = leagueIndex(ligaObjetivo) - leagueIndex(r.liga);
      const boost = ligaGap >= 1 ? Math.min(1 + K_BOOST * ligaGap, BOOST_MAX) : 1;
      delta = Math.round(LP_WIN_BASE * boost) + cross;
    } else {
      const gap = Math.max(0, avgMy - avgOpp);
      const cross = gap > EPS ? Math.round(CROSS_LIGA_LOSS_EXTRA_PER_INDEX_GAP * gap) : 0;
      delta = -(LP_LOSS_BASE + cross);
    }

    let lps = Math.max(0, r.lps + delta);
    let liga = r.liga;
    let shield = r.mm_shield_matches;
    let peak = r.mm_peak_liga || r.liga;
    let promoted = false;

    if (!draw) {
      while (lps >= LP_PROMOTE_THRESHOLD && leagueIndex(liga) < LEAGUE_ORDER.length - 1) {
        lps -= LP_PROMOTE_THRESHOLD;
        liga = nextLiga(liga);
        promoted = true;
        shield = MM_SHIELD_MATCHES_AFTER_PROMO;
      }
    }

    if (loss && !promoted && lps === 0 && leagueIndex(liga) > 0 && shield === 0) {
      liga = prevLiga(liga);
      lps = LP_AFTER_DEMOTE;
      shield = 0;
    }

    if (!promoted) {
      shield = Math.max(0, shield - 1);
    }

    peak = higherLigaByIndex(peak, liga);

    out.push({
      id: r.playerId,
      lps,
      liga,
      mm_shield_matches: shield,
      mm_peak_liga: peak,
      league_season_id: r.league_season_id ?? activeSeasonId,
    });
  }

  return out;
}
