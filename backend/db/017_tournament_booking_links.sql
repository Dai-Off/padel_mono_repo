-- Link tournaments with generated booking rows for grilla

create table if not exists public.tournament_booking_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  court_id uuid not null references public.courts(id),
  unique (tournament_id, booking_id),
  unique (booking_id)
);

create index if not exists idx_tournament_booking_links_tournament
  on public.tournament_booking_links (tournament_id);
