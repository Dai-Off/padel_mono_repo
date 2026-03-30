# API MVP – Rutas disponibles

Base URL: `http://localhost:3000` (o la que uses en `PORT`).

## Root

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Mensaje de bienvenida de la API. |

## Auth

Usuarios en Supabase Auth. Un usuario puede ser **jugador** (fila en `players` con `auth_user_id`), **dueño de club** (fila en `club_owners` con `auth_user_id`) o ambos.

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/auth/register` | Registro como **jugador**. Body: `{ email, password, name? }`. Crea usuario Auth; si ya existe jugador manual con ese email, vincula `auth_user_id`; si no, crea fila en `players`. |
| POST | `/auth/login` | Login. Body: `{ email, password }`. Devuelve user y session (`access_token`, `refresh_token`, `expires_at`). |
| POST | `/auth/forgot-password` | Restablecer contraseña. Body: `{ email }`. Genera enlace de recuperación y envía email. |
| GET | `/auth/me` | Usuario actual y roles. Header: `Authorization: Bearer <access_token>`. Respuesta: `{ user, roles: { player_id?, club_owner_id?, admin_id? }, clubs?: [...] }`. |
| POST | `/auth/register-club-owner` | Completar registro de dueño desde invite. Body: `{ application_id, token, password }`. |

## Health

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado del servidor. |
| GET | `/health/supabase` | Comprueba conexión a Supabase. |

## Home

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/home/zone-trends` | Tendencias por zona para dashboard/home. |

## Search

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/search/courts` | Búsqueda de pistas. |

## Solicitudes de club (club_applications)

Crear solicitud y subir imagen son públicos. Listar, detalle, aprobar/rechazar/reenviar invite requieren admin (`Authorization: Bearer <token>` y usuario en `admins`).

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/club-applications` | Listar (**admin**). Query: `?status=pending|contacted|approved|rejected`. |
| GET | `/club-applications/:id` | Detalle (**admin**). |
| GET | `/club-applications/:id/validate-invite` | Validar token del invite. Query: `?token=...` (público). |
| POST | `/club-applications/:id/approve` | Aprobar solicitud (**admin**). |
| POST | `/club-applications/:id/resend-invite` | Regenerar y reenviar invite (**admin**). |
| POST | `/club-applications/:id/reject` | Rechazar solicitud (**admin**). Body opcional: `{ reason }`. |
| POST | `/club-applications/upload` | Subir imagen (público). Body `multipart/form-data` con campo `file`. |
| POST | `/club-applications` | Crear solicitud (público). |

## Jugadores (players)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/players/me` | Jugador actual por token. |
| GET | `/players` | Lista (filtros por query). |
| GET | `/players/:id` | Detalle. |
| POST | `/players/manual` | Alta manual de jugador (sin cuenta Auth). |
| POST | `/players` | Crear jugador. |
| PUT | `/players/:id` | Actualizar jugador. |
| DELETE | `/players/:id` | Borrado lógico (`status=deleted`). |

## Dueños de club (club_owners)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/club-owners` | Lista. |
| GET | `/club-owners/:id` | Detalle. |
| POST | `/club-owners` | Crear. |
| PUT | `/club-owners/:id` | Actualizar. |
| DELETE | `/club-owners/:id` | Borrado lógico. |

## Clubs

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/clubs` | Lista. Query: `?owner_id=uuid`. |
| GET | `/clubs/:id` | Detalle. |
| POST | `/clubs` | Crear club. |
| PUT | `/clubs/:id` | Actualizar club. |
| DELETE | `/clubs/:id` | Borrado físico. |

## Pistas (courts)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/courts` | Listar. Query opcional: `?club_id=uuid`. |
| PUT | `/courts/reorder` | Reordenar pistas del club. |
| GET | `/courts/:id` | Ver una pista. |
| POST | `/courts` | Crear pista. |
| PUT | `/courts/:id` | Editar pista. |
| DELETE | `/courts/:id` | Borrar pista. |

## Reservas (bookings)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/bookings` | Lista. Query: `?court_id=`, `?organizer_player_id=` |
| POST | `/bookings/:id/mark-paid` | Marcar reserva como pagada. |
| GET | `/bookings/:id` | Detalle. |
| POST | `/bookings` | Crear reserva. |
| PUT | `/bookings/:id` | Actualizar reserva. |
| DELETE | `/bookings/:id` | Cancelar reserva (`status=cancelled`). |

## Participantes de reserva (booking_participants)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/booking-participants` | Lista. Query: `?booking_id=`, `?player_id=` |
| GET | `/booking-participants/:id` | Detalle. |
| POST | `/booking-participants` | Crear participante. |
| PUT | `/booking-participants/:id` | Actualizar participante. |
| DELETE | `/booking-participants/:id` | Borrado físico. |

## Partidos (matches)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/matches` | Lista. Query: `?booking_id=`, `?expand=1`. |
| GET | `/matches/:id` | Detalle. |
| POST | `/matches/create-with-booking` | Crear booking + match. |
| POST | `/matches/:id/prepare-join` | Preparar unión a partido (pre-check y datos de pago/slot). |
| POST | `/matches/:id/join` | Unirse al partido. |
| POST | `/matches` | Crear match sobre booking existente. |
| PUT | `/matches/:id` | Actualizar match. |
| DELETE | `/matches/:id` | Cancelar match (`status=cancelled`). |

## Jugadores de partido (match_players)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/match-players` | Lista. Query: `?match_id=`, `?player_id=` |
| GET | `/match-players/:id` | Detalle. |
| POST | `/match-players` | Crear (match_id, player_id, team: A/B). |
| PUT | `/match-players/:id` | Actualizar (team, invite_status, result, rating_change). |
| DELETE | `/match-players/:id` | Borrado físico. |

## Pagos (payments)

Incluye flujo real con Stripe y flujo mock para pruebas.

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/payments/webhook` | Webhook de Stripe (raw body). |
| GET | `/payments/transactions` | Lista transacciones del jugador autenticado. Query opcional: `?limit=` |
| POST | `/payments/customer-portal` | Crea sesión del portal de cliente Stripe. |
| POST | `/payments/create-intent` | Crea PaymentIntent para participante de booking existente. |
| POST | `/payments/create-intent-for-new-match` | Crea PaymentIntent para nuevo partido (sin crear booking/match aún). |
| POST | `/payments/confirm-client` | Confirmación cliente tras pago exitoso (crea/actualiza entidades según metadata). |
| POST | `/payments/simulate-turn-payment` | Simula pasarela de pago de turno/reserva (mock, sin cobro real). |

## Precios por tipo de reserva (reservation_type_prices)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/reservation-type-prices` | Obtener precios por tipo para un club. |
| PUT | `/reservation-type-prices` | Actualizar precios por tipo para un club. |

## Pricing Rules

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/pricing-rules/seed-defaults` | Sembrar reglas de pricing por defecto. |

## Personal del club (club_staff)

Requiere auth y permisos de dueño/admin.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/club-staff` | Listar personal del club (`club_id` query requerido). |
| POST | `/club-staff` | Crear miembro de staff. |
| PUT | `/club-staff/:id` | Actualizar miembro de staff. |
| DELETE | `/club-staff/:id` | Eliminar miembro de staff. |

## Inventario (`/inventario`)

Requiere auth y permisos de dueño/admin.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/inventario/items` | Listar items. |
| POST | `/inventario/items` | Crear item. |
| PUT | `/inventario/items/:id` | Actualizar item. |
| DELETE | `/inventario/items/:id` | Eliminar item. |
| GET | `/inventario/movements` | Listar movimientos de stock. |
| POST | `/inventario/movements` | Crear movimiento de stock. |
| POST | `/inventario/items/:id/image` | Subir imagen de item (multipart/form-data). |

## Escuela (`/school-courses`)

Requiere auth y permisos de dueño/admin.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/school-courses` | Listar cursos. |
| GET | `/school-courses/:id` | Detalle de curso. |
| POST | `/school-courses` | Crear curso. |
| PUT | `/school-courses/:id` | Actualizar curso. |
| GET | `/school-courses/slots` | Consultar slots/disponibilidad de cursos. |
| DELETE | `/school-courses/:id` | Eliminar curso. |
| POST | `/school-courses/:id/enrollments` | Crear inscripción/alumno en curso. |

## Aprendizaje (`/learning`)

Requiere auth de jugador (`Authorization: Bearer <access_token>`).

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/learning/daily-lesson` | Obtener 5 preguntas seleccionadas para el usuario. Query: `?timezone=Asia/Shanghai`. |
| POST | `/learning/daily-lesson/complete` | Registrar resultado de la lección diaria. Body: `{ timezone, answers }`. |

## Privacidad (privacy_logs) – solo escritura

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/privacy-logs` | Registrar evento GDPR (`action_type`: accept_terms, revoke_marketing, delete_account_request, export_data). |

---

**Migraciones:** Ejecutar en Supabase las migraciones del repo (`supabase/migrations`) y revisar docs operativas como `docs/CREAR_ADMIN.md` y `docs/EMAIL_EDGE_FUNCTIONS.md`.
