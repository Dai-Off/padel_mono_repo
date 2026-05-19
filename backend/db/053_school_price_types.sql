-- School price types (named tariffs) and course installment templates

create table if not exists public.club_school_price_types (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_school_price_types_club on public.club_school_price_types(club_id);

alter table if exists public.club_school_courses
  add column if not exists price_type_id uuid null references public.club_school_price_types(id) on delete set null;

create index if not exists idx_school_courses_price_type on public.club_school_courses(price_type_id);

create table if not exists public.club_school_course_installments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.club_school_courses(id) on delete cascade,
  label text null,
  amount_cents integer not null check (amount_cents >= 0),
  due_date date not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_school_course_installments_course on public.club_school_course_installments(course_id);

alter table if exists public.club_school_private_lessons
  add column if not exists student_count smallint not null default 1;

-- Extend private lesson student_count constraint (drop/recreate if exists)
do $$
begin
  alter table public.club_school_private_lessons
    drop constraint if exists club_school_private_lessons_student_count_check;
  alter table public.club_school_private_lessons
    add constraint club_school_private_lessons_student_count_check
    check (student_count in (1, 2, 3));
exception when others then null;
end $$;

-- Fee rules: allow group_size 1 for individual private lessons
alter table public.club_school_fee_rules
  drop constraint if exists club_school_fee_rules_group_size_check;

alter table public.club_school_fee_rules
  add constraint club_school_fee_rules_group_size_check
  check (group_size in (1, 2, 3, 4));

drop trigger if exists trg_school_price_types_updated_at on public.club_school_price_types;
create trigger trg_school_price_types_updated_at
before update on public.club_school_price_types
for each row execute function public.touch_updated_at();

drop trigger if exists trg_school_course_installments_updated_at on public.club_school_course_installments;
create trigger trg_school_course_installments_updated_at
before update on public.club_school_course_installments
for each row execute function public.touch_updated_at();
