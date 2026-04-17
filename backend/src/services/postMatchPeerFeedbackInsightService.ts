import type { SupabaseClient } from '@supabase/supabase-js';

import { generatePeerFeedbackCardWithOpenAI } from '../lib/openaiPeerFeedbackInsight';

export type PeerFeedbackInsight = {
  ok: true;
  empty: boolean;
  match_id: string | null;
  /** Último `created_at` entre las filas de feedback de compañeros de ese partido que te valoraron. */
  feedback_created_at: string | null;
  /** Compañeros distintos que te enviaron `level_ratings` con tu `player_id` en ese partido (1–3). */
  peer_count: number;
  /** Media de `perceived` (-1, 0, 1) entre esas valoraciones. */
  average_perceived: number | null;
  /** Conteo por tipo en ese partido. */
  distribution: { high: number; mid: number; low: number } | null;
  /**
   * Resumen tipo “badge”: -1 / 0 / 1 según la media (útil si el cliente solo quiere un estado).
   * Con pocos votos es orientativo.
   */
  last_perceived: -1 | 0 | 1 | null;
  recommendation_ia: string | null;
  fortalezas: string[];
  a_mejorar: string[];
  /** Origen del texto de la tarjeta (solo cuando `empty` es false). */
  insight_source: 'openai' | 'template' | null;
};

type MatchFeedbackRow = {
  match_id: string;
  reviewer_id: string;
  level_ratings: unknown;
  comment: string | null;
  created_at: string;
};

export type PeerRatingForPlayer = {
  perceived: -1 | 0 | 1;
  comment: string | null;
  reviewer_id: string;
  created_at: string;
};

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function parsePerceived(raw: unknown): -1 | 0 | 1 | null {
  const n = Number(raw);
  if (n === -1 || n === 0 || n === 1) return n;
  return null;
}

/** Extrae la valoración hacia `playerId` dentro de `level_ratings` de una fila. */
export function extractRatingForPlayerInRow(
  level_ratings: unknown,
  playerId: string
): { perceived: -1 | 0 | 1; comment: string | null } | null {
  if (!Array.isArray(level_ratings)) return null;
  for (const x of level_ratings) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    if (String(o.player_id ?? '') !== playerId) continue;
    const perceived = parsePerceived(o.perceived);
    if (perceived == null) continue;
    const c = o.comment;
    const comment =
      typeof c === 'string' && c.trim()
        ? clip(c, 400)
        : null;
    return { perceived, comment };
  }
  return null;
}

/**
 * Agrupa por `match_id` las valoraciones de compañeros hacia `playerId` y elige el partido
 * cuyo último feedback (cualquier compañero) sea el más reciente en el tiempo.
 * Por cada compañero (`reviewer_id`) queda como máximo una valoración (última fila si hubiera duplicados).
 */
export async function findLatestMatchPeerRatingsForPlayer(
  supabase: SupabaseClient,
  playerId: string
): Promise<{
  match_id: string;
  ratings: PeerRatingForPlayer[];
  lastFeedbackAt: string;
} | null> {
  const { data, error } = await supabase
    .from('match_feedback')
    .select('match_id, reviewer_id, level_ratings, comment, created_at')
    .neq('reviewer_id', playerId)
    .order('created_at', { ascending: false })
    .limit(400);

  if (error || !data?.length) return null;

  /** match_id -> (reviewer_id -> rating + ts de esa fila) */
  const perMatch = new Map<
    string,
    { byReviewer: Map<string, PeerRatingForPlayer>; lastAt: string }
  >();

  for (const raw of data) {
    const row = raw as MatchFeedbackRow;
    const mine = extractRatingForPlayerInRow(row.level_ratings, playerId);
    if (!mine) continue;

    const mid = row.match_id;
    const rating: PeerRatingForPlayer = {
      perceived: mine.perceived,
      comment: mine.comment,
      reviewer_id: row.reviewer_id,
      created_at: row.created_at,
    };

    let bucket = perMatch.get(mid);
    if (!bucket) {
      bucket = { byReviewer: new Map(), lastAt: row.created_at };
      perMatch.set(mid, bucket);
    }
    bucket.byReviewer.set(row.reviewer_id, rating);
    if (row.created_at > bucket.lastAt) bucket.lastAt = row.created_at;
  }

  let bestMatchId: string | null = null;
  let bestLastAt = '';
  for (const [mid, b] of perMatch) {
    if (b.lastAt > bestLastAt) {
      bestLastAt = b.lastAt;
      bestMatchId = mid;
    }
  }
  if (!bestMatchId) return null;

  const ratings = [...perMatch.get(bestMatchId)!.byReviewer.values()].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
  if (ratings.length === 0) return null;

  return { match_id: bestMatchId, ratings, lastFeedbackAt: bestLastAt };
}

function peerLabel(n: number): string {
  if (n <= 0) return 'Ningún compañero';
  if (n === 1) return 'Un compañero';
  if (n === 2) return 'Dos compañeros';
  return 'Tres compañeros';
}

function roundedSummaryPerceived(avg: number): -1 | 0 | 1 {
  if (avg > 0.34) return 1;
  if (avg < -0.34) return -1;
  return 0;
}

/** Tarjeta perfil a partir de 1–3 valoraciones `perceived` del mismo partido. */
export function buildPeerFeedbackInsightFromMultiple(ratings: PeerRatingForPlayer[]): {
  recommendation_ia: string;
  fortalezas: string[];
  a_mejorar: string[];
} {
  const nPlus = ratings.filter((r) => r.perceived === 1).length;
  const nZero = ratings.filter((r) => r.perceived === 0).length;
  const nMinus = ratings.filter((r) => r.perceived === -1).length;
  const n = ratings.length;
  const avg = n ? (nPlus * 1 + nZero * 0 + nMinus * -1) / n : 0;

  const comments = ratings.map((r) => r.comment).filter((c): c is string => Boolean(c && c.trim()));
  const uniqueComments = [...new Set(comments)];
  const joined =
    uniqueComments.length > 0
      ? clip(uniqueComments.join(' · '), 320)
      : null;
  const note = joined ? ` Comentarios de compañeros: «${joined}».` : '';

  const label = peerLabel(n);
  const distText = `${nPlus} por encima, ${nZero} acertado${nZero === 1 ? '' : 's'}, ${nMinus} por debajo.`;

  let recommendation_ia: string;
  let fortalezas: string[];
  let a_mejorar: string[];

  if (nMinus === 0 && nPlus === n && n > 0) {
    recommendation_ia = `${label} te valoraron por encima del nivel esperado en el mismo partido (${distText.slice(0, -1)}).${note} Refuerza la regularidad para sostener esa percepción en los siguientes encuentros.`;
    fortalezas = [
      'Consenso positivo del nivel mostrado a pares',
      'Impacto claro en la sensación de juego del grupo',
      'Buena base para exigirte en partidos más exigentes',
    ];
    a_mejorar = [
      'Evitar subir el riesgo innecesario cuando ya vas arriba',
      'Mantener la concentración en cierres de set',
      'Gestionar la carga física en partidos largos',
    ];
  } else if (nPlus === 0 && nMinus === n && n > 0) {
    recommendation_ia = `${label} percibieron tu nivel por debajo de lo esperado en el mismo partido (${distText.slice(0, -1)}).${note} Prioriza confianza en fundamentos y lectura de partido; suele haber margen de mejora rápida.`;
    fortalezas = [
      'Disposición a competir y a recibir feedback',
      'Punto de partida claro para trabajar objetivos concretos',
      'Mentalidad de mejora continua',
    ];
    a_mejorar = [
      'Refinar consistencia en golpes de alta exigencia',
      'Afinar posicionamiento y transiciones',
      'Gestionar la frustración en rachas negativas',
    ];
  } else if (nPlus === 0 && nMinus === 0 && nZero === n && n > 0) {
    recommendation_ia = `${label} te valoraron en línea con lo esperado (${distText.slice(0, -1)}).${note} Es un buen equilibrio: afina detalles para dar el siguiente salto.`;
    fortalezas = [
      'Percepción estable y alineada con el contexto',
      'Encaje correcto con el ritmo del partido',
      'Buen punto de partida para objetivos semanales',
    ];
    a_mejorar = [
      'Elegir 1–2 focos por semana (saque, volea, salida de pared…)',
      'Subir un escalón en intensidad mental en puntos decisivos',
      'Trabajar continuidad física en sets largos',
    ];
  } else {
    recommendation_ia = `${label} te dieron valoraciones distintas en el mismo partido (${distText} La media es ${avg.toFixed(2)}).${note} La lectura global es ${avg > 0.15 ? 'ligeramente positiva' : avg < -0.15 ? 'con margen de mejora' : 'equilibrada'}; úsalo para priorizar 1–2 hábitos en entreno.`;
    fortalezas =
      nPlus >= nMinus
        ? [
            'Hay señales claras de valoración positiva en parte del grupo',
            'Buen contexto para consolidar lo que ya funciona',
            'Aprovecha el feedback mixto para afinar matices',
          ]
        : [
            'Feedback honesto: buena base para ajustar expectativas',
            'Oportunidad de trabajar detalles concretos con foco',
            'Mentalidad de mejora ante valoraciones dispares',
          ];
    a_mejorar =
      nMinus > nPlus
        ? [
            'Reforzar consistencia en golpes bajo presión',
            'Mejorar lectura en transiciones y bloqueos',
            'Gestionar mejor la carga emocional en el set',
          ]
        : [
            'Sostener el nivel cuando el partido se aprieta',
            'Evitar forzar riesgos si ya sumas ventaja',
            'Cerrar mejor los puntos “fáciles”',
          ];
  }

  return { recommendation_ia, fortalezas, a_mejorar };
}

export async function getLastPeerFeedbackInsightForPlayer(
  supabase: SupabaseClient,
  playerId: string
): Promise<PeerFeedbackInsight> {
  const found = await findLatestMatchPeerRatingsForPlayer(supabase, playerId);
  if (!found || found.ratings.length === 0) {
    return {
      ok: true,
      empty: true,
      match_id: null,
      feedback_created_at: null,
      peer_count: 0,
      average_perceived: null,
      distribution: null,
      last_perceived: null,
      recommendation_ia: null,
      fortalezas: [],
      a_mejorar: [],
      insight_source: null,
    };
  }

  const { ratings, match_id, lastFeedbackAt } = found;
  const nPlus = ratings.filter((r) => r.perceived === 1).length;
  const nZero = ratings.filter((r) => r.perceived === 0).length;
  const nMinus = ratings.filter((r) => r.perceived === -1).length;
  const n = ratings.length;
  const avg = (nPlus * 1 + nZero * 0 + nMinus * -1) / n;

  const llmInput = {
    match_id,
    valoraciones: ratings.map((r) => ({ perceived: r.perceived, comment: r.comment })),
    distribution: { high: nPlus, mid: nZero, low: nMinus },
    average_perceived: Math.round(avg * 100) / 100,
  };

  const fromOpenAi = await generatePeerFeedbackCardWithOpenAI(llmInput);
  const card = fromOpenAi ?? buildPeerFeedbackInsightFromMultiple(ratings);
  const insight_source: 'openai' | 'template' = fromOpenAi ? 'openai' : 'template';

  return {
    ok: true,
    empty: false,
    match_id,
    feedback_created_at: lastFeedbackAt,
    peer_count: n,
    average_perceived: Math.round(avg * 100) / 100,
    distribution: { high: nPlus, mid: nZero, low: nMinus },
    last_perceived: roundedSummaryPerceived(avg),
    recommendation_ia: card.recommendation_ia,
    fortalezas: card.fortalezas,
    a_mejorar: card.a_mejorar,
    insight_source,
  };
}
