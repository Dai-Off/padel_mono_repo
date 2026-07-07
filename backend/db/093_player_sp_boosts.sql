-- 093_player_sp_boosts.sql — Consumable SP boosters + booster rewards (phase 3).
--
-- ORDER: requires 092 (season_pass_rewards). Run AFTER 092.
--
-- Boost engine (plan §3/§6.4): sp_final = sp_base * clamp(1 + Σ bonuses, 1, boost_cap).
-- Sources:
--   lesson_streak → NOT materialized here: derived at runtime from
--                   learning_streaks (+15/+30/+50/+70% at streaks 3/8/21/46)
--   pass_reward   → rows in this table, auto-activated on grant with a
--                   generous time window (decided 2026-07-07: 48-72h)
--   catch_up      → derived at runtime (+15% while <10 missions completed
--                   during the season's last month)
--   event         → reserved for special season events

create table if not exists public.player_sp_boosts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  source text not null check (source in ('pass_reward', 'catch_up', 'event')),
  bonus numeric(4,2) not null check (bonus > 0),
  remaining_missions int check (remaining_missions >= 0),  -- future seasons: per-mission consumption
  expires_at timestamptz,                                   -- S1: time window, auto-activated
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

create index if not exists idx_player_sp_boosts_active
  on public.player_sp_boosts (player_id) where consumed_at is null;

alter table public.player_sp_boosts enable row level security;

comment on table public.player_sp_boosts is
  'Consumable SP boosters (pass rewards). Active = consumed_at null and not expired; lesson_streak/catch_up derive at runtime.';

-- ────────────────────────────────────────────────────────────
-- Booster rewards in the S1 track (PDF: +30/+50/+60%, mostly Elite lane).
-- They fill levels the 092 seed left empty. Auto-activate on grant with a
-- 48-72h window. Product knob — tune from SQL.
-- ────────────────────────────────────────────────────────────

-- Free lane: a taste of boosters (+30%, 48h)
insert into public.season_pass_rewards (season_slug, level, tier, reward_type, boost_config, display, sort_order) values
  ('s1', 45, 'free', 'sp_boost', '{"bonus":0.30,"expires_hours":48}', '{"icon":"🚀","label":"+30% SP · 48h"}', 0),
  ('s1', 65, 'free', 'sp_boost', '{"bonus":0.30,"expires_hours":48}', '{"icon":"🚀","label":"+30% SP · 48h"}', 0),
  ('s1', 95, 'free', 'sp_boost', '{"bonus":0.50,"expires_hours":48}', '{"icon":"🚀","label":"+50% SP · 48h"}', 0)
on conflict (season_slug, level, tier, reward_type, unlockable_id) do update set
  boost_config = excluded.boost_config, display = excluded.display, sort_order = excluded.sort_order;

-- Elite lane: the real accelerator
insert into public.season_pass_rewards (season_slug, level, tier, reward_type, boost_config, display, sort_order) values
  ('s1',  5, 'elite', 'sp_boost', '{"bonus":0.30,"expires_hours":48}', '{"icon":"🚀","label":"+30% SP · 48h"}', 0),
  ('s1', 18, 'elite', 'sp_boost', '{"bonus":0.30,"expires_hours":48}', '{"icon":"🚀","label":"+30% SP · 48h"}', 0),
  ('s1', 28, 'elite', 'sp_boost', '{"bonus":0.50,"expires_hours":72}', '{"icon":"🚀","label":"+50% SP · 72h"}', 0),
  ('s1', 38, 'elite', 'sp_boost', '{"bonus":0.30,"expires_hours":48}', '{"icon":"🚀","label":"+30% SP · 48h"}', 0),
  ('s1', 48, 'elite', 'sp_boost', '{"bonus":0.50,"expires_hours":72}', '{"icon":"🚀","label":"+50% SP · 72h"}', 0),
  ('s1', 58, 'elite', 'sp_boost', '{"bonus":0.30,"expires_hours":48}', '{"icon":"🚀","label":"+30% SP · 48h"}', 0),
  ('s1', 60, 'elite', 'sp_boost', '{"bonus":0.60,"expires_hours":72}', '{"icon":"🚀","label":"+60% SP · 72h"}', 0),
  ('s1', 68, 'elite', 'sp_boost', '{"bonus":0.50,"expires_hours":72}', '{"icon":"🚀","label":"+50% SP · 72h"}', 0),
  ('s1', 78, 'elite', 'sp_boost', '{"bonus":0.50,"expires_hours":72}', '{"icon":"🚀","label":"+50% SP · 72h"}', 0),
  ('s1', 85, 'elite', 'sp_boost', '{"bonus":0.60,"expires_hours":72}', '{"icon":"🚀","label":"+60% SP · 72h"}', 0),
  ('s1', 95, 'elite', 'sp_boost', '{"bonus":0.60,"expires_hours":72}', '{"icon":"🚀","label":"+60% SP · 72h"}', 0),
  ('s1', 98, 'elite', 'sp_boost', '{"bonus":0.60,"expires_hours":72}', '{"icon":"🚀","label":"+60% SP · 72h"}', 0)
on conflict (season_slug, level, tier, reward_type, unlockable_id) do update set
  boost_config = excluded.boost_config, display = excluded.display, sort_order = excluded.sort_order;

-- "How to earn SP": streak boost row (deferred from 094 until the engine existed)
insert into public.season_pass_sp_how_rows (season_slug, sort_order, icon, label, sp_hint) values
  ('s1', 4, '🔥', 'Racha diaria', 'Potencia todo el SP que ganas (+15% a +70%)')
on conflict (season_slug, sort_order) do update set
  icon = excluded.icon, label = excluded.label, sp_hint = excluded.sp_hint;
