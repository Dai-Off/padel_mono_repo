-- Marca de inicio real del turno para check-in operativo
alter table public.bookings
  add column if not exists started_at timestamptz null;

create index if not exists idx_bookings_started_at
  on public.bookings (started_at);
