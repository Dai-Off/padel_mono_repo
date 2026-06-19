-- Invitaciones para entrar a matchmaking competitivo en pareja (premade duo).
-- A invita a B; al aceptar (o al "buscar" de A) se encola a ambos con paired_with_id mutuo.

create table if not exists public.matchmaking_pair_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  inviter_player_id uuid not null references public.players(id) on delete cascade,
  invitee_player_id uuid not null references public.players(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'searching', 'rejected', 'cancelled', 'expired')),
  -- Parámetros de cola que fijó el invitador (compartidos por la pareja).
  prefs jsonb not null,
  expires_at timestamptz not null,
  resolved_at timestamptz,
  constraint matchmaking_pair_invites_no_self check (inviter_player_id <> invitee_player_id)
);

comment on table public.matchmaking_pair_invites is 'Invitaciones de pareja para matchmaking competitivo (doc parejas).';
comment on column public.matchmaking_pair_invites.prefs is 'Params de cola del invitador: available_from/until, club_id, preferred_club_ids, max_distance_km, preferred_side, gender, search_lat/lng.';

-- Solo una invitación activa (pendiente o aceptada) por par invitador→invitado.
create unique index if not exists ux_matchmaking_pair_invites_active
  on public.matchmaking_pair_invites (inviter_player_id, invitee_player_id)
  where status in ('pending', 'accepted');

create index if not exists idx_matchmaking_pair_invites_invitee
  on public.matchmaking_pair_invites (invitee_player_id, status);
create index if not exists idx_matchmaking_pair_invites_inviter
  on public.matchmaking_pair_invites (inviter_player_id, status);
