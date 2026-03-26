-- Arqueos de caja guardados por club (historial persistente)
create table if not exists public.club_cash_closings (
  id uuid primary key default gen_random_uuid(),

  club_id uuid not null references public.clubs(id) on delete cascade,
  staff_id uuid,
  employee_name text not null,

  closed_at timestamptz not null default now(),
  for_date date not null,

  real_cash_cents integer not null,
  real_card_cents integer not null,
  system_cash_cents integer not null,
  system_card_cents integer not null,
  difference_cents integer not null,

  observations text,
  status text not null
    check (status in ('perfect', 'surplus', 'deficit')),

  created_at timestamptz not null default now()
);

create index if not exists idx_club_cash_closings_club_closed
  on public.club_cash_closings (club_id, closed_at desc);
