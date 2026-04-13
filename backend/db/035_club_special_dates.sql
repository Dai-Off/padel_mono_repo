-- Club special dates: holidays and non-working days
create table if not exists public.club_special_dates (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  date date not null,
  type text not null check (type in ('holiday', 'non_working')),
  reason text,
  created_at timestamptz not null default now(),

  unique (club_id, date, type)
);

create index idx_club_special_dates_club_date on public.club_special_dates (club_id, date);
