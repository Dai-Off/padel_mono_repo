# 06 — Algoritmo de matchmaking

## 1. Visión objetivo

Un jugador activa "quiero jugar" desde la app, introduce sus preferencias, y entra en una pool de búsqueda. El sistema corre periódicamente, busca grupos de 4 jugadores compatibles, elige la combinación de equipos más equilibrada, notifica a los 4, y reserva la pista automáticamente cuando todos confirman.

Un jugador puede entrar solo o en pareja (con otro jugador vinculado). Si entra en pareja, el sistema los trata como unidad indivisible y solo busca los otros 2 jugadores.

### Flujo completo

```
Jugador activa búsqueda (solo o en pareja)
       ↓
Entra en pool con preferencias
       ↓
Sistema corre algoritmo (periódico)
       ↓
¿Grupo de 4 compatible + equilibrado?
  → NO: sigue en pool (ampliación de criterios si hay timeout)
  → SÍ: notifica a los 4
       ↓
Los 4 confirman/rechazan
  → Alguien rechaza: se le aplica derrota en el nivel (ver sección 4.9)
  → Todos confirman: reserva automática de pista
       ↓
Partido creado con type = 'matchmaking'
```

---

## 2. Estado actual

**Archivo:** `backend/src/routes/matches.ts`

La tabla `matches` tiene `elo_min`, `elo_max` y `gender` para filtrar en partidos abiertos. La función `hasCourtConflict` (línea 17–74) verifica conflictos de horario y puede reutilizarse.

**No existe:**
- Ninguna tabla de pool de matchmaking
- Ningún algoritmo de emparejamiento
- Ninguna ruta para activar/desactivar la búsqueda
- Ninguna lógica de reserva automática
- El campo `type` en `matches` (ver componente 02)

---

## 3. Qué hay que cambiar

### 3.1 `backend/src/routes/matches.ts`
La función `hasCourtConflict` (línea 17–74) debe extraerse a `backend/src/services/bookingService.ts` para que el matchmaking también pueda verificar conflictos de horario antes de proponer una pista.

---

## 4. Qué hay que crear nuevo

### 4.1 Tabla `matchmaking_pool` en Supabase

```
matchmaking_pool
├── id               uuid PRIMARY KEY default gen_random_uuid()
├── player_id        uuid NOT NULL UNIQUE references players(id)
├── paired_with_id   uuid references players(id)              ← null si entra solo
├── club_id          uuid references clubs(id)                ← nullable; preferencia de club
├── max_distance_km  int4                                     ← nullable; radio si no hay club
├── preferred_side   text                                     ← 'drive' | 'backhand' | 'any'
├── gender           text NOT NULL default 'any'              ← 'male' | 'female' | 'any'
├── available_from   timestamptz NOT NULL
├── available_until  timestamptz NOT NULL
├── status           text NOT NULL default 'searching'        ← 'searching' | 'matched' | 'expired'
├── created_at       timestamptz default now()
└── expires_at       timestamptz                              ← pendiente de definir
```

`player_id` es UNIQUE — un jugador solo puede estar en la pool una vez.

Si `paired_with_id` está presente, ambos jugadores deben estar en la pool para que el sistema los considere disponibles para un partido.

### 4.2 Nuevas rutas de matchmaking

Archivo nuevo: `backend/src/routes/matchmaking.ts`, registrado en `backend/src/routes/index.ts`.

---

#### `POST /matchmaking/join`

**Body:**
```json
{
  "club_id": "uuid-del-club",
  "max_distance_km": 10,
  "preferred_side": "drive",        // 'drive' | 'backhand' | 'any'
  "gender": "any",                  // 'male' | 'female' | 'any'
  "available_from": "2026-03-25T18:00:00Z",
  "available_until": "2026-03-25T21:00:00Z",
  "paired_with_id": null            // uuid si entra en pareja, null si entra solo
}
```

**Lógica:**
1. Verificar que `initial_rating_completed = true` (debe tener nivel asignado)
2. Verificar que el jugador no está ya en la pool (409 si está)
3. Si `paired_with_id` presente: verificar que ese jugador existe (no se requiere que ya esté en pool)
4. Insertar en `matchmaking_pool`
5. Responder 200

---

#### `DELETE /matchmaking/leave`
Marca el registro del jugador como `expired` o lo elimina.

---

#### `GET /matchmaking/status`
```json
{
  "ok": true,
  "status": "searching",       // 'searching' | 'matched' | 'not_in_pool'
  "match_id": null
}
```

---

### 4.3 Endpoint de estadísticas del jugador

**Archivo:** `backend/src/routes/players.ts` o archivo nuevo `backend/src/routes/playerStats.ts`

```
GET /players/:id/stats
```

El frontend solo renderiza — no calcula estadísticas en cliente.

**Respuesta:**
```json
{
  "ok": true,
  "win_streak": 3,
  "loss_streak": 0,
  "win_rate_last_20": 0.65,
  "matches_played_competitive": 42,
  "matches_played_friendly": 15,
  "matches_played_matchmaking": 28
}
```

---

### 4.4 Restricción de nivel en partidos abiertos competitivos

Los partidos abiertos con `competitive = true` aplican la misma restricción de nivel que el matchmaking. Un jugador solo puede unirse a un partido abierto competitivo si su `elo_rating` está dentro de ±1.0 puntos del `elo_rating` del creador del partido.

Implementación:
- Al crear un partido abierto competitivo, el backend calcula automáticamente `elo_min = creator_elo - 1.0` y `elo_max = creator_elo + 1.0`
- Los campos `elo_min` y `elo_max` que ya existen en la tabla `matches` se usan para esta validación
- El creador no puede modificar este rango manualmente
- Al intentar unirse (`POST /matches/:id/prepare-join`), el backend verifica que el `elo_rating` del jugador está dentro del rango

> **Nota:** Los partidos abiertos con `competitive = false` (amistosos) no aplican esta restricción — cualquiera puede unirse.

---

### 4.5 Servicio de matchmaking `backend/src/services/matchmakingService.ts`

#### Función principal: `runMatchmakingCycle()`

```typescript
async function runMatchmakingCycle(): Promise<void> {
  // 1. Leer jugadores con status='searching' en matchmaking_pool
  //    - Incluir mu, sigma, beta, preferred_side, gender, available_from/until, paired_with_id

  // 2. Agrupar por compatibilidad de preferencias:
  //    a. Filtrar por género (estricto: 'male'/'female'; 'any' acepta cualquier combinación)
  //    b. Filtrar por horario superpuesto
  //    c. Filtrar por club/distancia

  // 3. Manejar entradas en pareja:
  //    - Si player.paired_with_id != null, buscar su pareja en la pool
  //    - Si la pareja no está en pool: skip (esperan juntos)
  //    - Si los dos están: tratarlos como unidad; buscar 2 rivales compatibles

  // 4. Para cada grupo de 4 candidatos compatibles:
  //    a. Aplicar filtro max_level_spread (descartar si spread > 1.0)
  //    b. Calcular bestTeamSplit
  //    c. Aplicar umbral dinámico de win_prob según tamaño de pool
  //    d. Ajustar rango según evolución reciente del jugador

  // 5. Verificar disponibilidad de pista en el club/zona compatible
  //    (reutilizar hasCourtConflict de bookingService)

  // 6. Si partido válido encontrado:
  //    - Marcar los 4 jugadores como status='matched'
  //    - Notificar a los 4 (push notification)

  // 7. Guardar pre_match_win_prob para cuando se confirme el partido
}
```

#### Filtro `max_level_spread` (decisión tomada)

```typescript
const MAX_LEVEL_SPREAD = 1.0; // decisión tomada — escala 0–7

function exceedsLevelSpread(players: Player[]): boolean {
  const eloValues = players.map(p => p.elo_rating);
  return Math.max(...eloValues) - Math.min(...eloValues) > MAX_LEVEL_SPREAD;
}
```

Razón: no es válido juntar a dos jugadores de nivel muy diferente contra otra pareja con la misma media. El equilibrio de equipo no garantiza una experiencia justa.

#### Sub-función: `bestTeamSplit`

```typescript
function bestTeamSplit(players: [Player, Player, Player, Player]): {
  teamA: [Player, Player];
  teamB: [Player, Player];
  winProbability: number;
} {
  const combinations = [
    [[0,1],[2,3]],
    [[0,2],[1,3]],
    [[0,3],[1,2]],
  ];

  // Para cada combinación:
  // 1. Obtener sinergía de cada pareja (getSynergy)
  // 2. Calcular win_prob usando predictWinProbability de OpenSkill
  //    → OpenSkill incorpora mu, sigma y beta en la varianza combinada
  //    → NO restar beta directamente a mu (beta no es una penalización sobre mu)
  // 3. balance_score = 1 - |win_prob - 0.5| * 2
  // 4. Devolver la combinación con mayor balance_score

  // Nota sobre sinergía en partidos de parejas vinculadas (paired_with_id):
  // Si los dos jugadores entraron juntos, la sinergía ya viene dada.
  // En ese caso, la función solo evalúa las combinaciones de rivales posibles (1 combinación).
}
```

> **Nota sobre beta en OpenSkill:** Beta no es una penalización directa sobre mu. Es varianza adicional en la predicción. OpenSkill ya la incorpora en la varianza combinada del equipo al calcular `predictWinProbability`. No hay que restar `beta` a `mu` manualmente.

#### Sub-función: `getSynergy`

```typescript
async function getSynergy(id1: string, id2: string): Promise<number> {
  const [a, b] = id1 < id2 ? [id1, id2] : [id2, id1];
  // Buscar en player_synergies; si no existe, devolver 0
}
```

> **Efecto secundario de la sinergía:** La sinergía tiende a que el sistema reitere parejas que han funcionado bien juntas. Esto es consecuencia del diseño, no un objetivo. Si la mayoría de jugadores entra al matchmaking por parejas (`paired_with_id`), la sinergía pierde utilidad en la selección de equipos porque la pareja viene dada; en ese caso puede reservarse solo para predicciones y feedback. **Pendiente de decidir si limitar el peso de la sinergía cuando una pareja lleva más de N partidos juntos.**

#### Umbral dinámico de win_prob

```typescript
// Rango base
const BASE_WIN_PROB_MIN = 0.35;
const BASE_WIN_PROB_MAX = 0.65;

// Ajuste según tamaño de pool compatible
function getWinProbThreshold(poolSize: number): { min: number; max: number } {
  if (poolSize > 20) return { min: 0.40, max: 0.60 }; // pool grande → más exigente
  if (poolSize > 8)  return { min: 0.35, max: 0.65 }; // pool media → normal
  return { min: 0.30, max: 0.70 };                     // pool pequeña → más flexible
  // ← todos los umbrales pendientes de calibrar
}
```

Es preferible esperar más tiempo y encontrar un partido más equilibrado que proponer uno aceptable demasiado rápido. El tiempo de espera es un parámetro del sistema, no un problema a minimizar agresivamente.

#### Ajuste por evolución reciente del jugador

```typescript
// Detectar rachas y ajustar el rango de elo buscado
function adjustEloRangeByTrend(
  playerElo: number,
  recentResults: ('win' | 'loss')[]
): { eloMin: number; eloMax: number } {
  const STREAK_THRESHOLD = 4; // ← pendiente de calibrar
  const BASE_RANGE = 0.5;
  const TREND_OFFSET = 0.3;

  const last = recentResults.slice(-STREAK_THRESHOLD);
  const allWins  = last.length === STREAK_THRESHOLD && last.every(r => r === 'win');
  const allLoss  = last.length === STREAK_THRESHOLD && last.every(r => r === 'loss');

  if (allWins)  return { eloMin: playerElo - BASE_RANGE + TREND_OFFSET,
                         eloMax: playerElo + BASE_RANGE + TREND_OFFSET }; // rivales ligeramente mejores
  if (allLoss)  return { eloMin: playerElo - BASE_RANGE - TREND_OFFSET,
                         eloMax: playerElo + BASE_RANGE - TREND_OFFSET }; // rivales ligeramente peores
  return { eloMin: playerElo - BASE_RANGE, eloMax: playerElo + BASE_RANGE };
}
```

Este ajuste es suave y temporal. No distorsiona el nivel real del jugador (mu/elo_rating), solo el rango de búsqueda en esa sesión de matchmaking.

#### Visualización de probabilidad de victoria

La probabilidad pre-partido (`pre_match_win_prob`, guardada en `match_players`) se muestra al jugador solo en partidos de `type = 'matchmaking'` y solo cuando `score_status = 'confirmed'`. El porcentaje se calcula antes de actualizar los ratings (componente 03, paso 3).

### 4.6 Scheduler para `runMatchmakingCycle`

Opciones de implementación:
- **Opción A:** Cron job en el servidor (`node-cron`)
- **Opción B:** Job externo (Supabase Edge Function programada)
- **Opción C:** Triggered por cada nuevo jugador que entra a la pool

La frecuencia depende del tamaño de la pool activa. Valores orientativos: cada 5 minutos con pool pequeña, cada 1 minuto con pool grande.

### 4.7 Flujo de ampliación de criterios

Si tras bastante tiempo en cola (horas, no minutos) no aparece partido compatible, el sistema notifica al jugador y le propone ampliar criterios **uno a la vez**. El jugador debe aceptar explícitamente cada ampliación:

1. **Lado:** "No encontramos partido para tu posición preferida. ¿Quieres jugar en el otro lado?"
2. **Género:** "No hay partidos con tu preferencia de género. ¿Quieres ampliar a mixto?" (solo si el filtro lo permite)
3. **Distancia:** "No hay partidos cerca. ¿Quieres ampliar la búsqueda +5 km? ¿+10 km?"

El sistema no amplía criterios sin confirmación del jugador. Límite máximo de ampliación de distancia: pendiente de definir.

Si el jugador rechaza todas las ampliaciones propuestas, permanece en la pool en estado `searching` hasta que se cumpla `expires_at` o salga manualmente con `DELETE /matchmaking/leave`. No se expulsa automáticamente por rechazar las ampliaciones.

### 4.8 Penalización por rechazo de partido propuesto (decisión tomada)

Cuando un jugador rechaza un partido propuesto por el matchmaking, **el partido se da por perdido para ese jugador**: se ejecuta el pipeline de nivelación como si hubiera perdido con los jugadores con los que se le había propuesto jugar.

Esto sustituye al sistema de faults/penalizaciones. No hay contadores de faltas ni restricciones temporales — la consecuencia es directa sobre el nivel.

Flujo cuando alguien rechaza:
1. El jugador rechaza la propuesta
2. Se crea un partido virtual (no se reserva pista, no aparece en historial público)
3. Se ejecuta `runLevelingPipeline` con el jugador que rechazó en el equipo perdedor
4. Los otros 3 jugadores vuelven a la pool sin penalización
5. El jugador que rechazó puede volver a la pool manualmente

---

## 5. Decisiones pendientes

1. **Frecuencia del ciclo de matchmaking:**
   - Afecta la arquitectura del scheduler y la latencia de emparejamiento.

2. **Tiempo de espera antes de notificar ampliación de criterios:**
   - En horas. Depende del tamaño de la pool esperada al lanzar.
   - _Afecta el campo `expires_at` de `matchmaking_pool`._

3. **Límite de peso de sinergía para parejas repetidas:**
   - ¿Se limita el efecto de sinergía si la pareja ha jugado juntos más de N veces recientemente?
   - _No bloquea el MVP._

4. **Umbral `STREAK_THRESHOLD` para ajuste por evolución:**
   - Sugerencia: 4 partidos consecutivos.
   - _Pendiente de calibrar._

5. **Límite máximo de ampliación de distancia:**
   - ¿Hasta cuántos km puede ampliarse la búsqueda?
   - _No bloquea el MVP._

6. **Restricción de nivel en partidos abiertos — ¿recalcular rango?:**
   - Si el creador del partido sube o baja de nivel después de crear el partido pero antes de que se llene, ¿se recalcula `elo_min`/`elo_max` o se mantiene el rango original?
   - _No bloquea el MVP._
