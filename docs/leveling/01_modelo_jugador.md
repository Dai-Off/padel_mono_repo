# 01 — Modelo del jugador

## 1. Visión objetivo

Cada jugador tiene las siguientes variables de nivelación y progresión:

### Variables de nivelación

| Variable | Tipo | Visibilidad | Descripción |
|---|---|---|---|
| `elo_rating` | float (0–7) | Pública | Nivel visible al usuario. Calculado a partir de mu |
| `mu` | float | Interna | Estimación real de habilidad (escala OpenSkill, ~25 para un nuevo jugador) |
| `sigma` | float | Interna | Incertidumbre sobre mu. Se expone como `fiabilidad` (0–100) calculado en backend |
| `beta` | float | Interna | Inconsistencia propia del jugador. Nunca visible para evitar rechazo social |
| `streak_bonus` | float (×1.0–×2.0) | Interna | **Post-MVP.** Multiplicador de SP segun racha activa. No implementar hasta que Season Pass este en scope |

### Variables de nivel desglosado por areas

| Variable | Tipo | Visibilidad | Descripcion |
|---|---|---|---|
| `area_technique` | float (0-7) | Publica | Nivel desglosado: tecnica. Golpes, precision, variedad de recursos |
| `area_tactics` | float (0-7) | Publica | Nivel desglosado: tactica. Lectura de juego, posicionamiento, estrategia |
| `area_physical` | float (0-7) | Publica | Nivel desglosado: fisico. Resistencia, velocidad, explosividad |
| `area_mental` | float (0-7) | Publica | Nivel desglosado: mental. Concentracion, gestion emocional, vocabulario |

Las 4 areas se inicializan a `elo_rating` del jugador cuando este completa el cuestionario inicial (componente 04). Para jugadores existentes, se inicializan con una migracion one-time `SET area_* = elo_rating`.

Las areas son **publicas** y se muestran en el radar chart del Coach IA (componente 11). A diferencia de `mu`, `sigma` y `beta`, las areas son visibles para el jugador.

**Invariante de rango:** Cada area debe estar siempre dentro de `[elo_rating - 1.0, elo_rating + 1.0]`. Este clamp se aplica despues de cada actualizacion, sin excepcion.

Las reglas detalladas de actualizacion estan en la seccion 4.4.

### Variables de contadores de partidos

| Variable | Tipo | Visibilidad | Descripción |
|---|---|---|---|
| `matches_played_competitive` | int | Interna | Partidos competitivos jugados |
| `matches_played_friendly` | int | Interna | Partidos amistosos jugados |
| `matches_played_matchmaking` | int | Interna | Partidos encontrados por matchmaking jugados |

**Decisión tomada:** En el perfil del usuario se muestra el **total de partidos jugados** (suma de los tres contadores). Los tres contadores existen internamente para consultas y estadísticas, pero la API pública devuelve la suma.

### Variables de progresion (Season Points) — POST-MVP

> **Todo el sistema de SP y Season Pass queda para post-MVP.** No implementar `sp`, `streak_bonus` ni ninguna logica de Season Points hasta que el Season Pass (componente 09) entre en scope. Las columnas `sp` y `streak_bonus` pueden existir en la BD con sus valores por defecto, pero ningun endpoint las lee ni escribe en el MVP.

### Variable de perfil

| Variable | Tipo | Descripción |
|---|---|---|
| `gender` | text (`'male'` \| `'female'`) | Género real del jugador. Necesario para el filtro `'mixed'` del matchmaking (ver componente 06) |

### Variable de control de onboarding

| Variable | Tipo | Descripción |
|---|---|---|
| `initial_rating_completed` | boolean | Indica si el jugador completó el cuestionario de nivelación inicial |

---

Adicionalmente, existe una tabla separada `player_synergies` que registra cómo rinden dos jugadores cuando forman pareja.

La API publica expone: `elo_rating`, total de partidos jugados (suma de los tres contadores), las 4 areas de nivel, y el campo `fiabilidad` calculado en backend.
Los campos `mu`, `sigma`, `beta` son solo de uso interno del backend. `sp` y `streak_bonus` quedan para post-MVP.

---

## 2. Estado actual

> Ultima verificacion: 2026-04-14

### 2.1 Tabla `players` en Supabase — columnas de nivelacion

Todas las columnas de nivelacion estan implementadas desde la migracion `backend/db/014_leveling_matchmaking.sql`:

| Columna | Tipo SQL | Default | Estado |
|---|---|---|---|
| `elo_rating` | float8 | 3.5 | ✅ Implementada |
| `mu` | float8 | 25.0 | ✅ Implementada |
| `sigma` | float8 | 8.333 | ✅ Implementada |
| `beta` | float8 | 4.167 | ✅ Implementada |
| `beta_residuals` | jsonb | '[]' | ✅ Implementada |
| `streak_bonus` | float8 | 1.0 | ✅ En BD (post-MVP, no se usa) |
| `matches_played_competitive` | int4 | 0 | ✅ Implementada |
| `matches_played_friendly` | int4 | 0 | ✅ Implementada |
| `matches_played_matchmaking` | int4 | 0 | ✅ Implementada |
| `sp` | int4 | 0 | ✅ En BD (post-MVP, no se usa) |
| `initial_rating_completed` | bool | false | ✅ Implementada |
| `gender` | text | 'male' | ✅ Implementada (migracion 024) |
| `area_technique` | float8 | null | ❌ **PENDIENTE** |
| `area_tactics` | float8 | null | ❌ **PENDIENTE** |
| `area_physical` | float8 | null | ❌ **PENDIENTE** |
| `area_mental` | float8 | null | ❌ **PENDIENTE** |

**Sobre mu = 25:** Es el valor neutral estandar de OpenSkill. No tiene significado visible para el jugador. El jugador no ve su elo_rating hasta completar el cuestionario inicial (`initial_rating_completed = true`). El onboarding (componente 04, `onboardingService.ts`) sobrescribe mu a un rango de 15-40 segun las respuestas del cuestionario, y recalcula elo_rating. El default de 25 nunca se muestra al usuario.

### 2.2 Tabla `player_synergies` — ✅ Implementada

Creada en `backend/db/014_leveling_matchmaking.sql`. Estructura:

```sql
player_synergies (
  id uuid PRIMARY KEY,
  player_id_1 uuid NOT NULL REFERENCES players(id),
  player_id_2 uuid NOT NULL REFERENCES players(id),
  value double precision NOT NULL DEFAULT 0.0,
  matches_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (player_id_1, player_id_2),
  CHECK (player_id_1 < player_id_2)
)
```

Se usa activamente en `levelingService.ts` (`fetchSynergyRow`) y en el RPC `apply_leveling_pipeline`.

### 2.3 `levelingService.ts` — ✅ Implementado

Archivo: `backend/src/services/levelingService.ts` (419 lineas).

Funciones principales:
- `calcEloRating(mu, sigma)` — mapea a escala 0-7 usando conservative rating (`mu - 2*sigma`)
- `calcScoreMargin()` — margen de victoria
- `detectComeback()` — deteccion de remontada
- `determineOutcome()` — resultado del partido
- `updateBeta()` — actualizacion de beta basada en residuales
- `runLevelingPipeline()` — pipeline completo de nivelacion con OpenSkill
- `applyFriendlyPlayCounts()` — contadores de partidos amistosos

OpenSkill se importa y usa activamente: `import { rating, rate, predictWin } from 'openskill'`.

### 2.4 Endpoints de players — ✅ Implementados

Archivo: `backend/src/routes/players.ts`.

La funcion `toPublicPlayer()` transforma los datos antes de devolverlos:
- **Expone:** `elo_rating`, `fiabilidad` (calculada), `matches_played_total` (suma), contadores individuales, `gender`
- **Oculta:** `mu`, `sigma`, `beta`, `streak_bonus`, `beta_residuals`

Formula de fiabilidad implementada:
```typescript
const fiabilidad = Math.max(0, Math.round((1 - sigma / 8.333) * 100));
```

### 2.5 Formula actual de `calcEloRating`

```typescript
export function calcEloRating(mu: number, sigma: number): number {
  const conservative = mu - 2 * sigma;
  const clamped = Math.max(0, Math.min(50, conservative));
  return Math.round((clamped / 50) * 7 * 10) / 10;
}
```

> **Nota:** La implementacion usa conservative rating (`mu - 2*sigma`), no la formula lineal que documentaba la version anterior de este archivo. Esta es la formula correcta en produccion.

### 2.6 Evolucion de sigma y su efecto en elo_rating

OpenSkill reduce sigma despues de cada partido usando inferencia bayesiana. La bajada es decreciente: los primeros partidos reducen sigma mucho, los siguientes cada vez menos.

| Partidos jugados | sigma aprox | Fiabilidad % | Variacion elo por partido |
|---|---|---|---|
| 0 | 8.33 | 0% | ±0.33 |
| 5 | 6.0 | 28% | ±0.24 |
| 15 | 4.0 | 52% | ±0.16 |
| 30 | 2.5 | 70% | ±0.10 |
| 60 | 1.5 | 82% | ±0.06 |
| 100 | 0.9 | 89% | ±0.04 |
| 200+ | ~0.5 | 94% | ±0.02 |

- **sigma nunca llega a 0.** Suelo: `MIN_SIGMA = 0.5` (~94% fiabilidad maxima).
- **Inactividad:** El parametro `tau` de OpenSkill sube sigma si el jugador lleva tiempo sin jugar, bajando fiabilidad y aumentando variacion en el siguiente partido.

---

## 3. Que falta por implementar

### 3.1 Columnas `area_*` en tabla `players`

Anadir desde el dashboard de Supabase:

| Columna | Tipo SQL | Default | Nullable |
|---|---|---|---|
| `area_technique` | `float8` | `null` | SI |
| `area_tactics` | `float8` | `null` | SI |
| `area_physical` | `float8` | `null` | SI |
| `area_mental` | `float8` | `null` | SI |

Valor por defecto `null` porque la inicializacion depende del `elo_rating` del jugador en el momento del cuestionario inicial. Se inicializan a `elo_rating` cuando completa el cuestionario (componente 04). Migracion para jugadores existentes:

```sql
UPDATE players SET
  area_technique = elo_rating,
  area_tactics = elo_rating,
  area_physical = elo_rating,
  area_mental = elo_rating
WHERE area_technique IS NULL;
```

### 3.2 Exponer areas en endpoints de players

En `toPublicPlayer()` de `backend/src/routes/players.ts`: incluir `area_technique`, `area_tactics`, `area_physical`, `area_mental` en la respuesta (solo si no son null).

### 3.3 Logica de actualizacion de areas

Tres fuentes modifican las areas (ver seccion 4.4 para reglas detalladas):
1. **Lecciones diarias** — `POST /learning/daily-lesson/complete`
2. **Resultado de partidos** — `runLevelingPipeline()` en `levelingService.ts`
3. **Feedback post-partido** — `POST /matches/:id/feedback`

---

## 4. Logica pendiente de implementar

### 4.1 streak_bonus — POST-MVP

> `streak_bonus` es un multiplicador de SP. Toda la logica de SP y Season Pass queda para post-MVP. No implementar esta seccion hasta que el componente 09 (Season Pass) entre en scope. El campo puede existir en la BD con su valor por defecto (1.0) pero no se lee ni se escribe en el MVP.

### 4.2 Reglas de actualizacion de areas de nivel

Las 4 areas (`area_technique`, `area_tactics`, `area_physical`, `area_mental`) se modifican por 3 fuentes. Cada fuente aplica un delta diferente.

#### Constantes

```typescript
const DELTA_LESSON_CORRECT = 0.02;   // Por pregunta correcta en leccion diaria
const DELTA_LESSON_INCORRECT = 0.01; // Por pregunta incorrecta en leccion diaria
const DRAG_FACTOR = 0.5;             // Proporcion de arrastre al cambiar elo_rating
const DELTA_FEEDBACK_VOTE = 0.01;    // Por voto de feedback post-partido
const MAX_DEVIATION = 1.0;           // Desviacion maxima del area respecto a elo_rating
const SOFTCAP_THRESHOLD = 0.7;       // A partir de esta desviacion, el delta se reduce
```

#### Soft cap (reduccion de delta cerca del limite)

Cuando un area esta cerca del limite superior (`elo_rating + MAX_DEVIATION`), el delta se reduce linealmente para evitar que suba artificialmente:

```typescript
function applyDelta(area: number, delta: number, eloRating: number): number {
  if (delta > 0) {
    const deviation = area - eloRating;
    if (deviation > SOFTCAP_THRESHOLD) {
      const factor = 1.0 - (deviation - SOFTCAP_THRESHOLD) / (MAX_DEVIATION - SOFTCAP_THRESHOLD);
      delta = delta * Math.max(0, factor);
    }
  }
  const newArea = area + delta;
  return Math.max(eloRating - MAX_DEVIATION, Math.min(eloRating + MAX_DEVIATION, newArea));
}
```

**Ejemplo:** Jugador con `elo_rating = 3.0` y `area_technique = 3.8`:
- Desviacion = 0.8 (entre 0.7 y 1.0)
- Factor = 1.0 - (0.8 - 0.7) / (1.0 - 0.7) = 0.667
- Si responde correctamente: delta_effective = 0.02 * 0.667 = 0.013
- Nueva area_technique = 3.813

#### Fuente 1: Lecciones diarias (componente aprendizaje)

Se ejecuta en `POST /learning/daily-lesson/complete`, despues de registrar las respuestas.

```
Para cada pregunta respondida (5 en total):
  - Obtener area de la pregunta (learning_questions.area)
  - Mapping: 'technique' -> area_technique
             'tactics'   -> area_tactics
             'physical'  -> area_physical
             'mental_vocabulary' -> area_mental
  - Si answered_correctly: applyDelta(area, +DELTA_LESSON_CORRECT, elo_rating)
  - Si incorrecta: area -= DELTA_LESSON_INCORRECT (sin soft cap para bajadas, solo clamp)
Despues de las 5 preguntas, clamp las 4 areas a [elo_rating - 1.0, elo_rating + 1.0].
UPDATE players SET area_technique=X, area_tactics=Y, area_physical=Z, area_mental=W.
```

#### Fuente 2: Resultado de partidos (componente 03 — pipeline de nivelacion)

Se ejecuta en el pipeline de actualizacion de nivel, despues de calcular el nuevo `elo_rating`.

```
delta_elo = new_elo_rating - old_elo_rating

Para cada area:
  area_nueva = area_actual + delta_elo * DRAG_FACTOR

Clamp las 4 areas a [new_elo_rating - 1.0, new_elo_rating + 1.0].
```

Esto significa:
- Si el jugador gana y su elo sube 0.10, cada area sube 0.05.
- Si pierde y su elo baja 0.10, cada area baja 0.05.
- Las areas se "arrastran" hacia el nuevo elo, manteniendo sus proporciones relativas.

Solo aplica a partidos competitivos y de matchmaking (los que actualizan elo_rating).

#### Fuente 3: Feedback post-partido (componente 08)

Se ejecuta cuando se procesa el feedback recibido. El ajuste es **invisible para el usuario**.

```
Para cada voto recibido sobre el jugador (de la pregunta de area del feedback):
  - area_asked = el area sobre la que se pregunto (technique, tactics, physical, mental)
  - area_perceived = -1, 0, o +1

  Si area_perceived == 1 (mas alto de lo esperado):
    applyDelta(area_correspondiente, +DELTA_FEEDBACK_VOTE, elo_rating)
  Si area_perceived == -1 (mas bajo de lo esperado):
    area_correspondiente -= DELTA_FEEDBACK_VOTE (clamp despues)
  Si area_perceived == 0: no hacer nada

Para el voto de nivel general (perceived):
  Si perceived == 1: elo ajuste ligero positivo (+0.01)
  Si perceived == -1: elo ajuste ligero negativo (-0.01)
  Esto NO es el mismo ajuste que hace el pipeline de nivelacion (componente 03).
  Es un microajuste adicional basado en la percepcion de los demas jugadores.

Clamp areas y elo despues de todos los ajustes.
```

**Nota importante:** Estos ajustes son MUY ligeros. Un solo voto de feedback mueve el area 0.01 puntos. Hacen falta muchos partidos con consenso consistente para que el efecto acumulado sea perceptible. Esto es intencional.

#### Resumen de deltas

| Fuente | Que modifica | Delta | Frecuencia |
|--------|-------------|-------|------------|
| Leccion diaria (correcta) | Area de la pregunta | +0.02 | Hasta 5 veces por dia |
| Leccion diaria (incorrecta) | Area de la pregunta | -0.01 | Hasta 5 veces por dia |
| Victoria/derrota en partido | Todas las areas | delta_elo * 0.5 | Por partido competitivo |
| Feedback de area (positivo) | Area preguntada | +0.01 | Por voto recibido |
| Feedback de area (negativo) | Area preguntada | -0.01 | Por voto recibido |
| Feedback de nivel general | elo_rating | +/-0.01 | Por voto recibido |

#### Endpoints que exponen las areas

- `GET /players/me`: incluir `area_technique`, `area_tactics`, `area_physical`, `area_mental` en la respuesta (solo si no son null).
- `GET /players/:id`: igual.

---

## 5. Decisiones pendientes

1. **SP y Season Pass: post-MVP.** Todo el sistema de Season Points, streak_bonus y Season Pass (componente 09) queda fuera del MVP. Se implementara cuando entre en scope.
