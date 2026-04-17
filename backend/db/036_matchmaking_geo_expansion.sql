-- Matchmaking: posición para max_distance_km (haversine al club) y ofertas de ampliación de criterios (§6).

alter table public.matchmaking_pool
  add column if not exists search_lat double precision,
  add column if not exists search_lng double precision,
  add column if not exists expansion_offer jsonb,
  add column if not exists expansion_cycle_index integer not null default 0,
  add column if not exists last_expansion_prompt_at timestamptz;

comment on column public.matchmaking_pool.search_lat is 'Latitud de referencia del jugador para comprobar max_distance_km respecto al club del partido.';
comment on column public.matchmaking_pool.search_lng is 'Longitud de referencia del jugador.';
comment on column public.matchmaking_pool.expansion_offer is 'Oferta activa de ampliar criterios (in-app + push opcional).';
comment on column public.matchmaking_pool.expansion_cycle_index is 'Cuántas rondas de ampliación ya se ofrecieron (0..n).';
comment on column public.matchmaking_pool.last_expansion_prompt_at is 'Última vez que se generó una oferta de ampliación.';
