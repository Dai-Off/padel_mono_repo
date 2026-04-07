-- Cartel, modo de nivel (banda única vs categorías paralelas), divisiones e inscripciones por categoría.

alter table public.tournaments
  add column if not exists poster_url text null,
  add column if not exists level_mode text not null default 'single_band'
    check (level_mode in ('single_band', 'multi_division'));

comment on column public.tournaments.poster_url is 'URL https opcional del cartel del torneo.';
comment on column public.tournaments.level_mode is 'single_band: rango Elo único; multi_division: categorías paralelas (tabla tournament_divisions).';

create table if not exists public.tournament_divisions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  code text not null,
  label text not null,
  elo_min int null,
  elo_max int null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (tournament_id, code)
);

create index if not exists idx_tournament_divisions_tournament_id on public.tournament_divisions(tournament_id);

alter table public.tournament_inscriptions
  add column if not exists division_id uuid null references public.tournament_divisions(id) on delete set null;

alter table public.tournament_teams
  add column if not exists division_id uuid null references public.tournament_divisions(id) on delete set null;

alter table public.tournament_teams drop constraint if exists tournament_teams_tournament_id_slot_index_key;

create unique index if not exists tournament_teams_slot_single_band
  on public.tournament_teams (tournament_id, slot_index)
  where division_id is null;

create unique index if not exists tournament_teams_slot_per_division
  on public.tournament_teams (tournament_id, division_id, slot_index)
  where division_id is not null;
