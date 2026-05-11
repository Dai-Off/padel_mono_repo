-- 052_learning_puzzles.sql
-- Tabla learning_puzzles, vinculada 1:1 con learning_questions cuando type='puzzle'.
-- El árbol del puzzle (frames, jugadores, pelota, opciones, shapes) vive en columnas jsonb
-- dentro de esta tabla. Para puzzles, learning_questions.content queda en '{}'::jsonb
-- (la columna es NOT NULL) y la información real se carga desde aquí vía JOIN.

-- 1. Permitir 'puzzle' en el CHECK constraint de learning_questions.type.
alter table public.learning_questions drop constraint if exists learning_questions_type_check;
alter table public.learning_questions add constraint learning_questions_type_check
  check (type in ('test_classic', 'true_false', 'multi_select', 'match_columns', 'order_sequence', 'puzzle'));

-- 2. Tabla learning_puzzles.
create table if not exists public.learning_puzzles (
  id                 uuid primary key default gen_random_uuid(),
  question_id        uuid not null unique
                       references public.learning_questions(id) on delete cascade,
  schema_version     smallint not null default 1,
  statement          text not null,
  court_position     text not null default 'both'
                       check (court_position in ('left','right','both')),
  general_explanation text,

  -- Sub-árbol del puzzle. Se carga siempre junto al puzzle entero, nunca se filtra suelto.
  initial_frame      jsonb not null,   -- { players: Player[], ball: Ball, shapes?: Shape[] }
  options            jsonb not null,   -- Option[] (1..3) con su reveal_frame opcional

  thumbnail_url      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists learning_puzzles_court_position_idx
  on public.learning_puzzles (court_position);

create index if not exists learning_puzzles_question_id_idx
  on public.learning_puzzles (question_id);

-- Comentarios documentales
comment on table public.learning_puzzles is
  'Detalle de preguntas type=puzzle. 1:1 con learning_questions vía question_id.';
comment on column public.learning_puzzles.schema_version is
  'Versión del schema del árbol jsonb. Permite migrar puzzles sin romper.';
comment on column public.learning_puzzles.initial_frame is
  'jsonb: { players: Player[], ball: Ball, shapes?: Shape[] }. Estado visible antes de elegir.';
comment on column public.learning_puzzles.options is
  'jsonb: Option[] (1..3). Cada opción: { id, text, explanation, points, badge_position?, reveal_frame? }.';
