# Flujo Completo Player -> Matchmaking (Camino Feliz)

Este documento describe el recorrido end-to-end de un jugador desde registro hasta partido de matchmaking confirmado, con los endpoints backend involucrados.

## 1) Registro y acceso

1. `POST /auth/register`
   - Crea usuario en Supabase Auth.
   - Crea o vincula fila en `players`.
   - Intenta asignar temporada MM activa (`league_season_id`) si existe.
2. `POST /auth/login`
   - Devuelve `access_token` y `refresh_token`.
3. `GET /players/me`
   - Devuelve perfil del jugador autenticado.
   - Incluye `elo_rating`, `liga`, `lps` y métricas de fiabilidad/partidos.

## 2) Onboarding y nivel inicial

1. `POST /players/onboarding`
   - Recibe respuestas del cuestionario inicial.
   - Calcula:
     - `mu`, `sigma`
     - `elo_rating` (escala 0-7)
     - `liga` inicial según bandas de `matchmaking_leagues`
   - Inicializa:
     - `lps = 0`
     - `mm_peak_liga = liga`
     - `league_season_id` (si hay temporada activa)
   - Marca `initial_rating_completed = true`.

Sin este paso, `POST /matchmaking/join` devuelve `403`.

## 3) Entrada a matchmaking

1. `POST /matchmaking/join`
   - Requiere JWT.
   - Requiere `available_from` y `available_until`.
   - Opcional:
     - `club_id`
     - `max_distance_km` (+ `search_lat`, `search_lng`)
     - `preferred_side`
     - `gender`
     - `paired_with_id`
   - Valida que el jugador no esté ya en pool.
   - Inserta fila en `matchmaking_pool` con `status = searching`.

2. `GET /matchmaking/status`
   - Permite a la app poll del estado.
   - Responde `not_in_pool | searching | matched`.
   - Puede incluir `expansion_offer` pendiente.

3. `DELETE /matchmaking/leave`
   - Salida voluntaria de cola (elimina fila de pool).

## 4) Ciclo de emparejamiento (servicio interno)

1. `POST /matchmaking/run-cycle` (cron/operador)
   - Ejecuta `runMatchmakingCycle()`.
2. El ciclo:
   - Expira propuestas vencidas.
   - Lanza escaneo de ampliaciones:
     - Near-miss de 3 jugadores compatibles (`§6.1`)
     - Ampliación progresiva (`§6.2`)
   - Evalúa cuartetos compatibles (horario, club/distancia, género, nivel, ligas).
   - Usa OpenSkill para balancear equipos.
   - Crea:
     - `bookings` (`pending_payment`)
     - `matches` (`type = matchmaking`)
     - `booking_participants`
     - `match_players`
   - Marca los 4 jugadores en pool como `matched`.

## 5) Ofertas de ampliación

1. `POST /matchmaking/expansion-respond`
   - Body: `{ accept: boolean }`
   - Ofertas soportadas:
     - `side_any`
     - `gender_any`
     - `dist_plus_5`
     - `dist_plus_10`
     - `near_group_distance`
     - `near_group_gender`
   - Si acepta, actualiza criterios de búsqueda en pool.

## 6) Propuesta de partido y pago

1. `GET /matchmaking/proposal`
   - Si el jugador está `matched`, devuelve:
     - `match_id`
     - `booking_id`
     - `confirm_deadline_at`
     - `pre_match_win_prob`
     - `your_participant_id`
     - `your_share_cents`
2. Pago de su plaza (flujo payments)
   - `POST /payments/create-intent` con `booking_id` + `participant_id`.
   - Confirmación vía webhook de Stripe.
3. Confirmación de reserva:
   - Para matchmaking, la reserva pasa a `confirmed` solo cuando pagan los 4.

## 7) Rechazo de propuesta

1. `POST /matchmaking/reject`
   - Libera propuesta y devuelve a pool a los otros jugadores.
   - Aplica penalización al rechazador:
     - resta de `lps`
     - incremento de `reject_count`

## 8) Resultado del partido y actualización de liga/LP

Cuando score competitivo queda confirmado:

1. Se ejecuta pipeline de nivelación (`runLevelingPipeline`):
   - OpenSkill (mu/sigma/beta)
   - `elo_rating`
   - contadores de partidos
2. Si `type = matchmaking`, además:
   - LP por victoria/derrota
   - ajuste cross-liga
   - ascenso/descenso
   - escudo anti-descenso
   - reconciliación liga vs elo (si diverge 2+ ligas)
3. Todo se persiste de forma atómica por RPC `apply_leveling_pipeline`.

## 9) Temporadas de ligas MM

1. `POST /matchmaking/close-season` (operador/cron)
   - Cierra temporada activa.
   - Archiva en `player_league_history`:
     - `liga`
     - `final_lps`
     - `highest_liga`
   - Crea nueva temporada.
   - Resetea `lps`, `mm_shield_matches` y `mm_peak_liga`.

2. `GET /players/me/league-history`
   - Devuelve historial por temporada cerrada.

3. `GET /matchmaking/league-config`
   - Devuelve configuración de ligas (`matchmaking_leagues`):
     - bandas de elo
     - orden
     - nombre de liga

## 10) Camino feliz resumido (app)

1. Usuario se registra: `POST /auth/register`
2. Login: `POST /auth/login`
3. Completa onboarding: `POST /players/onboarding`
4. Entra a cola: `POST /matchmaking/join`
5. La app consulta estado: `GET /matchmaking/status`
6. Cuando hay propuesta: `GET /matchmaking/proposal`
7. Paga su parte: `POST /payments/create-intent`
8. Los 4 pagan -> booking `confirmed`
9. Se juega y confirma score
10. Se actualizan elo + liga + lps automáticamente

