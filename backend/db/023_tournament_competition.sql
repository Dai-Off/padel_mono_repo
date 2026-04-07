-- Motor de competición de torneos: formatos, fases, partidos, resultados y podio manual.

alter table public.tournaments
  add column if not exists competition_format text
    check (competition_format is null or competition_format in ('single_elim', 'group_playoff', 'round_robin')),
  add column if not exists match_rules jsonb not null default '{"best_of_sets":3}'::jsonb,
  add column if not exists standings_rules jsonb not null default '{}'::jsonb;

create table if not exists public.tournament_teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  slot_index int not null default 0,
  player_id_1 uuid not null references public.players(id),
  player_id_2 uuid null references public.players(id),
  name text not null,
  status text not null default 'active' check (status in ('active', 'eliminated')),
  created_at timestamptz not null default now(),
  unique (tournament_id, slot_index)
);

create table if not exists public.tournament_stages (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  stage_type text not null check (stage_type in ('single_elim', 'groups', 'playoff', 'round_robin')),
  stage_name text not null,
  stage_order int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_stage_groups (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.tournament_stages(id) on delete cascade,
  group_code text not null,
  created_at timestamptz not null default now(),
  unique (stage_id, group_code)
);

create table if not exists public.tournament_stage_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  stage_id uuid not null references public.tournament_stages(id) on delete cascade,
  group_id uuid null references public.tournament_stage_groups(id) on delete set null,
  round_number int not null default 1,
  match_number int not null default 1,
  team_a_id uuid null references public.tournament_teams(id) on delete set null,
  team_b_id uuid null references public.tournament_teams(id) on delete set null,
  source_match_a_id uuid null references public.tournament_stage_matches(id) on delete set null,
  source_match_b_id uuid null references public.tournament_stage_matches(id) on delete set null,
  seed_label_a text null,
  seed_label_b text null,
  status text not null default 'scheduled' check (status in ('scheduled', 'bye', 'finished')),
  winner_team_id uuid null references public.tournament_teams(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_match_results (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.tournament_stage_matches(id) on delete cascade,
  winner_team_id uuid not null references public.tournament_teams(id),
  sets jsonb not null default '[]'::jsonb,
  submitted_by_user_id uuid null,
  submitted_at timestamptz not null default now(),
  unique (match_id)
);

create table if not exists public.tournament_podium (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  position int not null check (position between 1 and 3),
  team_id uuid not null references public.tournament_teams(id) on delete cascade,
  note text null,
  created_by_user_id uuid null,
  created_at timestamptz not null default now(),
  unique (tournament_id, position)
);

create index if not exists idx_tournament_teams_tournament_id on public.tournament_teams(tournament_id);
create index if not exists idx_tournament_stages_tournament_id on public.tournament_stages(tournament_id);
create index if not exists idx_tournament_stage_matches_tournament_id on public.tournament_stage_matches(tournament_id);
create index if not exists idx_tournament_stage_matches_stage_id on public.tournament_stage_matches(stage_id);
create index if not exists idx_tournament_match_results_match_id on public.tournament_match_results(match_id);
create index if not exists idx_tournament_podium_tournament_id on public.tournament_podium(tournament_id);
