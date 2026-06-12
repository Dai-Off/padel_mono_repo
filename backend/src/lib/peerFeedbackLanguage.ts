/**
 * Locale para la tarjeta Coach IA (peer feedback).
 * Por defecto `es` — mismo comportamiento que antes si el cliente no envía idioma.
 */

export const DEFAULT_PEER_FEEDBACK_LOCALE = 'es';

/** Idiomas con prompt explícito; otros BCP-47 válidos usan plantilla genérica en OpenAI. */
export const KNOWN_PEER_FEEDBACK_LOCALES = ['es', 'en', 'zh-HK'] as const;
export type KnownPeerFeedbackLocale = (typeof KNOWN_PEER_FEEDBACK_LOCALES)[number];

function normalizeLocaleToken(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const lower = t.toLowerCase().replace(/_/g, '-');
  if (lower === 'es' || lower.startsWith('es-')) return 'es';
  if (lower === 'en' || lower.startsWith('en-')) return 'en';
  if (lower === 'zh-hk') return 'zh-HK';
  if (lower === 'zh' || lower.startsWith('zh-')) return 'zh-HK';
  if (/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(t)) return t.replace(/_/g, '-');
  return null;
}

/** Primera etiqueta de Accept-Language (sin q-values). */
function parseAcceptLanguage(header: string | null | undefined): string | null {
  if (!header?.trim()) return null;
  const first = header.split(',')[0]?.trim();
  if (!first) return null;
  const tag = first.split(';')[0]?.trim();
  return tag ? normalizeLocaleToken(tag) : null;
}

/**
 * Resuelve locale desde query `?lang=` (prioridad) o cabecera Accept-Language.
 * Sin valor válido → `es`.
 */
export function parsePeerFeedbackLocale(
  queryLang?: string | string[] | null,
  acceptLanguage?: string | null
): string {
  const rawQuery = Array.isArray(queryLang) ? queryLang[0] : queryLang;
  const fromQuery = typeof rawQuery === 'string' ? normalizeLocaleToken(rawQuery) : null;
  if (fromQuery) return fromQuery;

  const fromHeader = parseAcceptLanguage(acceptLanguage);
  if (fromHeader) return fromHeader;

  return DEFAULT_PEER_FEEDBACK_LOCALE;
}

const JSON_SCHEMA_INSTRUCTIONS = [
  'Responde SOLO un objeto JSON (sin markdown ni texto fuera del JSON) con exactamente estas claves:',
  '- "recommendation_ia": string, un solo párrafo (2-4 frases) que sintetice el feedback del último partido y oriente al siguiente paso.',
  '- "fortalezas": array de exactamente 3 strings, cada uno una frase corta (máx. ~120 caracteres).',
  '- "a_mejorar": array de exactamente 3 strings, cada uno una frase corta (máx. ~120 caracteres).',
  'Basa las listas en las valoraciones numéricas y en los comentarios si existen; no inventes hechos concretos que no aparezcan en los datos (puedes generalizar a técnica/táctica/físico/mental).',
  'No menciones UUIDs ni "OpenAI". No uses comillas tipográficas raras dentro de los strings.',
  'No uses emojis, iconos ni símbolos decorativos.',
].join(' ');

const PROMPTS: Record<KnownPeerFeedbackLocale, string[]> = {
  es: [
    'Eres un coach de pádel para jugadores amateur/intermedio en España.',
    'Tienes que generar contenido en español, tono natural, cercano y profesional.',
    'Evita lenguaje grandilocuente, frases de marketing y estilo robótico.',
    JSON_SCHEMA_INSTRUCTIONS,
  ],
  en: [
    'You are a padel coach for amateur and intermediate players.',
    'Generate all content in English: natural, friendly and professional tone.',
    'Avoid marketing language, grandiose phrases and robotic style.',
    JSON_SCHEMA_INSTRUCTIONS,
  ],
  'zh-HK': [
    '你係一位面向業餘同中級球員嘅網球（padel）教練。',
    '請用繁體中文（香港口語可接受）生成所有內容，語氣自然、親切、專業。',
    '避免誇張宣傳語、生硬機械式表達。',
    JSON_SCHEMA_INSTRUCTIONS,
  ],
};

export function buildPeerFeedbackSystemPrompt(locale: string): string {
  const known = KNOWN_PEER_FEEDBACK_LOCALES.find((l) => l === locale) as
    | KnownPeerFeedbackLocale
    | undefined;
  if (known) return PROMPTS[known].join(' ');

  return [
    'You are a padel coach for amateur and intermediate players.',
    `Generate all text fields in the language/locale "${locale}" (BCP-47). Use a natural, friendly and professional tone.`,
    'Avoid marketing language and robotic style.',
    JSON_SCHEMA_INSTRUCTIONS,
  ].join(' ');
}

export function buildPeerFeedbackUserContext(locale: string): string {
  const known = KNOWN_PEER_FEEDBACK_LOCALES.find((l) => l === locale) as
    | KnownPeerFeedbackLocale
    | undefined;

  if (known === 'en') {
    return 'Post-match padel feedback: each teammate rated the player with perceived -1 (below expected level), 0 (on par), 1 (above). They may have left a short optional comment.';
  }
  if (known === 'zh-HK') {
    return '賽後網球（padel）隊友評價：每位隊友以 perceived -1（低於預期）、0（符合）、1（高於）評分；可選短評論。';
  }
  return 'Feedback post-partido de pádel: cada compañero valoró al jugador con perceived -1 (por debajo del nivel esperado), 0 (acertado), 1 (por encima). Opcionalmente dejaron un comentario corto.';
}
