# Plan incremental de migración a React Query (mobile-app)

Estado: infraestructura + piloto (season pass) + perfil propio (punto 1) hechos.
Este documento prioriza la migración del resto de dominios de estado de servidor.

## Qué hay ya

- `src/queries/client.ts` — `queryClient` (staleTime 30s, gcTime 24h, retry 1),
  persistencia en AsyncStorage con **whitelist por raíz de query key**
  (`PERSIST_ROOTS`, hoy solo `season-pass`), `buster` de versión, y
  `setupQueryManagers()` (focusManager ← AppState, onlineManager ← NetInfo).
- `src/queries/keys.ts` — factories de keys por dominio, **siempre con userId**
  (un usuario nunca ve caché de otro; `AuthContext.logout()` además hace
  `queryClient.clear()`).
- `src/queries/seasonPass.ts` — patrón de referencia: query compartida
  (`useSeasonPassMe`) + mutaciones que actualizan el caché (`setQueryData`)
  e invalidan en background; ack optimista con `onMutate`.
- Las funciones de `src/api/*.ts` no lanzan en error (devuelven `null`/`{ok:false}`):
  **envolver siempre en la queryFn/mutationFn** convirtiendo el error en `throw`
  para que `isError`/`retry` funcionen. No tocar la capa api.

## Orden propuesto

### 1. ProfileDataContext (perfil propio) — HECHO

Migrado en `src/queries/profile.ts` (una query por dataset + acciones), contexto
retirado, remount por `key` sustituido por invalidaciones y raíz `profile` en
`PERSIST_ROOTS`. Lo de abajo queda como registro del criterio aplicado.

Pantalla clave ya optimizada a mano; criterio duro: **no empeorar el warm feel**.

- Una query por dataset: bundle (`fetchProfileBundle`), radar
  (`fetchMyCoachAssessment` + `fetchMyCoachStats`), peer insight, level history
  (con `levelLimit` en la key), player stats, social
  (`fetchFrequentClubs`/`fetchFrequentPartners`, keyed por `playerId`).
- `staleTime` 30s = el `REVALIDATE_TTL_MS` actual; el `ensureLoaded()` perezoso
  se convierte en montar los hooks solo cuando la pantalla se abre (las queries
  se activan al montar; `enabled` con token/playerId).
- Spinner solo en primera carga → `isPending`; revalidación silenciosa → refetch
  con datos en caché (comportamiento nativo de RQ).
- **Sustituir el remount `key={profileRefreshKey}`** de ProfileScreen
  (`tabRoutes.tsx`) por `invalidateQueries` de las keys de perfil al guardar
  (settingsRoutes/MainShell). Valorar si la señal de AppSignals puede morir
  cuando ya nadie más la consuma.
- Candidato a entrar en `PERSIST_ROOTS` (datos estables).

### 2. HomeDataContext (Home) — por dominios, matches al final

**Perfil base: HECHO** (`useMyProfile` en `queries/profile.ts`; el contexto lo
expone como fachada — `profile`/`profileLoading`/`refreshProfile` leen de la
query — hasta migrar sus ~25 consumidores a los hooks; sin estado duplicado).

- Orden: profile → stats/streak → tournaments/reservations → **matches al
  final** (es el dominio con upserts optimistas de `misPartidos`,
  merge server/local y generaciones anti-stale; mapear eso a
  `setQueryData` + `cancelQueries` exige más cuidado).
- El guard binario actual (`loadedAt > 0`, solo refetch con `force`) equivale a
  `staleTime: Infinity` + invalidaciones explícitas; si se quiere paridad con el
  background-refresh (30s), usar `staleTime: 30_000` y dejar que el focusManager
  haga el trabajo.
- La señal `partidosRefreshNonce` (AppSignals) → `invalidateQueries` de matches.
- Al terminar, el skeleton del Home (`isFirstLoading`) pasa a combinar los
  `isLoading` de las queries.

### 3. TiendaScreen — la más fácil

- 3 queries públicas sin token: `fetchStoreProducts` / `fetchStoreFlash` /
  `fetchStoreCollections` (keys `['store', ...]` sin userId al ser públicas,
  o con él si se quiere simetría). Elimina el spinner de recarga al remontar.

### 4. usePartidosList / PartidosScreen

- Depende de la migración de matches (punto 2): el hook consume
  `partidos`/`refreshMatches` del contexto.
- El nonce de foco (`focusNonce` + `partidosRefreshNonce`) se sustituye por
  `refetchOnWindowFocus` + invalidaciones tras mutaciones.
- El fetch propio de rango custom pasa a una query keyed por el rango de fechas.

### 5. PublicProfileScreen

- Queries keyed por `playerId` (perfil público + customización, stats, social,
  level history con su límite). Los 5 efectos con flag `cancelled` desaparecen.
- Follow: `useMutation` con update optimista + rollback en `onError`
  (hoy está hecho a mano).

### 6. MatchmakingContext

- `refetchInterval: 5_000` (status) y `8_000` (invitaciones); los nonces
  `bumpPairInvites`/`bumpMatchInvites` → `invalidateQueries`.
- **Nunca persistir** (no añadir su raíz a `PERSIST_ROOTS`).
- La máquina de estados del banner (searching/matched/timed_out) es estado de
  cliente y se queda en el contexto.

## No migrar (estado de cliente puro)

Cart, AppSignals, Sidebar, BookingSuccess. AppSignals solo muere señal a señal
cuando su último consumidor pase a invalidaciones.

## Reglas transversales

- Query keys siempre desde `src/queries/keys.ts`, con userId salvo endpoints
  públicos.
- Al añadir un dominio a `PERSIST_ROOTS`, subir el `buster` si cambió el shape
  de algo ya persistido.
- Un dominio migrado no debe seguir viviendo también en su contexto: retirar
  el estado antiguo en el mismo cambio (evitar dobles fuentes de verdad).
- Gate por cambio: `cd mobile-app && npx tsc --noEmit` + prueba manual en
  Expo Go de la pantalla afectada.
