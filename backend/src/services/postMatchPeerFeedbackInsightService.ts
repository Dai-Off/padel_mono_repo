import type { SupabaseClient } from '@supabase/supabase-js';

import { generatePeerFeedbackCardWithOpenAI } from '../lib/openaiPeerFeedbackInsight';
import { DEFAULT_PEER_FEEDBACK_LOCALE } from '../lib/peerFeedbackLanguage';

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
  /** Locale BCP-47 usado para generar el texto (`es` por defecto). */
  locale: string;
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

function stripEmoji(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
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
        ? clip(stripEmoji(c), 400)
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
  const note = joined ? ` Comentarios de compañeros: «${stripEmoji(joined)}».` : '';

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

export type GetLastPeerFeedbackInsightOptions = {
  /** Query `lang` o Accept-Language ya parseado; si se omite, se usa `es`. */
  locale?: string;
};

export async function getLastPeerFeedbackInsightForPlayer(
  supabase: SupabaseClient,
  playerId: string,
  options: GetLastPeerFeedbackInsightOptions = {}
): Promise<PeerFeedbackInsight> {
  const locale = options.locale?.trim() || DEFAULT_PEER_FEEDBACK_LOCALE;
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
      locale,
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
    locale,
  };

  const fromOpenAi = await generatePeerFeedbackCardWithOpenAI(llmInput);
  const card = fromOpenAi ?? buildPeerFeedbackInsightFromMultiple(ratings);
  const insight_source: 'openai' | 'template' = fromOpenAi ? 'openai' : 'template';
  const sanitizedRecommendation = stripEmoji(card.recommendation_ia);
  const sanitizedStrengths = card.fortalezas.map(stripEmoji).filter(Boolean).slice(0, 3);
  const sanitizedImprovements = card.a_mejorar.map(stripEmoji).filter(Boolean).slice(0, 3);

  return {
    ok: true,
    empty: false,
    match_id,
    feedback_created_at: lastFeedbackAt,
    peer_count: n,
    average_perceived: Math.round(avg * 100) / 100,
    distribution: { high: nPlus, mid: nZero, low: nMinus },
    last_perceived: roundedSummaryPerceived(avg),
    recommendation_ia: sanitizedRecommendation,
    fortalezas: sanitizedStrengths,
    a_mejorar: sanitizedImprovements,
    insight_source,
    locale,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache por (player_id, locale). La generación (arriba) llama a OpenAI, así que
// NO debe estar en la ruta crítica de apertura del perfil. La apertura lee la
// cache (1 query); la generación ocurre por evento (feedback nuevo) o, como
// mucho, la primera vez que se ve a un jugador en un idioma sin cache.
// ─────────────────────────────────────────────────────────────────────────────

function emptyPeerFeedbackInsight(locale: string): PeerFeedbackInsight {
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
    locale,
  };
}

function mapRowToInsight(row: Record<string, unknown>): PeerFeedbackInsight {
  const avg = row.average_perceived;
  return {
    ok: true,
    empty: Boolean(row.empty),
    match_id: (row.match_id as string | null) ?? null,
    feedback_created_at: (row.feedback_created_at as string | null) ?? null,
    peer_count: Number(row.peer_count ?? 0),
    average_perceived: avg == null ? null : Number(avg),
    distribution: (row.distribution as PeerFeedbackInsight['distribution']) ?? null,
    last_perceived: (row.last_perceived as -1 | 0 | 1 | null) ?? null,
    recommendation_ia: (row.recommendation_ia as string | null) ?? null,
    fortalezas: (row.fortalezas as string[] | null) ?? [],
    a_mejorar: (row.a_mejorar as string[] | null) ?? [],
    insight_source: (row.insight_source as 'openai' | 'template' | null) ?? null,
    locale: String(row.locale),
  };
}

/** Persiste (upsert) el insight ya generado en la cache. Best-effort: no lanza. */
export async function storePeerFeedbackInsight(
  supabase: SupabaseClient,
  playerId: string,
  insight: PeerFeedbackInsight
): Promise<void> {
  const { error } = await supabase.from('player_peer_feedback_insight').upsert(
    {
      player_id: playerId,
      locale: insight.locale,
      empty: insight.empty,
      match_id: insight.match_id,
      feedback_created_at: insight.feedback_created_at,
      peer_count: insight.peer_count,
      average_perceived: insight.average_perceived,
      distribution: insight.distribution,
      last_perceived: insight.last_perceived,
      recommendation_ia: insight.recommendation_ia,
      fortalezas: insight.fortalezas,
      a_mejorar: insight.a_mejorar,
      insight_source: insight.insight_source,
      generated_at: new Date().toISOString(),
    },
    { onConflict: 'player_id,locale' }
  );
  if (error) console.error('[storePeerFeedbackInsight]', error.message);
}

/** Genera el insight (llama a OpenAI/template) y lo guarda en cache. Devuelve el insight. */
export async function computeAndStorePeerFeedbackInsight(
  supabase: SupabaseClient,
  playerId: string,
  locale?: string
): Promise<PeerFeedbackInsight> {
  const insight = await getLastPeerFeedbackInsightForPlayer(supabase, playerId, { locale });
  await storePeerFeedbackInsight(supabase, playerId, insight);
  return insight;
}

/**
 * Lectura para la ruta crítica: sirve el insight cacheado (sin OpenAI y sin
 * bloquear). Si no hay cache para ese idioma todavía, devuelve VACÍO al instante
 * y dispara la generación en background (fire-and-forget): aparecerá cacheado en
 * la siguiente apertura. Así OpenAI nunca está en el camino de una lectura.
 */
export async function getCachedPeerFeedbackInsight(
  supabase: SupabaseClient,
  playerId: string,
  options: GetLastPeerFeedbackInsightOptions = {}
): Promise<PeerFeedbackInsight> {
  const locale = options.locale?.trim() || DEFAULT_PEER_FEEDBACK_LOCALE;
  const { data: row } = await supabase
    .from('player_peer_feedback_insight')
    .select('*')
    .eq('player_id', playerId)
    .eq('locale', locale)
    .maybeSingle();
  if (row) return mapRowToInsight(row as Record<string, unknown>);
  void computeAndStorePeerFeedbackInsight(supabase, playerId, locale).catch((e) =>
    console.error('[getCachedPeerFeedbackInsight] bg gen', e instanceof Error ? e.message : e)
  );
  return emptyPeerFeedbackInsight(locale);
}

/**
 * Write-through por evento: al llegar feedback nuevo, regenera la cache de los
 * idiomas ya presentes para ese jugador (los que alguien ha abierto). Si aún no
 * hay ninguno, no hace nada (se generará perezosamente en la primera lectura).
 * Best-effort: no lanza. Fire-and-forget desde el submit de feedback.
 */
export async function refreshCachedPeerFeedbackInsightForPlayer(
  supabase: SupabaseClient,
  playerId: string
): Promise<void> {
  const { data: rows } = await supabase
    .from('player_peer_feedback_insight')
    .select('locale')
    .eq('player_id', playerId);
  const locales = [...new Set((rows ?? []).map((r) => String((r as { locale: string }).locale)))];
  await Promise.all(
    locales.map((loc) =>
      computeAndStorePeerFeedbackInsight(supabase, playerId, loc).catch((e) =>
        console.error('[refreshCachedPeerFeedbackInsight]', playerId, loc, e instanceof Error ? e.message : e)
      )
    )
  );
}

