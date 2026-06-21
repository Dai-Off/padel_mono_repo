import { Request } from 'express';

/**
 * Resolutor de locale compartido para toda la API.
 *
 * Único punto de entrada para que cualquier endpoint que sirva contenido
 * traducido (lecciones diarias, coach IA, afinidad, badges...) resuelva el
 * idioma del jugador de forma consistente:
 *   1. query `?lang=` (prioridad)
 *   2. cabecera `Accept-Language`
 *   3. fallback `es`
 *
 * IMPORTANTE: a diferencia del parser de peer feedback (que colapsa cualquier
 * `zh-*` a `zh-HK` porque solo soporta tradicional), aquí PRESERVAMOS las
 * variantes de chino (zh-HK tradicional HK, zh-CN simplificado, zh-TW
 * tradicional Taiwán) porque el contenido se traduce a cada una por separado.
 * El resto de idiomas se colapsan a su subtag primario (es-ES → es, en-GB → en),
 * que es la granularidad con la que se guardan las traducciones.
 */
export const DEFAULT_LOCALE = 'es';

// Mapa script chino → región usada como clave de traducción.
const ZH_SCRIPT_TO_REGION: Record<string, string> = {
  HANT: 'HK', // tradicional → HK por defecto
  HANS: 'CN', // simplificado → CN
};

function normalizeLocaleToken(raw: string): string | null {
  const t = raw.trim().replace(/_/g, '-');
  if (!t) return null;

  // language [- script] [- region] (ignoramos subtags posteriores)
  const m = /^([a-zA-Z]{2,3})(?:-([a-zA-Z]{4}))?(?:-([a-zA-Z]{2}|\d{3}))?/.exec(t);
  if (!m) return null;

  const lang = m[1].toLowerCase();
  const script = m[2] ? m[2].toUpperCase() : null;
  const region = m[3] ? m[3].toUpperCase() : null;

  if (lang === 'zh') {
    // Prioridad: región explícita > script conocido > default tradicional HK.
    if (region) return `zh-${region}`;
    if (script && ZH_SCRIPT_TO_REGION[script]) return `zh-${ZH_SCRIPT_TO_REGION[script]}`;
    return 'zh-HK';
  }

  // Resto de idiomas: subtag primario (es, en, fr...).
  return lang;
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
 * Resuelve el locale de una request: query `?lang=` (prioridad), luego
 * `Accept-Language`, con fallback a `es`.
 */
export function resolveLocale(req: Request): string {
  const rawQuery = req.query?.lang;
  const queryStr = Array.isArray(rawQuery) ? rawQuery[0] : rawQuery;
  const fromQuery = typeof queryStr === 'string' ? normalizeLocaleToken(queryStr) : null;
  if (fromQuery) return fromQuery;

  const fromHeader = parseAcceptLanguage(req.headers?.['accept-language'] as string | undefined);
  if (fromHeader) return fromHeader;

  return DEFAULT_LOCALE;
}
