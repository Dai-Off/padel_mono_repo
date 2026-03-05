create table public.club_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  responsible_first_name text not null,
  responsible_last_name text not null,
  club_name text not null,
  city text not null,
  country text not null,
  phone text not null,
  email text not null,
  court_count integer not null default 1 check (court_count >= 1),
  sport text not null default 'padel',

  status text not null default 'pending'
    check (status in ('pending','contacted','approved','rejected')),

  official_name text,
  full_address text,
  description text,
  logo_url text,
  photo_urls jsonb default '[]'::jsonb,
  courts jsonb default '[]'::jsonb,
  open_time text,
  close_time text,
  slot_duration_min integer check (slot_duration_min is null or slot_duration_min in (60, 90, 120)),
  pricing jsonb default '[]'::jsonb,
  booking_window text,
  cancellation_policy text,
  tax_id text,
  fiscal_address text,
  stripe_connected boolean default false,
  selected_plan text check (selected_plan is null or selected_plan in ('standard','professional','champion','master')),
  sports jsonb default '[]'::jsonb
);

create index idx_club_applications_email on public.club_applications (email);
create index idx_club_applications_created_at on public.club_applications (created_at desc);
