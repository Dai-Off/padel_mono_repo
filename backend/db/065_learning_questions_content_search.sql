-- ============================================================================
-- 065_learning_questions_content_search.sql
--
-- Añade una columna generada `content_search` que es la representación text
-- de `content` (jsonb). Sirve para poder usar ILIKE sobre el contenido en
-- los listados (Supabase JS / PostgREST no soportan bien el cast inline
-- `content::text` en filtros, así que la materializamos como columna).
--
-- STORED para que se pueda indexar; pequeño coste de espacio que vale la
-- pena por la búsqueda. Si el volumen crece, añadir un índice GIN sobre
-- content_search para acelerar el ILIKE.
--
-- Idempotente.
-- ============================================================================

BEGIN;

ALTER TABLE public.learning_questions
  ADD COLUMN IF NOT EXISTS content_search text GENERATED ALWAYS AS (content::text) STORED;

COMMENT ON COLUMN public.learning_questions.content_search IS
  'Representación text de content (jsonb), generada automáticamente. Para búsqueda ILIKE.';

COMMIT;
