# Seguridad — Fuga de datos personales (PII) en endpoints públicos de jugadores

Fecha: 2026-06-06
Severidad: **Alta** (exposición de PII sin autenticación)
Estado: **detectado, pendiente de arreglar**
Ámbito: `backend/src/routes/players.ts`

## Resumen ejecutivo

Los endpoints `GET /players/:id` y `GET /players` del backend **no requieren
autenticación** y devuelven **datos personales** de cualquier jugador (`email`,
`phone`, `stripe_customer_id`, `consents` y, desde un cambio reciente,
`birth_date`). Como los identificadores de jugador no son secretos (la propia
búsqueda los expone), **cualquiera —incluso sin estar logueado— puede obtener el
email, teléfono y fecha de nacimiento de cualquier jugador**.

No se puede arreglar simplemente "dejando de devolver esos campos", porque el
**panel de administración (web-app) sí necesita** email/phone en `GET /players`.
El arreglo correcto es **autenticación + autorización por rol**.

---

## 1. El problema

### 1.1 Falta de autenticación
- El router se monta sin middleware de auth: `router.use("/players", playersRouter)`
  (`backend/src/routes/index.ts:67`).
- El handler `GET /players/:id` (`backend/src/routes/players.ts:~1456`) **no lee
  el header `Authorization`** (a diferencia de `PATCH /me`, que sí valida token).
- Lo mismo aplica a `GET /players` (búsqueda/listado).

→ Ambos son **accesibles de forma anónima** desde internet.

### 1.2 Exposición de datos sensibles
La proyección `SELECT_PUBLIC_INTERNAL` (`players.ts:~167-178`) incluye campos
privados y se usa también para servir perfiles de **otros** jugadores:
`email`, `phone`, `stripe_customer_id`, `consents`, `birth_date`.

### 1.3 Los identificadores no son secretos
`GET /players?q=<nombre>` devuelve el `id` de los jugadores que coinciden. Además
los `id` circulan por toda la app (chat, partidos, candidatos de IA de afinidad,
perfil público). No hace falta "adivinar" UUIDs: se obtienen legítimamente.

### Cadena de ataque
1. `GET /players?q=Juan` → se obtiene el `id` de un jugador (sin login).
2. `GET /players/:id` con ese `id` → devuelve `email`, `phone`,
   `stripe_customer_id`, `consents`, `birth_date`.

(De hecho, `GET /players` ya devuelve `email` y `phone` directamente en los
resultados de búsqueda, sin necesidad del segundo paso.)

---

## 2. Endpoints afectados

| Endpoint | Auth | Campos privados que devuelve | Notas |
|---|---|---|---|
| `GET /players/:id` | ❌ ninguna | email, phone, stripe_customer_id, consents, **birth_date** | Usa `SELECT_PUBLIC_INTERNAL` |
| `GET /players` (búsqueda/listado) | ❌ ninguna | email, phone | Proyección explícita (`players.ts:~1342-1345`) |
| `GET /players/:id/public-profile` | — | ninguno ✓ | Proyección propia, limpia |
| `GET /me`, `PATCH /me` | ✅ token | (correcto, es el propio jugador) | — |

> `birth_date` se añadió recientemente a `SELECT_PUBLIC_INTERNAL` (al cablear la
> edición de perfil). Eso introdujo su fuga vía `GET /players/:id`. La fuga de
> `email`/`phone`/`stripe_customer_id`/`consents` es **preexistente**.

---

## 3. Quién consume estos endpoints hoy (restricciones a respetar)

Auditoría de consumidores (clave para no romper nada al arreglar):

- **`GET /players/:id`** → **sin consumidores**. En web-app `playerService.getById`
  está definido pero **no se llama en ningún sitio**; el mobile usa
  `/players/:id/public-profile`, no `/:id`. Es un **endpoint muerto** pero
  expuesto. **Minimizarlo no rompe nada.**
- **`GET /players` (search)** → **lo usa el panel admin (web-app)** vía
  `playerService.getAll(...)`, y **lee `email`/`phone`**:
  - `QuickSaleCart` (muestra `phone || email`),
  - `ClubTournamentsTab` (muestra `email`),
  - `ClubLeaguesTab`, `EditCartSaleModal`.
  - **Quitar email/phone aquí rompería esas pantallas.**
  - (El listado principal de jugadores del club, `ClubPlayers`, usa otro endpoint
    de club —`clubClientService.list`— no este.)
- **Mobile**: `searchPlayers` (`GET /players`) lee solo `id`, `first_name`,
  `last_name`, `username` (no PII); los perfiles los pide a `/public-profile`.

**Conclusión:** `GET /players` sirve a la vez a mobile (no necesita PII) y al
panel admin (sí necesita email/phone). Por eso **no** se puede arreglar solo
quitando campos: hay que distinguir **quién pregunta**.

---

## 4. Impacto

- Exposición de **PII de todos los jugadores** (contacto y fecha de nacimiento)
  a cualquier persona sin autenticación. Posible incumplimiento de protección de
  datos (RGPD) y riesgo de scraping masivo del padrón de jugadores.
- `stripe_customer_id` y `consents` también expuestos.

---

## 5. Solución propuesta

### 5.1 Arreglo rápido — `GET /players/:id` (riesgo cero, hacer ya)
Como no lo consume nadie, cambiar su proyección a un `SELECT_PUBLIC` **sin**
`email, phone, stripe_customer_id, consents, birth_date`.
- Cierra la fuga de `birth_date` (introducida hace poco) y la preexistente de ese
  endpoint.
- No rompe ningún cliente.

### 5.2 Arreglo correcto — autenticación + autorización por rol
Es lo principal y debe hacerse con cuidado:

1. **Exigir autenticación** en `GET /players/:id` y `GET /players` (token válido,
   como en `PATCH /me`, o middleware de auth en el router). Los clientes ya
   mandan token (el mobile en `searchPlayers`; el web admin está autenticado);
   confirmar que no haya llamadas pre-login.
2. **Autorización por rol en `GET /players`**: devolver `email`/`phone` **solo a
   staff del club / admin**; a un jugador normal, solo campos públicos. Opciones:
   - parámetro/scope ya existente (`club_id`) + comprobación de que el solicitante
     es staff de ese club, o
   - dos proyecciones según rol (público vs admin) decididas en el handler.
3. Mantener `GET /players/:id` con la proyección pública (5.1).

### 5.3 Revisar también las mutaciones (mismo router sin auth)
`POST /players`, `POST /players/manual` y `PUT /players/:id` están bajo el mismo
router sin middleware de auth. Conviene **verificar si están protegidas** de otro
modo; si no, cualquiera podría **crear/editar/borrar jugadores** de forma anónima
(problema potencialmente mayor que la lectura). Revisar como parte de este
trabajo.

---

## 6. Plan de implementación sugerido

1. **Inmediato:** `GET /players/:id` → `SELECT_PUBLIC` (sin PII). Sin impacto.
2. **Auth:** añadir verificación de token a `GET /players/:id` y `GET /players`;
   probar mobile (búsqueda) y web (panel) tras el cambio.
3. **Rol en `GET /players`:** devolver contacto solo a staff/admin; ajustar
   `playerService.getAll` y consumidores (QuickSaleCart, ClubTournamentsTab,
   ClubLeaguesTab, EditCartSaleModal) si cambia la forma.
4. **Mutaciones:** auditar y proteger `POST`/`PUT`/`DELETE` de `/players`.

## 7. Verificación

- Tras 5.1: `GET /players/:id` no devuelve email/phone/stripe/consents/birth_date;
  mobile y web siguen funcionando (no lo consumen).
- Tras 5.2: sin token → 401; con token de jugador normal → sin PII; con token de
  staff del club → email/phone visibles. Panel admin (QuickSaleCart, torneos,
  ligas) sigue mostrando contacto.
- Comprobar que no haya regresiones en búsqueda de jugadores (mobile y web).

---

## Apéndice — Referencias de código
- Router sin auth: `backend/src/routes/index.ts:67`
- Proyección con PII: `backend/src/routes/players.ts` (`SELECT_PUBLIC_INTERNAL`, ~L167-178)
- `GET /players/:id`: `backend/src/routes/players.ts:~1456`
- `GET /players` (search): `backend/src/routes/players.ts:~1329-1391`
- Consumidor web admin: `web-app/src/services/player.ts` (`getAll`, `getById`),
  `web-app/src/components/Inventory/QuickSaleCart.tsx`,
  `web-app/src/components/Dashboard/ClubTournamentsTab.tsx`
- Consumidor mobile (sin PII): `mobile-app/src/api/players.ts` (`searchPlayers`,
  `fetchPublicPlayerProfile`)
