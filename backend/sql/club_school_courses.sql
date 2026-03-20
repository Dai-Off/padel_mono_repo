-- School courses tables for Supabase
create table if not exists public.club_school_courses (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  sport text not null check (sport in ('padel', 'tenis')),
  level text not null check (level in ('Principiante', 'Intermedio', 'Avanzado', 'Competicion', 'Elite', 'Infantil')),
  staff_id uuid not null references public.club_staff(id) on delete restrict,
  court_id uuid not null references public.courts(id) on delete restrict,
  price_cents integer not null default 0 check (price_cents >= 0),
  capacity integer not null default 8 check (capacity > 0),
  is_active boolean not null default true,
  starts_on date null,
  ends_on date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_school_courses_club on public.club_school_courses(club_id);
create index if not exists idx_school_courses_staff on public.club_school_courses(staff_id);
create index if not exists idx_school_courses_court on public.club_school_courses(court_id);
create index if not exists idx_school_courses_sport_level on public.club_school_courses(sport, level);

create table if not exists public.club_school_course_days (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.club_school_courses(id) on delete cascade,
  weekday text not null check (weekday in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')),
  start_time text not null check (start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  end_time text not null check (end_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  created_at timestamptz not null default now(),
  constraint chk_course_day_time_order check (start_time < end_time)
);

create index if not exists idx_school_course_days_course on public.club_school_course_days(course_id);
create index if not exists idx_school_course_days_weekday on public.club_school_course_days(weekday);

create table if not exists public.club_school_course_enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.club_school_courses(id) on delete cascade,
  player_id uuid null references public.players(id) on delete set null,
  student_name text null,
  student_email text null,
  student_phone text null,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_school_enrollments_course on public.club_school_course_enrollments(course_id);
create index if not exists idx_school_enrollments_player on public.club_school_course_enrollments(player_id);

-- Optional: keep updated_at in sync
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_school_courses_updated_at on public.club_school_courses;
create trigger trg_school_courses_updated_at
before update on public.club_school_courses
for each row execute function public.touch_updated_at();

drop trigger if exists trg_school_enrollments_updated_at on public.club_school_course_enrollments;
create trigger trg_school_enrollments_updated_at
before update on public.club_school_course_enrollments
for each row execute function public.touch_updated_at();
