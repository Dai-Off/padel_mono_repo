-- 091_season_pass_missions_v2.sql — Mission pool schema v2 + per-player assignments/progress.
--
-- ORDER: run BEFORE 094_season_pass_season_s1.sql (the S1 pool seed uses the
-- columns added here). Requires 050_season_pass_content.sql.
--
-- assignment semantics:
--   daily_fixed     anchor mission, always assigned every day (daily lesson)
--   daily_pool      3/day drawn per player with a deterministic PRNG
--                   seeded by hash(player_id + date) — no cron, lazy on read
--   weekly_calendar 6/week active for the whole community, derived from
--                   hash(season_slug + iso_week) — only progress rows are lazy
--   monthly_all     every active monthly mission runs the whole month

alter table public.season_pass_mission_definitions
  add column if not exists assignment text not null default 'monthly_all'
    check (assignment in ('daily_fixed', 'daily_pool', 'weekly_calendar', 'monthly_all')),
  add column if not exists condition_params jsonb not null default '{}'::jsonb;

comment on column public.season_pass_mission_definitions.assignment is
  'How the mission is assigned: daily_fixed (anchor), daily_pool (3/day PRNG draw), weekly_calendar (6/week community-wide), monthly_all.';
comment on column public.season_pass_mission_definitions.condition_params is
  'Evaluator filter params, e.g. {"kind":"league"}, {"start_after":"20:00"}, {"distinct":"club"}, {"grant_at_period_end":true}.';

-- Per-player mission assignment + progress. One row per (player, mission, period).
-- Progress is evaluated on read; the unique key makes the SP grant idempotent.
create table if not exists public.player_season_pass_missions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  mission_id uuid not null references public.season_pass_mission_definitions (id) on delete cascade,
  period_start date not null,          -- day (daily), Monday (weekly), 1st (monthly), in the player's timezone
  progress int not null default 0 check (progress >= 0),
  completed_at timestamptz,
  sp_granted int,                      -- final SP granted (boosts applied); null while incomplete
  notified_at timestamptz,             -- null = celebration pending in the app
  rerolled_to uuid references public.season_pass_mission_definitions (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, mission_id, period_start)
);

create index if not exists idx_pspm_player_period
  on public.player_season_pass_missions (player_id, period_start desc);

-- Deferred celebrations queue: completed but not yet shown in the app.
create index if not exists idx_pspm_pending_celebration
  on public.player_season_pass_missions (player_id)
  where completed_at is not null and notified_at is null;

alter table public.player_season_pass_missions enable row level security;

comment on table public.player_season_pass_missions is
  'Season pass mission assignments and progress per player and period; unique key guarantees idempotent SP grants.';
