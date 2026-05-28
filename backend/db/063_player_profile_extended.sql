-- Perfil extendido del jugador (app móvil: editar perfil)

alter table public.players
  add column if not exists birth_date date,
  add column if not exists profile_description text,
  add column if not exists play_location text;

comment on column public.players.birth_date is
  'Fecha de nacimiento (opcional).';
comment on column public.players.profile_description is
  'Bio corta del jugador (máx. 100 caracteres en API).';
comment on column public.players.play_location is
  'Texto libre: dónde suele jugar (club, ciudad, etc.).';
