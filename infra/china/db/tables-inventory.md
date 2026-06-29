# Inventario de la base (origen Supabase `oxowmfhnorxnabhzkcmi`)

> Capturado por **solo lectura** (`list_tables`) el 2026-06-25. Schema `public`.
> Sirve para dimensionar la migración de datos y verificar la réplica (`count(*)`).

- **Total: 113 tablas** en `public`.
- ~17 tablas vacías (0 filas) al momento de la captura.
- La tabla más pesada por lejos es `club_day_schedule` (~45.8k filas).

## Tablas con mayor volumen (>= 20 filas)

| Tabla | Filas |
|---|---|
| club_day_schedule | 45816 |
| booking_participants | 3722 |
| match_players | 3634 |
| bookings | 1611 |
| matches | 1275 |
| learning_questions | 633 |
| payment_transactions | 425 |
| learning_question_log | 265 |
| wallet_transactions | 242 |
| tournament_courts | 139 |
| tournament_booking_links | 136 |
| tournament_chat_messages | 123 |
| players | 120 |
| learning_puzzles | 118 |
| tournaments | 95 |
| player_direct_messages | 90 |
| tournament_inscriptions | 79 |
| onboarding_questions | 71 |
| players_vector | 68 |
| learning_sessions | 63 |
| match_feedback | 62 |
| pricing_rules | 52 |
| score_submissions | 46 |
| player_season_pass | 46 |
| courts | 41 |
| league_division_teams | 38 |
| reservation_type_prices | 37 |
| inventory_movements | 36 |
| coach_assessments | 35 |
| community_posts | 32 |
| community_post_content | 32 |
| store_stock_movements | 29 |
| community_likes | 28 |
| matchmaking_pool | 27 |
| learning_streaks | 24 |
| store_products | 24 |

## Resto (< 20 filas)

community_comments (19), tournament_teams (17), learning_course_progress (17),
club_cash_openings (16), club_portal_role_permissions (15), club_portal_invites (15),
club_school_course_days (15), club_cash_closings (15), club_school_fee_rules (14),
tournament_stage_matches (12), club_applications (11), learning_course_lessons (11),
league_divisions (9), club_school_course_enrollments (9), matchmaking_pair_invites (8),
matchmaking_reject_faults (8), player_synergies (8), club_school_courses (8),
club_tariffs (8), inventory_items (7), club_staff (6), store_collection_products (6),
club_owners (6), clubs (6), club_application_invites (6), club_reviews (5),
tournament_match_results (5), score_votes (5), club_portal_roles (5), fraud_alerts (4),
onboarding_answers (4), matchmaking_leagues (4), bonuses (4), onboarding_config (4),
club_portal_members (3), league_seasons (3), club_school_price_types (3),
club_cash_movements (3), inventory_categories (3), club_incidents (3), club_sports (3),
tournament_podium (3), learning_courses (2), tournament_entry_requests (2),
club_special_dates (2), community_bookmarks (2), club_school_private_lessons (2),
store_collections (2), season_pass_mission_definitions (1), store_tienda_settings (1),
season_pass_sp_how_rows (1), mobile_admins (1), booking_chat_messages (1),
club_daily_tariff_assignments (1), season_pass_seasons (1), tariff_forms (1),
admins (1), club_player_contacts (1), matchmaking_seasons (1).

**Vacías (0):** club_chat_mentions, privacy_logs, court_chat_messages,
booking_override_responses, player_league_history, tournament_stage_groups,
learning_shared_streaks, club_school_course_installments, league_teams,
club_player_segments, matchmaking_player_blocks, tournament_divisions,
club_tariff_defaults, tariff_form_slots, league_matches, club_day_overrides,
club_school_charges.

## Nota de seguridad (preexistente, NO modificar sin decisión)

El advisory de Supabase reporta **99 tablas con RLS deshabilitado**. Dado que la
`anon key` viaja en el bundle público del frontend, esas tablas quedan expuestas a
lectura/escritura directa vía la API REST de Supabase. No se corrige aquí (activar RLS
sin políticas rompería la app); se documenta para evaluar con el equipo.
