# Sistema de Follows (seguidores / seguidos) — Plan de implementación

> **Implementado (2026-07).** Se conserva como referencia de diseño; la fuente
> de verdad es el código y las migraciones.
> Fecha: 2026-07-07
> Relación: habilita la misión D10 del Season Pass (`docs/season-pass-implementation-plan.md` §5.1 y §9). El sistema de **compartir** tiene plan propio: `docs/sharing-implementation-plan.md` (allí está también el orden de implementación conjunto). Ambos se implementan **antes** que el pase.
> Base: exploración del repo — la UI de follows ya está cableada como placeholder; falta todo el backend.

---

## 1. Contexto y objetivo

Implementar un grafo social de **follow asimétrico** (yo te sigo; tú no tienes que seguirme):
seguir/dejar de seguir, contadores y listas de seguidores/seguidos, y sugerencias de a quién seguir.

Por qué ahora:

1. **La app ya lo "promete" visualmente**: el perfil muestra SEGUIDORES/SEGUIDOS (`--`) y un botón "Seguir" que no hace nada. Es deuda visible para el usuario.
2. **Desbloquea la misión D10 del Season Pass** ("Seguir a 1 nuevo usuario", 50 SP), hoy inactiva en el pool.
3. **Es la base de futuras features sociales**: relevancia del feed de comunidad (§11), notificaciones, gating opcional de mensajes directos, y refuerzo del loop social (jugar → conocer gente → seguirla → volver a jugar).

---

## 2. Estado actual — qué existe ya (y es mucho)

### 2.1 UI ya cableada esperando backend

| Pieza | Dónde | Estado |
|---|---|---|
| Botón "Seguir" + stats SEGUIDORES/SEGUIDOS (`--`) en perfil ajeno | `mobile-app/src/screens/PublicProfileScreen.tsx:214-240` (`followBtn` no-op en L231) | Placeholder |
| Stats SEGUIDORES/SEGUIDOS en perfil propio | `mobile-app/src/screens/ProfileScreen.tsx:561-567` | Placeholder |
| Botón "Seguir" en visor de clips | `mobile-app/src/components/community/ClipViewer.tsx:278-314` | Solo visual |
| i18n listo | `src/i18n/sections/profile.ts:7-8` (`followersStat`/`followingStat`), `locales/es/profile.ts:8-9`, `locales/zh-HK/profile.ts:8-9`, `locales/es/common.ts:115` (`follow: 'Seguir'`) | Hecho |

### 2.2 Infraestructura reutilizable

| Pieza | Dónde | Uso para follows |
|---|---|---|
| Perfil público de otro jugador | `PublicProfileScreen.tsx` + `GET /players/:id/public-profile` (`backend/src/routes/players.ts:1652`) | Punto de anclaje del botón y los contadores |
| Overlay de perfil reutilizable | `mobile-app/src/components/profile/PlayerProfileOverlay.tsx` (usado en DMs, torneos, liga) | El follow funciona desde cualquier superficie |
| Navegación al perfil desde comunidad/partidos/home | `MainApp.tsx:1013-1024, 1182, 1244…` (`setSelectedPublicPlayerId`) | Ya resuelto |
| Búsqueda de jugadores | `GET /players?q=` (`players.ts:1570-1632`) + `searchPlayers` (`mobile-app/src/api/players.ts:445-482`); UI en `MessagesScreen.tsx`, `PlayerSelectModal.tsx`… | "Buscar a quién seguir" sin trabajo nuevo |
| Listas de jugador con avatar+nombre+marco | patrón `select id, first_name, last_name, username, avatar_url` + `getEquippedFrames` (`backend/src/services/equippedFramesService.ts`); render `AvatarWithFrame.tsx`, `PlayerAvatarCircle.tsx` | Las listas de seguidores usan el mismo patrón |
| Sugerencias "has jugado con" | `GET /players/:id/frequent-partners` (`players.ts:1773-1813`) + `FrequentPartnersCard.tsx` | Fuente directa de sugerencias a seguir |
| Compañeros de racha | `GET /shared-streaks` (`learningCourses.ts:76`) | Segunda fuente de sugerencias |
| Precedentes de relación jugador-jugador | `learning_shared_streaks` (simétrica, `019_learning_module.sql:118-134`), `player_direct_messages` (`042`) | Referencia de modelado; el follow es asimétrico |

### 2.3 Lo que NO existe

- Tabla de follows, endpoints, contadores. **Nada de backend.**
- Sistema de bloqueo entre usuarios (no existe en toda la app; los DMs tampoco tienen gating — `messages.ts:174-183` solo valida que el destinatario esté `active`).
- Centro de notificaciones in-app genérico (`NotificationsScreen.tsx` está acoplada solo a invitaciones de partido). No hay push.
- Nota: el `unlock_type: 'social'` de `profileCatalog.ts` **no** es follow — significa "juega con N compañeros distintos".

---

## 3. Decisiones de diseño (propuesta)

1. **Modelo asimétrico sin aprobación** (estilo Instagram/Twitter): seguir es unilateral e inmediato. Es lo que asume la misión del PDF ("Seguir a 1 nuevo usuario") y lo que menos fricción tiene. Los perfiles ya son públicos hoy (cualquiera puede ver `public-profile`), así que no se expone nada nuevo.
2. **Sin cuentas privadas en v1.** Si algún día se quieren, el patrón a replicar es `players.affinity_visible` (`074_player_affinity.sql` + toggle en `AffinityVisibilityToggle.tsx`) → un `follows_require_approval` con solicitudes pendientes. v2+.
3. **Unfollow = soft-delete (clave anti-farming).** En vez de borrar la fila, se marca `unfollowed_at`; el re-follow reactiva la fila **sin cambiar `created_at`**. Consecuencias:
   - La misión D10 del pase ("seguir a 1 usuario **nuevo**") cuenta filas con `created_at` en el período → el ciclo follow/unfollow/follow **no** farmea SP (el par ya existía).
   - Queda historial de relación gratis.
4. **Sin bloqueo en v1** (aplazado a futuro — decidido 2026-07-07). El follow no empeora la exposición actual (los DMs ya son abiertos).
5. **Sin notificación "X te sigue" en v1** (aplazado a futuro — decidido 2026-07-07). El contador de seguidores subiendo ya da señal pasiva.
6. **Contadores calculados, no denormalizados** (v1): `count(*)` con índices dedicados es suficiente a la escala actual. Si un perfil se vuelve caliente, se añade contador denormalizado con trigger (decisión reversible, anotada en §9).

---

## 4. Modelo de datos

**`0XX_player_follows.sql`** (numerar con el siguiente libre en `backend/db/` al implementar; el plan del Season Pass reserva hasta `096_`):

```sql
create table if not exists public.player_follows (
  follower_id uuid not null references public.players(id) on delete cascade,
  followed_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),   -- primera vez que se siguió (no cambia al re-seguir)
  unfollowed_at timestamptz,                       -- null = follow activo (soft-delete)
  updated_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint chk_no_self_follow check (follower_id <> followed_id)
);

-- Listas y contadores en ambas direcciones (parciales: solo follows activos)
create index idx_player_follows_followed
  on public.player_follows (followed_id, created_at desc) where unfollowed_at is null;
create index idx_player_follows_follower
  on public.player_follows (follower_id, created_at desc) where unfollowed_at is null;

alter table public.player_follows enable row level security;
```

Semántica:
- **Follow activo** = `unfollowed_at IS NULL`.
- **Follow** = upsert: si no existe la fila → insert; si existe con `unfollowed_at` → `set unfollowed_at = null, updated_at = now()`. Idempotente.
- **Unfollow** = `set unfollowed_at = now()`. Idempotente.
- Todo el acceso va por service-role desde el backend (patrón estándar del repo), RLS activada sin policies públicas.

---

## 5. Backend

Nuevo router `backend/src/routes/follows.ts`, montado en `routes/index.ts` bajo `/players` (mismo patrón que `unlockables.ts`). Auth con `getPlayerIdFromBearer` en todos los endpoints. Convención de respuesta `{ ok: boolean, ... }`.

### 5.1 Endpoints

| Endpoint | Comportamiento |
|---|---|
| `POST /players/:id/follow` | Valida: `:id` existe, `status='active'`, no es uno mismo. Upsert según §4. Devuelve `{ ok, following: true, followers_count }`. Dispara evaluación de la misión D10 (canal instantáneo del pase, §6) |
| `DELETE /players/:id/follow` | Marca `unfollowed_at`. Devuelve `{ ok, following: false, followers_count }` |
| `GET /players/:id/followers?cursor=&limit=` | Lista paginada por `created_at desc` (cursor, como el feed de comunidad). Cada fila: `{ id, first_name, last_name, username, avatar_url, frame, viewer_follows }` — el flag `viewer_follows` permite pintar el botón "Seguir también" en la propia lista. Excluye jugadores con `status != 'active'` |
| `GET /players/:id/following?cursor=&limit=` | Ídem en la otra dirección |
| `GET /players/me/follow-suggestions` | Mezcla rankeada de: compañeros frecuentes (`frequent-partners`, ya existe la query), compañeros de racha compartida, y (futuro) afinidad IA. Excluye ya-seguidos y a uno mismo |

### 5.2 Integración en endpoints existentes (evitar roundtrips extra)

- **`GET /players/:id/public-profile`** (`players.ts:1652`): añadir al payload `followers_count`, `following_count`, `viewer_is_following`, `follows_viewer`. Es lo que necesita `PublicProfileScreen` para pintar botón y contadores en una sola llamada.
- **Perfil propio** (datos que consume `ProfileScreen` vía `HomeDataContext`): añadir `followers_count`, `following_count`.
- Enriquecimiento de listas con el patrón existente: `getEquippedFrames(supabase, ids)` para el marco equipado (como hace `messages.ts:59-62`).

### 5.3 Anti-abuso

- Idempotencia por PK del par (sin duplicados posibles).
- Rate limit ligero en `POST /follow` (p. ej. 60/hora por jugador, contador en memoria como el cooldown de `unlockablesEngine`) — el farming de SP ya está neutralizado por el soft-delete, esto es solo higiene anti-spam.

---

## 6. Integración con el Season Pass (misión D10)

- `condition_key = 'user_follow'`, `condition_params = {}`: el evaluador cuenta `player_follows` con `follower_id = player` y `created_at` dentro del período de la misión (solo primeras veces del par — garantizado por el soft-delete).
- `POST /follow` invoca la evaluación síncrona de misiones y devuelve el bloque `season_pass` en la respuesta (canal instantáneo de §6.7 del plan del pase) → al seguir a alguien, si la misión estaba activa ese día, la celebración aparece al momento.
- Al desplegar follows, activar la definición D10 en `season_pass_mission_definitions` (estaba sembrada como inactiva).

---

## 7. Mobile

Sin router: navegación por estado en `MainApp.tsx`, como todo lo demás.

### 7.1 Cliente API

Nuevo `mobile-app/src/api/follows.ts` (patrón `fetch` + `ok` discriminado, como `api/seasonPass.ts`):
`followPlayer(id, token)`, `unfollowPlayer(id, token)`, `fetchFollowers(id, cursor, token)`, `fetchFollowing(id, cursor, token)`, `fetchFollowSuggestions(token)`. Tipos con `frame` y `viewer_follows`.

### 7.2 Perfil ajeno — `PublicProfileScreen.tsx`

- Contadores reales desde el `public-profile` ampliado (sustituyen los `--` de L214-229).
- Botón con 3 estados: **Seguir** / **Siguiendo** (tap → unfollow con confirmación ligera) / **Te sigue · Seguir también** (si `follows_viewer && !viewer_is_following`).
- Update optimista (cambia el botón y el contador al instante; rollback si la request falla) — no hay react-query, así que estado local + revert manual, como hace el resto de la app.
- Tap en los contadores → abre la lista (§7.4).
- Si la respuesta del follow trae `season_pass.completed_missions`, disparar el componente de celebración del pase.

### 7.3 Perfil propio — `ProfileScreen.tsx`

- Contadores reales (L561-567) + tap → lista propia de seguidores/seguidos.

### 7.4 Pantalla nueva — `FollowListScreen.tsx`

- Dos tabs (Seguidores / Seguidos), lista paginada con `PlayerAvatarCircle`/`AvatarWithFrame` + nombre + `@username` + botón de follow contextual por fila (usando `viewer_follows`).
- Registro en `MainApp.tsx` con el patrón estándar: estado `showFollowList: { playerId, tab } | null`, render prioritario en `renderContent()`, entrada en el `BackHandler`, tap en fila → `setSelectedPublicPlayerId` (perfil público).
- Estado vacío del tab "Seguidos" → módulo de sugerencias (§7.5).

### 7.5 Búsqueda de jugadores + sugerencias "A quién seguir" (decidido 2026-07-07)

No existe un buscador de jugadores general en la app (solo embebido en DMs e invitaciones) y es pieza clave del follow. Decisión: vive en **comunidad**, no en el Home.

- **Punto de entrada:** icono de búsqueda (lupa) en el header de `CommunityScreen` → abre `PlayerSearchScreen`.
- **`PlayerSearchScreen` (pantalla nueva):** barra de búsqueda arriba (reutiliza `GET /players?q=` / `searchPlayers` — el mismo API que ya usan los DMs), resultados con avatar+marco+`@username`+botón de follow contextual por fila; tap en fila → perfil público.
- **Estado vacío (sin query) = sugerencias "A quién seguir":** compañeros frecuentes + compañeros de racha (`follow-suggestions`), con el patrón visual de `FrequentPartnersCard`. Buscador y sugerencias viven en el mismo sitio.
- También accesible desde el estado vacío del tab "Seguidos" de `FollowListScreen`.
- **Descartado:** sección "A quién seguir" en el Home.

### 7.6 Comunidad

- `ClipViewer.tsx:278-314`: conectar el botón "Seguir" visual al API (mismo estado optimista).
- `PostCard`/`StoryViewer`: opcional en fase 2, follow inline desde el autor.

### 7.7 i18n

- Ya existen: `followersStat`, `followingStat`, `common.follow`.
- Añadir (es + zh-HK): `common.following` ("Siguiendo"), `common.followBack` ("Seguir también"), `profile.followsYou` ("Te sigue"), títulos de `FollowListScreen`, textos de sugerencias y estados vacíos.

---

## 8. Fases

### Fase 1 — Core (el 80% del valor)
Migración + router `follows.ts` (follow/unfollow/listas) + ampliación de `public-profile` y perfil propio + mobile: botón con estados, contadores reales, `FollowListScreen`, **`PlayerSearchScreen` básico** (lupa en el header de comunidad — el buscador es pieza clave del follow y el API ya existe), i18n. Activar misión D10 del pase con su celebración.
**Entregable:** seguir/dejar de seguir funciona desde perfil, clips y buscador; contadores y listas reales; la misión D10 entra al pool diario.

### Fase 2 — Descubrimiento
`follow-suggestions` + sugerencias "A quién seguir" en el estado vacío del buscador + follow inline en comunidad (PostCard/StoryViewer) + **feed personalizado por follows** (§11).
**Entregable:** loop de crecimiento del grafo (jugar → buscar/sugerencia → follow → feed relevante).

### Fase 3 — Higiene y notificaciones (APLAZADA — decidido 2026-07-07: para el futuro)
1. **Bloqueo mínimo**: tabla `player_blocks`; bloquea follow, DM y visibilidad de perfil. Revisar `messages.ts POST /` para respetarlo (hoy los DMs son totalmente abiertos — preexistente, no lo introduce el follow).
2. **Notificación "X te sigue"**: generalizar `NotificationsScreen` (tabla `player_notifications` + badge) y/o push realtime vía el hub de `messagesRealtime.ts`.
3. **Gating opcional de DMs** por relación ("solo quien sigues puede escribirte"), como preferencia del jugador.

### Futuro (fuera de alcance)
Cuentas privadas con aprobación (patrón `affinity_visible`), follows de clubes.

---

## 9. Edge cases y QA

- **Self-follow** → 400 (`chk_no_self_follow` como red de seguridad).
- **Jugadores `deleted`/`blocked`**: no se pueden seguir; excluidos de listas y contadores (filtrar por `players.status = 'active'` al enriquecer).
- **Borrado de cuenta**: `on delete cascade` limpia el grafo en ambas direcciones (compatible con el `account-deletion-job` existente).
- **Idempotencia**: follow/unfollow repetidos no cambian contadores ni duplican filas.
- **Paginación estable**: cursor por `created_at` + desempate por id (mismo enfoque que el feed).
- **Optimistic UI**: verificar rollback en fallo de red (modo avión) en botón y contador.
- **Contadores**: verificar que los índices parciales cubren `count(*)` de ambas direcciones (EXPLAIN en staging con datos sintéticos).
- **i18n zh-HK**: la app está traducida — no dejar strings nuevas sin ambas locales.
- **Type-check**: `cd backend && npx tsc --noEmit` y `cd mobile-app && npx tsc --noEmit` (no hay framework de tests; probar funcionalmente contra el backend local, puerto 3000).

---

## 10. Decisiones (follows)

**Cerradas (2026-07-07):** bloqueo de jugadores, perfiles públicos/privados y notificaciones quedan **para el futuro** (fase 3 aplazada, sin fecha). La sección "A quién seguir" **no** va en el Home — solo en comunidad, dentro del buscador de jugadores (§7.5).

**Abiertas:**
1. ¿El botón "Mensaje" del perfil debe condicionarse algún día a la relación de follow? (hoy es abierto para todos).

---

## 11. Feed personalizado por follows (decidido 2026-07-07)

- **Feed de posts:** un único feed mezclado — posts de tus **seguidos priorizados** + posts recientes de usuarios públicos como relleno (hoy todos los perfiles son públicos; cuando existan cuentas privadas, se filtrarán). Implementación v1 sin ML: **"freshness boost"** — al ordenar, los posts de seguidos cuentan como ~12 h más recientes (`order by (created_at + boost) desc`, cursor sobre el timestamp ajustado). Ventajas: sin cold start (con el grafo recién nacido, un feed solo-seguidos quedaría vacío para casi todos), una sola query y paginación estable.
- **Clips (reels):** globales para todo el mundo — es formato de descubrimiento, manda el contenido y no el grafo — con un boost más ligero (~6 h) para autores seguidos.
- Las horas de boost son knobs configurables para ajustar cuando crezca el grafo. Un filtro "Solo seguidos" queda como opción v2.
- Toca los GET de `community.ts` (`/feed`, `/reels`, `/reels/feed`). Entra en la **fase 2** de follows.

---

## 12. Relación con el plan de compartir

El sistema de compartir (partidos con link para unirse, share cards al feed, repost, share externo) tiene plan propio: **`docs/sharing-implementation-plan.md`**, donde está también el **orden de implementación conjunto** de ambos bloques antes del Season Pass.
