# API – Rutas disponibles

Base URL: `http://localhost:3000` (o la definida en `PORT`).

**Autenticación:** salvo que se indique *público*, las rutas suelen aceptar `Authorization: Bearer <access_token>` de Supabase Auth. Algunas exigen **dueño de club / admin** (`requireClubOwnerOrAdmin` o `requireAdmin`).

**Documentación OpenAPI:** muchos endpoints tienen bloques `@openapi` en el código; si el proyecto genera Swagger, úsalo como referencia detallada de body/query/respuestas.

---

## Raíz

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Mensaje de bienvenida de la API. |

---

## Auth (`/auth`)

Usuarios en Supabase Auth. Un usuario puede ser **jugador** (fila en `players`), **dueño de club** (`club_owners`) y/o **admin** (`admins`).

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/auth/register` | Registro como jugador. Body: `{ email, password, name? }`. |
| POST | `/auth/login` | Login. Body: `{ email, password }`. Devuelve `user` y `session` (`access_token`, `refresh_token`, `expires_at`). |
| POST | `/auth/forgot-password` | Recuperación de contraseña. Body: `{ email }`. |
| GET | `/auth/me` | Usuario actual y roles. **Bearer.** Respuesta: `{ user, roles: { player_id?, club_owner_id?, admin_id? }, clubs?: [...] }`. |
| POST | `/auth/register-club-owner` | Completar registro de dueño desde invite. Body: `{ application_id, token, password }`. |

---

## Health (`/health`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado del servidor. |
| GET | `/health/supabase` | Comprueba conexión a Supabase. |

---

## Home (`/home`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/home/zone-trends` | Tendencias por zona para dashboard/home. |

---

## Búsqueda (`/search`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/search/courts` | Búsqueda de pistas con disponibilidad. Query opcional: `date_from`, `date_to`, `indoor`, `glass_type`, etc. Excluye pistas ocultas (`is_hidden`) en listado público. |

---

## Solicitudes de club (`/club-applications`)

Crear solicitud y subir imagen son públicos. Listar, detalle, aprobar/rechazar/reenviar invite requieren **admin** (`Bearer` + fila en `admins`).

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/club-applications` | Crear solicitud (público). |
| POST | `/club-applications/upload` | Subir imagen (público). `multipart/form-data`, campo `file`. |
| GET | `/club-applications` | Listar (**admin**). Query: `?status=pending|contacted|approved|rejected`. |
| GET | `/club-applications/:id` | Detalle (**admin**). |
| GET | `/club-applications/:id/validate-invite` | Validar token del invite (público). Query: `?token=...`. |
| POST | `/club-applications/:id/approve` | Aprobar (**admin**). |
| POST | `/club-applications/:id/resend-invite` | Regenerar y reenviar invite (**admin**). |
| POST | `/club-applications/:id/reject` | Rechazar (**admin**). Body opcional: `{ reason }`. |

---

## Jugadores (`/players`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/players/me` | Perfil del jugador autenticado (**Bearer**). |
| PATCH | `/players/me` | Actualizar perfil propio: nombre, apellidos, `phone`, `avatar_url`. Con nombre+apellidos, el teléfono es obligatorio (en body o ya guardado). |
| POST | `/players/manual` | Alta manual de jugador (sin cuenta Auth). Body: `first_name`, `last_name`, `phone`; `email` opcional. |
| POST | `/players/onboarding` | Onboarding / cuestionario inicial del jugador. |
| GET | `/players` | Lista. Query opcional: `q` (nombre, apellido o teléfono). |
| GET | `/players/:id` | Detalle. |
| GET | `/players/:id/stats` | Estadísticas del jugador. |
| GET | `/players/:id/feedback-summary` | Resumen de feedback del jugador. |
| POST | `/players` | Crear jugador. |
| PUT | `/players/:id` | Actualizar jugador. |
| DELETE | `/players/:id` | Borrado lógico (`status=deleted`). |

> Las rutas con parámetro `:id` no deben coincidir con `me`, `manual`, `onboarding` (definidas antes en el router).

---

## Dueños de club (`/club-owners`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/club-owners` | Lista. |
| GET | `/club-owners/:id` | Detalle. |
| POST | `/club-owners` | Crear. |
| PUT | `/club-owners/:id` | Actualizar. |
| DELETE | `/club-owners/:id` | Borrado lógico. |

---

## Clubs (`/clubs`)

**Bearer** + dueño/admin en la práctica (router protegido).

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/clubs` | Lista. Query: `?owner_id=uuid`. |
| GET | `/clubs/:id` | Detalle. |
| POST | `/clubs` | Crear club. |
| PUT | `/clubs/:id` | Actualizar club. |
| DELETE | `/clubs/:id` | Borrado físico. |

---

## Pistas (`/courts`)

Crear/editar/borrar/reordenar requieren **dueño o admin** (`requireClubOwnerOrAdmin`). Listado y detalle pueden usarse con contexto según implementación (p. ej. pistas ocultas visibles para staff).

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/courts` | Listar. Query opcional: `?club_id=uuid`. |
| GET | `/courts/:id` | Detalle de una pista. |
| PUT | `/courts/reorder` | Reordenar pistas del club. |
| POST | `/courts` | Crear pista. |
| PUT | `/courts/:id` | Editar pista (`is_hidden`, `visibility_windows`, etc., según esquema). |
| DELETE | `/courts/:id` | Borrar pista. |

---

## Reservas (`/bookings`)

Usa `attachAuthContext`; el acceso por club depende de la lógica de cada handler.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/bookings` | Lista. Query: `court_id`, `club_id`, `organizer_player_id`, `date` (YYYY-MM-DD), etc. |
| GET | `/bookings/checkin/today` | Reservas del día para check-in (según filtros del handler). |
| GET | `/bookings/:id` | Detalle. |
| POST | `/bookings` | Crear reserva. |
| PUT | `/bookings/:id` | Actualizar reserva. |
| DELETE | `/bookings/:id` | Cancelar (`status=cancelled`). |
| POST | `/bookings/:id/mark-paid` | Marcar como pagada. |
| POST | `/bookings/:id/start-turn` | Iniciar turno / marcar inicio de reserva. |

---

## Participantes de reserva (`/booking-participants`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/booking-participants` | Lista. Query: `?booking_id=`, `?player_id=`. |
| GET | `/booking-participants/:id` | Detalle. |
| POST | `/booking-participants` | Crear participante. |
| PUT | `/booking-participants/:id` | Actualizar participante. |
| DELETE | `/booking-participants/:id` | Borrado físico. |

---

## Partidos (`/matches`)

Sub-rutas de **scores** y **feedback** se registran en el mismo stack bajo `/matches` (ver abajo).

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/matches` | Lista. Query: `?booking_id=`, `?expand=1`, etc. |
| GET | `/matches/:id` | Detalle. |
| POST | `/matches/create-with-booking` | Crear booking + match. |
| POST | `/matches` | Crear match sobre booking existente. |
| POST | `/matches/:id/prepare-join` | Preparar unión al partido (pre-check, pago/slot). |
| POST | `/matches/:id/join` | Unirse al partido. |
| PUT | `/matches/:id` | Actualizar match. |
| DELETE | `/matches/:id` | Cancelar match (`status=cancelled`). |

### Puntuación de partido (mismo prefijo `/matches`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/matches/:id/score` | Enviar / proponer resultado. |
| POST | `/matches/:id/score/confirm` | Confirmar resultado. |
| POST | `/matches/:id/score/dispute` | Disputar resultado. |
| POST | `/matches/:id/score/resolve` | Resolver disputa. |

### Feedback de partido

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/matches/:id/feedback` | Enviar feedback tras el partido. |

---

## Jugadores de partido (`/match-players`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/match-players` | Lista. Query: `?match_id=`, `?player_id=`. |
| GET | `/match-players/:id` | Detalle. |
| POST | `/match-players` | Alta (`match_id`, `player_id`, equipo A/B, etc.). |
| PUT | `/match-players/:id` | Actualizar (team, invite_status, result, rating_change, …). |
| DELETE | `/match-players/:id` | Borrado físico. |

---

## Matchmaking (`/matchmaking`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/matchmaking/join` | Entrar en cola / matchmaking. |
| DELETE | `/matchmaking/leave` | Salir de cola. |
| GET | `/matchmaking/status` | Estado actual del jugador en matchmaking. |
| POST | `/matchmaking/reject` | Rechazar propuesta de partido. |
| POST | `/matchmaking/run-cycle` | Ejecutar ciclo de emparejamiento (según política del backend). |

---

## Pagos (`/payments`)

El **webhook** de Stripe usa body raw y está montado en la app principal (no pasa por el JSON parser global).

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/payments/webhook` | Webhook Stripe (raw JSON). |
| GET | `/payments/transactions` | Transacciones del jugador autenticado. Query opcional: `?limit=`. |
| GET | `/payments/club-transactions` | Transacciones del club (**dueño/admin**). |
| GET | `/payments/cash-closing/expected` | Totales esperados para cierre de caja (**dueño/admin**). |
| GET | `/payments/cash-closing/records` | Listar cierres de caja (**dueño/admin**). |
| POST | `/payments/cash-closing/records` | Registrar cierre de caja (**dueño/admin**). |
| POST | `/payments/customer-portal` | Sesión del portal de cliente Stripe. |
| POST | `/payments/create-intent` | `PaymentIntent` para participante de un booking existente. |
| POST | `/payments/create-intent-for-new-match` | `PaymentIntent` para nuevo partido (sin booking/match aún). |
| POST | `/payments/confirm-client` | Confirmación tras pago (crea/actualiza entidades según metadata). |
| POST | `/payments/simulate-turn-payment` | Simulación de pago de turno/reserva (mock). |

---

## Precios por tipo de reserva (`/reservation-type-prices`)

**Bearer** + **dueño o admin** con acceso al `club_id`.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/reservation-type-prices` | Precios por tipo. Query obligatoria: `?club_id=uuid`. |
| PUT | `/reservation-type-prices` | Actualizar precios por tipo para el club. |

---

## Pricing rules (`/pricing-rules`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/pricing-rules/seed-defaults` | Sembrar reglas de pricing por defecto. |

---

## Personal del club (`/club-staff`)

**Bearer** + **dueño o admin**.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/club-staff` | Listar. Query: `?club_id=` (requerido). |
| POST | `/club-staff` | Crear miembro. |
| PUT | `/club-staff/:id` | Actualizar miembro. |
| DELETE | `/club-staff/:id` | Eliminar miembro. |

---

## Clientes del club / CRM (`/club-clients`)

**Bearer** + **dueño o admin**.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/club-clients` | Listar clientes del club (query según handler). |
| GET | `/club-clients/export` | Export (p. ej. CSV). |
| POST | `/club-clients/manual` | Alta manual de cliente. |
| POST | `/club-clients/send-email` | Envío de email a clientes. |
| PUT | `/club-clients/:playerId` | Actualizar datos del cliente. |

---

## Reseñas (`/club-reviews`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/club-reviews` | Listar reseñas del club (**dueño/admin**). Query: `?club_id=`. |
| POST | `/club-reviews` | Crear reseña (jugador autenticado; según validaciones del handler). |
| PATCH | `/club-reviews/:id` | Actualizar reseña (propietario / reglas del handler). |
| DELETE | `/club-reviews/:id` | Eliminar reseña. |

---

## Inventario (`/inventario`)

**Bearer** + **dueño o admin**.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/inventario/items` | Listar ítems. |
| POST | `/inventario/items` | Crear ítem. |
| PUT | `/inventario/items/:id` | Actualizar ítem. |
| DELETE | `/inventario/items/:id` | Eliminar ítem. |
| POST | `/inventario/items/:id/image` | Subir imagen (`multipart/form-data`, campo `file`). |
| GET | `/inventario/movements` | Listar movimientos de stock. |
| POST | `/inventario/movements` | Crear movimiento de stock. |

---

## Escuela (`/school-courses`)

**Bearer** + **dueño o admin**.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/school-courses` | Listar cursos. |
| GET | `/school-courses/slots` | Slots / ocupación por día. Query: `club_id`, `date` (YYYY-MM-DD). |
| GET | `/school-courses/:id` | Detalle de curso (UUID; la ruta `slots` se resuelve aparte en el router). |
| POST | `/school-courses` | Crear curso. |
| PUT | `/school-courses/:id` | Actualizar curso. |
| DELETE | `/school-courses/:id` | Eliminar curso. |
| POST | `/school-courses/:id/enrollments` | Crear inscripción / alumno en el curso. |

## Aprendizaje (`/learning`)

Requiere auth de jugador (`Authorization: Bearer <access_token>`).

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/learning/daily-lesson` | Obtener 5 preguntas seleccionadas para el usuario. Query: `?timezone=Asia/Shanghai`. |
| POST | `/learning/daily-lesson/complete` | Registrar resultado de la lección diaria. Body: `{ timezone, answers }`. |
| GET | `/learning/streak` | Racha individual del usuario + multiplicador activo. |
| GET | `/learning/shared-streaks` | Rachas compartidas del usuario con info del compañero. |
| POST | `/learning/shared-streaks` | Crear racha compartida. Body: `{ partner_id }`. |
| GET | `/learning/courses` | Cursos activos con progreso y estado locked según nivel del jugador. |
| GET | `/learning/courses/:id` | Detalle de curso con lecciones y estado (completed/available/locked). Sin lecciones si locked. |
| POST | `/learning/courses/:id/complete-lesson` | Marcar lección completada. Body: `{ lesson_id }`. Valida nivel y orden secuencial. |

### Gestión de preguntas (club owner / admin)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/learning/questions` | Crear pregunta. Body: `{ club_id, type, level, area, has_video, video_url, content }`. |
| PUT | `/learning/questions/:id` | Actualizar pregunta. |
| PATCH | `/learning/questions/:id/deactivate` | Desactivar pregunta (soft delete). |
| GET | `/learning/questions` | Listar preguntas del club. Query: `?club_id=...&type=...&area=...&is_active=true`. |

### Gestión de cursos (club owner / admin)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/learning/courses` | Crear curso en draft. Body: `{ club_id, title, description, banner_url, elo_min, elo_max, pedagogical_goal }`. |
| PUT | `/learning/courses/:id` | Actualizar curso (solo en draft). |
| POST | `/learning/courses/:id/lessons` | Añadir lección a curso (solo en draft). Body: `{ title, description, video_url, duration_seconds }`. |
| PUT | `/learning/courses/:id/lessons/:lessonId` | Actualizar lección (solo en draft). |
| DELETE | `/learning/courses/:id/lessons/:lessonId` | Eliminar lección (solo en draft). Re-ordena automáticamente. |
| POST | `/learning/courses/:id/submit` | Enviar curso a revisión (mínimo 2 lecciones). |

## Privacidad (privacy_logs) – solo escritura

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/privacy-logs` | Registrar evento GDPR (`action_type`: accept_terms, revoke_marketing, delete_account_request, export_data). |

---

## Torneos (`/tournaments`)

Parte de las rutas están en `tournamentInvites.ts` (mismo prefijo). Muchas operaciones requieren **dueño o admin** del club del torneo.

### Invitaciones (router de invites)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/tournaments/:id/invites` | Crear/enviar invitaciones a inscripción (**dueño/admin**). |
| POST | `/tournaments/invites/:token/accept` | Aceptar invitación por token (público o según token). |

### Gestión y vista club

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/tournaments` | Listar torneos del club (**dueño/admin**). |
| GET | `/tournaments/:id` | Detalle + inscripciones (**dueño/admin**). |
| POST | `/tournaments` | Crear torneo (**dueño/admin**). |
| PUT | `/tournaments/:id` | Actualizar torneo (**dueño/admin**). |
| POST | `/tournaments/:id/cancel` | Cancelar torneo (**dueño/admin**). |
| POST | `/tournaments/:id/join-owner` | Inscribir / acción de dueño sobre cupo (**dueño/admin**). |
| POST | `/tournaments/:id/participants` | Añadir participante (**dueño/admin**). |
| PUT | `/tournaments/:id/inscriptions/:inscriptionId/division` | Asignar categoría/división a inscripción (**dueño/admin**). |
| DELETE | `/tournaments/:id/inscriptions/:inscriptionId` | Eliminar inscripción (**dueño/admin**). |
| POST | `/tournaments/:id/inscriptions/swap-singles` | Intercambiar parejas modo individual (**dueño/admin**). |
| PUT | `/tournaments/:id/inscriptions/singles-pairing` | Configurar emparejamientos singles (**dueño/admin**). |
| POST | `/tournaments/:id/inscriptions/:inscriptionId/assign-partner` | Asignar pareja a inscripción (**dueño/admin**). |
| GET | `/tournaments/:id/chat` | Historial de chat del torneo (**dueño/admin**). |
| POST | `/tournaments/:id/chat` | Enviar mensaje al chat (**dueño/admin**). |

### Público / jugador

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/tournaments/public/list` | Listado público de torneos. Query opcional: `club_id`. |
| POST | `/tournaments/:id/join` | Unirse al torneo como jugador (**Bearer**). |
| POST | `/tournaments/:id/join-pair` | Inscripción en pareja (**Bearer**). |
| POST | `/tournaments/:id/leave` | Abandonar / cancelar inscripción (**Bearer**). |
| GET | `/tournaments/:id/player-detail` | Detalle para jugador inscrito o según permisos. |
| GET | `/tournaments/:id/chat/player` | Chat vista jugador. |
| POST | `/tournaments/:id/chat/player` | Enviar mensaje como jugador. |
| GET | `/tournaments/:id/competition/public-view` | Cuadros, partidos y resultados (vista pública). |

### Competición (admin club)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/tournaments/:id/competition/setup` | Configurar formato, `match_rules` (p. ej. `bracket_seed_strategy`), `standings_rules`. |
| POST | `/tournaments/:id/competition/generate` | Generar cuadros/fixtures automáticamente. |
| POST | `/tournaments/:id/competition/generate-manual` | Generar con orden manual de equipos (`team_keys`). |
| GET | `/tournaments/:id/competition/admin-view` | Vista completa de competición para gestión. |
| POST | `/tournaments/:id/matches/:matchId/result` | Registrar resultado de un partido del cuadro. |
| PUT | `/tournaments/:id/podium` | Guardar podio manual. |

---

## Ligas internas (`/leagues`)

**Bearer** + **dueño o admin** (acceso al `club_id` de la temporada).

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/leagues/clubs/:clubId/seasons` | Listar temporadas del club. |
| POST | `/leagues/clubs/:clubId/seasons` | Crear temporada con divisiones (body: `name`, `divisions[]`, fechas opcionales). |
| GET | `/leagues/seasons/:seasonId` | Detalle: temporada + divisiones + equipos. |
| POST | `/leagues/divisions/:divisionId/teams` | Añadir equipo (`team_label`, `sort_order`). |
| PATCH | `/leagues/division-teams/:teamId` | Actualizar `sort_order` (menor = mejor clasificación). |
| POST | `/leagues/seasons/:seasonId/apply-promotion-relegation` | Aplicar ascensos/descensos según `promote_count` / `relegate_count` y cerrar temporada. |

---

## Privacidad (`/privacy-logs`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/privacy-logs` | Registrar evento GDPR (`action_type`: p. ej. `accept_terms`, `revoke_marketing`, `delete_account_request`, `export_data`). |

---

## Notas operativas

- **Migraciones SQL:** carpeta `backend/db/` (y/o `supabase/migrations` si el proyecto lo unifica).
- **Admin / email:** ver `docs/CREAR_ADMIN.md`, `docs/EMAIL_EDGE_FUNCTIONS.md` u otras guías en `backend/docs/`.
