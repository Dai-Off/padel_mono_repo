-- 058_learning_questions_status.sql
-- Modelo de estado unificado para learning_questions.
--
-- Sustituye el binomio is_active + is_draft por un único campo `status` con
-- tres valores mutuamente excluyentes:
--   - 'draft'     → en progreso, content puede ser inválido, no se sirve al mobile.
--   - 'published' → válida, servida en las lecciones del mobile.
--   - 'inactive'  → publicada pero pausada (no se sirve, conserva contenido válido).
--
-- Reglas de UI:
--   - Editor "Publicar"        → status='published'.
--   - Editor "Guardar borrador" → status='draft'.
--   - Listado toggle (off/on)  → published ↔ inactive.
--   - Borrado permanente solo permitido si status in ('draft','inactive').
--
-- Idempotente: se puede correr en BD limpia (mapea is_active si existe) o en
-- BD donde ya se aplicó una versión antigua de 058 con is_draft.

alter table public.learning_questions
  add column if not exists status text not null default 'published'
    check (status in ('draft', 'published', 'inactive'));

do $$
begin
  -- Caso 1: BD con la 058 antigua (tiene is_draft además de is_active).
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'learning_questions' and column_name = 'is_draft'
  ) then
    update public.learning_questions
       set status = case
         when is_draft = true then 'draft'
         when is_active = false then 'inactive'
         else 'published'
       end;
    alter table public.learning_questions drop column is_draft;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'learning_questions' and column_name = 'is_active'
  ) then
    -- Caso 2: BD limpia antes de la 058 (solo is_active).
    update public.learning_questions
       set status = case when is_active = false then 'inactive' else 'published' end;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'learning_questions' and column_name = 'is_active'
  ) then
    alter table public.learning_questions drop column is_active;
  end if;
end$$;

drop index if exists public.learning_questions_active_published_idx;

create index if not exists learning_questions_status_idx
  on public.learning_questions (status);

comment on column public.learning_questions.status is
  'Estado de la pregunta: draft (en progreso) / published (servida en lecciones) / inactive (pausada).';
