/**
 * Genera la tarjeta «Recomendación IA / Fortalezas / A mejorar» vía OpenAI Chat Completions.
 * Sin dependencia npm: usa `fetch`.
 */

import {
  DEFAULT_PEER_FEEDBACK_LOCALE,
  buildPeerFeedbackSystemPrompt,
  buildPeerFeedbackUserContext,
} from './peerFeedbackLanguage';

export type PeerFeedbackLlmInput = {
  match_id: string;
  /** Solo perceived y comentario opcional por compañero (sin IDs). */
  valoraciones: Array<{ perceived: -1 | 0 | 1; comment: string | null }>;
  distribution: { high: number; mid: number; low: number };
  average_perceived: number;
  /** BCP-47; por defecto `es` (comportamiento histórico). */
  locale?: string;
};

export type PeerFeedbackLlmOutput = {
  recommendation_ia: string;
  fortalezas: string[];
  a_mejorar: string[];
};

function getApiKey(): string | null {
  const k = process.env.OPENAI_API_KEY?.trim();
  return k || null;
}

export function getOpenAiModel(): string {
  return process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
}

function normalizeStringList(arr: unknown, len: number): string[] | null {
  if (!Array.isArray(arr)) return null;
  const out = arr
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean)
    .slice(0, len);
  if (out.length !== len) return null;
  return out;
}

function stripEmoji(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseJsonFromAssistantContent(raw: string): Record<string, unknown> | null {
  const t = raw.trim();
  if (!t) return null;
  const noFence = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(noFence) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Llama a OpenAI. Devuelve `null` si no hay API key, error HTTP o JSON inválido.
 */
export async function generatePeerFeedbackCardWithOpenAI(
  input: PeerFeedbackLlmInput
): Promise<PeerFeedbackLlmOutput | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const model = getOpenAiModel();
  const locale = input.locale?.trim() || DEFAULT_PEER_FEEDBACK_LOCALE;
  const userPayload = {
    locale,
    contexto: buildPeerFeedbackUserContext(locale),
    datos: input,
  };

  const system = buildPeerFeedbackSystemPrompt(locale);

  const user = JSON.stringify(userPayload);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.45,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('[openai peer feedback]', res.status, errText.slice(0, 500));
      return null;
    }

    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return null;

    const parsed = parseJsonFromAssistantContent(content);
    if (!parsed) return null;

    const rec =
      typeof parsed.recommendation_ia === 'string'
        ? stripEmoji(parsed.recommendation_ia)
        : typeof parsed.recommendationIA === 'string'
          ? stripEmoji(parsed.recommendationIA)
          : '';
    if (!rec) return null;

    const fortalezasRaw = normalizeStringList(parsed.fortalezas, 3);
    const aMejorarRaw = normalizeStringList(parsed.a_mejorar ?? parsed.aMejorar, 3);
    const fortalezas = fortalezasRaw?.map(stripEmoji).filter(Boolean) ?? null;
    const a_mejorar = aMejorarRaw?.map(stripEmoji).filter(Boolean) ?? null;
    if (!fortalezas || !a_mejorar) return null;

    return {
      recommendation_ia: rec,
      fortalezas,
      a_mejorar,
    };
  } catch (e) {
    console.warn('[openai peer feedback]', e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
