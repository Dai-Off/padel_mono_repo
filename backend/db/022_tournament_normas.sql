-- Campo de normas/reglas visibles al jugador

alter table public.tournaments
  add column if not exists normas text;
