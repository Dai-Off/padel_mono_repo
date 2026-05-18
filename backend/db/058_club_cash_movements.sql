-- Movimientos de efectivo en caja (retiradas e ingresos durante sesión abierta).
create table if not exists public.club_cash_movements (
  id uuid primary key default gen_random_uuid(),

  club_id uuid not null references public.clubs(id) on delete cascade,
  staff_id uuid,
  employee_name text not null,

  movement_type text not null check (movement_type in ('withdrawal', 'deposit')),
  amount_cents integer not null check (amount_cents > 0),
  for_date date not null,
  opening_id uuid references public.club_cash_openings(id) on delete set null,

  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_club_cash_movements_club_date
  on public.club_cash_movements (club_id, for_date, created_at desc);
