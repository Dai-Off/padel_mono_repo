-- Soporte para altas manuales en el club y sincronización con usuarios de la app.
-- Email opcional en jugadores (altas manuales sin correo); teléfono único para evitar duplicados.

alter table public.players
  alter column email drop not null;

create unique index if not exists idx_players_phone_unique
  on public.players (phone)
  where phone is not null and phone != '';

comment on column public.players.email is 'Opcional en altas manuales; obligatorio cuando el usuario se registra por la app.';
