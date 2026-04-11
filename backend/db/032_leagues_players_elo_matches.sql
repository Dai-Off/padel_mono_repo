-- Ligas: jugadores/parejas en vez de equipos genéricos, Elo por división, partidos de liga.

-- Rango Elo por división
alter table public.league_divisions
  add column if not exists elo_min int null,
  add column if not exists elo_max int null;

comment on column public.league_divisions.elo_min is 'Elo mínimo para entrar a esta división (null = sin límite inferior).';
comment on column public.league_divisions.elo_max is 'Elo máximo para entrar a esta división (null = sin límite superior).';

-- Referencias a jugadores en cada entrada de división (player_id_1 obligatorio, player_id_2 para parejas)
alter table public.league_division_teams
  add column if not exists player_id_1 uuid null references public.players(id) on delete set null,
  add column if not exists player_id_2 uuid null references public.players(id) on delete set null;

comment on column public.league_division_teams.player_id_1 is 'Jugador principal de la entrada de liga.';
comment on column public.league_division_teams.player_id_2 is 'Segundo jugador (pareja); null si es liga individual.';

-- Partidos de liga: vinculan una reserva de la grilla con una jornada de liga.
create table if not exists public.league_matches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.league_seasons(id) on delete cascade,
  division_id uuid not null references public.league_divisions(id) on delete cascade,
  entry_a_id uuid not null references public.league_division_teams(id) on delete cascade,
  entry_b_id uuid not null references public.league_division_teams(id) on delete cascade,
  booking_id uuid null references public.bookings(id) on delete set null,
  round_number int not null default 1,
  status text not null default 'scheduled' check (status in ('scheduled', 'confirmed', 'played', 'cancelled')),
  winner_entry_id uuid null references public.league_division_teams(id) on delete set null,
  sets jsonb null,
  scheduled_at timestamptz null,
  played_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_league_matches_season on public.league_matches(season_id);
create index if not exists idx_league_matches_division on public.league_matches(division_id);
create index if not exists idx_league_matches_booking on public.league_matches(booking_id);

-- Modo de liga: individual o parejas
alter table public.league_seasons
  add column if not exists mode text not null default 'individual'
    check (mode in ('individual', 'pairs'));

comment on column public.league_seasons.mode is 'individual: 1 jugador por entrada; pairs: 2 jugadores por entrada.';
