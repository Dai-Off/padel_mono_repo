-- 029_leagues_skeleton.sql
-- Base schema for internal club leagues.

create table if not exists league_seasons (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  name text not null,
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists league_divisions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references league_seasons(id) on delete cascade,
  name text not null,
  sort_order int not null default 1,
  promote_count int not null default 0,
  relegate_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists league_teams (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references league_divisions(id) on delete cascade,
  name text not null,
  sort_order int not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_league_seasons_club on league_seasons(club_id);
create index if not exists idx_league_divisions_season on league_divisions(season_id);
create index if not exists idx_league_teams_division on league_teams(division_id);
-- Esqueleto para ligas con ascenso/descenso (épica futura). Sin lógica de negocio aún.

create table if not exists public.league_seasons (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  starts_on date null,
  ends_on date null,
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.league_divisions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.league_seasons(id) on delete cascade,
  code text not null,
  label text not null,
  level_index int not null default 0,
  promote_count int not null default 0,
  relegate_count int not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (season_id, code)
);

create table if not exists public.league_division_teams (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.league_divisions(id) on delete cascade,
  team_label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_league_seasons_club_id on public.league_seasons(club_id);
create index if not exists idx_league_divisions_season_id on public.league_divisions(season_id);
create index if not exists idx_league_division_teams_division_id on public.league_division_teams(division_id);
