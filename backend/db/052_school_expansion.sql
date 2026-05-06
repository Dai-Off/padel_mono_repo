-- School module expansion: fees, private lessons and charges

alter table if exists public.club_school_course_enrollments
  add column if not exists fee_cents integer not null default 0 check (fee_cents >= 0),
  add column if not exists billing_day smallint null check (billing_day between 1 and 28);

create table if not exists public.club_school_private_lessons (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  student_player_id uuid null references public.players(id) on delete set null,
  student_name text null,
  student_email text null,
  student_phone text null,
  staff_id uuid not null references public.club_staff(id) on delete restrict,
  court_id uuid not null references public.courts(id) on delete restrict,
  price_cents integer not null default 0 check (price_cents >= 0),
  weekday text not null check (weekday in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')),
  start_time text not null check (start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  end_time text not null check (end_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  starts_on date null,
  ends_on date null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_private_lesson_time_order check (start_time < end_time)
);

create index if not exists idx_school_private_lessons_club on public.club_school_private_lessons(club_id);
create index if not exists idx_school_private_lessons_staff on public.club_school_private_lessons(staff_id);
create index if not exists idx_school_private_lessons_court on public.club_school_private_lessons(court_id);
create index if not exists idx_school_private_lessons_weekday on public.club_school_private_lessons(weekday);

create table if not exists public.club_school_fee_rules (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  group_size smallint not null check (group_size in (2, 3, 4)),
  time_band text not null check (time_band in ('morning', 'afternoon', 'weekend')),
  price_cents integer not null check (price_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, group_size, time_band)
);

create index if not exists idx_school_fee_rules_club on public.club_school_fee_rules(club_id);

create table if not exists public.club_school_charges (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  source_type text not null check (source_type in ('course', 'private')),
  source_id uuid null,
  enrollment_id uuid null references public.club_school_course_enrollments(id) on delete set null,
  student_player_id uuid null references public.players(id) on delete set null,
  student_name text null,
  amount_cents integer not null check (amount_cents >= 0),
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  paid_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_school_charges_club on public.club_school_charges(club_id);
create index if not exists idx_school_charges_status_due on public.club_school_charges(status, due_date);
create index if not exists idx_school_charges_student on public.club_school_charges(student_player_id);

drop trigger if exists trg_school_private_lessons_updated_at on public.club_school_private_lessons;
create trigger trg_school_private_lessons_updated_at
before update on public.club_school_private_lessons
for each row execute function public.touch_updated_at();

drop trigger if exists trg_school_fee_rules_updated_at on public.club_school_fee_rules;
create trigger trg_school_fee_rules_updated_at
before update on public.club_school_fee_rules
for each row execute function public.touch_updated_at();

drop trigger if exists trg_school_charges_updated_at on public.club_school_charges;
create trigger trg_school_charges_updated_at
before update on public.club_school_charges
for each row execute function public.touch_updated_at();
