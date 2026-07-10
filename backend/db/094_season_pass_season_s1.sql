-- 094_season_pass_season_s1.sql — Real S1 season window + full mission pool (season pass v2, phase 1).
--
-- ORDER: run AFTER 091_season_pass_missions_v2.sql (adds `assignment` and
-- `condition_params` to season_pass_mission_definitions). Fixes the seeded
-- season that expired 2026-04-30 while still active=true.
--
-- Idempotent: missions upsert by (season_slug, slug). `active` is only set on
-- first insert — re-running never overrides manual flips (e.g. enabling
-- daily_follow / daily_share once the social features ship).

-- ────────────────────────────────────────────────────────────
-- SECTION 1 — Extend season s1 (decided 2026-07-07): as if it had started
-- 2026-06-01 → ends 2026-09-01 (3 months). Adds the per-season boost cap
-- (season row is the pass economy config: sp_per_level, max_level, …).
-- ────────────────────────────────────────────────────────────

alter table public.season_pass_seasons
  add column if not exists boost_cap numeric(4,2) not null default 2.00
    check (boost_cap >= 1);

comment on column public.season_pass_seasons.boost_cap is
  'Global cap on stacked SP multipliers: sp_final = sp_base * clamp(1 + Σ bonuses, 1, boost_cap).';

-- Temporada de 45 días (decidido 2026-07-09): inicio 2026-07-01 → fin 2026-08-15,
-- 50 niveles (antes 100). max_level es data-driven: el track y el hero se ajustan solos.
update public.season_pass_seasons
set max_level = 50,
    ends_at = '2026-08-15T00:00:00Z',
    subtitle = 'Jul – Ago 2026',
    updated_at = now()
where slug = 's1';

-- ────────────────────────────────────────────────────────────
-- SECTION 2 — Mission pool (requires 091).
--
-- condition_key = event type; the mission `period` bounds the date range,
-- `target_count` is the event count, `condition_params` refines the filter.
-- Keys the engine must support (phase 1 evaluators):
--   daily_lesson            learning_sessions completed in period
--   active_day              player_active_days rows in period (table in 096)
--   match_completed         finished matches w/ confirmed score; params:
--                           {"kind":"league"|"matchmaking"}, {"weekend":true},
--                           {"start_after":"20:00"}, {"start_before":"14:00"},
--                           {"distinct":"club"|"partner"}, {"same":"partner"}
--   match_victory           match_players.result='win'; params {"competitive":true}
--   victory_streak          longest consecutive-win run within period
--   booking_created         bookings created by player in period
--   class_booking           bookings with reservation_type in ('school_group','school_individual')
--   rating_submitted        post-match ratings sent (match_feedback)
--   community_comment       comments on community posts
--   user_follow             follows created (player_follows — social team, seeded inactive)
--   share_external          community_share_events channel in ('external','join_link')
--                           (social team, seeded inactive)
--   missions_completed      pass missions completed in period; params {"period":"weekly"}
--   zero_matchmaking_faults 0 rows in matchmaking_reject_faults in period;
--                           params {"grant_at_period_end":true} → granted on period close
-- ────────────────────────────────────────────────────────────

insert into public.season_pass_mission_definitions
  (season_slug, slug, icon, title, description, period, target_count, sp_reward,
   sort_order, condition_key, condition_params, assignment, reward_hint, active)
-- SP recalibrado (2026-07-10): fisicas >> simples. Base diaria: muy simple 100,
-- leccion 200, fisica media 450, fisica alta 700. Escalado semanal/temporada.
-- Cualitativas nuevas activas; torneo/tienda/curso-completo inactivas hasta su
-- evaluador (flip de active al implementarlo).
values
  -- Fixed daily anchor (outside the draw)
  ('s1', 'daily_lesson', '📚', 'Lección diaria', 'Completa la lección del día y mantén tu racha.',
   'daily', 1, 200, 0, 'daily_lesson', '{}', 'daily_fixed',
   'La constancia cuenta: mantén tu racha diaria.', true),

  -- Daily pool (3/day per player, deterministic draw)
  ('s1', 'daily_active', '☀️', 'Pásate por WeMatch', 'Abre la app hoy.',
   'daily', 1, 100, 10, 'active_day', '{}', 'daily_pool', null, true),
  ('s1', 'daily_match', '🎾', 'Juega un partido', 'Completa un partido con marcador confirmado.',
   'daily', 1, 700, 11, 'match_completed', '{}', 'daily_pool', null, true),
  ('s1', 'daily_league_match', '🏆', 'Partido de Liga', 'Juega un partido de tu liga.',
   'daily', 1, 700, 12, 'match_completed', '{"kind":"league"}', 'daily_pool', null, true),
  ('s1', 'daily_matchmaking_match', '🤖', 'Partido de Matchmaking', 'Juega un partido encontrado por el matchmaking.',
   'daily', 1, 700, 13, 'match_completed', '{"kind":"matchmaking"}', 'daily_pool', null, true),
  ('s1', 'daily_victory', '🥇', 'Gana un partido', 'Consigue una victoria hoy.',
   'daily', 1, 700, 14, 'match_victory', '{}', 'daily_pool', null, true),
  ('s1', 'daily_competitive_victory', '⚔️', 'Victoria competitiva', 'Gana un partido competitivo.',
   'daily', 1, 700, 15, 'match_victory', '{"competitive":true}', 'daily_pool', null, true),
  ('s1', 'daily_straight_win', '💥', 'Victoria sin ceder set', 'Gana un partido 2-0.',
   'daily', 1, 750, 16, 'match_victory', '{"straight":true}', 'daily_pool', null, true),
  ('s1', 'daily_booking', '📅', 'Reserva una pista', 'Crea una reserva de pista.',
   'daily', 1, 450, 17, 'booking_created', '{}', 'daily_pool', null, true),
  ('s1', 'daily_class', '🎓', 'Reserva una clase', 'Reserva una clase de academia.',
   'daily', 1, 450, 18, 'class_booking', '{}', 'daily_pool', null, true),
  ('s1', 'daily_lesson_80', '🎯', 'Lección notable', 'Acierta el 80% de la lección de hoy.',
   'daily', 1, 250, 19, 'lesson_score', '{"min":80}', 'daily_pool', null, true),
  ('s1', 'daily_lesson_perfect', '💯', 'Lección perfecta', 'Acierta todas las preguntas de la lección.',
   'daily', 1, 300, 20, 'lesson_perfect', '{}', 'daily_pool', null, true),
  ('s1', 'daily_rating', '⭐', 'Valora un partido', 'Envía tu valoración tras un partido.',
   'daily', 1, 100, 21, 'rating_submitted', '{}', 'daily_pool', null, true),
  ('s1', 'daily_comment', '💬', 'Comenta en la comunidad', 'Deja un comentario en una publicación.',
   'daily', 1, 100, 22, 'community_comment', '{}', 'daily_pool', null, true),
  ('s1', 'daily_post', '📸', 'Publica en el feed', 'Comparte una publicación con la comunidad.',
   'daily', 1, 100, 23, 'community_post', '{}', 'daily_pool', null, true),
  ('s1', 'daily_follow', '➕', 'Sigue a un jugador', 'Empieza a seguir a otro jugador.',
   'daily', 1, 100, 24, 'user_follow', '{}', 'daily_pool', null, false),
  ('s1', 'daily_share', '📣', 'Comparte', 'Comparte un partido o un logro.',
   'daily', 1, 100, 25, 'share_external', '{}', 'daily_pool', null, false),

  -- Weekly pool (6 active per ISO week, same for everyone)
  ('s1', 'weekly_matches_3', '🎾', 'Semana de pádel', 'Juega 3 partidos esta semana.',
   'weekly', 3, 2500, 30, 'match_completed', '{}', 'weekly_calendar', null, true),
  ('s1', 'weekly_victories_2', '🥇', 'Doblete ganador', 'Gana 2 partidos esta semana.',
   'weekly', 2, 2500, 31, 'match_victory', '{}', 'weekly_calendar', null, true),
  ('s1', 'weekly_league_matches_2', '🏆', 'Semana de Liga', 'Juega 2 partidos de Liga.',
   'weekly', 2, 2500, 32, 'match_completed', '{"kind":"league"}', 'weekly_calendar', null, true),
  ('s1', 'weekly_matchmaking_matches_2', '🤖', 'Rivales a tu medida', 'Juega 2 partidos de Matchmaking.',
   'weekly', 2, 2500, 33, 'match_completed', '{"kind":"matchmaking"}', 'weekly_calendar', null, true),
  ('s1', 'weekly_distinct_clubs_2', '🗺️', 'De gira', 'Juega en 2 clubes distintos.',
   'weekly', 2, 2500, 34, 'match_completed', '{"distinct":"club"}', 'weekly_calendar', null, true),
  ('s1', 'weekly_weekend_match', '🎉', 'Finde de pádel', 'Juega un partido en fin de semana.',
   'weekly', 1, 1800, 35, 'match_completed', '{"weekend":true}', 'weekly_calendar', null, true),
  ('s1', 'weekly_night_match', '🌙', 'Nocturno', 'Juega un partido que empiece después de las 20:00.',
   'weekly', 1, 1800, 36, 'match_completed', '{"start_after":"20:00"}', 'weekly_calendar', null, true),
  ('s1', 'weekly_early_match', '🌅', 'Madrugador', 'Juega un partido que empiece antes de las 14:00.',
   'weekly', 1, 1800, 37, 'match_completed', '{"start_before":"14:00"}', 'weekly_calendar', null, true),
  ('s1', 'weekly_distinct_partners_3', '🤝', 'Bien acompañado', 'Juega con 3 compañeros distintos.',
   'weekly', 3, 2500, 38, 'match_completed', '{"distinct":"partner"}', 'weekly_calendar', null, true),
  ('s1', 'weekly_bookings_2', '📅', 'Pista asegurada', 'Crea 2 reservas esta semana.',
   'weekly', 2, 1500, 39, 'booking_created', '{}', 'weekly_calendar', null, true),
  ('s1', 'weekly_new_club', '🧭', 'Nuevo territorio', 'Reserva en un club donde no habías jugado.',
   'weekly', 1, 1500, 40, 'booking_created', '{"new_club":true}', 'weekly_calendar', null, true),
  ('s1', 'weekly_classes_2', '🎓', 'Semana de Academia', 'Reserva 2 clases esta semana.',
   'weekly', 2, 1500, 41, 'class_booking', '{}', 'weekly_calendar', null, true),
  ('s1', 'weekly_lessons_5', '📚', 'Constancia', 'Completa 5 lecciones diarias.',
   'weekly', 5, 700, 42, 'daily_lesson', '{}', 'weekly_calendar', null, true),
  ('s1', 'weekly_lessons_80_3', '🎯', 'Semana notable', 'Acierta el 80% en 3 lecciones esta semana.',
   'weekly', 3, 900, 43, 'lesson_score', '{"min":80}', 'weekly_calendar', null, true),
  ('s1', 'weekly_course_lesson', '🎧', 'Sigue formándote', 'Completa una lección de curso.',
   'weekly', 1, 700, 44, 'course_lesson', '{}', 'weekly_calendar', null, true),
  ('s1', 'weekly_ratings_3', '⭐', 'Buen feedback', 'Valora 3 partidos esta semana.',
   'weekly', 3, 450, 45, 'rating_submitted', '{}', 'weekly_calendar', null, true),
  -- Inactivas: sin evaluador todavia (torneos/tienda)
  ('s1', 'weekly_tournament_join', '🏟️', 'A competir', 'Inscríbete en un torneo.',
   'weekly', 1, 1500, 46, 'tournament_join', '{}', 'weekly_calendar', null, false),
  ('s1', 'weekly_tournament_win', '🏆', 'Victoria de torneo', 'Gana un partido de torneo.',
   'weekly', 1, 2000, 47, 'tournament_match_win', '{}', 'weekly_calendar', null, false),
  ('s1', 'weekly_store_purchase', '🛒', 'De compras', 'Realiza una compra en la tienda.',
   'weekly', 1, 450, 48, 'store_purchase', '{}', 'weekly_calendar', null, false),

  -- Monthly / temporada (all active from day 1)
  ('s1', 'monthly_matches_12', '🎾', 'Maratón mensual', 'Juega 12 partidos este mes.',
   'monthly', 12, 7000, 60, 'match_completed', '{}', 'monthly_all', null, true),
  ('s1', 'monthly_victories_6', '🏅', 'Media docena', 'Gana 6 partidos este mes.',
   'monthly', 6, 7000, 61, 'match_victory', '{}', 'monthly_all', null, true),
  ('s1', 'monthly_win_streak_3', '🔥', 'En racha', 'Encadena 3 victorias seguidas.',
   'monthly', 3, 4500, 62, 'victory_streak', '{}', 'monthly_all', null, true),
  ('s1', 'monthly_active_days_15', '📆', 'Siempre al día', 'Entra en WeMatch 15 días distintos.',
   'monthly', 15, 1200, 63, 'active_day', '{}', 'monthly_all', null, true),
  ('s1', 'monthly_classes_4', '🎓', 'Mes de Academia', 'Reserva 4 clases este mes.',
   'monthly', 4, 4500, 64, 'class_booking', '{}', 'monthly_all', null, true),
  ('s1', 'monthly_bookings_6', '📅', 'Organizador', 'Crea 6 reservas este mes.',
   'monthly', 6, 4500, 65, 'booking_created', '{}', 'monthly_all', null, true),
  ('s1', 'monthly_distinct_clubs_3', '🗺️', 'Explorador', 'Juega en 3 clubes distintos.',
   'monthly', 3, 4500, 66, 'match_completed', '{"distinct":"club"}', 'monthly_all', null, true),
  ('s1', 'monthly_same_partner_4', '👯', 'Pareja fija', 'Juega 4 partidos con el mismo compañero.',
   'monthly', 4, 4500, 67, 'match_completed', '{"same":"partner"}', 'monthly_all', null, true),
  ('s1', 'monthly_weekly_missions_12', '✅', 'Cazamisiones', 'Completa 12 misiones semanales.',
   'monthly', 12, 1800, 68, 'missions_completed', '{"period":"weekly"}', 'monthly_all', null, true),
  ('s1', 'monthly_lessons_20', '📚', 'Estudiante de pádel', 'Completa 20 lecciones diarias.',
   'monthly', 20, 2000, 69, 'daily_lesson', '{}', 'monthly_all', null, true),
  ('s1', 'monthly_ratings_10', '⭐', 'Voz de la comunidad', 'Valora 10 partidos este mes.',
   'monthly', 10, 1200, 70, 'rating_submitted', '{}', 'monthly_all', null, true),
  ('s1', 'monthly_zero_faults', '🛡️', 'Jugador fiable', 'Termina el mes sin penalizaciones de matchmaking.',
   'monthly', 1, 3500, 71, 'zero_matchmaking_faults', '{"grant_at_period_end":true}', 'monthly_all', null, true),
  -- Inactivas: sin evaluador todavia (curso completo / torneo)
  ('s1', 'monthly_course_completed', '🎓', 'Curso completado', 'Completa un curso entero de academia.',
   'monthly', 1, 1800, 72, 'course_completed', '{}', 'monthly_all', null, false),
  ('s1', 'monthly_tournament_semi', '🥈', 'Semifinalista', 'Llega a semifinales de un torneo.',
   'monthly', 1, 4000, 73, 'tournament_stage', '{"stage":"semi"}', 'monthly_all', null, false)

on conflict (season_slug, slug) do update set
  icon = excluded.icon,
  title = excluded.title,
  description = excluded.description,
  period = excluded.period,
  target_count = excluded.target_count,
  sp_reward = excluded.sp_reward,
  sort_order = excluded.sort_order,
  condition_key = excluded.condition_key,
  condition_params = excluded.condition_params,
  assignment = excluded.assignment,
  reward_hint = excluded.reward_hint;
  -- `active` intentionally NOT updated: manual flips survive re-runs.

-- ────────────────────────────────────────────────────────────
-- SECTION 3 — Refresh "how to earn SP" rows (old copy promised
-- 600 SP + streak multiplier on the lesson — obsolete).
-- Phase 3 (boost engine) will add the streak-boost row.
-- ────────────────────────────────────────────────────────────

delete from public.season_pass_sp_how_rows where season_slug = 's1';

insert into public.season_pass_sp_how_rows (season_slug, sort_order, icon, label, sp_hint) values
  ('s1', 0, '📚', 'Lección diaria', '200 SP fijos cada día'),
  ('s1', 1, '☀️', 'Misiones diarias', '3 retos nuevos cada día'),
  ('s1', 2, '📅', 'Misiones semanales', '6 retos compartidos cada semana'),
  ('s1', 3, '🌙', 'Misiones mensuales', 'Grandes retos durante todo el mes');
