-- Learning module tables
-------------------------

-- learning_questions
-------------------------
create table if not exists public.learning_questions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('test_classic', 'true_false', 'multi_select', 'match_columns', 'order_sequence')),
  level numeric not null default 1.0,
  area text not null check (area in ('technique', 'tactics', 'physical', 'mental_vocabulary')),
  has_video boolean not null default false,
  video_url text,
  content jsonb not null,
  created_by_club uuid references public.clubs(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_lq_active_level on public.learning_questions(is_active, level);
create index if not exists idx_lq_club on public.learning_questions(created_by_club);
create index if not exists idx_lq_type on public.learning_questions(type);

-------------------------
-- learning_question_log
-------------------------
create table if not exists public.learning_question_log (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  question_id uuid not null references public.learning_questions(id) on delete cascade,
  answered_correctly boolean not null,
  response_time_ms integer not null,
  answered_at timestamptz not null default now()
);

create index if not exists idx_lql_player on public.learning_question_log(player_id);
create index if not exists idx_lql_player_question on public.learning_question_log(player_id, question_id);
create index if not exists idx_lql_player_date on public.learning_question_log(player_id, answered_at);

-------------------------
-- learning_sessions
-------------------------
create table if not exists public.learning_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  correct_count integer not null,
  total_count integer not null default 5,
  score integer not null,
  xp_earned integer not null,
  timezone text not null default 'UTC',
  completed_at timestamptz not null default now()
);

create index if not exists idx_ls_player_date on public.learning_sessions(player_id, completed_at);

-------------------------
-- learning_courses
-------------------------
create table if not exists public.learning_courses (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references public.clubs(id) on delete set null,
  title text not null,
  description text,
  banner_url text,
  elo_min numeric not null default 0,
  pedagogical_goal text,
  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_lc_status on public.learning_courses(status);
create index if not exists idx_lc_club on public.learning_courses(club_id);
create index if not exists idx_lc_level on public.learning_courses(elo_min);

-------------------------
-- learning_course_lessons
-------------------------
create table if not exists public.learning_course_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.learning_courses(id) on delete cascade,
  "order" integer not null,
  title text not null,
  description text,
  video_url text,
  duration_seconds integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_lcl_course on public.learning_course_lessons(course_id, "order");

-------------------------
-- learning_course_progress
-------------------------
create table if not exists public.learning_course_progress (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  lesson_id uuid not null references public.learning_course_lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (player_id, lesson_id)
);

create index if not exists idx_lcp_player on public.learning_course_progress(player_id);

-------------------------
-- learning_streaks
-------------------------
create table if not exists public.learning_streaks (
  player_id uuid primary key references public.players(id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_lesson_completed_at timestamptz
);

-------------------------
-- learning_shared_streaks
-------------------------
create table if not exists public.learning_shared_streaks (
  id uuid primary key default gen_random_uuid(),
  player_id_1 uuid not null references public.players(id) on delete cascade,
  player_id_2 uuid not null references public.players(id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  player1_completed_today boolean not null default false,
  player2_completed_today boolean not null default false,
  last_both_completed_at timestamptz,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  constraint chk_different_players check (player_id_1 <> player_id_2),
  unique (player_id_1, player_id_2)
);

create index if not exists idx_lss_player1 on public.learning_shared_streaks(player_id_1);
create index if not exists idx_lss_player2 on public.learning_shared_streaks(player_id_2);

-- Fase 4: rango de elo para cursos
alter table public.learning_courses
  rename column level_required to elo_min;

alter table public.learning_courses
  add column if not exists elo_max numeric not null default 7;
