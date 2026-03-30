# 03 — Algoritmo de actualización de nivel

## 1. Visión objetivo

> **Nota:** El `streak_bonus` multiplica SP, no mu. No tiene ningún efecto en este pipeline. Ver componente 09 (Season Pass).

Cuando un partido competitivo pasa a `score_status = 'confirmed'`, el sistema ejecuta el siguiente pipeline:

1. Capturar probabilidad de victoria pre-partido y guardarla
2. Detectar si hubo remontada
3. Correr OpenSkill Plackett-Luce con los 4 jugadores
4. Calcular `score_margin` (0.5–1.5) basado en diferencia de juegos
5. Aplicar `score_margin` al delta de `mu`
6. Actualizar `sigma` — solo la reduce OpenSkill, nunca se escala
7. Actualizar `beta` mediante ventana deslizante de residuales
8. Actualizar la sinergia de cada pareja que jugó junta
9. Recalcular `elo_rating` (0–7) y actualizar contadores de partidos
10. Escribir todos los cambios en Supabase de forma atómica

**Condiciones de ejecución:**
- `competitive = true`
- `score_status = 'confirmed'`
- Exactamente 4 jugadores con team A/B

**Todos los valores de `match_end_reason` ejecutan el pipeline:**
- `completed`: determinar ganador por sets. Ranks: ganador=1, perdedor=2
- `retired`: la pareja que no se retiró gana. Ranks: no retirada=1, retirada=2
- `timeout`: se trata como empate. Ranks: `[1, 1]` (ambos equipos)

**Partidos `competitive = false`:** No ejecutan el pipeline bajo ninguna circunstancia.

**Decisión tomada — manejo de errores:** Transacción atómica. Si el pipeline falla en cualquier paso, no se escribe nada en Supabase y se reintenta. No se guardan estados parciales.

---

## 2. Estado actual

**Archivo:** `backend/src/routes/matchPlayers.ts`

El campo `rating_change` (línea 7, línea 84) existe y se puede actualizar manualmente vía `PUT /match-players/:id`. No hay ningún cálculo automático.

El campo `result` existe pero no tiene tipo definido ni uso.

**Archivo:** `backend/src/routes/players.ts`

El campo `elo_rating` existe (línea 208, default 1200). Los campos `mu`, `sigma`, `beta`, contadores de partidos no existen todavía (ver componente 01).

**No existe** ningún archivo de servicio de nivelación. No hay librería OpenSkill instalada.

---

## 3. Qué hay que cambiar

### 3.1 Endpoint `PUT /match-players/:id` (matchPlayers.ts línea 77)
El `rating_change` ya no debe actualizarse desde este endpoint público — el valor lo escribe exclusivamente el algoritmo de nivelación. Añadir validación para rechazar actualizaciones de `rating_change` desde esta ruta.

### 3.2 Tabla `match_players` en Supabase
Añadir columnas:

| Columna | Tipo SQL | Nullable | Descripción |
|---|---|---|---|
| `result` | `text` | SÍ | `'win'` \| `'loss'` \| `'draw'` — escrito por el algoritmo |
| `pre_match_win_prob` | `float8` | SÍ | Probabilidad de victoria pre-partido del equipo de este jugador. Se guarda en el paso 1 del pipeline. Necesario para el sistema antifraude (componente 07) |

> Se añade `'draw'` como valor posible de `result` para partidos con `match_end_reason = 'timeout'`.

---

## 4. Qué hay que crear nuevo

### 4.1 Librería OpenSkill
Instalar en el backend:
```bash
npm install openskill
```
Librería TypeScript-native. Usa el modelo Plackett-Luce.

**Parámetro tau activado:** OpenSkill incluye un parámetro `tau` (decay de sigma) que da más peso a los resultados recientes y hace que la sigma suba ligeramente con el tiempo si el jugador no juega. Esto gestiona automáticamente la inactividad y la forma reciente del jugador. **No hay que implementar lógica extra para estos casos.**

**Nivel/consistencia/experiencia del rival:** OpenSkill ya lo contempla implícitamente — el mu y sigma del rival determinan el impacto del resultado en el jugador. Un rival con mu alto y sigma baja (bueno y consistente) tiene mayor impacto en la actualización que un rival con sigma alta (incierto). No hay que implementar esto por separado.

### 4.2 `backend/src/services/levelingService.ts` (archivo nuevo)

Responsabilidades:
- `calcEloRating(mu, sigma)` → float 0–7 (ver componente 01, decisión pendiente)
- `calcScoreMargin(sets)` → float 0.5–1.5
- `detectComeback(sets, winnerTeam)` → boolean
- `determineOutcome(match)` → ranks y resultado por jugador
- `runLevelingPipeline(matchId)` → void (función principal)

---

#### Función `determineOutcome`

```typescript
function determineOutcome(
  sets: { a: number; b: number }[],
  matchEndReason: 'completed' | 'retired' | 'timeout'
): { ranks: [number, number]; winnerTeam: 'A' | 'B' | null } {
  if (matchEndReason === 'timeout') {
    // Empate — ambos equipos reciben rank 1
    return { ranks: [1, 1], winnerTeam: null };
  }
  if (matchEndReason === 'retired') {
    // La pareja que no se retiró gana
    // Requiere saber qué equipo se retiró (ver match.retired_team o similar)
    return { ranks: [1, 2], winnerTeam: /* equipo que NO se retiró */ };
  }
  // 'completed' — determinar ganador por sets
  let setsA = 0, setsB = 0;
  for (const set of sets) {
    if (set.a > set.b) setsA++;
    else setsB++;
  }
  const winnerTeam = setsA > setsB ? 'A' : 'B';
  return { ranks: [1, 2], winnerTeam };
}
```

---

#### Función `calcScoreMargin`

```typescript
function calcScoreMargin(sets: { a: number; b: number }[]): number {
  let totalA = 0, totalB = 0;
  for (const set of sets) {
    totalA += set.a;
    totalB += set.b;
  }
  const total = totalA + totalB;
  if (total === 0) return 1.0; // sin datos, margen neutro
  return 0.5 + Math.abs(totalA - totalB) / total;
  // Rango: 0.50 (7-6, 7-6) → 1.50 (6-0, 6-0)
}
```

Ejemplos:
| Resultado | totalA | totalB | total | score_margin |
|---|---|---|---|---|
| 6-0, 6-0 | 12 | 0 | 12 | 0.5 + 12/12 = **1.50** |
| 6-3, 6-4 | 12 | 7 | 19 | 0.5 + 5/19 = **0.76** |
| 7-6, 7-6 | 14 | 12 | 26 | 0.5 + 2/26 = **0.58** |

> Para `timeout` (empate): `score_margin` se calcula igualmente si hay marcador parcial. Si no hay marcador, se usa margen neutro (1.0).

---

#### Función `detectComeback`

```typescript
function detectComeback(sets: { a: number; b: number }[], winnerTeam: 'A' | 'B'): boolean {
  if (sets.length < 2) return false;
  const firstSet = sets[0];
  const firstSetWinner = firstSet.a > firstSet.b ? 'A' : 'B';
  // Hay remontada si el ganador del partido perdió el primer set
  return firstSetWinner !== winnerTeam;
}
```

Si hay remontada, se aplica `COMEBACK_BONUS` al `score_margin`:
```typescript
const COMEBACK_BONUS = 1.1; // ← pendiente de calibrar
score_margin_final = score_margin * (comeback ? COMEBACK_BONUS : 1.0);
```

> La detección de remontada solo aplica a `match_end_reason = 'completed'`. En `retired` y `timeout` no se evalúa remontada.

---

#### Función `updateBeta` — ventana deslizante

Más robusto que una EMA simple frente a partidos puntualmente sorprendentes:

```typescript
const WINDOW_SIZE = 20;
const MIN_SAMPLES = 10;
const DEFAULT_BETA = 4.167; // 25/6

function updateBeta(
  currentBeta: number,
  residuals: number[],   // lista acumulada de |residual| del jugador (últimos WINDOW_SIZE)
  newResidual: number
): { newBeta: number; updatedResiduals: number[] } {
  const updated = [...residuals, Math.abs(newResidual)];
  if (updated.length > WINDOW_SIZE) updated.shift();

  if (updated.length < MIN_SAMPLES) {
    // No hay suficientes datos — mantener beta actual
    return { newBeta: currentBeta, updatedResiduals: updated };
  }

  const measuredStd = stdDev(updated);
  const newBeta = 0.5 * measuredStd + 0.5 * DEFAULT_BETA;
  return { newBeta, updatedResiduals: updated };
}
```

> **Nota:** La lista de residuales del jugador debe persistirse. Opciones:
> - Campo `beta_residuals jsonb` en la tabla `players` (array de floats, máx 20 elementos)
> - Tabla separada `player_residuals` si se prefiere normalizar
> - Recomendación: campo `beta_residuals jsonb` en `players` — más simple para una lista pequeña

---

#### Función principal `runLevelingPipeline`

```typescript
async function runLevelingPipeline(matchId: string): Promise<void> {
  // PASO 1 — Leer datos del partido
  // - Verificar: competitive=true, score_status='confirmed'
  // - Leer sets, match_end_reason, team A (2 jugadores), team B (2 jugadores)
  // - Llamar determineOutcome(sets, matchEndReason) → ranks, winnerTeam

  // PASO 2 — Leer variables de cada jugador
  // - mu, sigma, beta, beta_residuals
  // - De players: los 4 jugadores

  // PASO 3 — Capturar probabilidad pre-partido
  // - pre_win_prob = predictWin([teamA_mu_sigma], [teamB_mu_sigma])  ← función de OpenSkill
  // - Guardar en match_players.pre_match_win_prob ANTES de actualizar ratings
  // - Residual: actual_outcome (1/0/0.5) - pre_win_prob
  //   (0.5 para empates en caso de timeout)

  // PASO 4 — Correr OpenSkill Plackett-Luce
  // - const [newTeamA, newTeamB] = rate([teamA, teamB], { rank: ranks })
  //   Para completed/retired: ranks = [1, 2] (ganador, perdedor)
  //   Para timeout: ranks = [1, 1] (empate)
  // - OpenSkill devuelve nuevos mu y sigma para cada jugador
  // - El rival con mayor mu/sigma/beta tiene mayor impacto → ya gestionado por OpenSkill

  // PASO 5 — Calcular score_margin y aplicar al delta de mu
  // - score_margin = calcScoreMargin(sets)
  // - Si match_end_reason='completed' y hay remontada:
  //   score_margin_final = score_margin * COMEBACK_BONUS
  // - Else: score_margin_final = score_margin
  // - delta_mu_i = (new_mu_i - old_mu_i) * score_margin_final
  // - final_mu_i = old_mu_i + delta_mu_i
  //
  // sigma_i = new_sigma_i  ← OpenSkill ya la reduce, nunca se escala

  // PASO 6 — Actualizar beta
  // - residual_i = actual_outcome_i - pre_win_prob
  // - { newBeta, updatedResiduals } = updateBeta(old_beta_i, old_residuals_i, residual_i)

  // PASO 7 — Actualizar sinergía de parejas
  // - pareja_A = (player_a1_id, player_a2_id)
  // - pareja_B = (player_b1_id, player_b2_id)
  // - Si completed/retired: equipo ganador synergy += 0.1, perdedor -= 0.1
  // - Si timeout (empate): synergy += 0.0 (o no actualizar)
  // - Upsert con matches_count++

  // PASO 8 — Recalcular elo_rating
  // - elo_rating_i = calcEloRating(final_mu_i, sigma_i)

  // PASO 9 — Actualizar contadores de partidos
  // - matches_played_competitive++ para todos los jugadores
  // - matches_played_matchmaking++ si type='matchmaking'
  // NOTA: matches_played_friendly NO se actualiza aquí.
  // Se incrementa en el handler de confirmación de marcador de un partido amistoso
  // (componente 05, POST /matches/:id/score/confirm), cuando competitive=false.
  // Ese handler confirma el marcador pero no llama a runLevelingPipeline.

  // PASO 10 — Escribir en Supabase (atómico)
  // players:      mu, sigma, beta, beta_residuals, elo_rating, matches_played_*, updated_at
  // match_players: result ('win'/'loss'/'draw'), rating_change (delta de elo_rating), pre_match_win_prob
  // player_synergies: upsert de cada pareja
}
```

### 4.3 Dónde se llama `runLevelingPipeline`

Se llama desde la ruta de confirmación de marcador (componente 05), cuando `score_status` transiciona a `'confirmed'` y `competitive = true`. No se llama desde ningún otro punto del sistema.

```typescript
// En el handler de confirmación de marcador:
if (competitive) {
  await runLevelingPipeline(matchId);                 // síncrono — esperar resultado
  runFraudCheck(matchId).catch(console.error);        // asíncrono — no bloquear respuesta
}
return res.json({ ok: true, ... });
```

---

## 5. Decisiones pendientes

1. **Función concreta `calcEloRating(mu, sigma) → 0–7`:**
   Compartida con componente 01. Sin esta función no se puede completar el paso 8 del pipeline.

2. **COMEBACK_BONUS — valor exacto:**
   Valor provisional: 1.1. Calibrar con datos reales.

3. **Almacenamiento de `beta_residuals`:**
   - Opción A: Campo `beta_residuals jsonb` en tabla `players` (recomendado)
   - Opción B: Tabla separada `player_residuals`

4. **Identificación del equipo retirado en `match_end_reason = 'retired'`:**
   Se necesita saber qué equipo se retiró para asignar los ranks correctos. Opciones:
   - Campo `retired_team text` en `matches` ('A' | 'B')
   - Campo `retired_player_ids uuid[]` en `matches`
   - _Pendiente de definir._
