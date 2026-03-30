# 01 — Modelo del jugador

## 1. Visión objetivo

Cada jugador tiene las siguientes variables de nivelación y progresión:

### Variables de nivelación

| Variable | Tipo | Visibilidad | Descripción |
|---|---|---|---|
| `elo_rating` | float (0–7) | Pública | Nivel visible al usuario. Calculado a partir de mu y sigma |
| `mu` | float | Interna | Estimación real de habilidad (escala OpenSkill, ~25 para un nuevo jugador) |
| `sigma` | float | Interna | Incertidumbre sobre mu. Se expone como `fiabilidad` (0–100) calculado en backend |
| `beta` | float | Interna | Inconsistencia propia del jugador. Nunca visible para evitar rechazo social |
| `streak_bonus` | float (×1.0–×2.0) | Interna | Multiplicador de SP según racha activa del módulo de aprendizaje. Ver sección 4.3 |

### Variables de contadores de partidos

| Variable | Tipo | Visibilidad | Descripción |
|---|---|---|---|
| `matches_played_competitive` | int | Interna | Partidos competitivos jugados |
| `matches_played_friendly` | int | Interna | Partidos amistosos jugados |
| `matches_played_matchmaking` | int | Interna | Partidos encontrados por matchmaking jugados |

**Decisión tomada:** En el perfil del usuario se muestra el **total de partidos jugados** (suma de los tres contadores). Los tres contadores existen internamente para consultas y estadísticas, pero la API pública devuelve la suma.

### Variables de progresión (Season Points)

| Variable | Tipo | Visibilidad | Descripción |
|---|---|---|---|
| `sp` | int | Pública | Season Points acumulados en la temporada activa. Alimenta el Season Pass (componente 09) |

El SP (Season Points) es una moneda de progresión transversal a toda la app. Se acumula con cualquier actividad:

| Acción | SP |
|---|---|
| Reservar pista | — pendiente de definir |
| Jugar partido competitivo | — pendiente de definir |
| Jugar partido amistoso | — pendiente de definir |
| Completar lección diaria | — pendiente de definir |
| Completar curso | — pendiente de definir |
| Compra en marketplace | — pendiente de definir |
| Asistir a clase | — pendiente de definir |
| Dar feedback post-partido | — pendiente de definir |
| Racha activa del módulo de aprendizaje | — pendiente de definir |
| Completar cuestionario inicial | — pendiente de definir |

El SP acumulado desbloquea niveles del Season Pass (ver componente 09). Al final de cada temporada se resetea.

### Variable de control de onboarding

| Variable | Tipo | Descripción |
|---|---|---|
| `initial_rating_completed` | boolean | Indica si el jugador completó el cuestionario de nivelación inicial |

**Decisión tomada:** El nombre del boolean es `initial_rating_completed`.

---

Adicionalmente, existe una tabla separada `player_synergies` que registra cómo rinden dos jugadores cuando forman pareja.

La API pública expone: `elo_rating`, total de partidos jugados (suma de los tres contadores), `sp`, y el campo `fiabilidad` calculado en backend.
Los campos `mu`, `sigma`, `beta`, `streak_bonus` son solo de uso interno del backend.

---

## 2. Estado actual

**Archivo:** `backend/src/routes/players.ts`

La tabla `players` en Supabase contiene actualmente:
- `elo_rating` (numeric) — valor por defecto implícito `1200` (línea 208), escala absoluta sin límite definido
- `elo_last_updated_at` (timestamptz) — timestamp de la última modificación

Los `SELECT` de los endpoints exponen:
- `GET /players/me` (línea 22): `id, created_at, first_name, last_name, email, phone, elo_rating, status`
- `GET /players` (línea 110): igual que `/me`
- `GET /players/:id` (línea 152): añade `elo_last_updated_at, stripe_customer_id, consents`

El endpoint `PUT /players/:id` (línea 239) acepta campos dinámicos: `first_name, last_name, email, phone, elo_rating, status`.

**No existe** ningún campo `mu`, `sigma`, `beta`, `streak_bonus`, contadores de partidos, `sp`, ni boolean de onboarding.
**No existe** la tabla `player_synergies`.
**No existe** función de mapeo de `mu/sigma → elo_rating (0–7)`.

---

## 3. Qué hay que cambiar

### 3.1 Tabla `players` en Supabase
Añadir columnas desde el dashboard de Supabase (no hay migraciones en el repo):

| Columna | Tipo SQL | Valor por defecto | Nullable |
|---|---|---|---|
| `mu` | `float8` | `25.0` | NO |
| `sigma` | `float8` | `8.333` | NO |
| `beta` | `float8` | `4.167` | NO |
| `streak_bonus` | `float8` | `1.0` | NO |
| `matches_played_competitive` | `int4` | `0` | NO |
| `matches_played_friendly` | `int4` | `0` | NO |
| `matches_played_matchmaking` | `int4` | `0` | NO |
| `sp` | `int4` | `0` | NO |
| `initial_rating_completed` | `bool` | `false` | NO |

> Valores por defecto de OpenSkill estándar: mu=25, sigma=25/3≈8.333, beta=25/6≈4.167.

### 3.2 `backend/src/routes/players.ts`

**Cálculo de `fiabilidad`:**
El % de fiabilidad se calcula **siempre en el backend**. El frontend nunca recibe `sigma` crudo.
Fórmula corregida con protección contra valores negativos:
```typescript
const fiabilidad = Math.max(0, Math.round((1 - sigma / 8.333) * 100));
```
Añadir este cálculo en todos los endpoints que devuelven datos de jugador (`/me`, `/players`, `/players/:id`) antes de construir la respuesta.

**Endpoint `GET /players/:id` (línea 152):**
Añadir al SELECT: `matches_played_competitive`, `matches_played_friendly`, `matches_played_matchmaking`, `sp`. Calcular `fiabilidad` y `matches_played_total` (suma de los tres contadores) en backend antes de devolver la respuesta. No exponer `mu, sigma, beta, streak_bonus`.

**Endpoint `GET /players/me` (línea 22) y `GET /players` (línea 110):**
Añadir `matches_played_competitive`, `matches_played_friendly`, `matches_played_matchmaking`, `sp` al SELECT. Añadir `fiabilidad` y `matches_played_total` calculados.

**Endpoint `PUT /players/:id` (línea 239):**
No requiere cambios en código — los nuevos campos de nivelación se actualizan desde el servicio de nivelación directamente vía Supabase client, no desde este endpoint público.

---

## 4. Qué hay que crear nuevo

### 4.1 Tabla `player_synergies` en Supabase

```
player_synergies
├── id            uuid PRIMARY KEY default gen_random_uuid()
├── player_id_1   uuid NOT NULL references players(id)
├── player_id_2   uuid NOT NULL references players(id)
├── value         float8 NOT NULL default 0.0
├── matches_count int4 NOT NULL default 0
└── updated_at    timestamptz default now()
```

Restricción: `(player_id_1, player_id_2)` UNIQUE con `player_id_1 < player_id_2` para evitar duplicados.

### 4.2 Función de mapeo `mu/sigma → elo_rating`

Debe vivir en `backend/src/services/levelingService.ts` (archivo nuevo, ver componente 03).

```typescript
// Ejemplo provisional — la fórmula exacta es una decisión pendiente
export function calcEloRating(mu: number, sigma: number): number {
  // mu conservador = mu - 2*sigma (límite inferior al 95%)
  const conservative = mu - 2 * sigma;
  // Mapear al rango 0–7. Ajustar MIN/MAX con datos reales.
  const MIN_CONSERVATIVE = 0;   // ← pendiente de calibrar
  const MAX_CONSERVATIVE = 50;  // ← pendiente de calibrar
  const clamped = Math.max(MIN_CONSERVATIVE, Math.min(MAX_CONSERVATIVE, conservative));
  return Math.round((clamped / MAX_CONSERVATIVE) * 7 * 10) / 10;
}
```

### 4.3 streak_bonus — decisión tomada (Opción B)

> El `streak_bonus` es un multiplicador de SP. Se aplica a **todas las acciones que generan SP** mientras el jugador tiene racha activa en el módulo de aprendizaje. No afecta a `mu`, `sigma` ni `elo_rating` en ningún caso. Los valores exactos del multiplicador por días de racha están definidos en el PRD del módulo de aprendizaje.

El nivel de pádel (elo_rating) es puro — no se ve afectado por ningún multiplicador externo. La racha premia la progresión en el Season Pass, no el nivel competitivo.

---

## 5. Decisiones pendientes

1. **Función concreta `mu/sigma → elo_rating (0–7)`:**
   - Opción A: `elo = f(mu - 2*sigma)` — escala conservadora
   - Opción B: `elo = f(mu)` — ignora la incertidumbre para el valor visible
   - Opción C: fórmula personalizada tras calibración con datos reales

2. **Valores concretos de SP por acción:**
   - Todos los valores de la tabla de SP están pendientes de definir.
   - _No bloquea el MVP — los contadores de SP se pueden implementar sin los valores finales._
