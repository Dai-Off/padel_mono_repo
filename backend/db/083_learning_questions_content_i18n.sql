-- ============================================================================
-- 083_learning_questions_content_i18n.sql
--
-- Añade `content_locale` y `content_i18n` a learning_questions para soportar
-- contenido multiidioma en las preguntas de lección diaria.
--
-- Convención (reutilizable para otros módulos: coach IA, afinidad, badges...):
--   - `content` es el contenido BASE / fuente de verdad (incluye la clave de
--     respuesta: correct_index/correct_indices/correct_answer). Su idioma NO se
--     asume: lo declara `content_locale` (default 'es' para datos existentes).
--   - `content_i18n` guarda SOLO los campos de TEXTO traducidos a los OTROS
--     idiomas, indexados por locale BCP-47. NUNCA contiene la clave de
--     respuesta: el corrector server-side siempre usa `content`, así una
--     traducción no puede romper qué respuesta es la correcta.
--   - Una pregunta puede crearse en cualquier idioma base (p. ej. zh-HK) y
--     tener traducciones al resto en content_i18n.
--
-- Forma del JSON (los campos varían según el tipo de pregunta):
--   {
--     "zh-HK": { "question": "...", "options": ["...","...","...","..."], "explanation": "..." },
--     "zh-CN": { ... },
--     "en":    { ... }
--   }
-- Para puzzles: { "<locale>": { "statement": "...", "options": [{ "text": "...", "explanation": "..." }] } }
--
-- Al servir (GET /daily-lesson, today-results) el backend: si el idioma pedido
-- == content_locale devuelve `content`; si no, mergea `content_i18n[locale]`
-- sobre `content`, con fallback al base si falta la traducción.
-- Ver backend/src/lib/learningQuestionI18n.ts.
--
-- Idempotente.
-- ============================================================================

BEGIN;

ALTER TABLE public.learning_questions
  ADD COLUMN IF NOT EXISTS content_locale text NOT NULL DEFAULT 'es';

ALTER TABLE public.learning_questions
  ADD COLUMN IF NOT EXISTS content_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.learning_questions.content_locale IS
  'Idioma (locale BCP-47) en el que está escrito el content base. Default es. Las traducciones al resto de idiomas van en content_i18n.';

COMMENT ON COLUMN public.learning_questions.content_i18n IS
  'Traducciones de los campos de TEXTO de content a OTROS idiomas (ej. zh-HK, zh-CN, en), indexadas por locale. Nunca incluye la clave de respuesta ni el propio content_locale.';

COMMIT;
