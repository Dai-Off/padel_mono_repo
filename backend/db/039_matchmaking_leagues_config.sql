-- Ligas MM configurables (doc 10 §5 tabla opcional): rangos de elo y LP para ascender.

create table if not exists public.matchmaking_leagues (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  sort_order integer not null unique,
  label text not null,
  elo_min double precision not null,
  elo_max double precision not null,
  lps_to_promote integer,
  created_at timestamptz not null default now(),
  constraint matchmaking_leagues_code_chk check (code in ('bronce', 'plata', 'oro', 'elite'))
);

comment on table public.matchmaking_leagues is 'Definición de ligas globales MM: bandas de elo y LP para subir (doc 10).';
comment on column public.matchmaking_leagues.elo_max is 'Límite exclusivo: liga aplica si elo_min <= elo < elo_max (elite: usar elo_max alto).';
comment on column public.matchmaking_leagues.lps_to_promote is 'LP a descontar al ascender desde esta liga; null = usar constante de código.';

insert into public.matchmaking_leagues (code, sort_order, label, elo_min, elo_max, lps_to_promote)
values
  ('bronce', 0, 'Bronce', 0, 2, 100),
  ('plata', 1, 'Plata', 2, 4, 100),
  ('oro', 2, 'Oro', 4, 5.5, 100),
  ('elite', 3, 'Elite', 5.5, 20, null)
on conflict (code) do nothing;
