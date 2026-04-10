# 02 — Modelo del partido

## 1. Visión objetivo

Cada partido tiene:
- Un **tipo** (`open` o `matchmaking`) que indica cómo se formó
- Un **flag competitivo** que determina si el resultado afecta al nivel
- Un **marcador** estructurado por sets (juegos por set, no solo sets ganados)
- Un **estado del marcador** con 6 estados posibles que controla cuándo se actualiza el nivel
- Un **motivo de fin de partido** que indica cómo terminó
- Los 4 jugadores asignados a equipos A y B

### Comportamiento según combinación de flags

| `type` | `competitive` | Afecta `mu/sigma/elo_rating` | Afecta `beta` y `player_synergies` |
|---|---|---|---|
| cualquiera | false | NO | NO |
| `open` | true | SÍ (si score_status = `confirmed`) | SÍ |
| `matchmaking` | true | SÍ (si score_status = `confirmed`) | SÍ |

### Comportamiento según `match_end_reason` (decisión tomada)

| `match_end_reason` | Pipeline de nivelación |
|---|---|
| `completed` | Normal — ejecuta todos los pasos |
| `retired` | Ejecuta pipeline. La pareja que no se retiró gana (rank=1), la que se retiró pierde (rank=2) |
| `timeout` | Ejecuta pipeline. Se trata como empate (ranks=[1,1]) |

Los tres valores de `match_end_reason` ejecutan el pipeline de nivelación completo si `competitive = true` y `score_status = 'confirmed'`.

---

## 2. Estado actual

**Archivo:** `backend/src/routes/matches.ts`

Las constantes de SELECT en líneas 6–9:
```typescript
const SELECT_LIST = 'id, created_at, booking_id, visibility, elo_min, elo_max, gender, competitive, status';
const SELECT_ONE  = 'id, created_at, updated_at, booking_id, visibility, elo_min, elo_max, gender, competitive, status';
```

Campos relevantes que ya existen en la tabla `matches`:
- `competitive` (boolean) — por defecto `true` (línea 220: `competitive: competitive !== false`)
- `gender` ('any' | …)
- `status` ('pending', 'cancelled', …)
- `elo_min`, `elo_max` — para filtrar por nivel en partidos abiertos
- `visibility` ('public' | 'private')

**No existen:**
- `type` — no se distingue si el partido es abierto o de matchmaking
- `score_status` — no hay estado de confirmación de marcador
- `sets` — no hay campo para almacenar el marcador
- `match_end_reason` — no hay campo para el motivo de fin de partido

**Archivo:** `backend/src/routes/matchPlayers.ts`

La tabla `match_players` ya tiene:
- `team` ('A' | 'B') — asignación de equipo (línea 7)
- `result` — campo genérico sin tipo definido, sin uso actual
- `rating_change` (numeric) — delta de elo, se actualiza manualmente (línea 84)
- `invite_status` ('accepted', 'pending', …)
- `slot_index` (0–3) — posición dentro del equipo

---

## 3. Qué hay que cambiar

### 3.1 Tabla `matches` en Supabase
Añadir columnas desde el dashboard:

| Columna | Tipo SQL | Valor por defecto | Nullable | Valores posibles |
|---|---|---|---|---|
| `type` | `text` | `'open'` | NO | `'open'`, `'matchmaking'` |
| `score_status` | `text` | `'pending'` | NO | ver tabla de estados abajo |
| `sets` | `jsonb` | `null` | SÍ | ver estructura abajo |
| `match_end_reason` | `text` | `null` | SÍ | `'completed'`, `'retired'`, `'timeout'` |

### 3.2 Estados de `score_status`

| Estado | Descripción |
|---|---|
| `pending` | Partido terminado, nadie ha introducido marcador aún |
| `pending_confirmation` | Un equipo introdujo marcador, esperando confirmación del rival |
| `disputed_pending` | El rival propuso un contra-marcador, esperando respuesta del equipo original |
| `confirmed` | Marcador acordado — dispara el algoritmo si competitive=true |
| `disputed` | Sin acuerdo tras el proceso completo — pendiente de resolución |
| `no_result` | El partido no tiene resultado válido (disputa sin resolver, timeout sin marcador, etc.) |

### 3.3 Estructura del campo `sets`

```json
[
  { "a": 6, "b": 3 },
  { "a": 4, "b": 6 },
  { "a": 7, "b": 5 }
]
```

Cada elemento es un set. `a` = juegos del equipo A, `b` = juegos del equipo B.
Máximo 3 sets. El tercer set puede ser tie-break (valores como 10–8 o 7–5).
Se guardan juegos por set (no solo sets ganados) porque el algoritmo de actualización necesita `|juegos_a - juegos_b| / total_juegos` para calcular el `score_margin`.

### 3.4 Flujo de `match_end_reason` (decisión tomada)

El campo `match_end_reason` no se elige en un paso separado. El flujo es:

1. El usuario introduce el marcador al terminar el partido
2. Si el marcador tiene un ganador claro → `match_end_reason = 'completed'` automáticamente
3. Si el partido no se completó con normalidad → el usuario ve una pantalla de incidencia con dos opciones:
   - **Timeout:** el partido se da como empate. `match_end_reason = 'timeout'`
   - **Retired:** la pareja que no se retiró gana. `match_end_reason = 'retired'`

### 3.5 `backend/src/routes/matches.ts`

**Constantes SELECT_LIST y SELECT_ONE (líneas 6–9):**
Añadir `type, score_status, sets, match_end_reason` a ambas constantes.

**Endpoint `POST /matches/create-with-booking` (línea 161):**
Añadir extracción de `type` del body y pasarlo al INSERT (línea 213–221). `match_end_reason` empieza como null.

**Endpoint `POST /matches` (línea 404):**
Añadir `type` al body y al INSERT.

**Endpoint `PUT /matches/:id` (línea 432):**
`score_status`, `sets` y `match_end_reason` NO se actualizan desde aquí — se actualizan exclusivamente desde las rutas de confirmación de marcador (componente 05). No añadir estos campos al PUT genérico.

---

## 4. Qué hay que crear nuevo

No se crea ninguna tabla nueva en este componente. Las tablas nuevas del sistema de nivelación se crean en el componente 01 (`player_synergies`) y el componente 06 (pool de matchmaking).

La lógica de transición de `score_status` se implementa en el componente 05.

---

## 5. Decisiones pendientes

1. **Resolución de disputas de marcador sin acuerdo:**
   - Ver componente 05 para las opciones.
   - El estado `no_result` ya está definido como destino final.
   - Pendiente: cuántos intercambios máximos y cuánto tiempo antes de llegar a `no_result`.
