-- Username público único para jugadores (app + CRM).

alter table public.players
  add column if not exists username text;

create unique index if not exists idx_players_username_unique
  on public.players (lower(username))
  where username is not null and username <> '';

comment on column public.players.username is
  'Identificador público único; obligatorio en registro app; opcional en altas manuales hasta edición de perfil.';
