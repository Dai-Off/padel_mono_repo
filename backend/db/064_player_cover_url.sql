-- Foto de portada del perfil (banner superior en app móvil).
alter table public.players add column if not exists cover_url text;

comment on column public.players.cover_url is
  'URL pública de la imagen de portada del perfil (mismo bucket player-avatars, ruta {auth_user_id}/cover.ext).';
