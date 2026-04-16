-- Matchmaking reject sanctions: escalating LP penalties, fault expiry, temporary blocks.

create table if not exists public.matchmaking_reject_faults (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_matchmaking_reject_faults_player_exp
  on public.matchmaking_reject_faults (player_id, expires_at);

create table if not exists public.matchmaking_player_blocks (
  player_id uuid primary key references public.players(id) on delete cascade,
  blocked_until timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_matchmaking_player_blocks_until
  on public.matchmaking_player_blocks (blocked_until);
