-- Permitir varias aperturas el mismo día (p. ej. tras un cierre de caja intermedio).
-- Puede existir unicidad como índice (013) o como CONSTRAINT con nombre *_key (p. ej. Supabase).

alter table public.club_cash_openings
  drop constraint if exists club_cash_openings_club_id_for_date_key;

drop index if exists public.uq_club_cash_openings_club_date;

create index if not exists idx_club_cash_openings_club_for_date_opened
  on public.club_cash_openings (club_id, for_date, opened_at desc);