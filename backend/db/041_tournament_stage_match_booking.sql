-- Opcional: vincular un cruce de competición con una reserva de pista concreta (horario / pista por partido).

alter table public.tournament_stage_matches
  add column if not exists booking_id uuid null references public.bookings(id) on delete set null;

create index if not exists idx_tournament_stage_matches_booking_id
  on public.tournament_stage_matches (booking_id)
  where booking_id is not null;
