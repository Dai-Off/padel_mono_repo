-- 057_learning_puzzles.sql
-- Tabla learning_puzzles, vinculada 1:1 con learning_questions cuando type='puzzle'.
-- El árbol del puzzle (frames, jugadores, pelota, opciones, shapes) vive en columnas jsonb
-- dentro de esta tabla. Para puzzles, learning_questions.content queda en '{}'::jsonb
-- (la columna es NOT NULL) y la información real se carga desde aquí vía JOIN.
--
-- Schema v2 (formato del catálogo importado):
--   - Cada opción tiene `is_correct: boolean` (no `points`).
--   - Cada opción tiene `select_frame` + `confirmation_frame` (no `reveal_frame`).
--   - Shapes en formato kit (circle/arrow/rect/line/text/triangle).
--   - `intro_frame` opcional: si está presente, el visor anima intro → initial al cargar.
--
-- Idempotente. Al final limpia el campo legacy `court_position` (era una etiqueta
-- editorial que nunca afectó al scheduling ni al render mobile, ver más abajo).

-- 1. Permitir 'puzzle' en el CHECK constraint de learning_questions.type.
alter table public.learning_questions drop constraint if exists learning_questions_type_check;
alter table public.learning_questions add constraint learning_questions_type_check
  check (type in ('test_classic', 'true_false', 'multi_select', 'match_columns', 'order_sequence', 'puzzle'));

-- 2. Tabla learning_puzzles.
create table if not exists public.learning_puzzles (
  id                 uuid primary key default gen_random_uuid(),
  question_id        uuid not null unique
                       references public.learning_questions(id) on delete cascade,
  schema_version     smallint not null default 2,
  statement          text not null,

  -- Sub-árbol del puzzle. Se carga siempre junto al puzzle entero, nunca se filtra suelto.
  intro_frame        jsonb,            -- opcional: { players, ball, shapes?, duration_ms?, auto_trajectory? }
  initial_frame      jsonb not null,   -- { players, ball, shapes?, duration_ms? } estado estático visible antes de elegir
  options            jsonb not null,   -- Option[] (1..3) con select_frame/confirmation_frame opcionales

  thumbnail_url      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists learning_puzzles_question_id_idx
  on public.learning_puzzles (question_id);

-- 3. Limpieza del campo legacy `court_position`.
--
-- Era una etiqueta editorial (left/right/both) que solo se usaba como ayuda
-- visual en el editor web (oscurecer la mitad inactiva). Nunca afectó al
-- scheduling ni se renderizó en mobile. Acabó siendo un campo zombi: el autor
-- lo rellenaba pero nada cambiaba a partir de ahí.
-- Si en el futuro queremos preferencias por lado del jugador, será mejor un
-- campo explícito `side_relevance` (left/right/agnostic) que el autor marque
-- a conciencia. Mientras tanto, fuera.
alter table public.learning_puzzles drop column if exists court_position;
drop index if exists public.learning_puzzles_court_position_idx;

-- Comentarios documentales
comment on table public.learning_puzzles is
  'Detalle de preguntas type=puzzle. 1:1 con learning_questions vía question_id.';
comment on column public.learning_puzzles.schema_version is
  'Versión del schema del árbol jsonb. Esquema actual: 2 (formato del catálogo importado).';
comment on column public.learning_puzzles.intro_frame is
  'jsonb opcional: { players, ball, shapes?, duration_ms?, auto_trajectory? }. Si está presente, el visor anima intro_frame → initial_frame al cargar.';
comment on column public.learning_puzzles.initial_frame is
  'jsonb: { players: Player[], ball: Ball, shapes?: Shape[], duration_ms? }. Estado estático visible antes de elegir.';
comment on column public.learning_puzzles.options is
  'jsonb: Option[] (1..3). Cada opción: { id, text, explanation, is_correct, badge_position?, select_frame?, confirmation_frame? }.';
