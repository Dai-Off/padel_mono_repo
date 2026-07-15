-- 099_player_season_pass_by_season.sql — Aisla el SP/elite por temporada (fase 6).
--
-- Antes: player_season_pass tenía PK (player_id) => el SP y has_elite eran
-- GLOBALES por jugador, así que se arrastraban a la siguiente temporada (la
-- barra no empezaba de cero y el elite comprado seguía activo gratis).
--
-- Ahora: PK (player_id, season_slug) => una fila de SP/elite POR temporada.
-- Cada temporada arranca limpia; S1 queda archivada con su progreso.
-- Idempotente. Requiere 050 (season_pass_seasons).

alter table public.player_season_pass
  add column if not exists season_slug text;

-- Filas existentes: pertenecen a la temporada activa actual (s1).
update public.player_season_pass
  set season_slug = 's1'
  where season_slug is null;

alter table public.player_season_pass
  alter column season_slug set not null;

-- Nueva PK compuesta (player_id, season_slug); soltamos la vieja (solo player_id).
alter table public.player_season_pass
  drop constraint if exists player_season_pass_pkey;
alter table public.player_season_pass
  add constraint player_season_pass_pkey primary key (player_id, season_slug);

-- FK a la temporada.
alter table public.player_season_pass
  drop constraint if exists player_season_pass_season_fk;
alter table public.player_season_pass
  add constraint player_season_pass_season_fk
    foreign key (season_slug) references public.season_pass_seasons (slug) on delete cascade;

comment on table public.player_season_pass is
  'Pase de temporada por jugador y temporada: SP acumulado y flag Elite, aislados por season_slug.';
