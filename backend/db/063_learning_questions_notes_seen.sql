-- ============================================================================
-- 063_learning_questions_notes_seen.sql
--
-- Añade `notes_seen_at` (timestamptz, NULLABLE) a learning_questions para
-- saber si el club ya ha visto la nota de moderación del admin.
--
-- Lógica de "nota no vista" (calculada client-side):
--   moderation_notes IS NOT NULL
--   AND (notes_seen_at IS NULL OR notes_seen_at < last_admin_edit_at)
--
-- Cuando el club abre el modal de edición de una pregunta con nota no vista,
-- el cliente llama a PATCH /learning/questions/:id/acknowledge-notes que
-- escribe notes_seen_at = NOW().
--
-- Aditiva y NULLABLE: las preguntas existentes con moderation_notes = NULL
-- no requieren backfill (no hay nada que marcar como visto). Las que ya
-- tuvieran una nota previa empezarían con notes_seen_at NULL → quedarían
-- como "no vistas" en el próximo render. Aceptable porque la 062 acaba de
-- entrar en producción y aún no hay notas reales.
--
-- Idempotente.
-- ============================================================================

BEGIN;

ALTER TABLE public.learning_questions
  ADD COLUMN IF NOT EXISTS notes_seen_at timestamptz;

COMMENT ON COLUMN public.learning_questions.notes_seen_at IS
  'Última vez que el club abrió la pregunta y vio la nota de moderación. NULL = nunca abierta tras recibir nota.';

COMMIT;
