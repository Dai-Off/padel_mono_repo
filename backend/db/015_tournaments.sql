-- Tournaments module

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  club_id uuid not null references public.clubs(id),
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_min integer not null,
  price_cents integer not null default 0,
  currency char(3) not null default 'EUR',
  elo_min integer,
  elo_max integer,
  max_players integer not null,
  registration_mode text not null default 'individual'
    check (registration_mode in ('individual', 'pair')),
  registration_closed_at timestamptz,
  cancellation_cutoff_at timestamptz,
  invite_ttl_minutes integer not null default 1440,
  status text not null default 'open'
    check (status in ('open', 'closed', 'cancelled')),
  description text,
  cancelled_at timestamptz,
  cancelled_reason text,
  closed_at timestamptz,
  created_by_player_id uuid references public.players(id),
  check (end_at > start_at),
  check (duration_min > 0),
  check (max_players > 1),
  check (invite_ttl_minutes > 0),
  check (elo_min is null or elo_max is null or elo_min <= elo_max)
);

create index if not exists idx_tournaments_club_status_start
  on public.tournaments (club_id, status, start_at);

create table if not exists public.tournament_courts (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  court_id uuid not null references public.courts(id),
  created_at timestamptz not null default now(),
  unique (tournament_id, court_id)
);

create index if not exists idx_tournament_courts_court_id
  on public.tournament_courts (court_id);

create table if not exists public.tournament_inscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'expired', 'cancelled', 'rejected')),
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_reason text,
  player_id_1 uuid references public.players(id),
  player_id_2 uuid references public.players(id),
  invite_email_1 text,
  invite_email_2 text,
  token_hash text not null unique,
  invite_url text,
  check (
    player_id_1 is not null
    or (invite_email_1 is not null and length(trim(invite_email_1)) > 0)
  )
);

create index if not exists idx_tournament_inscriptions_tournament_status
  on public.tournament_inscriptions (tournament_id, status);

create index if not exists idx_tournament_inscriptions_expires_at
  on public.tournament_inscriptions (expires_at);
