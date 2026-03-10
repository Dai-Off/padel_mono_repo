# API MVP – Rutas disponibles

Base URL: `http://localhost:3000` (o la que uses en `PORT`).

Sin pagos ni precios por ahora: `payment_transactions` y `pricing_rules` quedan para más adelante.

## Auth

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/auth/register` | Registro. Body: `{ "email", "password", "name"? }`. Mínimo 6 caracteres en password. Crea usuario en Auth y opcionalmente en `players`. |
| POST | `/auth/login` | Login. Body: `{ "email", "password" }`. Respuesta: `{ ok, user, session: { access_token, refresh_token, expires_at } }`. 401 si credenciales incorrectas. |

Para desarrollo: si no puedes entrar tras registrarte, revisa en Supabase → Authentication → Users que el usuario exista y, si usas confirmación de email, confírmalo o desactiva "Confirm email" en Auth settings.

## Solicitudes de club (club_applications)

Solicitud de acceso al Manager antes de tener cuenta. Ruta pública (sin auth).

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/club-applications/upload` | Subir imagen (logo/foto). Body: `multipart/form-data`, campo `file` (JPEG, PNG, WebP, GIF; máx. 5 MB). Respuesta 200: `{ ok: true, url }`. Errores: 400 (sin archivo o tipo no permitido), 500. Requiere bucket Supabase "Club Images" creado y público. |
| POST | `/club-applications` | Crear solicitud. Body JSON. **Obligatorios:** responsible_first_name, responsible_last_name, club_name, city, country, phone, email, court_count, sport. **Opcionales:** sports (array), official_name, full_address, description, logo_url, photo_urls (array), courts (array), open_time, close_time (HH:mm), slot_duration_min (60\|90\|120), pricing (array), booking_window, cancellation_policy, tax_id, fiscal_address, stripe_connected (bool), selected_plan (standard\|professional\|champion\|master). Validaciones: email y teléfono formato válido, nombres/ciudad/país mín. 2 caracteres. Respuesta 201: `{ ok: true, id }`. Errores: 400 `{ ok: false, error }`, 500. |

## Health

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado del servidor |
| GET | `/health/supabase` | Comprueba conexión a Supabase |

## Jugadores (players)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/players` | Lista (límite 50) |
| GET | `/players/:id` | Detalle |
| POST | `/players` | Crear (body: first_name, last_name, email, phone?, elo_rating?) |
| PUT | `/players/:id` | Actualizar |
| DELETE | `/players/:id` | Borrado lógico (status=deleted) |

## Dueños de club (club_owners)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/club-owners` | Lista |
| GET | `/club-owners/:id` | Detalle |
| POST | `/club-owners` | Crear (name, email, stripe_connect_account_id, phone?) |
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

**No implementado en este MVP:** `pricing_rules`, `payment_transactions` (pagos con Stripe u otra pasarela después).
