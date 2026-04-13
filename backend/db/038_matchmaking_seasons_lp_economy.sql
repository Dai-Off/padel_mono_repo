-- Doc 10: temporadas globales de LP (matchmaking), historial y aplicación atómica con nivelación.
-- Tabla propia `matchmaking_seasons` para no confundir con `league_seasons` por club.

create table if not exists public.matchmaking_seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_matchmaking_seasons_range on public.matchmaking_seasons (starts_at, ends_at);

create table if not exists public.player_league_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  season_id uuid not null references public.matchmaking_seasons(id) on delete restrict,
  liga text not null,
  final_lps integer not null,
  highest_liga text not null,
  created_at timestamptz not null default now(),
  unique (player_id, season_id)
);

create index if not exists idx_player_league_history_season on public.player_league_history (season_id);

alter table public.players
  add column if not exists league_season_id uuid references public.matchmaking_seasons(id),
  add column if not exists mm_shield_matches integer not null default 0,
  add column if not exists mm_peak_liga text;

update public.players set mm_peak_liga = coalesce(liga, 'bronce') where mm_peak_liga is null;

do $$
declare
  sid uuid;
begin
  if not exists (select 1 from public.matchmaking_seasons limit 1) then
    insert into public.matchmaking_seasons (name, starts_at, ends_at)
    values ('Temporada 1', '2026-01-01T00:00:00Z', '2099-12-31T23:59:59Z')
    returning id into sid;
    update public.players set league_season_id = sid where league_season_id is null;
  else
    select id into sid from public.matchmaking_seasons
    order by starts_at asc limit 1;
    update public.players set league_season_id = sid where league_season_id is null;
  end if;
end $$;

comment on table public.matchmaking_seasons is 'Temporadas de LP de matchmaking (doc 10 §2; paralelo al season pass).';
comment on table public.player_league_history is 'Snapshot fin de temporada: liga, LP finales y pico (doc 10 §5).';
comment on column public.players.league_season_id is 'Temporada activa de LP (matchmaking).';
comment on column public.players.mm_shield_matches is 'Partidos MM restantes con protección anti-descenso tras ascenso.';
comment on column public.players.mm_peak_liga is 'Mayor liga alcanzada en la temporada actual (matchmaking).';

-- RPC: añade aplicación de LP/liga en la misma transacción que la nivelación.
drop function if exists public.apply_leveling_pipeline(uuid, jsonb, jsonb, jsonb);

create or replace function public.apply_leveling_pipeline(
  p_match_id uuid,
  p_player_updates jsonb,
  p_match_player_updates jsonb,
  p_synergy_upserts jsonb,
  p_league_updates jsonb default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.matches%rowtype;
  item jsonb;
  n int;
begin
  select * into m from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'match_not_found';
  end if;
  if not m.competitive or m.score_status <> 'confirmed' then
    raise exception 'invalid_match_state';
  end if;
  if m.leveling_applied_at is not null then
    return;
  end if;

  for item in select * from jsonb_array_elements(p_player_updates)
  loop
    update public.players set
      mu = (item->>'mu')::double precision,
      sigma = (item->>'sigma')::double precision,
      beta = (item->>'beta')::double precision,
      beta_residuals = item->'beta_residuals',
      elo_rating = (item->>'elo_rating')::double precision,
      matches_played_competitive = (item->>'matches_played_competitive')::integer,
      matches_played_matchmaking = (item->>'matches_played_matchmaking')::integer,
      updated_at = now()
    where id = (item->>'id')::uuid;
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'player_update_failed %', item->>'id';
    end if;
  end loop;

  for item in select * from jsonb_array_elements(p_match_player_updates)
  loop
    update public.match_players set
      result = item->>'result',
      rating_change = (item->>'rating_change')::double precision,
      pre_match_win_prob = (item->>'pre_match_win_prob')::double precision
    where id = (item->>'id')::uuid and match_id = p_match_id;
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'match_player_update_failed %', item->>'id';
    end if;
  end loop;

  for item in select * from jsonb_array_elements(p_synergy_upserts)
  loop
    insert into public.player_synergies (player_id_1, player_id_2, value, matches_count, updated_at)
    values (
      (item->>'player_id_1')::uuid,
      (item->>'player_id_2')::uuid,
      (item->>'value')::double precision,
      (item->>'matches_count')::integer,
      now()
    )
    on conflict (player_id_1, player_id_2) do update set
      value = excluded.value,
      matches_count = excluded.matches_count,
      updated_at = now();
  end loop;

  if p_league_updates is not null and jsonb_array_length(p_league_updates) > 0 then
    for item in select * from jsonb_array_elements(p_league_updates)
    loop
      update public.players set
        lps = (item->>'lps')::integer,
        liga = item->>'liga',
        mm_shield_matches = (item->>'mm_shield_matches')::integer,
        mm_peak_liga = item->>'mm_peak_liga',
        league_season_id = (item->>'league_season_id')::uuid,
        updated_at = now()
      where id = (item->>'id')::uuid;
      get diagnostics n = row_count;
      if n <> 1 then
        raise exception 'league_update_failed %', item->>'id';
      end if;
    end loop;
  end if;

  update public.matches
  set leveling_applied_at = now(), updated_at = now()
  where id = p_match_id;
end;
$$;

grant execute on function public.apply_leveling_pipeline(uuid, jsonb, jsonb, jsonb, jsonb) to service_role;
