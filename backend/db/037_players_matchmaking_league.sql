-- Ligas globales de matchmaking (doc 10): liga actual + LP de temporada. Distinto de league_seasons por club.

alter table public.players
  add column if not exists liga text,
  add column if not exists lps integer not null default 0;

update public.players set
  liga = case
    when elo_rating::double precision < 2 then 'bronce'
    when elo_rating::double precision < 4 then 'plata'
    when elo_rating::double precision < 5.5 then 'oro'
    else 'elite'
  end
where liga is null;

update public.players set liga = 'bronce' where liga is null;

alter table public.players alter column liga set default 'bronce';

do $$ begin
  alter table public.players
    add constraint players_liga_chk check (liga in ('bronce', 'plata', 'oro', 'elite'));
exception when duplicate_object then null; end $$;

alter table public.players alter column liga set not null;

comment on column public.players.liga is 'Liga competitiva global (matchmaking), jerarquía bronce→plata→oro→elite.';
comment on column public.players.lps is 'League points de la temporada actual (solo matchmaking).';
