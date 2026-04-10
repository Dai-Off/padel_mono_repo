# Documentacion Tecnica — Modulo de Aprendizaje

> Registro detallado de lo implementado en el modulo. Se actualiza a medida que se completan fases.
> Ultima actualizacion: 2026-04-10

---

## Indice

1. [Arquitectura general](#1-arquitectura-general)
2. [Base de datos](#2-base-de-datos)
3. [Backend — learning.ts](#3-backend--learningts)
   - 3.1 [Setup y middleware](#31-setup-y-middleware)
   - 3.2 [Helpers de autenticacion](#32-helpers-de-autenticacion)
   - 3.3 [Tipos del algoritmo](#33-tipos-del-algoritmo)
   - 3.4 [Algoritmo de seleccion de preguntas](#34-algoritmo-de-seleccion-de-preguntas)
   - 3.5 [Sanitizacion de contenido](#35-sanitizacion-de-contenido)
   - 3.6 [Verificacion de respuestas](#36-verificacion-de-respuestas)
   - 3.7 [Puntuacion y ELO](#37-puntuacion-y-elo)
   - 3.8 [Helpers de timezone](#38-helpers-de-timezone)
   - 3.9 [GET /learning/daily-lesson](#39-get-learningdaily-lesson)
   - 3.10 [POST /learning/daily-lesson/complete](#310-post-learningdaily-lessoncomplete)
   - 3.13 [Rachas compartidas](#313-rachas-compartidas-fase-35)
   - 3.14 [Cursos — endpoints de jugador](#314-cursos--endpoints-de-jugador-fase-4)
4. [Decisiones tecnicas tomadas](#4-decisiones-tecnicas-tomadas)
5. [Diferencias entre plan e implementacion](#5-diferencias-entre-plan-e-implementacion)
6. [Issues conocidos](#6-issues-conocidos)
7. [Changelog](#7-changelog)

---

## 1. Arquitectura general

### Archivos del modulo

| Archivo | Proposito |
|---------|-----------|
| `backend/src/routes/learning.ts` | Router con toda la logica del modulo (endpoints + algoritmo) |
| `backend/db/019_learning_module.sql` | Definicion de las 8 tablas del modulo |
| `docs/learning/PRD_modulo_aprendizaje.md` | Requisitos funcionales y tecnicos del MVP |
| `docs/learning/PLAN_DESARROLLO_MODULO_APRENDIZAJE.md` | Plan de implementacion con orden de fases |
| `docs/learning/DOCUMENTACION_TECNICA.md` | Este archivo — registro tecnico de lo implementado |

### Flujo de datos

```
Mobile App (React Native)
    |
    | fetch() + Authorization: Bearer <token>
    v
Backend Express (learning.ts)
    |
    | Supabase service role client
    v
PostgreSQL (Supabase)
    |
    Tablas: learning_questions, learning_question_log,
            learning_sessions, learning_courses,
            learning_course_lessons, learning_course_progress,
            learning_streaks, learning_shared_streaks
```

La mobile app nunca se comunica con Supabase directamente. Todo pasa por el backend Express.

### Registro del router

En `backend/src/routes/index.ts`:

```typescript
import learningRouter from './learning';
router.use('/learning', learningRouter);
```

---

## 2. Base de datos

Archivo SQL: `backend/db/019_learning_module.sql`.
Se ejecuta manualmente en el SQL Editor de Supabase (patron del proyecto — no hay sistema de migraciones).

### 2.1 `learning_questions` — Pool de preguntas

Almacena todas las preguntas disponibles para las lecciones diarias.

| Columna | Tipo | Restricciones | Descripcion |
|---------|------|---------------|-------------|
| `id` | uuid | PK, auto-generado | Identificador unico |
| `type` | text | NOT NULL, CHECK in 5 valores | Tipo de pregunta |
| `level` | numeric | NOT NULL, default 1.0 | Nivel de dificultad (se compara con `elo_rating` del jugador) |
| `area` | text | NOT NULL, CHECK in 4 valores | Area tematica |
| `has_video` | boolean | NOT NULL, default false | Si la pregunta incluye video |
| `video_url` | text | nullable | URL del video si aplica |
| `content` | jsonb | NOT NULL | Contenido de la pregunta (estructura varia segun tipo) |
| `created_by_club` | uuid | FK → clubs(id), ON DELETE SET NULL | Club que creo la pregunta |
| `is_active` | boolean | NOT NULL, default true | Si la pregunta esta activa para seleccion |
| `created_at` | timestamptz | NOT NULL, default now() | Fecha de creacion |

**Valores permitidos de `type`:**
- `test_classic` — Pregunta con 4 opciones y 1 correcta
- `true_false` — Verdadero o falso
- `multi_select` — Seleccion multiple (2-3 correctas de 4)
- `match_columns` — Emparejar columnas (3-5 pares)
- `order_sequence` — Ordenar pasos (3-6 pasos)

**Valores permitidos de `area`:**
- `technique` — Tecnica
- `tactics` — Tactica
- `physical` — Preparacion fisica
- `mental_vocabulary` — Mental y vocabulario

**Estructura del campo `content` segun tipo:**

| Tipo | Estructura JSON |
|------|----------------|
| `test_classic` | `{ "question": str, "options": [str x4], "correct_index": 0-3, "video_pause_at": int\|null }` |
| `true_false` | `{ "statement": str, "correct_answer": bool }` |
| `multi_select` | `{ "question": str, "options": [str x4], "correct_indices": [int x2-3] }` |
| `match_columns` | `{ "pairs": [{ "left": str, "right": str } x3-5] }` |
| `order_sequence` | `{ "steps": [str x3-6] }` |

**Indices:**
- `idx_lq_active_level` → `(is_active, level)` — Filtro principal del algoritmo
- `idx_lq_club` → `(created_by_club)` — Busqueda por club creador
- `idx_lq_type` → `(type)` — Filtro por tipo

### 2.2 `learning_question_log` — Historial de respuestas

Registra cada respuesta individual que da un jugador. Se usa para alimentar el algoritmo de seleccion.

| Columna | Tipo | Restricciones | Descripcion |
|---------|------|---------------|-------------|
| `id` | uuid | PK, auto-generado | Identificador unico |
| `player_id` | uuid | NOT NULL, FK → players(id), ON DELETE CASCADE | Jugador que respondio |
| `question_id` | uuid | NOT NULL, FK → learning_questions(id), ON DELETE CASCADE | Pregunta respondida |
| `answered_correctly` | boolean | NOT NULL | Si la respondio bien |
| `response_time_ms` | integer | NOT NULL | Tiempo de respuesta en milisegundos |
| `answered_at` | timestamptz | NOT NULL, default now() | Momento de la respuesta |

**Indices:**
- `idx_lql_player` → `(player_id)` — Todo el historial de un jugador
- `idx_lql_player_question` → `(player_id, question_id)` — Historial por jugador y pregunta
- `idx_lql_player_date` → `(player_id, answered_at)` — Historial ordenado por fecha

### 2.3 `learning_sessions` — Sesiones completadas

Una fila por cada leccion diaria completada. Resume la sesion con puntuacion y XP.

| Columna | Tipo | Restricciones | Descripcion |
|---------|------|---------------|-------------|
| `id` | uuid | PK, auto-generado | Identificador unico |
| `player_id` | uuid | NOT NULL, FK → players(id), ON DELETE CASCADE | Jugador |
| `correct_count` | integer | NOT NULL | Preguntas acertadas (0-5) |
| `total_count` | integer | NOT NULL, default 5 | Total de preguntas |
| `score` | integer | NOT NULL | Puntuacion total (0-500) |
| `xp_earned` | integer | NOT NULL | XP ganada |
| `timezone` | text | NOT NULL, default 'UTC' | Timezone del usuario al completar |
| `completed_at` | timestamptz | NOT NULL, default now() | Momento de completar |

**Indice:**
- `idx_ls_player_date` → `(player_id, completed_at)` — Buscar sesiones por jugador y fecha

### 2.4 `learning_courses` — Cursos digitales

Cursos creados por clubes con ciclo de vida: draft → pending_review → active → inactive.

| Columna | Tipo | Restricciones | Descripcion |
|---------|------|---------------|-------------|
| `id` | uuid | PK, auto-generado | Identificador unico |
| `club_id` | uuid | FK → clubs(id), ON DELETE SET NULL | Club creador |
| `title` | text | NOT NULL | Titulo del curso |
| `description` | text | nullable | Descripcion |
| `banner_url` | text | nullable | URL del banner |
| `elo_min` | numeric | NOT NULL, default 0 | ELO minimo para acceder (rango 0-7) |
| `elo_max` | numeric | NOT NULL, default 7 | ELO maximo para acceder (rango 0-7) |
| `pedagogical_goal` | text | nullable | Objetivo pedagogico |
| `status` | text | NOT NULL, default 'draft', CHECK in 4 valores | Estado del ciclo de vida |
| `created_at` | timestamptz | NOT NULL, default now() | Fecha de creacion |
| `updated_at` | timestamptz | NOT NULL, default now() | Ultima actualizacion |

Un jugador puede acceder al curso si su `elo_rating` esta en el rango `[elo_min, elo_max]`. Fuera de rango, el curso aparece como `locked`.

**Indices:**
- `idx_lc_status` → `(status)`
- `idx_lc_club` → `(club_id)`
- `idx_lc_level` → `(elo_min)`

### 2.5 `learning_course_lessons` — Lecciones de un curso

| Columna | Tipo | Restricciones | Descripcion |
|---------|------|---------------|-------------|
| `id` | uuid | PK, auto-generado | Identificador unico |
| `course_id` | uuid | NOT NULL, FK → learning_courses(id), ON DELETE CASCADE | Curso padre |
| `"order"` | integer | NOT NULL | Posicion en el curso (palabra reservada, va entre comillas) |
| `title` | text | NOT NULL | Titulo |
| `description` | text | nullable | Descripcion |
| `video_url` | text | nullable | URL del video |
| `duration_seconds` | integer | nullable | Duracion en segundos |
| `created_at` | timestamptz | NOT NULL, default now() | Fecha de creacion |

**Indice:**
- `idx_lcl_course` → `(course_id, "order")`

### 2.6 `learning_course_progress` — Progreso del jugador

| Columna | Tipo | Restricciones | Descripcion |
|---------|------|---------------|-------------|
| `id` | uuid | PK, auto-generado | Identificador unico |
| `player_id` | uuid | NOT NULL, FK → players(id), ON DELETE CASCADE | Jugador |
| `lesson_id` | uuid | NOT NULL, FK → learning_course_lessons(id), ON DELETE CASCADE | Leccion completada |
| `completed_at` | timestamptz | NOT NULL, default now() | Momento de completar |

**Constraint UNIQUE:** `(player_id, lesson_id)`

**Indice:**
- `idx_lcp_player` → `(player_id)`

### 2.7 `learning_streaks` — Racha individual

| Columna | Tipo | Restricciones | Descripcion |
|---------|------|---------------|-------------|
| `player_id` | uuid | PK, FK → players(id), ON DELETE CASCADE | Jugador |
| `current_streak` | integer | NOT NULL, default 0 | Dias consecutivos |
| `longest_streak` | integer | NOT NULL, default 0 | Record historico |
| `last_lesson_completed_at` | timestamptz | nullable | Ultima leccion completada |

### 2.8 `learning_shared_streaks` — Rachas compartidas

| Columna | Tipo | Restricciones | Descripcion |
|---------|------|---------------|-------------|
| `id` | uuid | PK, auto-generado | Identificador unico |
| `player_id_1` | uuid | NOT NULL, FK → players(id), ON DELETE CASCADE | Primer jugador |
| `player_id_2` | uuid | NOT NULL, FK → players(id), ON DELETE CASCADE | Segundo jugador |
| `current_streak` | integer | NOT NULL, default 0 | Racha actual conjunta |
| `longest_streak` | integer | NOT NULL, default 0 | Record historico |
| `player1_completed_today` | boolean | NOT NULL, default false | Si player 1 completo hoy |
| `player2_completed_today` | boolean | NOT NULL, default false | Si player 2 completo hoy |
| `last_both_completed_at` | timestamptz | nullable | Ultima vez que ambos completaron |
| `timezone` | text | NOT NULL, default 'UTC' | Timezone para reset diario |
| `created_at` | timestamptz | NOT NULL, default now() | Fecha de creacion |

**Constraints:**
- CHECK: `player_id_1 <> player_id_2`
- UNIQUE: `(player_id_1, player_id_2)`

**Indices:**
- `idx_lss_player1` → `(player_id_1)`
- `idx_lss_player2` → `(player_id_2)`

### Diagrama de relaciones

```
players
  |
  +-- learning_question_log ---> learning_questions <--- clubs
  |
  +-- learning_sessions
  |
  +-- learning_course_progress ---> learning_course_lessons ---> learning_courses <--- clubs
  |
  +-- learning_streaks
  |
  +-- learning_shared_streaks (player_id_1 + player_id_2)
```

---

## 3. Backend — learning.ts

Archivo: `backend/src/routes/learning.ts` (~1400 lineas).

### 3.1 Setup y middleware

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';

const router = Router();
router.use(attachAuthContext);
```

`attachAuthContext` se aplica a todas las rutas. Extrae el usuario del token Bearer y lo pone en `req.authContext` con `{ userId: string }`.

### 3.2 Helpers de autenticacion

#### `requireAuth`

Guard de autenticacion. Si no hay `authContext`, devuelve 401. Se usa como middleware en cada ruta.

#### `getPlayerFromAuth(authUserId)`

Busca en `players` el jugador vinculado al `auth_user_id`, excluyendo `status = 'deleted'`. Devuelve `{ id, elo_rating }` o `null`. Se llama al inicio de cada endpoint; si devuelve `null`, el endpoint responde 404.

### 3.3 Tipos del algoritmo

```typescript
interface QuestionRow {
  id: string;
  type: string;
  level: number;
  area: string;
  has_video: boolean;
  video_url: string | null;
  content: Record<string, unknown>;
}

interface HistoryEntry {
  question_id: string;
  answered_correctly: boolean;
  answered_at: string;
}

interface ScoredQuestion {
  question: QuestionRow;
  weight: number;
}
```

- `QuestionRow` — Pregunta tal como viene de `learning_questions`.
- `HistoryEntry` — Una respuesta pasada de `learning_question_log`.
- `ScoredQuestion` — Pregunta con su peso calculado, para ordenar y seleccionar.

### 3.4 Algoritmo de seleccion de preguntas

Nucleo del modulo. Selecciona las 5 mejores preguntas para el jugador usando **pesos dinamicos**.

#### Constantes

```typescript
const PESO_BASE = 100;
const LESSON_SIZE = 5;
```

#### Funciones de peso

Cada funcion recibe el historial del jugador con esa pregunta y devuelve un bonus o penalizacion:

**`bonusFallada(history)` — Rango: 0 / 25 / 50**

Prioriza preguntas falladas anteriormente para refuerzo.

| Situacion | Valor |
|-----------|-------|
| Nunca respondida o nunca fallada | 0 |
| Fallo alguna vez, pero la ultima vez acerto | +25 |
| Fallo alguna vez y la ultima vez tambien fallo | +50 |

**`bonusNovedad(history)` — Rango: 0 / 40**

+40 si el jugador nunca ha visto la pregunta. 0 si ya la respondio alguna vez.

**`bonusTiempo(history, now)` — Rango: 0–30**

Preguntas no respondidas en mucho tiempo ganan peso. `min(diasDesdeUltima * 3, 30)`. Si nunca vista: 30.

**`penalizacionNivel(questionLevel, eloRating)` — Rango: 0–80**

Penaliza preguntas lejos del nivel del jugador. Tolerancia de +-0.5, luego crece linealmente con `(distancia - 0.5) * 40`, tope 80.

**`penalizacionRepeticion(history)` — Rango: 0–60**

Reduce peso de preguntas muy respondidas. `min(vecesRespondida * 8, 60)`.

#### `computeWeight`

```
peso = 100 + bonusFallada + bonusNovedad + bonusTiempo - penalizacionNivel - penalizacionRepeticion
```

Rango teorico: ~-40 a ~240.

#### `selectQuestions`

1. Calcula peso de cada pregunta activa.
2. Ordena de mayor a menor peso.
3. Primera pregunta: la mejor `test_classic` disponible.
4. Rellena hasta 5 evitando tipos consecutivos iguales (busca alternativa si el siguiente es del mismo tipo).
5. Devuelve array de 5 (o menos si no hay suficientes).

### 3.5 Sanitizacion de contenido

`sanitizeContent(type, content)` — Elimina las respuestas correctas antes de enviar al cliente:

| Tipo | Que se elimina | Que recibe el cliente |
|------|---------------|----------------------|
| `test_classic` | `correct_index` | `question`, `options` |
| `true_false` | `correct_answer` | `statement` |
| `multi_select` | `correct_indices` | `question`, `options` |
| `match_columns` | `pairs` | `lefts` + `rights_shuffled` (desordenado con Fisher-Yates) |
| `order_sequence` | `steps` | `steps_shuffled` (desordenado con Fisher-Yates) |

Para `match_columns` y `order_sequence`, el orden original en la DB es la respuesta correcta. Se desordena con Fisher-Yates para que el cliente no la reciba implicitamente.

### 3.6 Verificacion de respuestas

#### `checkAnswer(type, content, selectedAnswer)` → boolean

| Tipo | Que envia el cliente | Verificacion |
|------|---------------------|-------------|
| `test_classic` | `number` (0-3) | `=== content.correct_index` |
| `true_false` | `boolean` | `=== content.correct_answer` |
| `multi_select` | `number[]` | Ordena ambos arrays, compara con `JSON.stringify` |
| `match_columns` | `number[]` | Correcto es `[0,1,2,...]` (orden original de pairs) |
| `order_sequence` | `number[]` | Correcto es `[0,1,2,...]` (orden original de steps) |

Si `selectedAnswer` es `undefined` o tipo incorrecto, devuelve `false` (se cuenta como incorrecta sin error).

#### `getCorrectAnswer(type, content)` → unknown

Devuelve la respuesta correcta para incluirla en la response (para que el frontend muestre la correccion).

### 3.7 Puntuacion y XP

#### `timePenalty(responseTimeMs)` → 0–30

| Tiempo | Penalizacion |
|--------|-------------|
| < 5000ms | 0 |
| 5000–10000ms | Lineal entre 0 y 30 |
| >= 10000ms | 30 |

**Puntos por pregunta correcta:** `100 - timePenalty` (rango: 70–100).
**Puntos por pregunta incorrecta:** 0 siempre.
**Puntuacion total de sesion:** 0–500.
**XP base:** `Math.round(totalScore / 10)` (rango: 0–50).
**XP final:** `Math.round(baseXp * (1 + multiplier))` — el multiplicador viene de la racha post-update (ver 3.11).

> **El modulo de aprendizaje no modifica `players.elo_rating` en ningun momento.** En el futuro modificara levemente un desglose del nivel por area (tecnica/tactica/fisico/mental) que aun no esta implementado en el proyecto.

### 3.8 Helpers de timezone

El backend no usa ninguna libreria de fechas. Toda la conversion entre wall-clock local y UTC vive en `learning.ts` y se basa en `Intl.DateTimeFormat`. Soporta DST y offsets fraccionarios (India UTC+5:30, Nepal UTC+5:45, etc.).

#### `dayKeyInTz(date, timezone)` → "YYYY-MM-DD"

Devuelve el dia del calendario local en la timezone dada. Usa `Intl.DateTimeFormat` con locale `en-CA`. Si la timezone es invalida, fallback al dia UTC.

#### `previousDayKey(dayKey)` → "YYYY-MM-DD"

Resta un dia a un string `YYYY-MM-DD` con aritmetica UTC pura. Es seguro: opera sobre fecha-only, sin DST involucrado.

#### `formatInTimeZone(date, timezone)` → "YYYY-MM-DDTHH:mm:ss"

Formatea un instante UTC como wall-clock en la timezone destino. Normaliza el caso `"24"` a `"00"` (algunos runtimes lo devuelven asi a medianoche).

#### `zonedTimeToUtc(localDateTime, timezone)` → Date

Convierte un wall-clock `YYYY-MM-DDTHH:mm:ss` interpretado en `timezone` al instante UTC equivalente. Algoritmo de **doble pasada** para manejar transiciones DST:

1. Toma el string como si fuera UTC → primer guess.
2. Mide la diferencia entre lo que ese instante "se ve" en la tz vs lo que queriamos → drift.
3. Aplica el drift.
4. Repite para corregir el caso DST.

#### `getTodayRange(timezone)` → { start, end }

Calcula inicio (`00:00:00`) y fin (`23:59:59`) del dia actual en la tz del usuario, convertidos a ISO UTC. Lo consume el handler de `daily-lesson` para verificar si ya completo hoy.

### 3.9 GET /learning/daily-lesson

**Ruta:** `GET /learning/daily-lesson?timezone=Asia/Shanghai`
**Guard:** `requireAuth`

#### Flujo

1. Obtener player via `getPlayerFromAuth` → 404 si no existe.
2. Leer timezone del query param (default `'UTC'`).
3. Calcular rango del dia con `getTodayRange`.
4. Buscar sesion completada hoy en `learning_sessions`.
   - Si existe → `{ ok: true, already_completed: true, session }`.
5. Cargar en paralelo (`Promise.all`):
   - Todas las preguntas activas de `learning_questions`.
   - Todo el historial del jugador de `learning_question_log`.
6. Si no hay preguntas → `{ ok: true, already_completed: false, questions: [] }`.
7. Agrupar historial por `question_id` en un `Map`.
8. Ejecutar `selectQuestions`.
9. Sanitizar contenido (quitar respuestas correctas).
10. Devolver preguntas sanitizadas.

#### Response (no completada)

```json
{
  "ok": true,
  "already_completed": false,
  "questions": [
    {
      "id": "uuid",
      "type": "test_classic",
      "area": "technique",
      "has_video": true,
      "video_url": "https://...",
      "content": {
        "question": "Cual es la posicion correcta...?",
        "options": ["Opcion A", "Opcion B", "Opcion C", "Opcion D"]
      }
    }
  ]
}
```

El campo `content` no incluye respuestas correctas.

#### Response (ya completada)

```json
{
  "ok": true,
  "already_completed": true,
  "session": {
    "id": "uuid",
    "correct_count": 3,
    "total_count": 5,
    "score": 270,
    "xp_earned": 27,
    "completed_at": "2026-04-06T10:30:00Z"
  }
}
```

#### Queries a la DB

4 queries: 1 para player, 1 para sesion de hoy (secuenciales), luego 2 en paralelo (preguntas + historial).

### 3.10 POST /learning/daily-lesson/complete

**Ruta:** `POST /learning/daily-lesson/complete`
**Guard:** `requireAuth`

#### Request body

```json
{
  "timezone": "Asia/Shanghai",
  "answers": [
    { "question_id": "uuid-1", "selected_answer": 2, "response_time_ms": 4500 },
    { "question_id": "uuid-2", "selected_answer": true, "response_time_ms": 3200 },
    { "question_id": "uuid-3", "selected_answer": [0, 2], "response_time_ms": 6100 },
    { "question_id": "uuid-4", "selected_answer": [2, 0, 1], "response_time_ms": 8000 },
    { "question_id": "uuid-5", "selected_answer": [0, 1, 2, 3], "response_time_ms": 5500 }
  ]
}
```

El tipo de `selected_answer` varia segun el tipo de pregunta:
- `test_classic`: `number` (0-3)
- `true_false`: `boolean`
- `multi_select`: `number[]`
- `match_columns`: `number[]`
- `order_sequence`: `number[]`

#### Flujo

1. Obtener player → 404 si no existe.
2. Validar:
   - `answers` es array de exactamente 5 → 400 si no.
   - Cada answer tiene `question_id` y `response_time_ms > 0` → 400 si no.
3. Verificar que no haya completado hoy → 409 si ya existe sesion.
4. Cargar las 5 preguntas por IDs → 400 si alguna no existe.
5. Para cada respuesta:
   - `checkAnswer` → boolean.
   - `timePenalty` → 0-30.
   - Puntos = correcta ? `100 - penalty` : `0`.
   - Acumular `totalScore` y `correctCount`.
6. Calcular `baseXp = round(totalScore / 10)`.
7. Escritura secuencial en DB:
   - INSERT 5 filas en `learning_question_log`.
   - `updateIndividualStreak(playerId, tz)` (ver 3.11) → devuelve `current_streak` y `longest_streak` actualizados.
   - `multiplier = getMultiplier(current_streak)` (post-update).
   - `xpFinal = round(baseXp * (1 + multiplier))`.
   - INSERT 1 fila en `learning_sessions` con `xp_earned = xpFinal`.
8. Devolver resultados con bloque `streak`.

> **Importante:** el modulo no toca `players.elo_rating` ni `elo_last_updated_at`. La unica escritura sobre `players` desde aprendizaje en el futuro sera el desglose por area, aun no implementado.

#### Response

```json
{
  "ok": true,
  "session": {
    "id": "uuid",
    "correct_count": 3,
    "total_count": 5,
    "score": 270,
    "xp_earned": 41,
    "completed_at": "2026-04-06T10:30:00Z"
  },
  "streak": {
    "current": 5,
    "longest": 12,
    "multiplier": 0.5,
    "xp_base": 27,
    "xp_bonus": 14
  },
  "results": [
    {
      "question_id": "uuid-1",
      "correct": true,
      "correct_answer": 2,
      "points": 100
    },
    {
      "question_id": "uuid-2",
      "correct": false,
      "correct_answer": true,
      "points": 0
    }
  ]
}
```

#### Queries a la DB

7 queries secuenciales: player, sesion de hoy, cargar preguntas, INSERT log, SELECT streak, UPSERT streak, INSERT session.

### 3.11 Sistema de rachas (Fase 3)

Las tablas `learning_streaks` y `learning_shared_streaks` ya estaban creadas desde Fase 1. La racha individual se implemento en 3.1-3.4 y las rachas compartidas en 3.5.

#### `getMultiplier(currentStreak)` → number (exportada)

| Racha | Multiplicador |
|-------|---------------|
| <= 2 | 0 |
| 3-7 | 0.5 |
| 8-20 | 1.0 |
| 21-45 | 1.5 |
| > 45 | 2.0 |

Funcion pura, exportada desde `learning.ts`. Otros modulos del backend (matches, Coach IA, futuro Season Pass) la importan directamente para aplicar el mismo multiplicador a sus propias recompensas. Es la fuente de verdad unica para el sistema de bonus.

#### `getPlayerStreakMultiplier(playerId)` → Promise<number> (exportada)

Helper para uso intra-backend cuando otro modulo solo tiene un `playerId`. Lee `learning_streaks`, devuelve `getMultiplier(current_streak ?? 0)`. Si el jugador no tiene racha registrada, devuelve 0 (sin bonus).

> **Por que no hay endpoint HTTP `/learning/multiplier/:playerId`:** todos los consumidores viven en el mismo backend Express. Una llamada HTTP intra-proceso seria una indireccion gratuita y expondria un lookup por UUID arbitrario sin valor anadido. Si en el futuro algun consumidor externo (Edge Function, cron, otro servicio) lo necesita, se anadira el endpoint en ese momento.

#### `updateIndividualStreak(playerId, timezone)` → StreakState

Llamada desde `POST /complete` justo despues de insertar el log. Logica:

1. SELECT del row en `learning_streaks` para ese player (puede no existir).
2. Calcula `todayKey = dayKeyInTz(now, tz)` y `yesterdayKey = previousDayKey(todayKey)`.
3. Si `last_lesson_completed_at` es no nulo, calcula `lastKey = dayKeyInTz(last, tz)`:
   - `lastKey === todayKey` → no incrementa, devuelve el row tal cual (defensa: complete ya bloquea doble entrega).
   - `lastKey === yesterdayKey` → `current_streak += 1`.
   - cualquier otro caso (gap o primera vez) → `current_streak = 1`.
4. `longest_streak = max(longest_streak, current_streak)`.
5. `last_lesson_completed_at = now()`.
6. UPSERT en `learning_streaks` (PK = `player_id`).
7. Devuelve el nuevo estado.

La timezone usada es la que el cliente envia en cada request. Si el usuario viaja, la racha sigue su telefono. No se persiste tz en `learning_streaks`.

### 3.12 GET /learning/streak

**Ruta:** `GET /learning/streak`
**Guard:** `requireAuth`

Lectura pura — no evalua ni resetea la racha. El `current_streak` que devuelve es el ultimo valor persistido (al completar la ultima leccion). La racha solo cambia cuando se completa la siguiente leccion. Si el cliente quiere mostrar "tu racha esta en peligro", puede comparar `last_lesson_completed_at` con su dia local actual.

#### Response (sin racha)

```json
{
  "ok": true,
  "current_streak": 0,
  "longest_streak": 0,
  "multiplier": 0,
  "last_lesson_completed_at": null
}
```

#### Response (con racha)

```json
{
  "ok": true,
  "current_streak": 5,
  "longest_streak": 12,
  "multiplier": 0.5,
  "last_lesson_completed_at": "2026-04-06T10:30:00Z"
}
```

### 3.13 Rachas compartidas (Fase 3.5)

Dos jugadores pueden crear una racha compartida. La racha avanza cuando **ambos** completan su leccion diaria el mismo dia.

#### Tipos

```typescript
interface SharedStreakRow {
  id: string;
  player_id_1: string;
  player_id_2: string;
  current_streak: number;
  longest_streak: number;
  player1_completed_today: boolean;
  player2_completed_today: boolean;
  last_both_completed_at: string | null;
  timezone: string;
}
```

#### `normalizePair(a, b)` → [string, string]

Ordena dos UUIDs lexicograficamente: el menor va como `player_id_1`. Garantiza que no haya duplicados en la tabla (unique constraint sobre `player_id_1, player_id_2`).

#### `lazyResetSharedStreak(row)` → boolean

Reset lazy (sin cron job). Se llama antes de leer o actualizar una racha compartida. Compara `last_both_completed_at` con la fecha actual en la timezone de la racha:

| Situacion | Accion |
|-----------|--------|
| `last_both_completed_at` es de hoy | No hacer nada |
| Es de ayer | Resetear flags `playerX_completed_today` a false (racha sigue viva) |
| Gap > 1 dia o null | Resetear flags **y** `current_streak = 0` |

Muta el objeto in-place. Devuelve `true` si hubo cambios (el caller decide si persiste).

#### `updateSharedStreaks(playerId, timezone)` → SharedStreakRow[]

Se llama desde `POST /daily-lesson/complete` despues de `updateIndividualStreak`. Logica para cada racha compartida del jugador:

1. Aplica `lazyResetSharedStreak`.
2. Marca el flag del jugador que acaba de completar (`player1_completed_today` o `player2_completed_today`).
3. Si ambos flags son `true` → incrementa `current_streak`, actualiza `longest_streak`, guarda `last_both_completed_at = now()`.
4. Persiste con UPDATE por `id`.

Devuelve las rachas actualizadas para incluirlas en la response.

#### GET /learning/shared-streaks

**Ruta:** `GET /learning/shared-streaks`
**Guard:** `requireAuth`

Devuelve las rachas compartidas del usuario autenticado. Para cada racha:
- Aplica `lazyResetSharedStreak` y persiste si hubo cambios.
- Obtiene nombre y avatar del companero via join con `players`.

**Response:**

```json
{
  "ok": true,
  "shared_streaks": [
    {
      "id": "uuid",
      "partner": {
        "id": "uuid",
        "first_name": "Juan",
        "last_name": "Perez",
        "avatar_url": "https://..."
      },
      "current_streak": 5,
      "longest_streak": 12,
      "my_completed_today": true,
      "partner_completed_today": false
    }
  ]
}
```

#### POST /learning/shared-streaks

**Ruta:** `POST /learning/shared-streaks`
**Guard:** `requireAuth`

Crea una racha compartida con otro jugador.

**Request body:**

```json
{
  "partner_id": "uuid"
}
```

**Validaciones:**
- `partner_id` es obligatorio y de tipo string.
- El partner existe en `players` y no esta eliminado.
- No es el mismo jugador (`partner_id !== player_id`).
- No existe ya una racha entre ambos (se normaliza el orden con `normalizePair`).

Si ya existe → 409. Si el partner no existe → 404.

**Response (201):**

```json
{
  "ok": true,
  "shared_streak": {
    "id": "uuid",
    "partner": {
      "id": "uuid",
      "first_name": "Juan",
      "last_name": "Perez",
      "avatar_url": "https://..."
    },
    "current_streak": 0,
    "longest_streak": 0,
    "created_at": "2026-04-09T10:30:00Z"
  }
}
```

#### Integracion en POST /daily-lesson/complete

La response de `POST /daily-lesson/complete` ahora incluye un campo adicional `shared_streaks`:

```json
{
  "ok": true,
  "session": { "..." },
  "streak": { "..." },
  "shared_streaks": [
    {
      "id": "uuid",
      "partner_id": "uuid",
      "current_streak": 3,
      "longest_streak": 5,
      "both_completed_today": true
    }
  ],
  "results": [ "..." ]
}
```

### 3.14 Cursos — endpoints de jugador (Fase 4)

Tres endpoints que permiten a los jugadores ver cursos, ver detalle con lecciones, y marcar progreso.

#### Helper: `isCourseLocked(elo, eloMin, eloMax)` → boolean

Devuelve `true` si el elo del jugador esta fuera del rango `[eloMin, eloMax]` del curso. Se usa en los 3 endpoints para determinar acceso.

#### GET /learning/courses

**Ruta:** `GET /learning/courses`
**Guard:** `requireAuth`

Devuelve **todos** los cursos activos, marcando cada uno como `locked` o no segun el elo del jugador.

**Flujo:**
1. Obtener player (id + elo_rating).
2. SELECT cursos activos con JOIN a `clubs` para nombre del club.
3. SELECT todas las lecciones de esos cursos.
4. SELECT progreso del jugador para esas lecciones.
5. Para cada curso: contar total/completadas, calcular `locked` e `is_completed`.

**Queries:** 3-4 queries (cursos, lecciones, progreso — batch, no N+1).

**Response:**

```json
{
  "ok": true,
  "courses": [
    {
      "id": "uuid",
      "title": "Fundamentos del reves",
      "description": "...",
      "banner_url": "...",
      "elo_min": 0,
      "elo_max": 3,
      "club_name": "Club Padel Shanghai",
      "total_lessons": 6,
      "completed_lessons": 2,
      "is_completed": false,
      "locked": false
    }
  ]
}
```

#### GET /learning/courses/:id

**Ruta:** `GET /learning/courses/:id`
**Guard:** `requireAuth`

Detalle de un curso. Si el jugador no tiene nivel (locked), devuelve info basica sin lecciones. Si tiene nivel, devuelve lecciones con estado.

**Estado de cada leccion:**
- `completed` — el jugador ya la completo.
- `available` — es la primera, o la anterior esta completada.
- `locked` — la anterior no esta completada.

**Response (desbloqueado):**

```json
{
  "ok": true,
  "course": {
    "id": "uuid",
    "title": "...",
    "locked": false,
    "total_lessons": 3,
    "completed_lessons": 1,
    "is_completed": false,
    "lessons": [
      { "id": "uuid", "order": 1, "title": "Grip", "status": "completed" },
      { "id": "uuid", "order": 2, "title": "Movimiento", "status": "available" },
      { "id": "uuid", "order": 3, "title": "Ejecucion", "status": "locked" }
    ]
  }
}
```

**Response (bloqueado):**

```json
{
  "ok": true,
  "course": {
    "id": "uuid",
    "title": "...",
    "locked": true,
    "total_lessons": 3
  }
}
```

#### POST /learning/courses/:id/complete-lesson

**Ruta:** `POST /learning/courses/:id/complete-lesson`
**Guard:** `requireAuth`

**Request body:**

```json
{
  "lesson_id": "uuid"
}
```

**Validaciones (en orden):**
1. Curso existe y esta activo → 404 si no.
2. Jugador tiene nivel para el curso → 403 si locked.
3. La leccion pertenece al curso → 400 si no.
4. La leccion anterior esta completada (o es la primera) → 400 si no.

**Flujo post-validacion:**
1. UPSERT en `learning_course_progress` (idempotente por unique constraint).
2. Contar lecciones completadas vs totales.
3. Devolver progreso.

**Response:**

```json
{
  "ok": true,
  "lesson_completed": true,
  "course_completed": false,
  "completed_lessons": 2,
  "total_lessons": 3
}
```

---

## 4. Decisiones tecnicas tomadas

### Algoritmo de seleccion

| Decision | Motivo |
|----------|--------|
| Pesos dinamicos en vez de cooldown fijo | Permite iterar ajustando constantes sin cambiar estructura |
| Calculo en memoria (JS) | Con 40-200 preguntas en MVP, es instantaneo. Evita queries complejas en SQL |
| Historial completo en una query | Una sola query en vez de N. Viable en MVP |
| Primera pregunta siempre test_classic | Formato mas familiar, reduce friccion al empezar |

### Timezone

| Decision | Motivo |
|----------|--------|
| El cliente envia su timezone | Permite saber en que dia local cayo la sesion |
| Fallback a UTC si timezone invalida | Mejor completar con timezone incorrecto que bloquear |
| Rango de dia en vez de fecha simple | Evita edge cases cerca de medianoche |

### Seguridad

| Decision | Motivo |
|----------|--------|
| Sanitizar contenido antes de enviar | El cliente nunca ve respuestas correctas hasta completar |
| Fisher-Yates para desordenar | Garantiza permutacion uniformemente aleatoria |
| Verificacion server-side | El backend es fuente de verdad, no confiar en el cliente |
| selected_answer invalido = incorrecta | Sin error explicito. Evita dar informacion a un atacante |

### Rachas y multiplicador

| Decision | Motivo |
|----------|--------|
| Modulo de aprendizaje no toca `players.elo_rating` | El elo global no debe verse alterado por lecciones. En el futuro las lecciones modificaran un desglose por area (tecnica/tactica/fisico/mental), aun no implementado. |
| Multiplicador aplicado al XP de la leccion | Coherente: la misma fuente de verdad que en partidos, Coach IA y Season Pass. El usuario ve el bonus crecer en la misma sesion que sube su racha. |
| Multiplicador calculado sobre racha **post-update** | Si hoy es el dia 3, el bonus 0.5 ya se aplica a la leccion de hoy, no a la siguiente. |
| Sin endpoint HTTP `/multiplier/:playerId` | Todos los consumidores estan en el mismo backend. Importan `getMultiplier` / `getPlayerStreakMultiplier` directamente. Menos superficie HTTP. |
| Timezone del request en cada update de racha | Sin columna nueva en `learning_streaks`. Si el usuario viaja, la racha sigue su telefono. |
| `GET /streak` no resetea la racha | Lectura pura. La evaluacion de "ayer/gap" solo ocurre al completar la siguiente leccion. El cliente puede pintar "racha en peligro" comparando `last_lesson_completed_at` con su dia local. |
| Reset lazy para rachas compartidas | Sin cron job. Al leer o actualizar una racha compartida se compara `last_both_completed_at` con la fecha actual. Si hay gap > 1 dia se resetea todo; si es ayer se resetean solo las flags. |
| Normalizar par de UUIDs (menor primero) | Garantiza unicidad en la tabla. `normalizePair(a, b)` ordena lexicograficamente para evitar duplicados (A,B) vs (B,A). |

### Cursos

| Decision | Motivo |
|----------|--------|
| Rango de elo (`elo_min`, `elo_max`) en vez de solo minimo | Permite segmentar cursos por nivel. Un curso de "fundamentos" no deberia aparecer como disponible para un jugador avanzado |
| Cursos fuera de rango aparecen como `locked` (no ocultos) | El jugador sabe que existen y puede aspirar a desbloquearlos. Mejor UX que ocultarlos |
| Validacion de nivel en backend (403) | El frontend muestra locked, pero la validacion real esta en el servidor para evitar trampas |
| Lecciones secuenciales | No se puede completar leccion N sin haber completado N-1. Garantiza progresion pedagogica |
| Upsert en progreso | Completar una leccion ya completada es idempotente (no duplica filas por unique constraint) |
| Detalle de curso bloqueado sin lecciones | No exponer contenido (video_url, descripciones) a jugadores sin acceso |

---

## 5. Diferencias entre plan e implementacion

Puntos donde el codigo actual difiere del plan (`PLAN_DESARROLLO_MODULO_APRENDIZAJE.md`):

| Aspecto | Plan | Codigo | Impacto |
|---------|------|--------|---------|
| Multiplicador para otros modulos | `GET /learning/multiplier/:playerId` | Funciones exportadas (`getMultiplier`, `getPlayerStreakMultiplier`) para uso intra-backend, sin HTTP | Positivo — menos superficie publica, sin perdida funcional |
| `players.elo_rating` desde lecciones | El plan original lo modificaba al completar | Eliminado: el modulo de aprendizaje no toca elo en ningun momento | Cambio de scope. En el futuro las lecciones modificaran un desglose del nivel por area, aun no implementado |
| Acceso a cursos | Plan original: solo `level_required` (minimo) | Rango `[elo_min, elo_max]`. Cursos fuera de rango aparecen como `locked`, no ocultos | Mejor segmentacion por nivel |

---

## 6. Issues conocidos

| # | Descripcion | Severidad |
|---|-------------|-----------|
| 1 | `selected_answer` no se valida por tipo — un valor incorrecto se cuenta como respuesta incorrecta sin informar al cliente | Baja (no es de seguridad, pero dificulta debugging en frontend) |
| 2 | Sin pruebas end-to-end automatizadas. Validacion via Postman manual. | Baja (proyecto sin tests todavia) |

---

## 7. Changelog

### Fase 1 — Infraestructura

- Creado `backend/db/019_learning_module.sql` con 8 tablas y sus indices.
- Ejecutado SQL en Supabase.
- Creado `backend/src/routes/learning.ts` con router base.
- Registrado router en `backend/src/routes/index.ts` bajo `/learning`.

### Fase 2 — Lecciones diarias

- Implementado `getPlayerFromAuth` — busca jugador por `auth_user_id`.
- Implementado algoritmo de seleccion con 5 componentes de peso:
  - `bonusFallada` (0/25/50)
  - `bonusNovedad` (0/40)
  - `bonusTiempo` (0-30)
  - `penalizacionNivel` (0-80)
  - `penalizacionRepeticion` (0-60)
- Implementado `selectQuestions` con reglas de variedad (primera test_classic, no tipos consecutivos).
- Implementado `sanitizeContent` para los 5 tipos (incluyendo Fisher-Yates para match_columns y order_sequence).
- Implementado `checkAnswer` y `getCorrectAnswer` para los 5 tipos.
- Implementado `timePenalty` y `computeEloDelta` (este ultimo eliminado posteriormente).
- Implementado helpers de timezone: `getTodayRange` y `localToUtc` (reescritos posteriormente).
- Implementado `GET /learning/daily-lesson`.
- Implementado `POST /learning/daily-lesson/complete`.
- Documentadas rutas en `backend/API.md`.
- Verificado: TypeScript compila sin errores.

### Fase 2.5 — Limpieza ELO + endurecimiento del algoritmo y timezone

- **Eliminada toda la actualizacion de elo desde el modulo.** Quitada `computeEloDelta`, quitada la escritura `players.elo_rating` / `elo_last_updated_at`, quitadas las columnas `elo_before` / `elo_after` de `learning_sessions` (SQL + ALTER manual en Supabase). El modulo de aprendizaje ya no toca el elo del jugador.
- **Algoritmo de seleccion completado** segun spec: regla "incluir al menos 2 areas distintas" + fallback "ampliar rango si <5 disponibles" + shuffle final del orden (slot 0 fijo en `test_classic`).
- **Helpers de timezone reescritos**: `localToUtc` ad-hoc reemplazado por `formatInTimeZone` + `zonedTimeToUtc` con doble pasada. Soporta DST y offsets fraccionarios (India UTC+5:30, Nepal UTC+5:45). Extraido `dayKeyInTz` reutilizable.

### Fase 3 (parcial) — Racha individual + multiplicador

- Helpers nuevos: `dayKeyInTz`, `previousDayKey`, `getMultiplier` (exportada), `getPlayerStreakMultiplier` (exportada para uso intra-backend), `updateIndividualStreak`.
- `POST /daily-lesson/complete` extendido: tras insertar el log, llama a `updateIndividualStreak`, calcula el multiplicador sobre la racha post-update y aplica el bonus al XP antes de insertar la sesion. Response incluye bloque `streak: { current, longest, multiplier, xp_base, xp_bonus }`.
- `GET /learning/streak`: lectura pura de la racha + multiplicador del usuario autenticado. No evalua ni resetea.
- **No hay endpoint `/learning/multiplier/:playerId`**: en su lugar, `getMultiplier` y `getPlayerStreakMultiplier` se exportan desde `learning.ts` para uso intra-backend desde `matches.ts`, futuro Coach IA, futuro Season Pass. Menos superficie HTTP, sin perder funcionalidad.
- Verificado: TypeScript compila sin errores.

### Fase 3.5 — Rachas compartidas

- Helpers nuevos: `normalizePair` (ordena UUIDs para unicidad), `lazyResetSharedStreak` (reset lazy sin cron), `updateSharedStreaks` (marca flags y avanza racha al completar leccion).
- `POST /daily-lesson/complete` extendido: tras la racha individual, llama a `updateSharedStreaks` y devuelve `shared_streaks` en la response.
- `GET /learning/shared-streaks`: lectura de rachas compartidas con info del companero (nombre, avatar). Aplica reset lazy en cada lectura.
- `POST /learning/shared-streaks`: crear racha compartida. Valida existencia del partner, que no sea uno mismo, y que no haya duplicado (par normalizado).
- Verificado: TypeScript compila sin errores.

### Fase 4 — Cursos (endpoints de jugador)

- Renombrada columna `level_required` → `elo_min` en `learning_courses`. Anadida columna `elo_max` (default 7). Los cursos ahora tienen un rango de elo para acceso.
- Helper `isCourseLocked(elo, eloMin, eloMax)` — determina si el jugador tiene acceso al curso.
- `GET /learning/courses`: lista todos los cursos activos con progreso del jugador y campo `locked`. Queries batch (no N+1).
- `GET /learning/courses/:id`: detalle con lecciones y estado (completed/available/locked). Si el curso esta bloqueado, devuelve info basica sin lecciones.
- `POST /learning/courses/:id/complete-lesson`: marca leccion como completada. Valida nivel (403), pertenencia de leccion al curso (400), y orden secuencial (400). Upsert idempotente.
- Documentadas rutas en `backend/API.md`.
- Testeado con curl: 12 tests (lista, detalle desbloqueado/bloqueado, complete-lesson con validaciones, edge cases). 12/12 PASS.
- Verificado: TypeScript compila sin errores.
