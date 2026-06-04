alter table public.matchmaking_pool
  add column if not exists preferred_club_ids uuid[] not null default '{}'::uuid[];

comment on column public.matchmaking_pool.preferred_club_ids is
  'Clubes donde el jugador acepta jugar. Vacío = sin restricción de sede (solo distancia/geo si aplica).';
