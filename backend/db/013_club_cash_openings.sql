-- Apertura diaria de caja por club
create table if not exists public.club_cash_openings (
  id uuid primary key default gen_random_uuid(),

  club_id uuid not null references public.clubs(id) on delete cascade,
  staff_id uuid,
  employee_name text not null,

  opened_at timestamptz not null default now(),
  for_date date not null,
  opening_cash_cents integer not null check (opening_cash_cents >= 0),

  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_club_cash_openings_club_date
  on public.club_cash_openings (club_id, for_date);

create index if not exists idx_club_cash_openings_club_opened
  on public.club_cash_openings (club_id, opened_at desc);

-- Compatibilidad: si la tabla ya existía sin todas las columnas, completar esquema.
alter table public.club_cash_openings
  add column if not exists club_id uuid references public.clubs(id) on delete cascade,
  add column if not exists staff_id uuid,
  add column if not exists employee_name text,
  add column if not exists opened_by_name text,
  add column if not exists opened_at timestamptz default now(),
  add column if not exists for_date date,
  add column if not exists opening_cash_cents integer,
  add column if not exists notes text,
  add column if not exists created_at timestamptz default now();

-- Normaliza defaults/check para instalaciones previas.
alter table public.club_cash_openings
  alter column opened_at set default now(),
  alter column created_at set default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'club_cash_openings_opening_cash_cents_check'
  ) then
    alter table public.club_cash_openings
      add constraint club_cash_openings_opening_cash_cents_check check (opening_cash_cents >= 0);
  end if;
end $$;

-- Compatibilidad con esquemas previos que usan opened_by_name.
update public.club_cash_openings
set opened_by_name = coalesce(opened_by_name, employee_name, 'Empleado')
where opened_by_name is null;

update public.club_cash_openings
set employee_name = coalesce(employee_name, opened_by_name, 'Empleado')
where employee_name is null;
