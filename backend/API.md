# API MVP – Rutas disponibles

Base URL: `http://localhost:3000` (o la que uses en `PORT`).

Sin pagos ni precios por ahora: `payment_transactions` y `pricing_rules` quedan para más adelante.

## Auth

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/auth/register` | Registro. Body: email, password, name? (opcional). Mínimo 6 caracteres en password. |
| POST | `/auth/login` | Login. Body: email, password. Devuelve user y session (access_token, refresh_token). |

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

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/courts` | Lista. Query: `?club_id=uuid` |
| GET | `/courts/:id` | Detalle |
| POST | `/courts` | Crear (club_id, name, indoor?, glass_type?) |
| PUT | `/courts/:id` | Actualizar (name, indoor, glass_type, status) |
| DELETE | `/courts/:id` | Borrado físico |

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
| GET | `/matches` | Lista. Query: `?booking_id=` |
| GET | `/matches/:id` | Detalle |
| POST | `/matches` | Crear (booking_id, visibility?, elo_min?, elo_max?, gender?, competitive?) |
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
