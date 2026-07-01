-- Catálogo unificado de "desbloqueables": logros (trophy/badge/course),
-- títulos y marcos. Modelo data-driven (single-table con discriminador `kind`).
-- El COLOR sale siempre de la rareza (en código, RARITY_CONFIG); el catálogo
-- no guarda colores. `icon` (logros/título), `animation_type` y `style` (marcos)
-- son presets con nombre que el cliente resuelve. Crear contenido = INSERT.

create table if not exists public.unlockables (
  id            text primary key,
  kind          text not null check (kind in ('trophy','badge','course','title','frame')),
  title         text not null,
  description   text,
  rarity        text not null default 'common'
                  check (rarity in ('common','rare','epic','legendary')),
  icon          text,           -- glyph (logros / título en el selector)
  animation_type text,          -- solo marcos: movimiento (preset en código)
  style         text,           -- solo marcos: geometría/diseño (preset en código)
  sport         text,
  -- Regla de desbloqueo: vocabulario fijo que entiende el motor.
  unlock_type   text not null default 'manual'
                  check (unlock_type in (
                    'manual',               -- nunca automático (otorgado a mano)
                    'matches',              -- nº de partidos jugados >= value
                    'wins',                 -- nº de victorias >= value
                    'win_streak',           -- racha de victorias >= value
                    'level',                -- elo_rating >= value
                    'courses_completed',    -- nº de cursos completados >= value
                    'daily_lesson_streak',  -- racha de lección diaria >= value
                    'course'                -- curso concreto completado (value = course_id)
                  )),
  unlock_value  text,           -- umbral o id (según unlock_type)
  sort_order    int  not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_unlockables_kind on public.unlockables (kind) where is_active;

comment on table public.unlockables is
  'Catálogo de desbloqueables (trophy/badge/course/title/frame). Fuente de verdad data-driven; color por rareza en código.';
