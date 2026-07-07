-- 092_season_pass_rewards.sql — Level rewards for the season pass (phase 2).
--
-- ORDER: requires 050 (seasons) and 077/081/082 (unlockables catalog).
-- Independent from 091/094/096 (mission engine), but part of the same range.
--
-- Note: plan §6.1 sketched unlockable_id as uuid — unlockables.id is TEXT, so
-- the FK follows the real type.
--
-- Reward semantics:
--   unlockable → grants a row in player_unlockables (existing UnlockModalHost
--                shows it; display derives from the catalog at read time)
--   sp         → direct SP, re-enters via the grant path WITHOUT boosts
--   sp_boost   → consumable booster (player_sp_boosts, seeded in phase 3)

create table if not exists public.season_pass_rewards (
  id uuid primary key default gen_random_uuid(),
  season_slug text not null references public.season_pass_seasons (slug) on delete cascade,
  level int not null check (level between 1 and 1000),
  tier text not null check (tier in ('free', 'elite')),
  reward_type text not null check (reward_type in ('unlockable', 'sp_boost', 'sp')),
  unlockable_id text references public.unlockables (id),
  boost_config jsonb,   -- {"bonus":0.5,"expires_hours":72} when reward_type = 'sp_boost'
  sp_amount int check (sp_amount > 0),
  display jsonb not null default '{}'::jsonb,  -- used when there is no unlockable to derive from
  sort_order int not null default 0,
  unique nulls not distinct (season_slug, level, tier, reward_type, unlockable_id),
  check (reward_type <> 'unlockable' or unlockable_id is not null),
  check (reward_type <> 'sp' or sp_amount is not null),
  check (reward_type <> 'sp_boost' or boost_config is not null)
);

create index if not exists idx_sp_rewards_season_level
  on public.season_pass_rewards (season_slug, level, tier);

-- Idempotent per-player grant ledger (unique = no double grant).
create table if not exists public.player_season_pass_reward_grants (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  reward_id uuid not null references public.season_pass_rewards (id) on delete cascade,
  granted_at timestamptz not null default now(),
  notified_at timestamptz,   -- null = celebration pending (cosmetics also flow via player_unlockables)
  unique (player_id, reward_id)
);

create index if not exists idx_sp_reward_grants_player
  on public.player_season_pass_reward_grants (player_id);

alter table public.season_pass_rewards enable row level security;
alter table public.player_season_pass_reward_grants enable row level security;

comment on table public.season_pass_rewards is
  'Season pass level rewards (free/elite tracks). Display derives from unlockables at read time.';
comment on table public.player_season_pass_reward_grants is
  'Rewards granted per player; unique key guarantees idempotent grants.';

-- ────────────────────────────────────────────────────────────
-- Season 1 exclusive cosmetics (unlock_type 'manual': the pass grants them
-- by inserting into player_unlockables — the signals engine never does).
-- ────────────────────────────────────────────────────────────

insert into public.unlockables (id, kind, title, description, rarity, icon, unlock_type, sort_order) values
  ('s1_iniciado',   'badge',  'Iniciado de Temporada', 'Recompensa del Pase de Temporada 1.', 'common',    'flame',  'manual', 300),
  ('s1_constante',  'badge',  'Constante',             'Recompensa del Pase de Temporada 1.', 'rare',      'medal',  'manual', 301),
  ('s1_imparable',  'badge',  'Imparable',             'Recompensa del Pase de Temporada 1.', 'epic',      'flame',  'manual', 302),
  ('s1_veterano',   'trophy', 'Veterano S1',           'Recompensa del Pase de Temporada 1.', 'rare',      'trophy', 'manual', 303),
  ('s1_mitad',      'trophy', 'Mitad de Temporada',    'Recompensa del Pase de Temporada 1.', 'epic',      'medal',  'manual', 304),
  ('s1_llama',      'title',  'Llama del Pádel',       'Recompensa del Pase de Temporada 1.', 'epic',      'flame',  'manual', 305),
  ('s1_elite',      'badge',  'Elite S1',              'Recompensa Elite del Pase de Temporada 1.', 'rare', 'crown',  'manual', 306),
  ('s1_mecenas',    'title',  'Mecenas del Club',      'Recompensa Elite del Pase de Temporada 1.', 'rare', 'star',   'manual', 307),
  ('s1_elite_title','title',  'Elite de Temporada',    'Recompensa Elite del Pase de Temporada 1.', 'epic', 'crown',  'manual', 308)
on conflict (id) do update set
  kind = excluded.kind, title = excluded.title, description = excluded.description,
  rarity = excluded.rarity, icon = excluded.icon, unlock_type = excluded.unlock_type,
  sort_order = excluded.sort_order, updated_at = now();

insert into public.unlockables (id, kind, title, description, rarity, animation_type, style, colors, unlock_type, sort_order) values
  ('s1_ember',          'frame', 'Brasas',           'Recompensa Elite del Pase de Temporada 1.', 'epic',      'pulse',  'glow',  '["#F97316","#FBBF24","#EF4444"]'::jsonb, 'manual', 320),
  ('s1_llamas_eternas', 'frame', 'Llamas Eternas',   'Recompensa del Pase de Temporada 1 (nivel 100).', 'legendary', 'ripple', 'glow',  '["#DC2626","#F97316","#FBBF24"]'::jsonb, 'manual', 321),
  ('s1_corona_llamas',  'frame', 'Corona de Llamas', 'Recompensa Elite del Pase de Temporada 1 (nivel 100).', 'legendary', 'morph', 'bevel', '["#FBBF24","#F97316","#DC2626","#FDE68A"]'::jsonb, 'manual', 322)
on conflict (id) do update set
  kind = excluded.kind, title = excluded.title, description = excluded.description,
  rarity = excluded.rarity, animation_type = excluded.animation_type, style = excluded.style,
  colors = excluded.colors, unlock_type = excluded.unlock_type, sort_order = excluded.sort_order,
  updated_at = now();

-- ────────────────────────────────────────────────────────────
-- S1 reward track. Values are a product knob — tune from SQL.
-- Frames stay at high levels and in the Elite lane (decided 2026-07-07).
-- Elite direct-SP rewards total ~7.300 SP (≈7 levels), the Elite accelerator
-- until phase 3 boosters land.
-- ────────────────────────────────────────────────────────────

-- Free track
insert into public.season_pass_rewards (season_slug, level, tier, reward_type, unlockable_id, sp_amount, display, sort_order) values
  ('s1',   2, 'free', 'unlockable', 's1_iniciado',      null, '{}', 0),
  ('s1',   5, 'free', 'unlockable', 'social',           null, '{}', 0),
  ('s1',   8, 'free', 'sp',         null,               250,  '{"icon":"⚡","label":"+250 SP"}', 0),
  ('s1',  10, 'free', 'unlockable', 's1_constante',     null, '{}', 0),
  ('s1',  15, 'free', 'unlockable', 'francotirador',    null, '{}', 0),
  ('s1',  20, 'free', 'unlockable', 's1_veterano',      null, '{}', 0),
  ('s1',  25, 'free', 'unlockable', 's1_llama',         null, '{}', 0),
  ('s1',  30, 'free', 'unlockable', 's1_imparable',     null, '{}', 0),
  ('s1',  35, 'free', 'sp',         null,               300,  '{"icon":"⚡","label":"+300 SP"}', 0),
  ('s1',  40, 'free', 'unlockable', 'rey_red',          null, '{}', 0),
  ('s1',  50, 'free', 'unlockable', 's1_mitad',         null, '{}', 0),
  ('s1',  60, 'free', 'unlockable', 'campeon',          null, '{}', 0),
  ('s1',  70, 'free', 'sp',         null,               400,  '{"icon":"⚡","label":"+400 SP"}', 0),
  ('s1',  75, 'free', 'unlockable', 'neon',             null, '{}', 0),
  ('s1',  90, 'free', 'unlockable', 'dominador',        null, '{}', 0),
  ('s1', 100, 'free', 'unlockable', 's1_llamas_eternas', null, '{}', 0)
on conflict (season_slug, level, tier, reward_type, unlockable_id) do update set
  sp_amount = excluded.sp_amount, display = excluded.display, sort_order = excluded.sort_order;

-- Elite track
insert into public.season_pass_rewards (season_slug, level, tier, reward_type, unlockable_id, sp_amount, display, sort_order) values
  ('s1',   1, 'elite', 'unlockable', 's1_elite',          null, '{}', 0),
  ('s1',   3, 'elite', 'sp',         null,                300,  '{"icon":"⚡","label":"+300 SP"}', 0),
  ('s1',   7, 'elite', 'sp',         null,                300,  '{"icon":"⚡","label":"+300 SP"}', 0),
  ('s1',  10, 'elite', 'unlockable', 's1_mecenas',        null, '{}', 0),
  ('s1',  12, 'elite', 'sp',         null,                400,  '{"icon":"⚡","label":"+400 SP"}', 0),
  ('s1',  15, 'elite', 'sp',         null,                400,  '{"icon":"⚡","label":"+400 SP"}', 0),
  ('s1',  20, 'elite', 'unlockable', 's1_ember',          null, '{}', 0),
  ('s1',  25, 'elite', 'sp',         null,                500,  '{"icon":"⚡","label":"+500 SP"}', 0),
  ('s1',  30, 'elite', 'unlockable', 's1_elite_title',    null, '{}', 0),
  ('s1',  35, 'elite', 'sp',         null,                500,  '{"icon":"⚡","label":"+500 SP"}', 0),
  ('s1',  40, 'elite', 'sp',         null,                500,  '{"icon":"⚡","label":"+500 SP"}', 0),
  ('s1',  45, 'elite', 'sp',         null,                600,  '{"icon":"⚡","label":"+600 SP"}', 0),
  ('s1',  50, 'elite', 'unlockable', 'platino',           null, '{}', 0),
  ('s1',  55, 'elite', 'sp',         null,                600,  '{"icon":"⚡","label":"+600 SP"}', 0),
  ('s1',  65, 'elite', 'sp',         null,                700,  '{"icon":"⚡","label":"+700 SP"}', 0),
  ('s1',  70, 'elite', 'sp',         null,                700,  '{"icon":"⚡","label":"+700 SP"}', 0),
  ('s1',  80, 'elite', 'sp',         null,                800,  '{"icon":"⚡","label":"+800 SP"}', 0),
  ('s1',  90, 'elite', 'sp',         null,                1000, '{"icon":"⚡","label":"+1000 SP"}', 0),
  ('s1', 100, 'elite', 'unlockable', 's1_corona_llamas',  null, '{}', 0)
on conflict (season_slug, level, tier, reward_type, unlockable_id) do update set
  sp_amount = excluded.sp_amount, display = excluded.display, sort_order = excluded.sort_order;
