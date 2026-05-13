-- 058_learning_puzzles_v2.sql
-- Migración del schema de puzzles tácticos a v2 (formato del catálogo importado):
--   - Cada opción tiene `is_correct: boolean` en lugar de `points: 0|1|2`.
--   - Cada opción tiene `select_frame` + `confirmation_frame` en lugar de un único `reveal_frame`.
--   - Las shapes adoptan el formato del kit (circle/arrow/rect/line/text/triangle).
--   - El campo `general_explanation` desaparece (nunca se usó en el visor).
--
-- Decisión del usuario: los puzzles existentes son seeds de test, se borran
-- completamente. No hay migración de datos.

-- 1. Borrar puzzles existentes. CASCADE en learning_puzzles vía question_id elimina
--    las filas dependientes automáticamente.
delete from public.learning_questions where type = 'puzzle';

-- 2. Bump del default de schema_version a 2.
alter table public.learning_puzzles alter column schema_version set default 2;

-- 3. Drop columna obsoleta general_explanation.
alter table public.learning_puzzles drop column if exists general_explanation;

-- 4. Refresco de comentarios documentales.
comment on column public.learning_puzzles.schema_version is
  'Versión del schema del árbol jsonb. Esquema actual: 2 (formato del catálogo importado).';
comment on column public.learning_puzzles.initial_frame is
  'jsonb: { players: Player[], ball: Ball, shapes?: Shape[], duration_ms? }. Estado visible antes de elegir.';
comment on column public.learning_puzzles.options is
  'jsonb: Option[] (1..3). Cada opción: { id, text, explanation, is_correct, badge_position?, select_frame?, confirmation_frame? }.';
