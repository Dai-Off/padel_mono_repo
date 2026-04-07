# 04 — Cuestionario inicial

## 1. Vision objetivo

Cuando un jugador se registra por primera vez, completa un cuestionario de nivelacion que asigna un `elo_rating` inicial. Sin este paso, el sistema asume `elo_rating = 1200` para todos, lo que provoca partidos muy desequilibrados al principio.

El cuestionario tiene dos fases:
- **Fase 1 (Tu perfil):** Preguntas condicionales sobre experiencia, frecuencia, formacion y competicion. Genera un ELO base en escala 0.5–6.25.
- **Fase 2 (Conocimiento):** 5 preguntas tecnicas/tacticas/reglamentarias adaptadas al nivel del jugador. Ajusta el ELO de Fase 1 hacia arriba o hacia abajo.

Combina dos tipos de pregunta:
- **Preguntas estimadas** (anos jugando, frecuencia, competicion) — el usuario puede mentir, se acepta
- **Preguntas especificas de padel** (Fase 2: reglas, tecnica, tactica) — no se pueden falsear sin conocimiento real

Salida: un `elo_rating` inicial en escala 0.5–6.25 que se escribe en `players.elo_rating`.

### Que esta bloqueado hasta completar el cuestionario

Si el jugador no completa el cuestionario, no se le asigna nivel. En ese estado puede:

- **Permitido sin completar el cuestionario:**
  - Reservar pistas
  - Usar el marketplace
  - Ver el contenido general de la app

- **Bloqueado hasta completar el cuestionario:**
  - Unirse a partidos abiertos (competitivos o amistosos)
  - Entrar al matchmaking
  - Acceder al modulo de aprendizaje (lecciones diarias y cursos)

La app redirige al cuestionario cuando el jugador intenta acceder a cualquier funcionalidad bloqueada.

---

## 2. Estado actual

**Archivo:** `backend/src/routes/players.ts`

La tabla `players` ya tiene los campos de nivelacion OpenSkill (`mu`, `sigma`, `beta`) y el campo publico `elo_rating`, anadidos en `014_leveling_matchmaking.sql`. Tambien existe `initial_rating_completed` (boolean).

Ya existe un endpoint `POST /players/onboarding` (linea ~215) con un `onboardingService.ts` que implementa el flujo provisional (arbol P1–P4 simplificado, escala mu ~20–30). Este flujo debe sustituirse por el comportamiento validado con el prototipo que se documenta en la seccion 4.

**Relacion entre `mu` y `elo_rating`:** El sistema de nivelacion trabaja internamente con `mu` (escala OpenSkill, ~15–40) y `sigma` (incertidumbre). El valor visible al jugador es `elo_rating` (escala 0–7), derivado en `levelingService.ts` via `calcEloRating(mu, sigma)`. El cuestionario inicial calcula un `elo_rating` objetivo en escala 0.5–6.25 (validado con el prototipo) y el servicio lo convierte internamente a `mu` para almacenarlo, manteniendo coherencia con el resto del sistema de nivelacion.

---

## 3. Que hay que cambiar

El endpoint `POST /players/onboarding` y el servicio `onboardingService.ts` ya existen con logica provisional. Deben sustituirse por el comportamiento validado que se documenta en la seccion 4. El resto de endpoints no se modifica.

El boolean `initial_rating_completed` se anade a la tabla `players` segun lo definido en el componente 01. La logica de bloqueo de funcionalidades lo lee para decidir si el jugador puede acceder.

---

## 4. Que hay que crear nuevo

### 4.1 Tablas en Supabase

#### `onboarding_questions` — Pool de preguntas del cuestionario

Las preguntas y sus opciones viven en Supabase, no hardcodeadas en el codigo. Esto permite ajustar textos, pesos y opciones sin redesplegar.

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| `id` | uuid | PK |
| `question_key` | text | Identificador logico: `p1`, `p2`, ..., `p9`, `phase2_beginner_1`, etc. |
| `phase` | integer | 1 o 2 |
| `pool` | text | NULL para Fase 1. Para Fase 2: `beginner`, `intermediate`, `advanced`, `competition`, `professional` |
| `text` | text | Texto de la pregunta |
| `type` | text | `single`, `multi`, `order` |
| `options` | jsonb | Array de opciones (estructura segun fase, ver abajo) |
| `display_order` | integer | Orden de presentacion dentro de su fase/pool |
| `is_active` | boolean | default true |

**Estructura del campo `options` segun fase:**

Fase 1 — cada pregunta tiene su propia semantica:

```json
// P2: base_elo + ceiling
[
  { "text": "Mantener bola en juego...", "base_elo": 0.5, "ceiling": 1.5 },
  { "text": "Controlo direccion...",     "base_elo": 0.7, "ceiling": 2.5 },
  ...
]

// P3, P4, P5: corrector simple
[
  { "text": "Menos de 6 meses", "corrector": 0.0 },
  { "text": "Entre 6 meses y 2 anos", "corrector": 0.2 },
  ...
]

// P6a/P6b: elo para formula multiselect
[
  { "text": "Con amigos o conocidos", "elo": 0.1 },
  { "text": "Torneos sociales o amistosos", "elo": 0.2 },
  ...
]

// P1, P7: el valor es el indice seleccionado (0-4 para P1, 0-1 para P7)
// P8: informativa, solo texto
// P9: el valor es el indice (0-3), el corrector se obtiene de la matriz P9
```

Fase 2 — estructura comun para los tres tipos:

```json
// single: correct_index indica la respuesta correcta
{ "text": "...", "options": ["A", "B", "C", "D"], "correct_index": 2 }

// multi: correct_indices indica las respuestas correctas
{ "text": "...", "options": ["A", "B", "C", "D"], "correct_indices": [0, 2] }

// order: el orden del array es el correcto, se desordena con Fisher-Yates al enviar
{ "text": "...", "steps": ["Paso 1", "Paso 2", "Paso 3", ...] }
```

#### `onboarding_answers` — Registro de respuestas (para calibracion)

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| `id` | uuid | PK |
| `player_id` | uuid | FK → players(id) |
| `answers` | jsonb | Todas las respuestas del jugador |
| `elo_assigned` | numeric | ELO final calculado |
| `elo_phase1` | numeric | ELO al terminar Fase 1 (antes del ajuste) |
| `pool_assigned` | text | Pool de Fase 2 asignado |
| `phase2_score` | numeric | Puntuacion en Fase 2 (0–5) |
| `created_at` | timestamptz | default now() |

### 4.2 Logica del cuestionario en backend

**Archivo existente:** `backend/src/services/onboardingService.ts` (sustituir logica provisional)

Responsabilidades:
- `getNextQuestion(answers)` → siguiente pregunta o `null` si el cuestionario ha terminado
- `calcEloPhase1(answers)` → `elo_rating` de Fase 1 (float, escala 0.5–6.25)
- `getPhase2Pool(eloPhase1)` → pool de Fase 2
- `calcPhase2Adjustment(phase2Answers)` → ajuste de Fase 2
- `calcFinalElo(eloPhase1, phase2Adjustment)` → `elo_rating` final con floor/ceiling

El servicio lee las preguntas de `onboarding_questions` en Supabase. Toda la logica condicional (que pregunta va despues de cual) se resuelve en el backend — la mobile app solo consume lo que el backend le devuelve.

**Conversion interna:** El cuestionario calcula un `elo_rating` objetivo (escala 0.5–6.25). Antes de escribir en `players`, el servicio debe derivar el `mu` correspondiente usando la inversa de `calcEloRating(mu, sigma)` de `levelingService.ts`, con `sigma = 8.333` (valor por defecto de jugador nuevo):

```
// Forward (levelingService.ts):
elo_rating = clamp(mu - 2 * sigma, 0, 50) / 50 * 7

// Inversa para el onboarding:
mu = (elo_rating / 7 * 50) + 2 * sigma
// Ejemplo: elo_rating 3.5 → mu = (3.5 / 7 * 50) + 16.666 = 41.666
```

Asi se almacenan tanto `mu` como `elo_rating` de forma coherente con el sistema OpenSkill que usa el matchmaking y la actualizacion post-partido. El campo `beta` no se toca — se inicializa a `4.167` (default de columna en Supabase) al crear el jugador y solo cambia tras partidos reales via `levelingService`.

### 4.3 Fase 1 — Flujo condicional de preguntas

```
P1: "Juegas al padel?"
  |
  |-- Si P1 >= 2 (ocasional o mas):
  |     |-- P2: Nivel de juego (A/B/C/D)
  |     |-- P3: Tiempo jugando
  |     |-- P4: Frecuencia (solo si P1 >= 3)
  |     |-- P5: Clases / entrenamiento
  |     |-- P6: Competicion (solo si P1 >= 3, multiselect)
  |
  |-- Si P1 < 2 (nunca o muy poco):
  |     (salta directo a P7)
  |
  |-- P7: Otro deporte de raqueta? (siempre)
  |     |-- Si P7 = Si:
  |           |-- P8: Cual/es? (informativa, no afecta calculo)
  |           |-- P9: A que nivel?
  |
  [Calculo ELO Fase 1]
  |
  |-- Si P1 <= 1: → RESULTADO (sin Fase 2)
  |-- Si P1 >= 2: → FASE 2
```

**Logica de salto de preguntas (resuelta en el backend):**
- P1 < 2 → salta directamente a P7
- P1 = 2 → activa P2, P3, P5. **No activa P4 ni P6**
- P1 >= 3 → activa P2, P3, P4, P5, P6

### 4.4 Preguntas de Fase 1 — Pesos y correctores

#### P1 — "Juegas al padel?"

| Indice | Respuesta | Techo P1 | Efecto |
|--------|-----------|----------|--------|
| 0 | Nunca he jugado al padel | sin techo | Salta Fase 2. ELO por defecto o Bloque B |
| 1 | He jugado alguna vez, muy poco (<10 veces) | sin techo | Salta Fase 2. ELO por defecto o Bloque B |
| 2 | Juego de forma ocasional | 2.9 | Activa P2, P3, P5. No activa P4 ni P6 |
| 3 | Juego de forma regular | 4.4 | Activa P2–P6 |
| 4 | Juego a nivel avanzado o competitivo | 6.25 | Activa P2–P6 (P6 con opciones profesionales) |

#### P2 — "Cual de estas describe mejor tu juego actual?"

| Opcion | Descripcion | Base ELO | Techo P2 |
|--------|-------------|----------|----------|
| A | Mantener bola en juego, dificultad con pared | 0.5 | 1.5 |
| B | Controlo direccion en golpes lentos, defensa pared fondo | 0.7 | 2.5 |
| C | Puntos largos, transiciones, regularidad juego aereo | 1.5 | 4.0 |
| D | Golpes dificiles (vibora, x3, rulo), adapto estrategia | 3.0 | 6.25 |

#### P3 — "Cuanto tiempo llevas jugando?"

| Opcion | Corrector |
|--------|-----------|
| Menos de 6 meses | +0.0 |
| Entre 6 meses y 2 anos | +0.2 |
| Entre 2 y 5 anos | +0.5 |
| Mas de 5 anos | +0.8 |

#### P4 — "Con que frecuencia juegas?" (solo si P1 >= 3)

| Opcion | Corrector |
|--------|-----------|
| Menos de 1 vez por semana | +0.0 |
| 1-2 veces por semana | +0.1 |
| 3-4 veces por semana | +0.3 |
| 5 o mas veces por semana | +0.5 |

#### P5 — "Has recibido clases o entrenamiento?"

| Opcion | Corrector |
|--------|-----------|
| No | +0.0 |
| Alguna clase suelta | +0.1 |
| Entrenamiento regular en algun momento | +0.3 |
| Entreno con entrenador actualmente | +0.5 |

#### P6 — "Como y donde juegas o compites?" (solo si P1 >= 3, multiselect)

Se muestran opciones diferentes segun P1:

**Si P1 = 3 (regular) — P6a:**

| Opcion | ELO |
|--------|-----|
| Con amigos o conocidos | 0.1 |
| Torneos sociales o amistosos | 0.2 |
| Torneos competitivos de club o ranking | 0.5 |
| Ligas amateur organizadas | 0.8 |

**Si P1 = 4 (avanzado/competitivo) — P6b:**

| Opcion | ELO |
|--------|-----|
| Torneos competitivos de club o ranking | 0.3 |
| Ligas amateur organizadas | 0.3 |
| Liga/torneos federados | 0.8 |
| Circuitos nacionales o internacionales | 1.2 |

**Calculo multiselect P6:**
- Se ordenan los ELOs seleccionados de mayor a menor.
- La primera opcion suma su ELO completo.
- Las demas suman su ELO multiplicado por un factor de descuento:
  - Factor = 0.3 si P1 = 3
  - Factor = 0.2 si P1 = 4
- Formula: `elos[0] + sum(elos[1:]) * factor`

#### P7 — "Has practicado otro deporte de raqueta?"

| Opcion | Efecto |
|--------|--------|
| No | Fin del bloque B |
| Si | Activa P8 y P9 |

#### P8 — "Cual o cuales?" (multiselect, informativa)

Opciones: Tenis, Squash, Badminton, Ping pong, Otro.

**No afecta al calculo.** Solo es informativa.

#### P9 — "A que nivel lo practicabas?"

| Opcion | Descripcion |
|--------|-------------|
| 0 | Casual, sin regularidad |
| 1 | Regular, sin entrenamiento |
| 2 | Con entrenamiento o clases |
| 3 | Competicion (torneos, ligas) |

El corrector se obtiene de la **Matriz P9**, cruzando la respuesta de P2 con la de P9:

| P2 \ P9 | Casual | Regular | Entrenamiento | Competicion |
|----------|--------|---------|---------------|-------------|
| **sin P2** (P1 <= 1) | 0.5 | 0.7 | 1.0 | 1.8 |
| **A** | 0.1 | 0.2 | 0.3 | 1.3 |
| **B** | 0.1 | 0.1 | 0.2 | 0.9 |
| **C** | 0.0 | 0.0 | 0.1 | 0.4 |
| **D** | 0.0 | 0.0 | 0.0 | 0.0 |

- Si el usuario no respondio P2 (P1 <= 1), se usa la fila "sin P2" y el valor se asigna como ELO directo (no como corrector).
- Si el usuario respondio P2, el valor se suma como corrector al ELO acumulado.

### 4.5 Calculo del ELO en Fase 1

#### Caso A: Con P2 (P1 >= 2)

```
ELO = Base(P2) + Corrector(P3) + Corrector(P4) + Corrector(P5) + Corrector(P6) + Corrector(P9)
```

Los correctores de preguntas no respondidas (saltadas por la logica condicional) valen 0. Por ejemplo, si P1 = 2 se saltan P4 y P6, por lo que `Corrector(P4) = 0` y `Corrector(P6) = 0`.

Despues se aplican techos en cascada:
1. **Techo P2:** Si ELO > techo de la opcion P2, se recorta.
2. **Techo P1:** Si ELO > techo de P1, se recorta.

El techo mas restrictivo prevalece.

#### Caso B: Sin P2 (P1 <= 1)

- Si respondio P7 = Si y P9: ELO = Matriz_P9["sin P2"][P9] (ELO directo).
- Si no: ELO = 0.5 (valor por defecto).

### 4.6 Fase 2 — Preguntas de conocimiento

#### Asignacion de pool segun ELO de Fase 1

| Rango ELO | Pool |
|-----------|------|
| < 2.0 | beginner |
| 2.0 – 3.49 | intermediate |
| 3.5 – 4.49 | advanced |
| 4.5 – 5.49 | competition |
| >= 5.5 | professional |

**Condicion:** Si P1 <= 1, no se ejecuta Fase 2 — se va directo al resultado.

#### Mecanica

- Se seleccionan 5 preguntas del pool correspondiente desde `onboarding_questions`.
- El backend las devuelve en orden aleatorio (Fisher-Yates shuffle).
- Cada pregunta pertenece a un area: Tecnica, Tactica o Reglamento.

#### Tipos de pregunta en Fase 2

**Seleccion unica** (`type: single`): 1 punto si correcta, 0 si incorrecta.

**Seleccion multiple** (`type: multi`):
- 1 punto: todas las correctas seleccionadas, ninguna incorrecta.
- 0.5 puntos: al menos una correcta, ninguna incorrecta, pero no todas las correctas.
- 0 puntos: cualquier incorrecta seleccionada, o ninguna correcta.

**Ordenar** (`type: order`): 1 punto si el orden completo coincide, 0 si difiere en cualquier posicion.

#### Pools de preguntas

Las preguntas viven en `onboarding_questions` con `phase = 2` y el `pool` correspondiente. A continuacion el contenido validado de cada pool:

**Pool Beginner (5 preguntas):**

| # | Area | Pregunta | Tipo |
|---|------|----------|------|
| 1 | Tecnica | Empunadura recomendada | single |
| 2 | Tecnica | Componentes de un golpe | single |
| 3 | Tactica | Defensa ante bola facil | single |
| 4 | Tactica | Posicion al sacar | single |
| 5 | Reglamento | Pelota contra propia pared | single |

**Pool Intermediate (5 preguntas):**

| # | Area | Pregunta | Tipo |
|---|------|----------|------|
| 1 | Tecnica | Armado con pala por encima de la cabeza | single |
| 2 | Tecnica | Golpe mas importante del padel | single |
| 3 | Tactica | Companero pierde red, un rival sube | single |
| 4 | Tactica | Defendiendo bajo presion | single |
| 5 | Reglamento | Saque tras tie break | single |

**Pool Advanced (5 preguntas):**

| # | Area | Pregunta | Tipo |
|---|------|----------|------|
| 1 | Tecnica | Efecto del saque | single |
| 2 | Tecnica | Ordenar golpes por agresividad | single |
| 3 | Tactica | Salir de presion defendiendo | single |
| 4 | Tactica | Predecir golpe del rival atacante | single |
| 5 | Reglamento | Pala del rival invade nuestro campo | single |

**Pool Competition (5 preguntas):**

| # | Area | Pregunta | Tipo |
|---|------|----------|------|
| 1 | Tecnica | Empunadura para remate x3 | single |
| 2 | Tecnica | Opciones correctas de la dejada | multi |
| 3 | Tactica | Bajada de pared con rivales pegados a red | multi |
| 4 | Tactica | Estrategia en red contra buena defensa | single |
| 5 | Reglamento | Rival obstaculiza golpeo | single |

**Pool Professional (5 preguntas):**

| # | Area | Pregunta | Tipo |
|---|------|----------|------|
| 1 | Tecnica | Definir estrategia de partido | single |
| 2 | Tecnica | Ordenar pasos bajada de pared agresiva | order (7 opciones) |
| 3 | Tactica | Evitar bloqueo en juego aereo | single |
| 4 | Tactica | Preferencias defendiendo bola comoda | order (4 opciones) |
| 5 | Reglamento | Altura permitida del saque | single |

### 4.7 Calculo del ajuste de Fase 2

Score total: suma de puntuaciones de las 5 preguntas (minimo 0, maximo 5).

| Score Fase 2 | Ajuste al ELO |
|-------------|---------------|
| 5 (perfecto) | +0.7 |
| 4 – 4.5 | +0.4 |
| 3 – 3.5 | +0.2 |
| > 2 y < 3 | 0 |
| 2 | -0.3 |
| 1 – 1.5 | -0.7 |
| 0 – 0.5 | -1.0 |

### 4.8 ELO final — Floor y ceiling

```
ELO_final = max(0.5, min(6.25, ELO_fase1 + ajuste_fase2))
```

- **Floor (suelo):** 0.5 — ningun jugador puede quedar por debajo.
- **Ceiling (techo):** 6.25 — ningun jugador puede quedar por encima.

### 4.9 Nueva ruta en backend

**Archivo:** `backend/src/routes/players.ts` (o nuevo `backend/src/routes/onboarding.ts`)

El cuestionario se resuelve pregunta a pregunta. El backend gestiona el flujo condicional:

#### `GET /players/onboarding/next`

**Requiere:** Bearer token

**Query params:** respuestas anteriores codificadas, o el backend mantiene estado en memoria/session.

**Response:** la siguiente pregunta (texto, opciones, tipo) o `{ phase: "complete", elo_rating }` si el cuestionario ha terminado.

La mobile app muestra cada pregunta que el backend le devuelve y envia la respuesta. No necesita conocer el arbol de preguntas ni la logica de salto.

#### `POST /players/onboarding`

**Requiere:** Bearer token

**Body:**
```json
{
  "answers": [
    { "question_id": "p1", "value": 3 },
    { "question_id": "p2", "value": 2 },
    { "question_id": "p3", "value": 1 },
    ...
  ]
}
```

**Logica:**
1. Verificar que el jugador existe y que `initial_rating_completed = false`
2. Llamar a `calcEloPhase1(answers)` → ELO Fase 1
3. Si P1 >= 2: llamar a `getPhase2Pool(eloPhase1)` y `calcPhase2Adjustment(phase2Answers)`
4. Llamar a `calcFinalElo(eloPhase1, phase2Adjustment)` → ELO final con floor/ceiling
5. Derivar `mu` desde el `elo_rating` final (inversa de `calcEloRating` con `sigma = 8.333`)
6. Actualizar `players`: `mu`, `sigma`, `elo_rating`, `initial_rating_completed = true`
7. Insertar registro en `onboarding_answers` para calibracion
8. Responder con el `elo_rating` visible resultante

**Respuesta:**
```json
{
  "ok": true,
  "elo_rating": 3.5,
  "message": "Nivel inicial asignado"
}
```

**Condiciones:**
- Si `initial_rating_completed` ya es `true`: responder 409 (ya completado)
- Desde la mobile app se llama tras el registro, cuando el jugador intenta acceder a una funcionalidad bloqueada

### 4.10 Ejemplo completo de calculo

**Escenario:** Jugador regular (P1=3), nivel C (P2=2), 2-5 anos (P3=2), 3-4 veces/sem (P4=2), entreno regular (P5=2), torneos competitivos club (P6=[2]), sin otro deporte (P7=0).

```
Base ELO (P2=C):               1.5
+ Corrector P3 (2-5 anos):    +0.5
+ Corrector P4 (3-4/sem):     +0.3
+ Corrector P5 (entreno reg): +0.3
+ Corrector P6 (torneos):     +0.5
= Subtotal:                    3.1

Techo P2 (C) = 4.0 → no aplica (3.1 < 4.0)
Techo P1 (3) = 4.4 → no aplica (3.1 < 4.4)

ELO Fase 1 = 3.1 → Pool: Intermediate

Fase 2: 4/5 correctas → Score = 4 → Ajuste = +0.4
ELO final = max(0.5, min(6.25, 3.1 + 0.4)) = 3.5
Nivel: Advanced (3.5 - 4.5)
```

---

## 5. Decisiones pendientes

1. **Diseno de la interaccion pregunta-a-pregunta vs envio unico:**
   El backend puede funcionar de dos formas: (a) la app envia cada respuesta individualmente y el backend devuelve la siguiente pregunta, o (b) la app recoge todas las respuestas y las envia de golpe al final. La opcion (a) es mas limpia para el flujo condicional pero requiere mas llamadas HTTP. Decidir antes de implementar.

2. **Textos completos y opciones de cada pregunta de Fase 2:**
   Los pools estan definidos (que preguntas hay en cada nivel), pero los textos completos con sus opciones y respuestas correctas deben cargarse en `onboarding_questions`. Esto se hace directamente desde el dashboard de Supabase.

3. **Calibracion con datos reales:**
   Los pesos y correctores estan validados con el prototipo. La tabla `onboarding_answers` permite recalibrar si los primeros N jugadores muestran distribuciones anomalas.
