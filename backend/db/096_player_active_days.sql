-- 096_player_active_days.sql — One row per player per active day (opening the app).
--
-- Fed from authenticated requests with an in-process 1/day throttle (backend).
-- Supports season pass missions: D01 "open the app" (daily) and the monthly
-- "be active on 15 distinct days". Day is computed in the player's timezone.

create table if not exists public.player_active_days (
  player_id uuid not null references public.players (id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (player_id, day)
);

create index if not exists idx_player_active_days_day on public.player_active_days (day);

alter table public.player_active_days enable row level security;

comment on table public.player_active_days is
  'Distinct active days per player (app opened); source for season pass activity missions.';
