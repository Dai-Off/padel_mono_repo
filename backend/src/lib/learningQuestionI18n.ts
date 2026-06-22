// ---------------------------------------------------------------------------
// i18n del contenido de preguntas de lección diaria.
//
// El contenido BASE vive en learning_questions.content (y el árbol de puzzles
// en learning_puzzles); su idioma lo declara learning_questions.content_locale
// (no se asume español). Las traducciones al resto de idiomas viven en
// learning_questions.content_i18n, indexadas por locale, y contienen SOLO los
// campos de texto. Este módulo:
//   - localizeQuestionContent(): mergea la traducción del locale sobre el
//     contenido canónico, campo de texto a campo de texto, preservando SIEMPRE
//     la clave de respuesta (correct_index/correct_indices/correct_answer) y
//     toda la estructura no textual (frames de puzzle, ids, etc.).
//   - validateQuestionContentI18n(): valida el JSON entrante en POST/PUT para
//     que una traducción no pueda alterar la clave de respuesta ni romper la
//     paridad de longitudes de los arrays.
//
// Patrón reutilizable para otros módulos (coach IA, afinidad, badges...).
// ---------------------------------------------------------------------------

export type LocalizedContent = Record<string, unknown>;
export type ContentI18n = Record<string, LocalizedContent>;

// Idioma base por defecto cuando una pregunta no declara content_locale
// (datos creados antes de la columna). Coincide con el default de la columna.
export const DEFAULT_CONTENT_LOCALE = 'es';

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

// Etiqueta de idioma BCP-47 laxa (es, en, zh-HK, zh-CN, pt-BR...).
export function isValidLocaleTag(v: unknown): v is string {
  return typeof v === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(v.trim());
}

// Campos de texto traducibles por tipo. La clave de respuesta NO está aquí a
// propósito: nunca se sobreescribe desde una traducción.
const TEXT_ARRAY_FIELDS: Record<string, string[]> = {
  test_classic: ['options'],
  multi_select: ['options'],
  order_sequence: ['steps'],
};

/**
 * Devuelve `content` con los campos de texto reemplazados por su traducción al
 * `locale` pedido. Si el locale pedido coincide con `contentLocale` (idioma
 * base), no hay traducción para ese locale, o la traducción no es válida,
 * devuelve el contenido base tal cual (fallback seguro). Nunca toca la clave de
 * respuesta ni la estructura.
 */
export function localizeQuestionContent(
  type: string,
  content: LocalizedContent | null | undefined,
  contentLocale: string | null | undefined,
  contentI18n: ContentI18n | null | undefined,
  locale: string,
): LocalizedContent {
  const base = (content ?? {}) as LocalizedContent;
  const baseLocale = contentLocale || DEFAULT_CONTENT_LOCALE;
  if (!locale || locale === baseLocale) return base;
  if (!contentI18n || typeof contentI18n !== 'object') return base;

  const override = contentI18n[locale];
  if (!override || typeof override !== 'object' || Array.isArray(override)) return base;

  if (type === 'puzzle') return mergePuzzle(base, override);
  return mergeStandard(type, base, override);
}

function mergeStandard(type: string, base: LocalizedContent, ov: LocalizedContent): LocalizedContent {
  const out: LocalizedContent = { ...base };

  // Campos de texto simples comunes.
  if (isNonEmptyString(ov.question)) out.question = ov.question;
  if (isNonEmptyString(ov.statement)) out.statement = ov.statement;
  if (isNonEmptyString(ov.explanation)) out.explanation = ov.explanation;

  // Arrays de strings (options/steps): solo si la longitud coincide con el
  // canónico y todos los elementos son strings no vacíos.
  for (const field of TEXT_ARRAY_FIELDS[type] ?? []) {
    const ovArr = ov[field];
    const baseArr = base[field];
    if (
      Array.isArray(ovArr) &&
      Array.isArray(baseArr) &&
      ovArr.length === baseArr.length &&
      ovArr.every(isNonEmptyString)
    ) {
      out[field] = ovArr;
    }
  }

  // match_columns: pairs[{left,right}], merge texto a texto preservando orden.
  if (type === 'match_columns' && Array.isArray(ov.pairs) && Array.isArray(base.pairs) && ov.pairs.length === base.pairs.length) {
    out.pairs = (base.pairs as Array<Record<string, unknown>>).map((p, i) => {
      const op = (ov.pairs as Array<Record<string, unknown>>)[i] ?? {};
      return {
        ...p,
        left: isNonEmptyString(op.left) ? op.left : p.left,
        right: isNonEmptyString(op.right) ? op.right : p.right,
      };
    });
  }

  return out;
}

function mergePuzzle(base: LocalizedContent, ov: LocalizedContent): LocalizedContent {
  // Deep clone: vamos a reescribir texto anidado dentro de los frames, así que
  // no podemos compartir referencias con el content base. El árbol del puzzle es
  // JSON puro (sin funciones/fechas), así que clonar por JSON es seguro.
  const out: LocalizedContent = JSON.parse(JSON.stringify(base ?? {}));

  if (isNonEmptyString(ov.statement)) out.statement = ov.statement;

  // options[{ text, explanation }]: merge texto a texto, preservando id,
  // is_correct, frames y badge_position intactos.
  if (Array.isArray(ov.options) && Array.isArray(out.options) && ov.options.length === out.options.length) {
    (out.options as Array<Record<string, unknown>>).forEach((o, i) => {
      const oo = (ov.options as Array<Record<string, unknown>>)[i] ?? {};
      if (isNonEmptyString(oo.text)) o.text = oo.text;
      if (isNonEmptyString(oo.explanation)) o.explanation = oo.explanation;
    });
  }

  // frame_text: texto DENTRO de los frames (bocadillos de jugadores y shapes de
  // texto), indexado por una ruta estable. Solo se reemplaza si hay traducción.
  if (ov.frame_text && typeof ov.frame_text === 'object' && !Array.isArray(ov.frame_text)) {
    const map = ov.frame_text as Record<string, unknown>;
    walkPuzzleFrameTexts(out, (path, _current, set) => {
      const tr = map[path];
      if (isNonEmptyString(tr)) set(tr);
    });
  }

  return out;
}

// Recorre los nodos de texto traducibles dentro de los frames de un puzzle
// (bocadillos `speech_label` de jugadores y shapes de tipo texto/bocadillo/
// tagText de flecha). `visit(path, text, set)` permite leer y reemplazar in
// place. La ruta es estable mientras lo sean los ids de jugador/shape (el
// importador genera ids deterministas), así extracción y merge coinciden.
function walkPuzzleFrameTexts(
  content: LocalizedContent,
  visit: (path: string, text: string, set: (v: string) => void) => void,
): void {
  const c = content as Record<string, any>;
  const frames: Array<[string, any]> = [];
  if (c.initial_frame) frames.push(['initial', c.initial_frame]);
  if (c.intro_frame) frames.push(['intro', c.intro_frame]);
  for (const o of Array.isArray(c.options) ? c.options : []) {
    if (o && (o.id === 1 || o.id === 2 || o.id === 3)) {
      if (o.select_frame) frames.push([`opt.${o.id}.select`, o.select_frame]);
      if (o.confirmation_frame) frames.push([`opt.${o.id}.confirm`, o.confirmation_frame]);
    }
  }
  for (const [fk, f] of frames) {
    const players = Array.isArray(f.players) ? f.players : [];
    for (const p of players) {
      if (p && isNonEmptyString(p.speech_label)) {
        visit(`${fk}.player.${p.id}.speech_label`, p.speech_label, (v) => { p.speech_label = v; });
      }
    }
    const shapes = Array.isArray(f.shapes) ? f.shapes : [];
    shapes.forEach((s: any, i: number) => {
      if (!s) return;
      const sid = isNonEmptyString(s.id) ? s.id : `idx${i}`;
      if ((s.type === 'text' || s.type === 'speechbubble') && isNonEmptyString(s.text)) {
        visit(`${fk}.shape.${sid}.text`, s.text, (v) => { s.text = v; });
      }
      if (s.type === 'arrow' && isNonEmptyString(s.tagText)) {
        visit(`${fk}.shape.${sid}.tagText`, s.tagText, (v) => { s.tagText = v; });
      }
    });
  }
}

// Extrae las cadenas de texto traducibles de los frames de un puzzle, como
// mapa ruta -> texto original. Lo usa el importador para preparar la traducción.
export function extractPuzzleFrameTexts(content: LocalizedContent): Record<string, string> {
  const out: Record<string, string> = {};
  walkPuzzleFrameTexts(content, (path, text) => { out[path] = text; });
  return out;
}

// ---------------------------------------------------------------------------
// Validación de content_i18n entrante (POST/PUT)
// ---------------------------------------------------------------------------

// Claves prohibidas: la clave de respuesta nunca puede venir en una traducción.
const FORBIDDEN_KEYS = new Set(['correct_index', 'correct_indices', 'correct_answer', 'is_correct']);

/**
 * Valida el objeto `content_i18n` recibido en POST/PUT. Devuelve un mensaje de
 * error o null si es válido. Reglas:
 *   - Debe ser un objeto { [locale]: { ...campos de texto } }.
 *   - No admite el locale base (`contentLocale`): ese idioma ya vive en content.
 *   - Ninguna traducción puede traer la clave de respuesta.
 *   - Si el base tiene arrays de texto (options/steps/pairs/options de puzzle),
 *     la traducción debe respetar la misma longitud.
 * Validación tolerante con campos ausentes (una traducción parcial es válida:
 * los campos no traducidos caen al base al servir).
 */
export function validateQuestionContentI18n(
  type: string,
  content: unknown,
  contentI18n: unknown,
  contentLocale?: string | null,
): string | null {
  if (contentI18n === undefined || contentI18n === null) return null;
  if (typeof contentI18n !== 'object' || Array.isArray(contentI18n)) {
    return 'content_i18n debe ser un objeto { [locale]: { ...textos } }';
  }

  const baseLocale = contentLocale || DEFAULT_CONTENT_LOCALE;
  const base = (content && typeof content === 'object' && !Array.isArray(content) ? content : {}) as LocalizedContent;

  for (const [locale, override] of Object.entries(contentI18n as Record<string, unknown>)) {
    if (locale === baseLocale) {
      return `content_i18n no admite el locale base '${baseLocale}' (ese idioma va en content)`;
    }
    if (!override || typeof override !== 'object' || Array.isArray(override)) {
      return `content_i18n['${locale}'] debe ser un objeto`;
    }
    const ov = override as LocalizedContent;

    for (const key of Object.keys(ov)) {
      if (FORBIDDEN_KEYS.has(key)) {
        return `content_i18n['${locale}'] no puede incluir la clave de respuesta '${key}'`;
      }
    }

    const err = validateOverrideShape(type, base, ov, locale);
    if (err) return err;
  }

  return null;
}

function validateOverrideShape(type: string, base: LocalizedContent, ov: LocalizedContent, locale: string): string | null {
  const checkStringArray = (field: string): string | null => {
    if (ov[field] === undefined) return null;
    if (!Array.isArray(ov[field]) || !(ov[field] as unknown[]).every(isNonEmptyString)) {
      return `content_i18n['${locale}'].${field} debe ser un array de strings no vacíos`;
    }
    if (Array.isArray(base[field]) && (ov[field] as unknown[]).length !== (base[field] as unknown[]).length) {
      return `content_i18n['${locale}'].${field} debe tener la misma longitud que content.${field}`;
    }
    return null;
  };

  switch (type) {
    case 'test_classic':
    case 'multi_select':
      return checkStringArray('options');
    case 'order_sequence':
      return checkStringArray('steps');
    case 'match_columns': {
      if (ov.pairs === undefined) return null;
      if (!Array.isArray(ov.pairs)) return `content_i18n['${locale}'].pairs debe ser un array`;
      if (Array.isArray(base.pairs) && (ov.pairs as unknown[]).length !== (base.pairs as unknown[]).length) {
        return `content_i18n['${locale}'].pairs debe tener la misma longitud que content.pairs`;
      }
      return null;
    }
    case 'puzzle': {
      if (ov.frame_text !== undefined) {
        if (typeof ov.frame_text !== 'object' || Array.isArray(ov.frame_text)) {
          return `content_i18n['${locale}'].frame_text debe ser un objeto { ruta: texto }`;
        }
        for (const [k, v] of Object.entries(ov.frame_text as Record<string, unknown>)) {
          if (typeof v !== 'string') return `content_i18n['${locale}'].frame_text['${k}'] debe ser un string`;
        }
      }
      if (ov.options === undefined) return null;
      if (!Array.isArray(ov.options)) return `content_i18n['${locale}'].options debe ser un array`;
      if (Array.isArray(base.options) && (ov.options as unknown[]).length !== (base.options as unknown[]).length) {
        return `content_i18n['${locale}'].options debe tener la misma longitud que content.options`;
      }
      return null;
    }
    default:
      return null;
  }
}
