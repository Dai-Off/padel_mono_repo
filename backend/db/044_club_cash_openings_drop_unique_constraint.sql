-- Quitar unicidad (club_id, for_date) aunque exista como CONSTRAINT con nombre automático
-- (p. ej. club_cash_openings_club_id_for_date_key) y no solo como índice uq_club_cash_openings_club_date.

alter table public.club_cash_openings
  drop constraint if exists club_cash_openings_club_id_for_date_key;

drop index if exists public.uq_club_cash_openings_club_date;

create index if not exists idx_club_cash_openings_club_for_date_opened
  on public.club_cash_openings (club_id, for_date, opened_at desc);
