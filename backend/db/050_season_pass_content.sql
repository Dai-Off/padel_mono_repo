-- Contenido del pase de temporada: temporadas activas, misiones, textos UI (sin hardcode en app).
-- Requiere `049_season_pass_mvp.sql` (tabla `player_season_pass`). Ejecutar ESTE archivo antes que `051_*`.

create table if not exists public.season_pass_seasons (
  slug text primary key,
  title text not null,
  subtitle text not null,
  ends_at timestamptz not null,
  active boolean not null default false,
  sp_per_level int not null check (sp_per_level > 0),
  lesson_sp_base int not null check (lesson_sp_base > 0),
  max_level int not null check (max_level > 0),
  track_radius int not null default 6 check (track_radius > 0),
  hero_chip_label text,
  elite_card_subtitle text,
  mission_period_tabs jsonb not null default '[]'::jsonb,
  elite_modal_bullets jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.season_pass_mission_definitions (
  id uuid primary key default gen_random_uuid(),
  season_slug text not null references public.season_pass_seasons (slug) on delete cascade,
  slug text not null,
  icon text not null default '📌',
  title text not null,
  description text not null,
  period text not null check (period in ('daily', 'weekly', 'monthly')),
  target_count int not null default 1 check (target_count > 0),
  sp_reward int not null default 0 check (sp_reward >= 0),
  sort_order int not null default 0,
  condition_key text not null,
  reward_hint text,
  active boolean not null default true,
  unique (season_slug, slug)
);

create table if not exists public.season_pass_sp_how_rows (
  id uuid primary key default gen_random_uuid(),
  season_slug text not null references public.season_pass_seasons (slug) on delete cascade,
  sort_order int not null,
  icon text not null,
  label text not null,
  sp_hint text not null,
  unique (season_slug, sort_order)
);

create index if not exists idx_season_pass_seasons_active on public.season_pass_seasons (active) where active = true;
create index if not exists idx_season_pass_missions_season on public.season_pass_mission_definitions (season_slug, active, sort_order);

alter table public.season_pass_seasons enable row level security;
alter table public.season_pass_mission_definitions enable row level security;
alter table public.season_pass_sp_how_rows enable row level security;

-- Temporada activa MVP (ajustá fechas/textos desde SQL cuando cambie la temporada)
insert into public.season_pass_seasons (
  slug, title, subtitle, ends_at, active,
  sp_per_level, lesson_sp_base, max_level, track_radius, hero_chip_label, elite_card_subtitle,
  mission_period_tabs, elite_modal_bullets
) values (
  's1',
  '🔥 Llamas del Pádel',
  'Mar – Abr 2026',
  '2026-04-30T23:59:59.000Z',
  true,
  1000,
  600,
  100,
  6,
  'Pase Temporada 1',
  '+100 recompensas exclusivas',
  '[
    {"period":"daily","label":"☀️ Diarias"},
    {"period":"weekly","label":"📅 Semanales"},
    {"period":"monthly","label":"🌙 Mensuales"}
  ]'::jsonb,
  '[
    {"icon":"🏅","text":"Insignias, marcos y títulos exclusivos Elite"},
    {"icon":"💎","text":"Rarezas y recompensas del carril premium"},
    {"icon":"👑","text":"Progreso y hitos de temporada"},
    {"icon":"🔥","text":"Contenido prioritario de nuevas temporadas"}
  ]'::jsonb
)
on conflict (slug) do nothing;

-- Misión real: lección diaria (progreso evaluado contra learning_sessions del día)
insert into public.season_pass_mission_definitions (
  season_slug, slug, icon, title, description, period, target_count, sp_reward, sort_order, condition_key, reward_hint, active
) values (
  's1',
  'daily_lesson',
  '📚',
  'Lección diaria',
  'Completa la lección del día en Aprendizaje.',
  'daily',
  1,
  600,
  0,
  'daily_lesson',
  'Los SP ganados pueden subir según tu racha de días.',
  true
)
on conflict (season_slug, slug) do nothing;

-- Textos “cómo ganar SP”: solo mecánicas que existen o están previstas en backend (editá desde SQL)
insert into public.season_pass_sp_how_rows (season_slug, sort_order, icon, label, sp_hint) values
  ('s1', 0, '📚', 'Lección diaria', 'Base 600 SP + multiplicador por racha (ver aprendizaje)')
on conflict (season_slug, sort_order) do nothing;

comment on table public.season_pass_seasons is 'Temporada del pase: parámetros y textos para cliente; una fila con active=true.';
comment on table public.season_pass_mission_definitions is 'Misiones del pase; condition_key enlaza con evaluador en backend.';
comment on table public.season_pass_sp_how_rows is 'Filas informativas “cómo ganar SP” mostradas en la app.';
