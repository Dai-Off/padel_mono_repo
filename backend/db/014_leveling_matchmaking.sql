-- Leveling, score flow, matchmaking, fraud, feedback (Supabase SQL).
-- Apply in order after existing migrations.

-- ---------- players ----------
alter table public.players
  add column if not exists mu double precision,
  add column if not exists sigma double precision,
  add column if not exists beta double precision,
  add column if not exists streak_bonus double precision,
  add column if not exists beta_residuals jsonb,
  add column if not exists matches_played_competitive integer,
  add column if not exists matches_played_friendly integer,
  add column if not exists matches_played_matchmaking integer,
  add column if not exists sp integer,
  add column if not exists initial_rating_completed boolean;

update public.players set
  mu = coalesce(mu, 25.0),
  sigma = coalesce(sigma, 8.333),
  beta = coalesce(beta, 4.167),
  streak_bonus = coalesce(streak_bonus, 1.0),
  beta_residuals = coalesce(beta_residuals, '[]'::jsonb),
  matches_played_competitive = coalesce(matches_played_competitive, 0),
  matches_played_friendly = coalesce(matches_played_friendly, 0),
  matches_played_matchmaking = coalesce(matches_played_matchmaking, 0),
  sp = coalesce(sp, 0);

update public.players set initial_rating_completed = true where initial_rating_completed is null;

alter table public.players alter column mu set default 25.0;
alter table public.players alter column mu set not null;

alter table public.players alter column sigma set default 8.333;
alter table public.players alter column sigma set not null;

alter table public.players alter column beta set default 4.167;
alter table public.players alter column beta set not null;

alter table public.players alter column streak_bonus set default 1.0;
alter table public.players alter column streak_bonus set not null;

alter table public.players alter column beta_residuals drop not null;

alter table public.players alter column matches_played_competitive set default 0;
alter table public.players alter column matches_played_competitive set not null;

alter table public.players alter column matches_played_friendly set default 0;
alter table public.players alter column matches_played_friendly set not null;

alter table public.players alter column matches_played_matchmaking set default 0;
alter table public.players alter column matches_played_matchmaking set not null;

alter table public.players alter column sp set default 0;
alter table public.players alter column sp set not null;

alter table public.players alter column initial_rating_completed set default false;
alter table public.players alter column initial_rating_completed set not null;

-- Migrate legacy integer Elo (~1200) to 0–7 scale
alter table public.players alter column elo_rating drop default;

alter table public.players
  alter column elo_rating type double precision using (
    case
      when elo_rating::double precision > 20 then
        least(7::double precision, greatest(0::double precision,
          ((elo_rating::double precision - 800.0) / 1400.0) * 7.0))
      else elo_rating::double precision
    end
  );

alter table public.players alter column elo_rating set default 3.5;

update public.players p set
  mu = 25.0 + (p.elo_rating - 3.5) * 1.8
where abs(p.mu - 25.0) < 0.0001;

-- ---------- matches ----------
alter table public.matches
  alter column booking_id drop not null;

alter table public.matches
  add column if not exists type text,
  add column if not exists score_status text,
  add column if not exists sets jsonb,
  add column if not exists match_end_reason text,
  add column if not exists retired_team text,
  add column if not exists leveling_applied_at timestamptz,
  add column if not exists friendly_count_applied_at timestamptz,
  add column if not exists score_first_proposer_team text,
  add column if not exists score_confirmed_at timestamptz;

update public.matches set type = coalesce(type, 'open') where type is null;
update public.matches set score_status = coalesce(score_status, 'pending') where score_status is null;

alter table public.matches alter column type set default 'open';
alter table public.matches alter column type set not null;
do $$ begin
  alter table public.matches
    add constraint matches_type_chk check (type in ('open', 'matchmaking', 'penalty'));
exception when duplicate_object then null; end $$;

alter table public.matches alter column score_status set default 'pending';
alter table public.matches alter column score_status set not null;

do $$ begin
  alter table public.matches
    add constraint matches_score_status_chk check (score_status in (
      'pending', 'pending_confirmation', 'disputed_pending', 'confirmed', 'disputed', 'no_result'
    ));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.matches
    add constraint matches_match_end_reason_chk check (match_end_reason is null or match_end_reason in ('completed', 'retired', 'timeout'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.matches
    add constraint matches_retired_team_chk check (retired_team is null or retired_team in ('A', 'B'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.matches
    add constraint matches_booking_penalty_chk check (
      booking_id is not null or type = 'penalty'
    );
exception when duplicate_object then null; end $$;

alter table public.matches
  alter column elo_min type double precision using elo_min::double precision;

alter table public.matches
  alter column elo_max type double precision using elo_max::double precision;

-- ---------- match_players ----------
alter table public.match_players
  add column if not exists pre_match_win_prob double precision;

alter table public.match_players
  alter column rating_change type double precision using rating_change::double precision;

alter table public.match_players
  drop constraint if exists match_players_result_check;

alter table public.match_players
  add constraint match_players_result_check check (result in ('win', 'loss', 'draw', 'pending'));

-- ---------- player_synergies ----------
create table if not exists public.player_synergies (
  id uuid primary key default gen_random_uuid(),
  player_id_1 uuid not null references public.players(id),
  player_id_2 uuid not null references public.players(id),
  value double precision not null default 0.0,
  matches_count integer not null default 0,
  updated_at timestamptz default now(),
  unique (player_id_1, player_id_2),
  check (player_id_1 < player_id_2)
);

create index if not exists idx_player_synergies_p1 on public.player_synergies (player_id_1);
create index if not exists idx_player_synergies_p2 on public.player_synergies (player_id_2);

-- ---------- score_submissions ----------
create table if not exists public.score_submissions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id),
  team text not null,
  sets jsonb not null,
  created_at timestamptz default now(),
  constraint score_submissions_team_chk check (team in ('A', 'B'))
);

create index if not exists idx_score_submissions_match on public.score_submissions (match_id, created_at);

-- ---------- matchmaking_pool ----------
create table if not exists public.matchmaking_pool (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null unique references public.players(id) on delete cascade,
  paired_with_id uuid references public.players(id),
  club_id uuid references public.clubs(id),
  max_distance_km integer,
  preferred_side text,
  gender text not null default 'any',
  available_from timestamptz not null,
  available_until timestamptz not null,
  status text not null default 'searching',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  expires_at timestamptz,
  proposed_match_id uuid references public.matches(id),
  reject_count integer not null default 0,
  constraint matchmaking_pool_side_chk check (preferred_side is null or preferred_side in ('drive', 'backhand', 'any')),
  constraint matchmaking_pool_status_chk check (status in ('searching', 'matched', 'expired'))
);

create index if not exists idx_matchmaking_pool_status on public.matchmaking_pool (status) where status = 'searching';

alter table public.matchmaking_pool add column if not exists updated_at timestamptz default now();
alter table public.matchmaking_pool add column if not exists proposed_match_id uuid references public.matches(id);
alter table public.matchmaking_pool add column if not exists reject_count integer not null default 0;

-- ---------- fraud_alerts ----------
create table if not exists public.fraud_alerts (
  id uuid primary key default gen_random_uuid(),
  detection_type text not null,
  player_ids uuid[] not null,
  match_ids uuid[] not null,
  details jsonb,
  status text not null default 'open',
  created_at timestamptz default now(),
  resolved_at timestamptz,
  constraint fraud_alerts_status_chk check (status in ('open', 'reviewed', 'dismissed')),
  constraint fraud_alerts_type_chk check (detection_type in (
    'repeated_results', 'prediction_failure', 'sandbagging',
    'closed_group_inflation', 'score_manipulation', 'strategic_retirement'
  ))
);

create index if not exists idx_fraud_alerts_open on public.fraud_alerts (detection_type, status);

-- ---------- match_feedback ----------
create table if not exists public.match_feedback (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  reviewer_id uuid not null references public.players(id),
  level_ratings jsonb,
  would_repeat boolean,
  would_not_repeat_reason text,
  comment text,
  created_at timestamptz default now(),
  unique (match_id, reviewer_id)
);

-- ---------- onboarding_answers (optional) ----------
create table if not exists public.onboarding_answers (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  answers jsonb not null,
  mu_assigned double precision not null,
  created_at timestamptz default now()
);

-- ---------- RPC: atomic leveling apply ----------
create or replace function public.apply_leveling_pipeline(
  p_match_id uuid,
  p_player_updates jsonb,
  p_match_player_updates jsonb,
  p_synergy_upserts jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.matches%rowtype;
  item jsonb;
  n int;
begin
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'match_not_found';
  end if;
  if not m.competitive or m.score_status <> 'confirmed' then
    raise exception 'invalid_match_state';
  end if;
  if m.leveling_applied_at is not null then
    return;
  end if;

  for item in select * from jsonb_array_elements(p_player_updates)
  loop
    update public.players set
      mu = (item->>'mu')::double precision,
      sigma = (item->>'sigma')::double precision,
      beta = (item->>'beta')::double precision,
      beta_residuals = item->'beta_residuals',
      elo_rating = (item->>'elo_rating')::double precision,
      matches_played_competitive = (item->>'matches_played_competitive')::integer,
      matches_played_matchmaking = (item->>'matches_played_matchmaking')::integer,
      updated_at = now()
    where id = (item->>'id')::uuid;
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'player_update_failed %', item->>'id';
    end if;
  end loop;

  for item in select * from jsonb_array_elements(p_match_player_updates)
  loop
    update public.match_players set
      result = item->>'result',
      rating_change = (item->>'rating_change')::double precision,
      pre_match_win_prob = (item->>'pre_match_win_prob')::double precision
    where id = (item->>'id')::uuid and match_id = p_match_id;
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'match_player_update_failed %', item->>'id';
    end if;
  end loop;

  for item in select * from jsonb_array_elements(p_synergy_upserts)
  loop
    insert into public.player_synergies (player_id_1, player_id_2, value, matches_count, updated_at)
    values (
      (item->>'player_id_1')::uuid,
      (item->>'player_id_2')::uuid,
      (item->>'value')::double precision,
      (item->>'matches_count')::integer,
      now()
    )
    on conflict (player_id_1, player_id_2) do update set
      value = excluded.value,
      matches_count = excluded.matches_count,
      updated_at = now();
  end loop;

  update public.matches
  set leveling_applied_at = now(), updated_at = now()
  where id = p_match_id;
end;
$$;

grant execute on function public.apply_leveling_pipeline(uuid, jsonb, jsonb, jsonb) to service_role;
