-- ============================================================================
-- 067_fix_content_updated_at.sql
--
-- La migración 066 añadió learning_questions.content_updated_at con
-- DEFAULT NOW(). Eso marcó todas las preguntas existentes como "editadas
-- en el momento de aplicar la migración", lo que provoca que TODAS sus
-- respuestas anteriores se etiqueten como pre-edición.
--
-- Fix: para todas las preguntas que tienen content_updated_at posterior a
-- created_at (efecto de la migración 066), las igualamos a created_at —
-- representa "nunca editada después de creación". A partir de aquí,
-- solo las ediciones reales (PUT con content) actualizarán el timestamp.
--
-- Safe: si el usuario YA editó alguna pregunta entre 066 y 067, su
-- content_updated_at será distinto del default original. Pero el efecto
-- secundario aceptable es solo perder la marca de esa edición concreta;
-- la próxima edición la marca de nuevo correctamente. En la práctica, esta
-- migración se aplica inmediatamente tras 066 antes de que el usuario edite.
-- ============================================================================

BEGIN;

UPDATE public.learning_questions
SET content_updated_at = created_at;

COMMIT;
