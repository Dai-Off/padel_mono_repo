-- Record W/L/E en partidos type=matchmaking con marcador confirmado (perfil, home liga).

create or replace function public.player_matchmaking_record(p_player_id uuid)
returns table (wins bigint, losses bigint, draws bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(count(*) filter (where mp.result = 'win'), 0)::bigint,
    coalesce(count(*) filter (where mp.result = 'loss'), 0)::bigint,
    coalesce(count(*) filter (where mp.result = 'draw'), 0)::bigint
  from match_players mp
  inner join matches m on m.id = mp.match_id
  where mp.player_id = p_player_id
    and m.type = 'matchmaking'
    and m.score_status = 'confirmed';
$$;

comment on function public.player_matchmaking_record(uuid) is
  'Cuenta victorias, derrotas y empates del jugador en matchmaking con score confirmado.';
