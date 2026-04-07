-- Permitir más de 3 puestos de podio alineados con la lista `prizes` del torneo.
alter table public.tournament_podium drop constraint if exists tournament_podium_position_check;
alter table public.tournament_podium add constraint tournament_podium_position_check check (position >= 1 and position <= 32);
