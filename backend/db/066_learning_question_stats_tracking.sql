-- ============================================================================
-- 066_learning_question_stats_tracking.sql
--
-- Dos columnas para soportar estadísticas detalladas por pregunta:
--
--   1. learning_question_log.selected_answer (jsonb, NULLABLE)
--      Guarda la respuesta exacta del jugador (índice, boolean, array según
--      tipo de pregunta). Permite calcular distribución de respuestas en el
--      modal de stats. Para logs anteriores a esta migración queda NULL.
--
--   2. learning_questions.content_updated_at (timestamptz)
--      Marca de tiempo de la última edición del `content` (o del árbol del
--      puzzle). Las stats por pregunta filtran logs con
--      answered_at >= content_updated_at para que la distribución refleje
--      la versión actual del contenido, no versiones antiguas.
--
-- Default NOW() para preguntas existentes: efectivamente reseteamos las
-- stats por pregunta desde el momento de aplicar la migración. No podemos
-- distinguir las preguntas que no se han editado de las que sí, así que
-- partimos limpio.
--
-- Ambas aditivas. Idempotente.
-- ============================================================================

BEGIN;

ALTER TABLE public.learning_question_log
  ADD COLUMN IF NOT EXISTS selected_answer jsonb;

ALTER TABLE public.learning_questions
  ADD COLUMN IF NOT EXISTS content_updated_at timestamptz NOT NULL DEFAULT NOW();

COMMENT ON COLUMN public.learning_question_log.selected_answer IS
  'Respuesta concreta del jugador (jsonb). NULL en logs pre-migración 066.';

COMMENT ON COLUMN public.learning_questions.content_updated_at IS
  'Última edición del content. Las stats filtran logs anteriores a esta fecha.';

COMMIT;
