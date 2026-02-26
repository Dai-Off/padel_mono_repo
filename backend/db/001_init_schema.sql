-- Initial database schema for padel app
-- Run this in Supabase SQL editor to create all base tables.

-- Enable UUID generation extension (usually already enabled in Supabase)
create extension if not exists "pgcrypto";

-------------------------
-- players
-------------------------
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,

  first_name text not null,
  last_name text not null,
  email text not null unique,
  phone text,

  elo_rating integer not null default 1200,
  elo_last_updated_at timestamptz,

  stripe_customer_id text,

  consents jsonb not null default '{}'::jsonb,

  status text not null default 'active'
    check (status in ('active','blocked','deleted'))
);

create index if not exists idx_players_email on public.players (email);


-------------------------
-- club_owners
-------------------------
create table if not exists public.club_owners (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  name text not null,
  email text not null unique,
  phone text,

  stripe_connect_account_id text not null,
  kyc_status text not null default 'pending'
    check (kyc_status in ('pending','verified','rejected')),

  status text not null default 'active'
    check (status in ('active','blocked','deleted'))
);

create index if not exists idx_club_owners_email on public.club_owners (email);


-------------------------
-- clubs
-------------------------
create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.club_owners(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  fiscal_tax_id text not null,        -- NIF/CIF
  fiscal_legal_name text not null,

  name text not null,
  description text,

  address text not null,
  city text not null,
  postal_code text not null,
  lat double precision,
  lng double precision,

  base_currency char(3) not null default 'EUR',

  weekly_schedule jsonb not null default '{}'::jsonb,
  schedule_exceptions jsonb not null default '[]'::jsonb
);

create index if not exists idx_clubs_owner_id on public.clubs (owner_id);
create index if not exists idx_clubs_city on public.clubs (city);


-------------------------
-- courts
-------------------------
create table if not exists public.courts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id),

  name text not null,

  indoor boolean not null default false,
  glass_type text not null default 'normal'
    check (glass_type in ('normal','panoramic')),

  status text not null default 'operational'
    check (status in ('operational','maintenance'))
);

create index if not exists idx_courts_club_id on public.courts (club_id);


-------------------------
-- pricing_rules
-------------------------
create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references public.courts(id),

  days_of_week smallint[] not null,   -- 1=lunes ... 7=domingo

  start_minutes integer not null,     -- minutos desde medianoche
  end_minutes integer not null,

  amount_cents integer not null,
  currency char(3) not null default 'EUR',

  active boolean not null default true,
  valid_from timestamptz,
  valid_to timestamptz
);

create index if not exists idx_pricing_rules_court_id
  on public.pricing_rules (court_id);


-------------------------
-- bookings
-------------------------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),

  court_id uuid not null references public.courts(id),
  organizer_player_id uuid not null references public.players(id),

  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone text not null default 'Europe/Madrid',

  total_price_cents integer not null,
  currency char(3) not null default 'EUR',
  pricing_rule_ids uuid[],

  status text not null default 'pending_payment'
    check (status in ('pending_payment','confirmed','cancelled','completed')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  cancelled_at timestamptz,
  cancelled_by text
    check (cancelled_by in ('player','owner','system')),

  cancellation_reason text
);

create index if not exists idx_bookings_court_id on public.bookings (court_id);
create index if not exists idx_bookings_organizer on public.bookings (organizer_player_id);
create index if not exists idx_bookings_start_at on public.bookings (start_at);


-------------------------
-- booking_participants
-------------------------
create table if not exists public.booking_participants (
  id uuid primary key default gen_random_uuid(),

  booking_id uuid not null references public.bookings(id) on delete cascade,
  player_id uuid not null references public.players(id),

  role text not null
    check (role in ('organizer','guest')),

  share_amount_cents integer not null,
  payment_status text not null default 'pending'
    check (payment_status in ('pending','paid')),

  created_at timestamptz not null default now()
);

create unique index if not exists uq_booking_participants_booking_player
  on public.booking_participants (booking_id, player_id);

create index if not exists idx_booking_participants_player
  on public.booking_participants (player_id);


-------------------------
-- matches
-------------------------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),

  booking_id uuid not null references public.bookings(id) on delete cascade,

  visibility text not null default 'private'
    check (visibility in ('private','public')),

  elo_min integer,
  elo_max integer,
  gender text not null default 'any'
    check (gender in ('male','female','mixed','any')),

  competitive boolean not null default true,

  status text not null default 'pending'
    check (status in ('pending','in_progress','finished','cancelled')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_matches_booking_id
  on public.matches (booking_id);


-------------------------
-- match_players
-------------------------
create table if not exists public.match_players (
  id uuid primary key default gen_random_uuid(),

  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id),

  team text not null
    check (team in ('A','B')),

  invite_status text not null default 'invited'
    check (invite_status in ('invited','accepted','rejected')),

  result text not null default 'pending'
    check (result in ('win','loss','draw','pending')),

  rating_change integer not null default 0,

  created_at timestamptz not null default now()
);

create unique index if not exists uq_match_players_match_player
  on public.match_players (match_id, player_id);

create index if not exists idx_match_players_player
  on public.match_players (player_id);


-------------------------
-- payment_transactions
-------------------------
create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),

  booking_id uuid not null references public.bookings(id),
  payer_player_id uuid not null references public.players(id),

  amount_cents integer not null,
  currency char(3) not null default 'EUR',

  stripe_payment_intent_id text not null unique,

  platform_fee_amount_cents integer not null default 0,
  platform_fee_percentage numeric(5,4),

  status text not null default 'requires_action'
    check (status in ('requires_action','processing','succeeded','refunded','failed')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payment_transactions_booking
  on public.payment_transactions (booking_id);

create index if not exists idx_payment_transactions_payer
  on public.payment_transactions (payer_player_id);


-------------------------
-- privacy_logs
-------------------------
create table if not exists public.privacy_logs (
  id uuid primary key default gen_random_uuid(),

  user_id uuid, -- puede ser null/anonimizado
  action_type text not null
    check (action_type in (
      'accept_terms',
      'revoke_marketing',
      'delete_account_request',
      'export_data'
    )),

  occurred_at timestamptz not null default now(),
  ip text not null,
  user_agent text
);

create index if not exists idx_privacy_logs_user
  on public.privacy_logs (user_id);

create index if not exists idx_privacy_logs_action_type
  on public.privacy_logs (action_type);

