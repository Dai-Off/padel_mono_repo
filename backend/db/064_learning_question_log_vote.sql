-- ============================================================================
-- 064_learning_question_log_vote.sql
--
-- Añade `vote` (text NULLABLE) a learning_question_log para que el jugador
-- pueda valorar cada pregunta tras una lección diaria con like / dislike.
--
-- Valores permitidos: 'up', 'down' o NULL (sin voto).
--
-- El voto se aplica al log más reciente del jugador para esa pregunta. Si el
-- jugador ve la pregunta varias veces en distintas sesiones, cada log puede
-- tener su voto. Para las métricas globales (% de like) se contará el último
-- voto por (jugador, pregunta) para no sobre-pesar usuarios recurrentes.
--
-- Aditivo y NULLABLE: cero impacto en filas existentes. Idempotente.
-- ============================================================================

BEGIN;

ALTER TABLE public.learning_question_log
  ADD COLUMN IF NOT EXISTS vote text;

-- El CHECK constraint lo añadimos por separado para que la migración sea
-- robusta a runs múltiples (ADD CONSTRAINT IF NOT EXISTS no existe en
-- versiones antiguas de postgres; usamos un DO con information_schema).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_schema = 'public'
      AND table_name = 'learning_question_log'
      AND constraint_name = 'learning_question_log_vote_chk'
  ) THEN
    ALTER TABLE public.learning_question_log
      ADD CONSTRAINT learning_question_log_vote_chk
      CHECK (vote IS NULL OR vote IN ('up', 'down'));
  END IF;
END$$;

COMMENT ON COLUMN public.learning_question_log.vote IS
  'Valoración del jugador para esta pregunta en esta sesión: up / down / NULL.';

COMMIT;
