-- ============================================================================
-- 062_learning_questions_moderation.sql
--
-- Añade dos columnas a learning_questions para soportar moderación admin:
--
--   - moderation_notes (text, NULLABLE): notas escritas por un admin que el
--     club ve al editar/ver su pregunta. Solo se rellena si el admin marca
--     "Avisar al club" en el modal de moderación. NULL = sin nota visible.
--
--   - last_admin_edit_at (timestamptz, NULLABLE): timestamp de la última vez
--     que un admin editó la pregunta (independientemente del checkbox).
--     Permite distinguir si el último editor fue un admin sin exponerlo
--     directamente en moderation_notes.
--
-- Ambas columnas son aditivas y NULLABLE: cero impacto en preguntas existentes.
-- Idempotente.
-- ============================================================================

BEGIN;

ALTER TABLE public.learning_questions
  ADD COLUMN IF NOT EXISTS moderation_notes text,
  ADD COLUMN IF NOT EXISTS last_admin_edit_at timestamptz;

COMMENT ON COLUMN public.learning_questions.moderation_notes IS
  'Nota visible al club, escrita por un admin durante moderación. NULL = sin aviso.';

COMMENT ON COLUMN public.learning_questions.last_admin_edit_at IS
  'Timestamp de la última edición por un admin (server-side). Independiente de moderation_notes.';

COMMIT;
