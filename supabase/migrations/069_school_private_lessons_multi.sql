-- Clases particulares: varias pistas y varios alumnos por clase

alter table if exists public.club_school_private_lessons
  add column if not exists court_ids uuid[] null;

alter table if exists public.club_school_private_lessons
  add column if not exists students jsonb not null default '[]'::jsonb;

update public.club_school_private_lessons
  set court_ids = array[court_id]::uuid[]
  where court_ids is null and court_id is not null;

update public.club_school_private_lessons
  set students = jsonb_build_array(
    jsonb_strip_nulls(
      jsonb_build_object(
        'name', student_name,
        'email', student_email,
        'phone', student_phone,
        'player_id', student_player_id
      )
    )
  )
  where students = '[]'::jsonb
    and (coalesce(student_name, '') <> '' or coalesce(student_email, '') <> '' or student_player_id is not null);

alter table public.club_school_private_lessons
  drop constraint if exists club_school_private_lessons_student_count_check;

alter table public.club_school_private_lessons
  add constraint club_school_private_lessons_student_count_check
  check (student_count in (1, 2, 3, 4));
