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

> Ultima verificacion: 2026-04-14

**Todo lo descrito en la seccion 1 esta implementado.** Migracion `backend/db/014_leveling_matchmaking.sql`.

### Tabla `matches` — campos de nivelacion

| Campo | Estado | Valores |
|---|---|---|
| `type` | ✅ Implementado | `'open'`, `'matchmaking'`, `'penalty'` |
| `competitive` | ✅ Implementado | boolean, default true |
| `score_status` | ✅ Implementado | `'pending'`, `'pending_confirmation'`, `'disputed_pending'`, `'confirmed'`, `'disputed'`, `'no_result'` |
| `sets` | ✅ Implementado | jsonb `[{ a, b }, ...]` |
| `match_end_reason` | ✅ Implementado | `'completed'`, `'retired'`, `'timeout'` |
| `visibility` | ✅ Implementado | `'private'`, `'public'` |
| `score_confirmed_at` | ✅ Implementado | timestamptz |
| `score_first_proposer_team` | ✅ Implementado | text |
| `leveling_applied_at` | ✅ Implementado | timestamptz (idempotencia del pipeline) |
| `retired_team` | ✅ Implementado | text |

### Tabla `match_players`

| Campo | Estado |
|---|---|
| `team` ('A'/'B') | ✅ Implementado |
| `result` | ✅ Existe |
| `rating_change` | ✅ Implementado |
| `invite_status` | ✅ Implementado |
| `slot_index` | ✅ Implementado |

### Endpoints

Los SELECTs en `matches.ts` ya incluyen `type`, `score_status`, `sets`, `match_end_reason`. La transicion de `score_status` se gestiona desde `matchScores.ts` (componente 05), no desde el PUT generico.

### Estructura de `sets`

```json
[
  { "a": 6, "b": 3 },
  { "a": 4, "b": 6 },
  { "a": 7, "b": 5 }
]
```

---

## 3. Nada pendiente de implementar

Todo el modelo del partido esta completo. No hay cambios pendientes en este componente.

---

## 5. Decisiones pendientes

1. **Resolución de disputas de marcador sin acuerdo:**
   - Ver componente 05 para las opciones.
   - El estado `no_result` ya está definido como destino final.
   - Pendiente: cuántos intercambios máximos y cuánto tiempo antes de llegar a `no_result`.
