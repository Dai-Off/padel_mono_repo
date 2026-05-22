# Propuesta: campo `username` en jugadores

Documento para que el equipo revise si deberia insertarse username o no.

---

## 1. Qué problema resolvemos

Hoy la identidad pública del jugador en la app es básicamente **nombre + apellido** (y a veces teléfono en CRM). Eso genera duplicados visuales, búsquedas poco claras en mensajes/comunidad, y no hay un identificador corto y estable tipo `@juan_padel`.

La tabla `public.players` no tiene columna `username` (revisado en `backend/db/001_init_schema.sql` y en los selects del backend). Los estilos `username` que aparecen en `PostCard.tsx` / `StoryViewer.tsx` del móvil son nombres de estilo CSS, no el campo de datos.

**Alcance acordado (por ahora):** solo jugadores (`players`). Staff, `club_owners` y flujos de invite del portal siguen con email como hasta ahora.

---

## 2. Situación actual (resumen)

| Pieza | Comportamiento hoy |
|-------|-------------------|
| Login app / web jugador | `POST /auth/login` con **email** + password → Supabase `signInWithPassword` |
| Registro jugador | Solo móvil vía `POST /auth/register` (`email`, `password`, `name`, …) — sin username |
| Perfil | `GET/PATCH /players/me` — sin username en contrato |
| Búsqueda global | `GET /players?q=` filtra `first_name`, `last_name`, `phone` (ver `players.ts` ~1011) |
| CRM club | `GET /club-clients?q=` mismo criterio en `fetchPlayersByIds` (`clubClients.ts` ~148-150) |
| Incidencias | Filtro `q` en memoria sobre nombre/teléfono del jugador implicado |
| Resolución de sesión → player | `authPlayer.ts` busca por **email** del JWT, no por `auth_user_id` |

El email en `players` es UNIQUE (nullable desde migración 006). El teléfono tiene índice único parcial. **No** se busca por email en listados; el email se usa sobre todo para detectar duplicados en altas manuales.

---

## 3. Reglas de negocio propuestas

1. **Registro nuevo (app móvil):** username obligatorio.
2. **Usuario ya existente o alta manual del club:** `username` queda `NULL` hasta que lo ponga en editar perfil (`PATCH /players/me`).
3. **Login con username:** sin decidir — ver sección 6.

**Formato sugerido** (habría que validarlo con producto):

- 3–30 caracteres: `a-z`, `0-9`, `_` (sin espacios ni `@`).
- Guardar siempre en minúsculas (`trim().toLowerCase()`).
- Unicidad case-insensitive con índice `lower(username)` y condición `WHERE username IS NOT NULL AND username <> ''`.

Validación centralizada en backend (`normalizeUsername` + `assertUsernameAvailable`) para no duplicar lógica entre register, PATCH me y CRM.

**Usuarios que ya están en producción:** no haría backfill automático. Dejar `NULL` y empujar completado desde la app (banner o pantalla bloqueante suave). Generar usernames desde nombre+apellido en script me parece arriesgado por colisiones y nombres feos.

---

## 4. Cambios por capa

### 4.1 Base de datos

Nueva migración (patrón del repo: `backend/db/` + copia en `supabase/migrations/`):

```sql
ALTER TABLE public.players ADD COLUMN username text;

CREATE UNIQUE INDEX idx_players_username_unique
  ON public.players (lower(username))
  WHERE username IS NOT NULL AND username <> '';

COMMENT ON COLUMN public.players.username IS
  'Identificador público único; obligatorio en registro app; opcional en altas manuales hasta edición de perfil.';
```

### 4.2 Backend — lo imprescindible

| Área | Archivo(s) | Cambio |
|------|------------|--------|
| Selects | `players.ts` (`SELECT_PUBLIC_INTERNAL`), `clubClients.ts` (`PLAYER_LIST_FIELDS`) | Añadir `username` a respuestas |
| Registro | `auth.ts` `POST /auth/register` | Body con `username` obligatorio; check unicidad antes de insert/update del player (incluye caso “player manual sin auth” que luego se registra por email) |
| Disponibilidad | Nuevo `GET /players/username/check?q=` | `{ available: boolean }` para UX en registro/edición (+ Swagger) |
| Perfil | `players.ts` `GET/PATCH /players/me` | Devolver y permitir asignar/cambiar username con reglas del apartado 3 |
| Búsqueda | `players.ts`, `clubClients.ts`, `clubIncidents.ts` | Añadir `username` al `.or()` / filtro JS |
| Alta manual | `POST /players/manual`, `POST /club-clients/manual`, `PUT /club-clients/:playerId` | Username opcional; validar si viene |
| Docs API | `backend/API.md` + Swagger en rutas tocadas | Contratos y 409 por duplicado |

**`PATCH /players/me` — detalle que conviene cerrar en review:**

- Si el jugador **ya tiene** username y mandan vacío → 400.
- Si **no tiene** → permitir primera asignación.
- ¿Permitimos **cambiar** username después?

Invites (`register-from-club-portal-invite`, `register-club-owner`): en fase 1 **sin** username; el invite va atado al email.

### 4.3 Mobile

| Pantalla / módulo | Qué haría |
|-------------------|-----------|
| `RegisterScreen.tsx` | Campo username obligatorio; opcional llamar a `check` en blur |
| `api/auth.ts` | Enviar `username` en register |
| `EditProfileScreen.tsx` | Editar username (sobre todo legacy con `NULL`) |
| `ProfileScreen.tsx` | Mostrar `@username` bajo el nombre |
| `api/players.ts` | Tipos + `updateMyPlayerProfile` |
| Comunidad (`PostCard`, `StoryViewer`, etc.) | Mostrar `@username` con fallback a nombre si `NULL` |
| `MessagesScreen` | En hits de búsqueda, mostrar username si existe |

**Onboarding guard (opcional pero alineado con negocio):** si `GET /players/me` devuelve `username: null` con sesión activa, forzar pantalla “Elige tu usuario” antes de matchmaking/mensajes. Sin esto, los legacy pueden usar la app meses sin username y la búsqueda por `@` no les sirve.

`LoginScreen`: sin cambios en fase 1 si mantenemos login solo por email.

### 4.4 Web admin

| Componente | Cambio |
|------------|--------|
| `types/api.ts`, `services/player.ts` | `username?: string \| null` |
| `ClubPlayers.tsx` | Alta manual: username opcional; detalle/edición con `PUT /club-clients/:id` (hoy la web no cablea bien la edición de campos del cliente — habría que conectarlo) |
| `ReservationModal` / `PlayerSearch` | Sugerencias con `@username`; placeholder “Nombre, teléfono o usuario” |
| Resto de módulos con `PlayerSearch` o `clubClientService.list` | Heredan el `q` ampliado del backend |

No hay registro de jugador en web en fase 1 (`authService.register` no se usa para players). Login web, invites y registro de club: sin cambios.

---

## 5. Orden de implementación que propongo

1. Migración + helpers `normalizeUsername` / `assertUsernameAvailable`
2. `POST /auth/register` + `GET /players/username/check` + propagar en selects
3. `GET/PATCH /players/me`
4. Búsqueda en players, club-clients, incidents
5. Altas manuales + `PUT` club-clients
6. Móvil: registro → editar perfil → (opcional) guard sin username
7. Web admin: búsqueda + CRM
8. Display comunidad/mensajes
9. Fase 2: login por username + fix `authPlayer.ts`
10. Swagger + `API.md`

---

## 6. Login con username

Supabase **no** autentica por username; siempre necesitamos el email real en `signInWithPassword`.

| Opción | Descripción | Comentario |
|--------|-------------|------------|
| **B (fase 1)** | Login sigue siendo solo email | Menos riesgo, menos código. Username solo perfil + búsqueda |
| **A (fase 2)** | Body `identifier` (email o username) + password; si no hay `@`, lookup `players.username` → email | ~30 líneas en `auth.ts` una vez exista la columna. Recuperación de contraseña **sigue** por email |

---

## 7. Deuda técnica relacionada (importante)

`backend/src/lib/authPlayer.ts` resuelve el jugador así:

```ts
.eq('email', email)
```

Si en el futuro un jugador cambia email en Auth pero el row de `players` no se actualiza al mismo tiempo, o hay desajuste email/auth_user_id, rutas que usan `getPlayerIdFromBearer` pueden devolver “No existe jugador con tu email” aunque la sesión sea válida.

**Propuesta:** en la misma PR que username (o justo después), resolver primero por `auth_user_id` del JWT y usar email como fallback.

No es bloqueante para *añadir* la columna username, pero sí para confiar en login alternativo y cambios de email.

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Legacy sin username | Búsqueda por nombre sigue; UI con fallback; opcional guard post-login |
| Colisión “juan@gmail.com” como username | Regla: no permitir `@` en username |
| Jugador creado en CRM sin username que luego registra app | `register` enlaza por email; si username sigue NULL, pedir en primer PATCH o en guard |
| Duplicados por mayúsculas | Índice en `lower(username)` |
| Timing de errores en login por username (fase 2) | Mensaje genérico “Credenciales incorrectas” |

**Pruebas manuales mínimas (curl/Postman):**

- Register con username nuevo → OK
- Register username duplicado → 409
- `PATCH /players/me` primera asignación con legacy NULL → OK
- `GET /players?q=juan` encuentra por username
- Alta manual sin username → NULL; edición posterior → OK
- Login por email sigue igual

---

## 9. Preguntas abiertas para el equipo

Necesito vuestra opinión en esto antes de implementar:

1. **¿Login con username?**
2. **¿Permitimos cambiar username** una vez elegido, o solo una asignación?

---

## 10. Referencias rápidas de código

- Schema players: `backend/db/001_init_schema.sql`
- Auth registro/login: `backend/src/routes/auth.ts`
- Players + búsqueda: `backend/src/routes/players.ts`
- CRM: `backend/src/routes/clubClients.ts`
- Sesión → player: `backend/src/lib/authPlayer.ts`
- Móvil registro: `mobile-app/src/screens/RegisterScreen.tsx`
- Móvil perfil: `mobile-app/src/screens/EditProfileScreen.tsx`
- Web CRM: `web-app/src/components/Players/ClubPlayers.tsx`
- Búsqueda en grilla: `web-app/src/features/grilla/components/ReservationModal.tsx`

---