# 07 — Sistema antifraude

## 1. Visión objetivo

El sistema antifraude corre de forma **asíncrona**, sin bloquear el flujo normal de confirmación de marcador ni la actualización de nivel. Detecta patrones anómalos y genera alertas o aplica acciones automáticas.

**Recomendación para v1: solo alertas manuales en `fraud_alerts`, sin acciones automáticas.** Las opciones de acción automática (congelación, penalización, expulsión) se añaden en v2, tras validar la fiabilidad de cada detección con datos reales. Las acciones automáticas prematuras pueden perjudicar injustamente a jugadores legítimos.

---

## 2. Estado actual

No existe ningún sistema antifraude. No hay tablas de detecciones ni lógica de análisis.

La tabla `match_players` (`matchPlayers.ts`, línea 6–7) registra `result` y `rating_change` por jugador y partido. El campo `pre_match_win_prob` debe añadirse (ver componente 03, sección 3.2).

La función `predictWinProbability` de OpenSkill (componente 03) es la fuente de las predicciones pre-partido.

---

## 3. Qué hay que cambiar

Ningún archivo existente se modifica. El antifraude es una capa adicional sobre datos que ya existen.

---

## 4. Qué hay que crear nuevo

### 4.1 Tabla `fraud_alerts` en Supabase

```
fraud_alerts
├── id              uuid PRIMARY KEY default gen_random_uuid()
├── detection_type  text NOT NULL
├── player_ids      uuid[] NOT NULL   ← jugadores implicados
├── match_ids       uuid[] NOT NULL   ← partidos que dispararon la alerta
├── details         jsonb             ← datos específicos de la detección
├── status          text NOT NULL default 'open'   ← 'open' | 'reviewed' | 'dismissed'
├── created_at      timestamptz default now()
└── resolved_at     timestamptz
```

Valores de `detection_type` (uno por cada detección documentada abajo):
`'repeated_results'` | `'prediction_failure'` | `'sandbagging'` | `'closed_group_inflation'` | `'score_manipulation'` | `'strategic_retirement'`

### 4.2 `backend/src/services/fraudService.ts` (archivo nuevo)

#### Función de entrada: `runFraudCheck(matchId: string)`

```typescript
async function runFraudCheck(matchId: string): Promise<void> {
  // Leer los jugadores del partido
  await Promise.allSettled([
    checkRepeatedResults(matchId),
    checkPredictionFailures(matchId),
    checkSandbagging(matchId),
    checkClosedGroupInflation(matchId),
    checkScoreManipulation(matchId),
    checkStrategicRetirement(matchId),
  ]);
}
```

Llamada desde el handler de confirmación de marcador, después de `runLevelingPipeline`, sin bloquear la respuesta:
```typescript
await runLevelingPipeline(matchId);
runFraudCheck(matchId).catch(console.error);
return res.json({ ok: true, ... });
```

---

### 4.3 Detecciones

---

#### Detección 1: Resultados repetidos (`repeated_results`)

**Qué detecta:** El mismo par de equipos (mismos 4 jugadores, misma asignación A/B) produce el mismo resultado en N partidos consecutivos.

**Datos necesarios:**
- `match_players`: jugadores, equipos y `result` de cada partido
- Historial de partidos de estos 4 jugadores

**Cómo se calcula:**
```typescript
async function checkRepeatedResults(matchId: string): Promise<void> {
  // 1. Leer los 4 jugadores del partido y su asignación de equipo
  // 2. Determinar el equipo ganador
  // 3. Buscar partidos anteriores donde EXACTAMENTE estos 4 jugadores
  //    jugaron juntos con la MISMA combinación de equipos
  // 4. Contar cuántos consecutivos terminaron igual
  // 5. Si streak >= N_THRESHOLD → insertar alerta
  //    details: { streak: N, winner_team: 'A', match_ids: [...] }
}
```

**Umbral:** N_THRESHOLD = 5 partidos consecutivos (provisional — calibrar).

**Opciones de acción (elegir una):**
- A: Solo alerta manual en `fraud_alerts` ← **recomendado para v1**
- B: Congelación temporal del nivel de todos los jugadores implicados
- C: Penalización automática de mu

---

#### Detección 2: Predicciones fallidas sistemáticamente (`prediction_failure`)

**Qué detecta:** Un equipo con predicción de victoria > 95% pierde de forma recurrente contra los mismos rivales.

**Datos necesarios:**
- `match_players.pre_match_win_prob` (campo añadido en componente 03)
- `match_players.result` y `match_players.player_id`

**Cómo se calcula:**
```typescript
async function checkPredictionFailures(matchId: string): Promise<void> {
  // 1. Leer pre_match_win_prob del partido actual
  // 2. Si pre_win_prob > 0.95 y ese equipo perdió:
  //    → Buscar cuántas veces ha ocurrido esto entre estos mismos jugadores
  //    → Si occurrences >= M_THRESHOLD → insertar alerta
  //    details: { pre_win_prob, actual: 'loss', occurrences: M, match_ids: [...] }
}
```

**Umbrales:** pre_win_prob > 0.95, M_THRESHOLD = 3 ocurrencias (provisional).

**Opciones de acción (elegir una):**
- A: Solo alerta manual ← **recomendado para v1**
- B: Reducción de mu proporcional a la magnitud de la sorpresa
- C: Congelación temporal

---

#### Detección 3: Sandbagging individual (`sandbagging`)

**Qué detecta:** Un jugador pierde sistemáticamente cuando juega con ciertos rivales pero gana con otros — indica manipulación selectiva del resultado, no variabilidad natural.

**Datos necesarios:**
- Historial de `result` del jugador agrupado por rival
- Número de partidos por combinación de rivales

**Cómo se calcula:**
```typescript
async function checkSandbagging(matchId: string): Promise<void> {
  // Para cada jugador del partido:
  // 1. Agrupar sus últimos K partidos por rival (o conjunto de rivales)
  // 2. Calcular win_rate por grupo de rivales
  // 3. Si un jugador tiene win_rate > 0.9 contra un grupo
  //    Y win_rate < 0.1 contra otro grupo de nivel similar:
  //    → Anomalía detectada → insertar alerta
  //    details: { player_id, high_win_rivals: [...], low_win_rivals: [...] }
}
```

**Umbral:** K = últimos 20 partidos. Diferencia de win_rate > 0.8 entre grupos (provisional).

**Opciones de acción (elegir una):**
- A: Solo alerta manual ← **recomendado para v1**
- B: Suspensión temporal del matchmaking para el jugador implicado
- C: Revisión de sus últimos N partidos para revertir actualizaciones de nivel

---

#### Detección 4: Inflación de rating en grupo cerrado (`closed_group_inflation`)

**Qué detecta:** Un conjunto de jugadores que solo juegan entre sí, generando ratings artificialmente altos sin exposición a la pool general.

**Datos necesarios:**
- Historial de `match_players` para identificar con quién juega cada jugador
- `elo_rating` actual de cada jugador

**Cómo se calcula:**
```typescript
async function checkClosedGroupInflation(matchId: string): Promise<void> {
  // Para cada jugador del partido:
  // 1. Obtener los últimos K partidos del jugador
  // 2. Construir el conjunto de rivales únicos
  // 3. Si el P% de sus partidos son contra los mismos X rivales:
  //    → Grupo potencialmente cerrado
  // 4. Si además el elo_rating del jugador ha subido significativamente
  //    en ese periodo → mayor probabilidad de inflación
  // 5. Si condiciones se cumplen → insertar alerta
  //    details: { player_id, closed_rivals: [...], elo_increase: X }
}
```

**Umbrales:** K = últimos 30 partidos, P = 80% de partidos contra el mismo grupo, X ≤ 5 rivales únicos (provisional).

**Opciones de acción (elegir una):**
- A: Solo alerta manual ← **recomendado para v1**
- B: Congelación del nivel hasta revisión
- C: Exclusión forzada del matchmaking (el sistema evita emparejarlos entre sí)

---

#### Detección 5: Manipulación de marcador (`score_manipulation`)

**Qué detecta:** El marcador introducido es muy diferente de lo esperado dado el nivel de los jugadores. Por ejemplo, un 6-0, 6-0 cuando la predicción pre-partido era 50/50.

**Datos necesarios:**
- `matches.sets` (marcador introducido)
- `match_players.pre_match_win_prob`

**Cómo se calcula:**
```typescript
async function checkScoreManipulation(matchId: string): Promise<void> {
  // 1. Calcular score_margin del marcador introducido
  // 2. Comparar con pre_match_win_prob:
  //    - Si pre_win_prob ≈ 0.5 (partido equilibrado) y score_margin > MARGIN_THRESHOLD:
  //      → El resultado fue sorprendentemente dominante → alerta
  //    details: { pre_win_prob, score_margin, sets }
}
```

**Umbrales:** pre_win_prob entre 0.45 y 0.55, score_margin > 1.3 (provisional).

**Opciones de acción (elegir una):**
- A: Solo alerta manual ← **recomendado para v1**
- B: Aplicar score_margin reducido al pipeline (como si el resultado fuera más ajustado)
- C: Pedir a los jugadores confirmación adicional antes de procesar el nivel

---

#### Detección 6: Retiradas estratégicas (`strategic_retirement`)

**Qué detecta:** Un patrón de `match_end_reason = 'retired'` correlacionado con partidos donde la predicción era desfavorable para el jugador que se retira.

**Datos necesarios:**
- `matches.match_end_reason`
- `match_players.pre_match_win_prob`
- Historial de retiradas por jugador

**Cómo se calcula:**
```typescript
async function checkStrategicRetirement(matchId: string): Promise<void> {
  // Solo aplica si match_end_reason = 'retired'
  // 1. Identificar qué jugadores se retiraron (requiere nuevo campo en match_players
  //    o en matches: 'retired_player_ids')
  // 2. Para cada jugador retirado: calcular qué porcentaje de sus retiradas
  //    ocurrieron cuando pre_win_prob era < 0.4 (partido desfavorable)
  // 3. Si el porcentaje supera el umbral → alerta
  //    details: { player_id, retirements_when_losing: N, total_retirements: M }
}
```

**Umbrales:** N/M > 0.7, N >= 3 retiradas (provisional).

**Nota de implementación:** Esta detección requiere saber qué jugador se retiró. Añadir campo `retired_player_id uuid` (o similar) a `matches` cuando se defina el flujo de `match_end_reason` (ver componente 02, decisiones pendientes).

**Opciones de acción (elegir una):**
- A: Solo alerta manual ← **recomendado para v1**
- B: Las retiradas estratégicas actualizan beta negativamente (señal de inconsistencia)
- C: Restricción temporal del matchmaking

---

## 5. Decisiones pendientes

1. **Acción por defecto para cada detección:**
   - Recomendación v1: todas en modo "solo alerta" hasta calibrar umbrales con datos reales.
   - _Ninguna decisión bloquea la implementación de la capa de detección._

2. **Umbrales de todas las detecciones:**
   - Todos los valores marcados como "provisional" deben calibrarse con datos reales.
   - Pueden configurarse como constantes en `fraudService.ts` para facilitar el ajuste.

3. **Campo `retired_player_id` para detección 6:**
   - Requiere coordinación con el diseño de `match_end_reason` (componente 02).
   - _No bloquea las otras 5 detecciones._

4. **Gestión de alertas duplicadas:**
   - Si el mismo patrón se detecta en partidos consecutivos, ¿se crea una nueva alerta cada vez o se actualiza la existente?
   - Recomendación: actualizar la alerta existente añadiendo el nuevo `match_id` al array.
