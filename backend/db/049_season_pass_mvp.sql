-- MVP Season Pass: progreso por jugador (temporada fija en API; sin tabla de temporadas por simplicidad demo).

create table if not exists public.player_season_pass (
  player_id uuid primary key references public.players (id) on delete cascade,
  sp integer not null default 0 check (sp >= 0),
  has_elite boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists idx_player_season_pass_updated on public.player_season_pass (updated_at desc);

comment on table public.player_season_pass is 'MVP pase de temporada: SP acumulado y flag Elite (demo).';
