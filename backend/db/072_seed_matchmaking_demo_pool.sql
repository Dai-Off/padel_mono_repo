-- =============================================================================

-- 2/2 — Cola matchmaking demo (sin club preferido)

-- Los bots aceptan cualquier sede: club_id NULL en pool y favorite_clubs vacío.

-- Requiere haber ejecutado antes: 071_seed_matchmaking_demo_players.sql

-- =============================================================================



DO $$

DECLARE

  v_player_count int;

  v_inserted int;

BEGIN

  SELECT count(*)::int INTO v_player_count

  FROM public.players p

  WHERE p.email LIKE '%@padel-demo.local'

    AND p.status = 'active'

    AND p.onboarding_completed = true;



  IF v_player_count = 0 THEN

    RAISE EXCEPTION 'No hay jugadores demo. Ejecutá primero 071_seed_matchmaking_demo_players.sql (emails %%@padel-demo.local).';

  END IF;



  INSERT INTO public.matchmaking_pool (

    player_id,

    paired_with_id,

    club_id,

    max_distance_km,

    preferred_side,

    gender,

    available_from,

    available_until,

    status,

    search_lat,

    search_lng,

    expansion_offer,

    expansion_cycle_index,

    last_expansion_prompt_at,

    updated_at

  )

  SELECT

    p.id,

    NULL,

    NULL,

    NULL,

    'any',

    'any',

    (date_trunc('day', now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid')::timestamptz,

    (date_trunc('day', now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid')::timestamptz + interval '14 days',

    'searching',

    NULL,

    NULL,

    NULL,

    0,

    NULL,

    now()

  FROM public.players p

  WHERE p.email LIKE '%@padel-demo.local'

    AND p.status = 'active'

    AND p.onboarding_completed = true

  ON CONFLICT (player_id) DO UPDATE SET

    club_id = NULL,

    max_distance_km = NULL,

    preferred_side = EXCLUDED.preferred_side,

    gender = EXCLUDED.gender,

    available_from = EXCLUDED.available_from,

    available_until = EXCLUDED.available_until,

    status = 'searching',

    search_lat = NULL,

    search_lng = NULL,

    proposed_match_id = NULL,

    expansion_offer = NULL,

    expansion_cycle_index = 0,

    last_expansion_prompt_at = NULL,

    updated_at = now();



  GET DIAGNOSTICS v_inserted = ROW_COUNT;



  UPDATE public.players p

  SET favorite_clubs = ARRAY[]::text[], updated_at = now()

  WHERE p.email LIKE '%@padel-demo.local';



  RAISE NOTICE 'OK: % fila(s) en matchmaking_pool sin club preferido (% jugadores demo).', v_inserted, v_player_count;

END $$;



-- Verificación:

-- SELECT p.email, p.elo_rating, mp.club_id, mp.status,

--        mp.available_from AT TIME ZONE 'Europe/Madrid' AS desde_madrid,

--        mp.available_until AT TIME ZONE 'Europe/Madrid' AS hasta_madrid

-- FROM public.matchmaking_pool mp

-- JOIN public.players p ON p.id = mp.player_id

-- WHERE p.email LIKE '%@padel-demo.local'

-- ORDER BY p.elo_rating;


