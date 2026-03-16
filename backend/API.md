# API MVP – Rutas disponibles

Base URL: `http://localhost:3000` (o la que uses en `PORT`).

Sin pagos ni precios por ahora: `payment_transactions` y `pricing_rules` quedan para más adelante.

## Auth

Usuarios en Supabase Auth. Un usuario puede ser **jugador** (tiene fila en `players` con `auth_user_id`), **dueño de club** (fila en `club_owners` con `auth_user_id`) o ambos.

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/auth/register` | Registro como **jugador**. Body: `{ email, password, name? }`. Crea usuario Auth; si ya existe un jugador con ese email (alta manual sin cuenta), se vincula `auth_user_id` a esa fila; si no, se crea nueva fila en `players`. Mín. 6 caracteres en password. Así se sincronizan altas manuales y registro por app. |
| POST | `/auth/login` | Login. Body: `{ email, password }`. Devuelve user y session (access_token, refresh_token, expires_at). |
| POST | `/auth/forgot-password` | Restablecer contraseña. Body: `{ email }`. Genera enlace de recuperación (Supabase) y lo envía por email vía Edge Function `send-email` (Resend). Redirect: `FRONTEND_URL/reset-password`. Respuesta: `{ ok, message? }`. |
| GET | `/auth/me` | Usuario actual y roles. Header: `Authorization: Bearer <access_token>`. Respuesta: `{ user, roles: { player_id?, club_owner_id? }, clubs?: [...] }`. |
| POST | `/auth/register-club-owner` | Completar registro como **dueño** desde invite. Body: `{ application_id, token, password }`. Valida token, crea usuario Auth, `club_owner` (con auth_user_id), `club` y `courts` desde la solicitud; devuelve session. |

## Solicitudes de club (club_applications)

Crear solicitud y subir imagen son públicos. **Listar, detalle, aprobar y rechazar requieren admin:** header `Authorization: Bearer <access_token>` y que ese usuario esté en la tabla `admins`. Ver `docs/CREAR_ADMIN.md`.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/club-applications` | Listar (**admin**). Query: `?status=pending|contacted|approved|rejected`. |
| GET | `/club-applications/:id` | Detalle (**admin**). |
| GET | `/club-applications/:id/validate-invite` | Validar token del link. Query: `?token=xxx`. Público. |
| POST | `/club-applications/:id/approve` | Aprobar (**admin**). Crea invite, devuelve `invite_url`. El backend invoca la Edge Function `send-email`, que envía el correo con Resend. Respuesta: `invite_url`, `email_sent`, `email_error` (si falló). Ver `docs/EMAIL_EDGE_FUNCTIONS.md`. |
| POST | `/club-applications/:id/reject` | Rechazar (**admin**). Body opcional: `{ reason }`. |
| POST | `/club-applications/upload` | Subir imagen. Público. Body: `multipart/form-data`, campo `file`. Usa el bucket **"club-images"** (sin espacios): así la URL pública no devuelve 400. En Supabase: Storage → New bucket → nombre `club-images` → Public bucket = sí. (Storage → bucket → Public). |
| POST | `/club-applications` | Crear solicitud. Público. Body JSON (obligatorios + opcionales). Respuesta 201: `{ ok: true, id }`. |

## Health

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado del servidor |
| GET | `/health/supabase` | Comprueba conexión a Supabase |

## Jugadores (players)

Los jugadores pueden darse de alta **por la app** (registro con email/password) o **de forma manual en el club** (sin cuenta hasta que se registren). Ambas fuentes comparten la misma tabla; al registrarse por app con un email que ya existe por alta manual, se vincula la cuenta a ese jugador (sincronización, sin duplicados).

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/players/me` | Jugador actual. Header: `Authorization: Bearer <access_token>`. Respuesta: `{ ok, player }`. 401 si no hay token o sesión inválida; 404 si no hay jugador con ese email. |
| GET | `/players` | Lista (límite 50) |
| GET | `/players/:id` | Detalle |
| POST | `/players/manual` | **Alta manual en el club.** Body: `first_name`, `last_name`, `phone` (obligatorios), `email?` (opcional). Crea jugador sin `auth_user_id`. Si ya existe jugador con ese teléfono o correo (no borrado), responde 409. Respuesta 201: `{ ok, player }`. |
| POST | `/players` | Crear (body: first_name, last_name, email, phone?, elo_rating?). Requiere email. |
| PUT | `/players/:id` | Actualizar |
| DELETE | `/players/:id` | Borrado lógico (status=deleted) |

## Dueños de club (club_owners)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/club-owners` | Lista |
| GET | `/club-owners/:id` | Detalle |
| POST | `/club-owners` | Crear (name, email, phone?, stripe_connect_account_id?). stripe_connect_account_id opcional (NULL hasta conectar Stripe). |
| PUT | `/club-owners/:id` | Actualizar (kyc_status, status, etc.) |
| DELETE | `/club-owners/:id` | Borrado lógico |

## Clubs

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/clubs` | Lista. Query: `?owner_id=uuid` |
| GET | `/clubs/:id` | Detalle |
| POST | `/clubs` | Crear (owner_id, fiscal_tax_id, fiscal_legal_name, name, address, city, postal_code, …) |
| PUT | `/clubs/:id` | Actualizar |
| DELETE | `/clubs/:id` | Borrado físico |

## Pistas (courts)

CRUD de pistas de un club. Todas las rutas bajo `/courts`.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/courts` | Listar. Query: `?club_id=uuid` (opcional, filtra por club). Respuesta: `{ ok: true, courts: [...] }`. Cada pista: id, created_at, club_id, name, indoor, glass_type, status, lighting?, last_maintenance? (si existen columnas; ver migración 003_courts_lighting_maintenance.sql). |
| GET | `/courts/:id` | Ver una. Respuesta: `{ ok: true, court: { ... } }`. 404 si no existe. |
| POST | `/courts` | Crear. Body: `{ "club_id", "name", "indoor"? (boolean), "glass_type"? ("normal" \| "panoramic"), "lighting"? (boolean), "last_maintenance"? (ISO date) }`. Respuesta: `{ ok: true, court }`. 400 si faltan club_id o name. |
| PUT | `/courts/:id` | Editar. Body: `{ "name"?, "indoor"?, "glass_type"?, "status"?, "lighting"?, "last_maintenance"? }`. Respuesta: `{ ok: true, court }`. 400 si body vacío, 404 si no existe. |
| DELETE | `/courts/:id` | Borrar. Respuesta: `{ ok: true, deleted: id }`. |

## Reservas (bookings)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/bookings` | Lista. Query: `?court_id=`, `?organizer_player_id=` |
| GET | `/bookings/:id` | Detalle |
| POST | `/bookings` | Crear (court_id, organizer_player_id, start_at, end_at, total_price_cents, …) |
| PUT | `/bookings/:id` | Actualizar (status, cancelled_by, cancellation_reason) |
| DELETE | `/bookings/:id` | Cancelar reserva (status=cancelled) |

## Participantes de reserva (booking_participants)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/booking-participants` | Lista. Query: `?booking_id=`, `?player_id=` |
| GET | `/booking-participants/:id` | Detalle |
| POST | `/booking-participants` | Crear (booking_id, player_id, role, share_amount_cents?) |
| PUT | `/booking-participants/:id` | Actualizar (role, share_amount_cents, payment_status) |
| DELETE | `/booking-participants/:id` | Borrado físico |

## Partidos (matches)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/matches` | Lista. Query: `?booking_id=`, `?expand=1` (incluye booking, court, club) |
| GET | `/matches/:id` | Detalle |
| POST | `/matches/create-with-booking` | Crear booking + match: court_id, organizer_player_id, start_at, end_at, total_price_cents, timezone?, visibility?, elo_min?, elo_max?, gender?, competitive? |
| POST | `/matches` | Crear (booking_id existente: visibility?, elo_min?, elo_max?, gender?, competitive?) |
| PUT | `/matches/:id` | Actualizar |
| DELETE | `/matches/:id` | Cancelar (status=cancelled) |

## Jugadores de partido (match_players)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/match-players` | Lista. Query: `?match_id=`, `?player_id=` |
| GET | `/match-players/:id` | Detalle |
| POST | `/match-players` | Crear (match_id, player_id, team: A|B) |
| PUT | `/match-players/:id` | Actualizar (team, invite_status, result, rating_change) |
| DELETE | `/match-players/:id` | Borrado físico |

## Privacidad (privacy_logs) – solo escritura

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/privacy-logs` | Registrar evento GDPR (body: user_id?, action_type, ip, user_agent?). action_type: accept_terms, revoke_marketing, delete_account_request, export_data |

---

**Migraciones:** Ejecutar en Supabase: `004_roles_and_applications.sql` (auth_user_id, invites); `005_admins.sql` (tabla admins); `006_players_manual_and_sync.sql` (email opcional en players, índice único en phone para altas manuales y sincronización). Para crear el primer admin: ver `docs/CREAR_ADMIN.md`.

**No implementado en este MVP:** `pricing_rules`, `payment_transactions` (pagos con Stripe u otra pasarela después).
