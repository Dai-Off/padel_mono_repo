# 08 — Feedback post-partido

## 1. Vision objetivo

Al terminar un partido (cuando `score_status` pasa a `confirmed`), se invita a cada jugador a completar un formulario de feedback de **2 fases**.

El feedback cumple multiples funciones:
- **Ajustar ligeramente el elo y las areas de nivel** del jugador valorado (invisible para el usuario). Ver componente 01, seccion 4.4.
- **Calibrar los anclajes** del cuestionario inicial (componente 04).
- **Detectar desajustes de nivel** entre lo calculado y lo percibido.
- **Alimentar el Coach IA** (componente 11) con datos cualitativos: los textos escritos construyen progresivamente un perfil del jugador que permite recomendaciones personalizadas.

Los ajustes de nivel son **muy ligeros** (±0.01 por voto). El usuario no debe percibir que el feedback modifica su nivel. El sistema esta disenado para que solo el consenso sostenido a lo largo de muchos partidos tenga un efecto acumulado perceptible.

---

## 2. Estado actual

> Ultima verificacion: 2026-04-14

La tabla `match_feedback` existe en la base de datos y hay rutas implementadas:
- `POST /matches/:id/feedback` en `backend/src/routes/matchFeedback.ts`
- `GET /players/:id/feedback-summary` en `backend/src/routes/players.ts`

El punto de integracion es la respuesta de `POST /matches/:id/score/confirm` (componente 05), que incluye `request_feedback: true`.

---

## 3. Que hay que cambiar

### 3.1 Tabla `match_feedback`

La estructura de `level_ratings` (jsonb) cambia para incluir la pregunta de area:

**Antes:**
```json
[
  { "player_id": "uuid", "perceived": 0, "comment": "texto" }
]
```

**Despues:**
```json
[
  {
    "player_id": "uuid",
    "perceived": 0,
    "area_asked": "technique",
    "area_perceived": 1,
    "comment": "texto opcional"
  }
]
```

Campos nuevos por jugador valorado:
- `area_asked`: que area se pregunto para este jugador (`technique`, `tactics`, `physical`, `mental`)
- `area_perceived`: -1 (mas bajo de lo esperado) / 0 (correcto) / 1 (mas alto de lo esperado) para esa area especifica

### 3.2 Ruta `POST /matches/:id/feedback`

Actualizar la validacion para aceptar los campos nuevos (`area_asked`, `area_perceived`).

Anadir paso de aplicacion de ajustes de nivel (ver seccion 4.3).

### 3.3 Ruta `GET /players/:id/feedback-summary`

Ampliar el resumen para incluir desglose por areas:

```json
{
  "ok": true,
  "average_perceived_level": 0.4,
  "total_ratings": 24,
  "vs_elo_rating": 3.2,
  "perceived_elo_estimate": 3.8,
  "difference": 0.6,
  "area_breakdown": {
    "technique": { "average": 0.3, "count": 6 },
    "tactics": { "average": -0.1, "count": 5 },
    "physical": { "average": 0.5, "count": 7 },
    "mental": { "average": 0.0, "count": 6 }
  }
}
```

---

## 4. Estructura del formulario

### Fase 1 — Nivelacion de jugadores (1 pantalla por jugador, 3 pantallas total)

El reviewer completa una pantalla por cada uno de los otros 3 jugadores (1 companero + 2 rivales). Cada pantalla tiene:

**Pregunta 1 — Valoracion del nivel general:**
> "Su nivel fue..."
> - Mas bajo de lo esperado (-1)
> - Correcto (0)
> - Mas alto de lo esperado (+1)

**Pregunta 2 — Valoracion de un area especifica:**
Cada jugador recibe una pregunta sobre un **area diferente**. El backend asigna que area preguntar para cada jugador valorado.

> Ejemplo para un partido:
> - Jugador 1 (companero) → "Que tal su **tecnica**?"
> - Jugador 2 (rival 1) → "Que tal su **fisico**?"
> - Jugador 3 (rival 2) → "Que tal su **tactica**?"

Misma escala que la pregunta de nivel general:
> - Mas bajo de lo esperado (-1)
> - Correcto (0)
> - Mas alto de lo esperado (+1)

La referencia para "lo esperado" es el nivel general del jugador valorado (su `elo_rating`).

**Pregunta 3 — Comentario abierto (opcional):**
Campo de texto libre sobre el nivel del jugador. Alimenta el perfil del Coach IA.

### Fase 2 — Valoracion del partido (1 pantalla)

**Pregunta 1 — Volverias a jugar este partido?** (boolean)

Si la respuesta es **No**, desplegar opciones:
- No, los rivales estaban muy por encima/debajo de mi nivel (`rivals_above` / `rivals_below`)
- No, mi pareja no estaba a mi nivel (`partner_mismatch`)
- No, el partido fue muy desequilibrado desde el principio (`imbalanced`)
- No, por el horario o la pista (`schedule_or_venue`)
- Otra razon (texto libre) (`other`)

Se almacena en `would_repeat` (boolean) y `would_not_repeat_reason` (text).

**Pregunta 2 — Opinion personal del partido** (texto libre, siempre visible)

Campo de texto sin limite definido. Alimenta el perfil del Coach IA.

Se almacena en `comment`.

---

### 4.1 Logica de asignacion de areas a preguntar

El backend decide que area preguntar para cada jugador valorado. El objetivo es **rotar** las areas para que, a lo largo de varios partidos, se cubran las 4 areas de cada jugador.

**Algoritmo:**

```
Para cada jugador_valorado en los 3 otros jugadores:
  1. Consultar los ultimos 12 feedbacks recibidos por ese jugador
     (SELECT area_asked FROM match_feedback, unnest level_ratings WHERE player_id = jugador_valorado)
  2. Contar cuantas veces se pregunto cada area
  3. Asignar el area menos preguntada
  4. Si hay empate, elegir aleatoriamente entre las empatadas
  5. Asegurar que los 3 jugadores del mismo formulario no repitan area
     (si es posible — si quedan menos de 3 areas disponibles, permitir repeticion)
```

**Response del endpoint de contexto (o incluido en el formulario):**

Cuando la app solicita el formulario de feedback, el backend devuelve que area preguntar para cada jugador:

```json
{
  "players_to_rate": [
    { "player_id": "uuid-1", "name": "Carlos", "area_to_ask": "technique" },
    { "player_id": "uuid-2", "name": "Ana", "area_to_ask": "physical" },
    { "player_id": "uuid-3", "name": "Pedro", "area_to_ask": "tactics" }
  ]
}
```

Esto puede ser un endpoint nuevo `GET /matches/:id/feedback-form` o incluirse en la logica existente.

### 4.2 Efecto en elo y areas del jugador valorado

Al recibir un feedback, el backend aplica ajustes al jugador que fue valorado. Estos ajustes son **invisibles** para el usuario — no se muestra ninguna notificacion ni indicador de que su nivel cambio.

**Se ejecuta en `POST /matches/:id/feedback`, despues de guardar el feedback:**

```
Para cada jugador valorado en level_ratings:
  
  // Ajuste de area
  Si area_perceived == 1 (mas alto):
    jugador_valorado.area_[area_asked] += DELTA_FEEDBACK_VOTE (0.01)
    Aplicar soft cap y clamp (ver componente 01, seccion 4.4)
  Si area_perceived == -1 (mas bajo):
    jugador_valorado.area_[area_asked] -= DELTA_FEEDBACK_VOTE (0.01)
    Clamp
  
  // Ajuste de elo
  Si perceived == 1 (mas alto):
    jugador_valorado.elo_rating += 0.01
  Si perceived == -1 (mas bajo):
    jugador_valorado.elo_rating -= 0.01
  
  Clamp areas a [elo_rating - 1.0, elo_rating + 1.0]
  UPDATE players
```

**Nota:** El ajuste de elo por feedback es independiente y adicional al ajuste del pipeline de nivelacion (componente 03). El pipeline se ejecuta cuando el marcador se confirma. El feedback se ejecuta despues, cuando el jugador completa el formulario. Son dos momentos distintos.

### 4.3 Ruta `POST /matches/:id/feedback` (actualizada)

**Requiere:** Bearer token.

**Body:**
```json
{
  "level_ratings": [
    {
      "player_id": "uuid",
      "perceived": 1,
      "area_asked": "technique",
      "area_perceived": 0,
      "comment": "texto opcional"
    },
    {
      "player_id": "uuid",
      "perceived": 0,
      "area_asked": "physical",
      "area_perceived": -1,
      "comment": null
    },
    {
      "player_id": "uuid",
      "perceived": -1,
      "area_asked": "tactics",
      "area_perceived": 1,
      "comment": "Muy buena lectura de juego"
    }
  ],
  "would_repeat": false,
  "would_not_repeat_reason": "rivals_above",
  "comment": "Texto libre sobre el partido"
}
```

**Logica actualizada:**

```
1. Verificar que el jugador pertenece al partido
2. Verificar que score_status = 'confirmed'
3. Verificar que los player_id son los otros 3 jugadores del partido
4. Validar area_asked in ('technique', 'tactics', 'physical', 'mental') para cada entry
5. Validar area_perceived in (-1, 0, 1) para cada entry
6. Verificar ventana de tiempo (24 horas desde confirmed)
7. Upsert en match_feedback (idempotente)
8. Aplicar ajustes de elo y areas a cada jugador valorado (seccion 4.2)
9. Responder 200 OK
```

---

## 5. Integracion con Coach IA (componente 11)

### 5.1 Flujo de datos

Los textos escritos en el feedback son la fuente principal de datos cualitativos para el Coach IA:

```
Feedback escrito (comment por jugador + comment del partido)
  -> Almacenado en match_feedback
  -> Procesado por IA (batch)
  -> Construye player_ai_profiles
  -> Coach IA usa player_ai_profiles para recomendaciones personalizadas (V2)
```

### 5.2 Tabla `player_ai_profiles` (V2)

```
player_ai_profiles
+-- id                uuid PRIMARY KEY default gen_random_uuid()
+-- player_id         uuid NOT NULL UNIQUE references players(id)
+-- summary           text          -- Resumen generado por IA del perfil del jugador
+-- strengths         jsonb         -- Array de fortalezas detectadas: ["Buena volea", "Resistencia"]
+-- weaknesses        jsonb         -- Array de debilidades: ["Falta de lectura", "Saque debil"]
+-- personality       text          -- Rasgos de personalidad deportiva inferidos
+-- feedback_count    int NOT NULL default 0  -- Feedbacks procesados para este perfil
+-- last_analyzed_at  timestamptz
+-- updated_at        timestamptz default now()
```

Esta tabla **no se crea en V1**. Se documenta para que el diseno sea coherente.

### 5.3 Pipeline de analisis IA (V2)

```
Trigger: tras insertar feedback con texto no vacio, encolar analisis.
Frecuencia: batch diario o tras cada N feedbacks recibidos por un jugador (decidir).
Entrada: todos los textos de feedback donde el jugador es mencionado (como valorado o como reviewer).
Salida: actualizar player_ai_profiles con summary, strengths, weaknesses.
Consumidor: GET /learning/coach/summary (componente 11) lee player_ai_profiles
  para generar recomendaciones personalizadas en lugar de textos predeterminados.
```

---

## 6. Decisiones pendientes

1. **Ventana de tiempo para enviar feedback:**
   - Sugerencia: 24 horas desde `confirmed`.
   - Ya implementada como constante `FEEDBACK_WINDOW_HOURS = 24`.

2. **Peso del feedback en v2 (si se integra mas con el rating):**
   - En V1: ajuste ligero de ±0.01 por voto. Puramente informativo para el usuario.
   - En V2: posible ajuste mas agresivo si el consenso persiste durante N partidos.
   - _No bloquea V1._

3. **Incentivo para completar el feedback:**
   - Season Pass y SP quedan para post-MVP. En MVP el feedback es voluntario sin recompensa.
   - En el futuro se podria dar SP o badges por completar el feedback.

4. **Endpoint `GET /matches/:id/feedback-form`:**
   - Decidir si la asignacion de areas se devuelve como endpoint separado o se incluye en la respuesta de `score/confirm`.
   - Sugerencia: endpoint separado `GET /matches/:id/feedback-form` que devuelve los jugadores a valorar con sus areas asignadas. La app lo llama antes de mostrar el formulario.

5. **Frecuencia del pipeline de IA (V2):**
   - Batch diario vs tras N feedbacks. Decidir segun volumen de datos y costes del LLM.
