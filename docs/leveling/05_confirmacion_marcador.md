# 05 — Sistema de confirmación de marcador

## 1. Visión objetivo

El marcador de un partido pasa por seis estados posibles (alineados con el componente 02):

```
pending
  ↓
pending_confirmation
  ↓              ↘
confirmed      disputed_pending
                  ↓           ↘
               confirmed    disputed → no_result
```

**Flujo normal (happy path):**
1. Cualquier jugador del partido introduce el marcador
2. Cualquier jugador del equipo rival lo confirma
3. El partido pasa a `confirmed` → se dispara el algoritmo de actualización de nivel

**Flujo de disputa:**
1. Un jugador introduce el marcador (`pending_confirmation`)
2. Un jugador del equipo rival lo niega y propone el marcador que considera correcto (`disputed_pending`)
3. Un jugador del primer equipo acepta o rechaza el contra-marcador
   - Acepta → `confirmed`
   - Rechaza → nuevo ciclo de disputa o `disputed` / `no_result`

**Auto-confirmación (decisión tomada):**
Si el equipo rival no responde en **24 horas**, el marcador se confirma automáticamente. Si no se abre disputa, se asume que el marcador es correcto. El sistema envía recordatorios antes de que se cumpla el plazo (momento exacto de los recordatorios: pendiente de definir). En cada nueva propuesta dentro de una disputa, el contador de 24 horas se reinicia.

**Disputas sin resolución (decisión tomada):**
Tras N intercambios o un tiempo límite total, el partido pasa a `no_result`. Pendiente de definir: valor exacto de N y tiempo límite total.

**`no_result` (decisión tomada):**
Un partido en `no_result` no afecta a ninguna variable del jugador. Es como si el partido no se hubiera jugado: mu, sigma, beta, elo_rating, player_synergies y contadores de partidos permanecen sin cambios.

**Tiempo límite para introducir marcador (decisión tomada):**
Si nadie llama a `POST /matches/:id/score` en **48 horas** desde que termina el partido, el partido pasa a `no_result` automáticamente.

Aplica a todos los tipos de partido (`open` y `matchmaking`) y tanto competitivos como amistosos. Los amistosos confirman marcador pero no disparan el pipeline de nivelación — solo incrementan `matches_played_friendly`.

---

## 2. Estado actual

> Ultima verificacion: 2026-04-14

**Implementado:**
- `backend/src/routes/matchScores.ts` con endpoints: `POST /:id/score` (proponer), `POST /:id/score/confirm` (confirmar), `POST /:id/score/dispute` (contra-propuesta), `POST /:id/score/resolve` (resolver).
- Maquina de estados de `score_status` completa (pending → pending_confirmation → confirmed | disputed_pending → ...).
- `score_confirmed_at` y `score_first_proposer_team` en tabla matches.
- Al confirmar, devuelve `request_feedback: true` para disparar el formulario de feedback (componente 08).
- Al confirmar partido competitivo, dispara `runLevelingPipeline()` (componente 03) y `runFraudCheck()` (componente 07).
- `MAX_DISPUTE_ROUNDS` y `FEEDBACK_WINDOW_HOURS` definidos en `levelingConstants.ts`.

**Pendiente:**
- **Auto-confirmacion a 24h**: No existe job/cron que confirme automaticamente si el rival no responde. La logica esta documentada pero no implementada.
- **Timeout de 48h para introducir marcador**: No existe job que pase a `no_result` si nadie introduce marcador.

---

## 3. Que falta por implementar

### 3.1 Auto-confirmacion a 24h

Implementar un job (cron o endpoint protegido) que:
1. Busque partidos con `score_status = 'pending_confirmation'` donde `updated_at < now() - 24h`
2. Los pase a `confirmed` automaticamente
3. Dispare el pipeline de nivelacion

### 3.2 Timeout de 48h sin marcador

Implementar un job que:
1. Busque partidos con `status = 'finished'` y `score_status = 'pending'` donde el partido termino hace mas de 48h
2. Los pase a `no_result`

---

## 4. Qué hay que crear nuevo

### 4.1 Nueva tabla `score_submissions` en Supabase

Historial de todos los marcadores propuestos para cada partido. Permite resolver disputas y auditar.

```
score_submissions
├── id          uuid PRIMARY KEY default gen_random_uuid()
├── match_id    uuid NOT NULL references matches(id)
├── player_id   uuid NOT NULL references players(id)   ← quien envía
├── team        text NOT NULL                           ← 'A' o 'B', equipo del emisor
├── sets        jsonb NOT NULL                          ← marcador propuesto
├── created_at  timestamptz default now()
```

### 4.2 Nuevas rutas de marcador

Pueden vivir en `backend/src/routes/matchScores.ts` (archivo nuevo) y registrarse en `backend/src/routes/index.ts`.

---

#### `POST /matches/:id/score`

**Quién lo llama:** Cualquier jugador del partido (equipo A o B).

**Requiere:** Bearer token.

**Body:**
```json
{
  "sets": [
    { "a": 6, "b": 3 },
    { "a": 7, "b": 5 }
  ],
  "match_end_reason": "completed"   // 'completed' | 'retired' | 'timeout' — opcional
}
```

**Lógica:**
1. Verificar que el jugador pertenece al partido (buscar en `match_players`)
2. Verificar que `score_status = 'pending'`
3. Aplicar **lock a nivel de base de datos** sobre el registro del partido antes de insertar (first-write-wins): si dos jugadores llaman simultáneamente, el primer INSERT gana; el segundo recibe 409
4. Insertar en `score_submissions` con el equipo del jugador
5. Actualizar `matches.sets` y `matches.match_end_reason`
6. Cambiar `score_status` a `'pending_confirmation'`
7. Devolver 200 OK

**Error 409:** "Ya hay una propuesta de marcador activa para este partido."

---

#### `POST /matches/:id/score/confirm`

**Quién lo llama:** Cualquier jugador del equipo rival al que introdujo la propuesta activa.

**Requiere:** Bearer token.

**Body:** vacío — confirma el marcador actual en `matches.sets`

**Lógica:**
1. Verificar que el jugador pertenece al partido
2. Determinar el equipo que hizo la propuesta activa (leer último `score_submissions`)
3. Verificar que el jugador pertenece al **equipo contrario**
4. Verificar que `score_status = 'pending_confirmation'`
5. Actualizar `score_status = 'confirmed'`
6. Si `competitive = true`: llamar `runLevelingPipeline(matchId)`
7. Si `competitive = false`: incrementar `matches_played_friendly` de los 4 jugadores
8. Llamar `runFraudCheck(matchId)` de forma asíncrona (no bloquear)
9. Devolver 200 OK con `{ score_status: 'confirmed', request_feedback: true }`

> `request_feedback: true` le indica a la app que debe mostrar el flujo de feedback post-partido (componente 08).

---

#### `POST /matches/:id/score/dispute`

**Quién lo llama:** Cualquier jugador del equipo rival que no está de acuerdo con el marcador propuesto.

**Requiere:** Bearer token.

**Body:**
```json
{
  "sets": [
    { "a": 3, "b": 6 },
    { "a": 5, "b": 7 }
  ]
}
```

**Lógica:**
1. Verificar que el jugador pertenece al equipo rival (mismo criterio que confirm)
2. Verificar que `score_status = 'pending_confirmation'`
3. Insertar en `score_submissions` el contra-marcador
4. Actualizar `matches.sets` con el contra-marcador
5. Cambiar `score_status` a `'disputed_pending'`
6. Reiniciar el contador de 24 horas para auto-confirmación
7. Devolver 200 OK

---

#### `POST /matches/:id/score/resolve`

**Quién lo llama:** Cualquier jugador del equipo que introdujo el marcador original, tras recibir un contra-marcador.

**Requiere:** Bearer token.

**Body:**
```json
{ "accept": true }    // acepta el contra-marcador del rival → confirmed
```
o
```json
{ "accept": false }   // rechaza → disputed / no_result
```

**Lógica:**
1. Verificar que el jugador pertenece al equipo que hizo la propuesta original
2. Verificar que `score_status = 'disputed_pending'`
3. Si `accept = true`:
   - Actualizar `score_status = 'confirmed'`
   - Disparar pipeline y antifraude igual que en `/confirm`
4. Si `accept = false`:
   - Si se ha alcanzado el máximo de intercambios (N) → `score_status = 'no_result'`
   - Si no → permitir nuevo ciclo de disputa (vuelve a `pending_confirmation` con el marcador del equipo original)

---

### 4.3 Job de auto-confirmación y expiración

Un job periódico (cron o Supabase Edge Function) ejecuta dos tareas:

**Tarea 1 — Auto-confirmación tras 24 horas:**
```typescript
const staleConfirmations = await supabase
  .from('matches')
  .select('id, competitive')
  .eq('score_status', 'pending_confirmation')
  .lt('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

for (const match of staleConfirmations) {
  await supabase
    .from('matches')
    .update({ score_status: 'confirmed' })
    .eq('id', match.id);
  if (match.competitive) {
    await runLevelingPipeline(match.id);
  } else {
    // Incrementar matches_played_friendly de los 4 jugadores
  }
}
```

**Tarea 2 — Expiración tras 48 horas sin marcador:**
```typescript
const expiredMatches = await supabase
  .from('matches')
  .select('id')
  .eq('score_status', 'pending')
  .lt('booking_end_time', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString());

for (const match of expiredMatches) {
  await supabase
    .from('matches')
    .update({ score_status: 'no_result' })
    .eq('id', match.id);
}
```

---

### 4.4 Tabla de estados completa

| Estado | Quién puede transicionar desde aquí | Hacia |
|---|---|---|
| `pending` | Cualquier jugador del partido | `pending_confirmation` |
| `pending` | Job de expiración (48h sin marcador) | `no_result` |
| `pending_confirmation` | Rival (confirmar) | `confirmed` |
| `pending_confirmation` | Rival (disputar) | `disputed_pending` |
| `pending_confirmation` | Job de auto-confirmación (24h) | `confirmed` |
| `disputed_pending` | Equipo original (aceptar) | `confirmed` |
| `disputed_pending` | Equipo original (rechazar) | `no_result` (si max intercambios) o nuevo ciclo |
| `disputed` | Admin o job (timeout) | `no_result` |
| `confirmed` | Nadie | — estado final |
| `no_result` | Nadie | — estado final |

---

## 5. Decisiones pendientes

1. **Número máximo de intercambios de disputa (N) antes de `no_result`:**
   - Pendiente de definir. Sugerencia: 2–3 intercambios.

2. **Tiempo límite total del proceso de disputa:**
   - Desde la primera propuesta hasta `no_result` si no hay acuerdo.
   - Pendiente de definir. Sugerencia: 72 horas.

3. **Momento exacto de los recordatorios de auto-confirmación:**
   - ¿Recordatorio a las 12h? ¿A las 20h?
   - _No bloquea la implementación._
