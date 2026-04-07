-- Nombre visible del torneo (ej: "Copa Primavera 2026")
alter table public.tournaments
  add column if not exists name text;
