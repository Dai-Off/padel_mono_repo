-- 104_season_pass_reroll_tokens.sql — Reroll tokens consumibles del pase (fase 4a).
-- (renumerada desde 095; aplicada en Supabase con el numero antiguo)
--
-- ORDER: ejecutar ANTES de re-ejecutar 101 (que ahora reserva huecos para
-- reward_type 'reroll_token'; los token rows se siembran aqui). Requiere 101
-- (season_pass_rewards) y 050 (season_pass_seasons).
--
-- Modelo (decidido 2026-07-10): la cuota gratis sigue siendo 1 reroll/dia +
-- 1/semana. Cuando se agota, un reroll EXTRA consume 1 token. Ledger de 1 fila
-- por token (balance activo = consumed_at null), analogo a player_sp_boosts.
-- Se ganan en el track del pase (reward_type 'reroll_token').

-- ────────────────────────────────────────────────────────────
-- 1) Permitir reward_type 'reroll_token' + cantidad por reward
-- ────────────────────────────────────────────────────────────
alter table public.season_pass_rewards
  drop constraint if exists season_pass_rewards_reward_type_check;
alter table public.season_pass_rewards
  add constraint season_pass_rewards_reward_type_check
  check (reward_type in ('unlockable', 'sp_boost', 'sp', 'reroll_token'));

alter table public.season_pass_rewards
  add column if not exists reroll_tokens int check (reroll_tokens > 0);

alter table public.season_pass_rewards
  drop constraint if exists season_pass_rewards_reroll_tokens_present;
alter table public.season_pass_rewards
  add constraint season_pass_rewards_reroll_tokens_present
  check (reward_type <> 'reroll_token' or reroll_tokens is not null);

-- ────────────────────────────────────────────────────────────
-- 2) Ledger de tokens (1 fila por token; balance = consumed_at is null)
-- ────────────────────────────────────────────────────────────
create table if not exists public.player_reroll_tokens (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  season_slug text not null references public.season_pass_seasons (slug) on delete cascade,
  source_reward_id uuid references public.season_pass_rewards (id) on delete set null,
  granted_at timestamptz not null default now(),
  consumed_at timestamptz,
  consumed_assignment_id uuid
);

create index if not exists idx_player_reroll_tokens_active
  on public.player_reroll_tokens (player_id, season_slug) where consumed_at is null;

alter table public.player_reroll_tokens enable row level security;

comment on table public.player_reroll_tokens is
  'Reroll tokens del pase (consumibles). Balance activo = consumed_at null. Se ganan en el track y se gastan en rerolls extra tras agotar la cuota gratis del periodo.';

-- ────────────────────────────────────────────────────────────
-- 3) Track rewards de tipo reroll_token (rellenan huecos que reserva 101)
--    Free 26/43, Elite 14/32/43. Re-seed idempotente.
-- ────────────────────────────────────────────────────────────
delete from public.season_pass_rewards
  where season_slug = 's1' and reward_type = 'reroll_token';

insert into public.season_pass_rewards (season_slug, level, tier, reward_type, reroll_tokens, display, sort_order) values
  ('s1', 26, 'free',  'reroll_token', 1, '{"icon":"🎲","label":"+1 reroll"}', 0),
  ('s1', 43, 'free',  'reroll_token', 1, '{"icon":"🎲","label":"+1 reroll"}', 0),
  ('s1', 14, 'elite', 'reroll_token', 1, '{"icon":"🎲","label":"+1 reroll"}', 0),
  ('s1', 32, 'elite', 'reroll_token', 1, '{"icon":"🎲","label":"+1 reroll"}', 0),
  ('s1', 43, 'elite', 'reroll_token', 2, '{"icon":"🎲","label":"+2 rerolls"}', 0);
