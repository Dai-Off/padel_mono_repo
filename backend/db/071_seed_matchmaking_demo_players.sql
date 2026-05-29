-- =============================================================================
-- 1/2 — Jugadores demo matchmaking (15 bots, 5 bandas × 3, sin auth)
-- Ejecutar en Supabase SQL Editor ANTES del script 072.
--
-- Ajustá el club si hace falta (por defecto: primer club de la tabla).
-- Emails: *@padel-demo.local  |  Usernames: mm_<banda>_<n>
-- Sin club preferido: favorite_clubs vacío (aceptan cualquier sede en matchmaking).
-- =============================================================================

BEGIN;

-- Cambiá esto si querés un club concreto (solo referencia; no se asigna a los bots):
--   WHERE c.id = '36486753-9957-496e-bee1-a1c15adad27a'::uuid
WITH target_club AS (
  SELECT c.id AS club_id
  FROM public.clubs c
  ORDER BY c.created_at
  LIMIT 1
),
active_mm_season AS (
  SELECT ms.id AS season_id
  FROM public.matchmaking_seasons ms
  WHERE ms.starts_at <= now()
    AND ms.ends_at >= now()
  ORDER BY ms.starts_at DESC
  LIMIT 1
),
demo_rows AS (
  SELECT * FROM (VALUES
    ('mm_demo_bronce_1@padel-demo.local',  'mm_bronce_1',  'DemoBronce',  'M1', 1.20::double precision, 'male'),
    ('mm_demo_bronce_2@padel-demo.local',  'mm_bronce_2',  'DemoBronce',  'M2', 1.35,                 'female'),
    ('mm_demo_bronce_3@padel-demo.local',  'mm_bronce_3',  'DemoBronce',  'M3', 1.50,                 'male'),
    ('mm_demo_plata_b_1@padel-demo.local', 'mm_plata_b_1', 'DemoPlataB',  'M1', 2.40,                 'male'),
    ('mm_demo_plata_b_2@padel-demo.local', 'mm_plata_b_2', 'DemoPlataB',  'M2', 2.65,                 'female'),
    ('mm_demo_plata_b_3@padel-demo.local', 'mm_plata_b_3', 'DemoPlataB',  'M3', 2.85,                 'male'),
    ('mm_demo_plata_1@padel-demo.local',   'mm_plata_1',   'DemoPlata',   'M1', 3.20,                 'male'),
    ('mm_demo_plata_2@padel-demo.local',   'mm_plata_2',   'DemoPlata',   'M2', 3.45,                 'female'),
    ('mm_demo_plata_3@padel-demo.local',   'mm_plata_3',   'DemoPlata',   'M3', 3.65,                 'male'),
    ('mm_demo_oro_1@padel-demo.local',     'mm_oro_1',     'DemoOro',     'M1', 4.20,                 'male'),
    ('mm_demo_oro_2@padel-demo.local',     'mm_oro_2',     'DemoOro',     'M2', 4.45,                 'female'),
    ('mm_demo_oro_3@padel-demo.local',     'mm_oro_3',     'DemoOro',     'M3', 4.70,                 'male'),
    ('mm_demo_elite_1@padel-demo.local',   'mm_elite_1',   'DemoElite',   'M1', 5.60,                 'male'),
    ('mm_demo_elite_2@padel-demo.local',   'mm_elite_2',   'DemoElite',   'M2', 5.85,                 'female'),
    ('mm_demo_elite_3@padel-demo.local',   'mm_elite_3',   'DemoElite',   'M3', 6.10,                 'male')
  ) AS t(email, username, first_name, last_name, elo_rating, sex)
),
prepared AS (
  SELECT
    d.email,
    d.username,
    d.first_name,
    d.last_name,
    d.elo_rating,
    d.sex,
    (25.0 + (d.elo_rating - 3.5) * 1.8) AS mu,
    8.333::double precision AS sigma,
    4.167::double precision AS beta,
    CASE
      WHEN d.elo_rating < 2.0 THEN 'bronce'
      WHEN d.elo_rating < 4.0 THEN 'plata'
      WHEN d.elo_rating < 5.5 THEN 'oro'
      ELSE 'elite'
    END AS liga,
    tc.club_id,
    ams.season_id
  FROM demo_rows d
  CROSS JOIN target_club tc
  LEFT JOIN active_mm_season ams ON true
)
INSERT INTO public.players (
  first_name,
  last_name,
  email,
  username,
  status,
  auth_user_id,
  onboarding_completed,
  elo_rating,
  mu,
  sigma,
  beta,
  liga,
  sex,
  preferred_side,
  preferred_schedule_slots,
  preferred_days,
  preferred_play_style,
  preferred_match_duration_min,
  preferred_partner_level,
  favorite_clubs,
  league_season_id,
  mm_peak_liga,
  updated_at
)
SELECT
  p.first_name,
  p.last_name,
  p.email,
  p.username,
  'active',
  NULL,
  true,
  p.elo_rating,
  p.mu,
  p.sigma,
  p.beta,
  p.liga,
  p.sex,
  'both',
  ARRAY['morning', 'afternoon', 'evening']::text[],
  ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[],
  'competitive',
  90,
  'similar',
  ARRAY[]::text[],
  p.season_id,
  p.liga,
  now()
FROM prepared p
ON CONFLICT (email) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  username = EXCLUDED.username,
  status = 'active',
  onboarding_completed = true,
  elo_rating = EXCLUDED.elo_rating,
  mu = EXCLUDED.mu,
  sigma = EXCLUDED.sigma,
  beta = EXCLUDED.beta,
  liga = EXCLUDED.liga,
  sex = EXCLUDED.sex,
  preferred_side = EXCLUDED.preferred_side,
  preferred_schedule_slots = EXCLUDED.preferred_schedule_slots,
  preferred_days = EXCLUDED.preferred_days,
  preferred_play_style = EXCLUDED.preferred_play_style,
  preferred_match_duration_min = EXCLUDED.preferred_match_duration_min,
  preferred_partner_level = EXCLUDED.preferred_partner_level,
  favorite_clubs = EXCLUDED.favorite_clubs,
  league_season_id = COALESCE(EXCLUDED.league_season_id, public.players.league_season_id),
  mm_peak_liga = EXCLUDED.liga,
  updated_at = now();

COMMIT;

-- Verificación:
-- SELECT email, username, elo_rating, liga, onboarding_completed
-- FROM public.players WHERE email LIKE '%@padel-demo.local' ORDER BY elo_rating;
