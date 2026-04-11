-- Solicitudes de ingreso a torneo (jugadores que no cumplen Elo u otras reglas automáticas)

create table if not exists public.tournament_entry_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id uuid not null references public.players(id),
  message text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'dismissed')),
  response_message text,
  resolved_at timestamptz
);

create index if not exists idx_tournament_entry_requests_tournament_status
  on public.tournament_entry_requests (tournament_id, status);

create index if not exists idx_tournament_entry_requests_player
  on public.tournament_entry_requests (player_id);

-- Una sola solicitud pendiente por jugador y torneo
create unique index if not exists ux_tournament_entry_requests_one_pending
  on public.tournament_entry_requests (tournament_id, player_id)
  where (status = 'pending');
