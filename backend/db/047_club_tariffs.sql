-- Club tariffs (global per club): day categories used by the pricing calendar.
-- Replaces the holiday/non_working duality from club_special_dates with a
-- richer model where each club defines its own categories (CRUD libre) and
-- each one carries a price. A category flagged as is_blocking blocks bookings
-- on days that resolve to it (ex-"No laborable").

create table if not exists public.club_tariffs (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  price_cents integer not null default 0 check (price_cents >= 0),
  is_blocking boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, name)
);

create index if not exists idx_club_tariffs_club on public.club_tariffs (club_id);

-- Defaults per club: which tariff to use for weekdays (Mon-Fri) and weekends
-- (Sat-Sun) when no explicit override exists for a given date.
create table if not exists public.club_tariff_defaults (
  club_id uuid primary key references public.clubs(id) on delete cascade,
  weekday_tariff_id uuid references public.club_tariffs(id) on delete set null,
  weekend_tariff_id uuid references public.club_tariffs(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Per-date override: assigns a specific tariff to a concrete date. Loaded in
-- bulk for holidays or toggled one-off from the calendar UI.
create table if not exists public.club_day_overrides (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  date date not null,
  tariff_id uuid not null references public.club_tariffs(id) on delete cascade,
  label text,
  source text not null default 'manual' check (source in ('holiday', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, date)
);

create index if not exists idx_club_day_overrides_club_date
  on public.club_day_overrides (club_id, date);
