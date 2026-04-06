-- Permite registrar pagos de inscripción a torneos sin booking asociado.

alter table public.payment_transactions
  alter column booking_id drop not null;

alter table public.payment_transactions
  add column if not exists tournament_id uuid references public.tournaments(id) on delete set null;

create index if not exists idx_payment_transactions_tournament
  on public.payment_transactions (tournament_id);
