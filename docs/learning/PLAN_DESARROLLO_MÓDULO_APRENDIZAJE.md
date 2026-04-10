# Plan de Desarrollo — Módulo de Aprendizaje (Backend)

> Documento de referencia para la implementación. Backend primero, frontend después.
> Última actualización: 2026-03-30

---

## Índice

1. [Scope del MVP](#1-scope-del-mvp)
2. [Tablas de base de datos](#2-tablas-de-base-de-datos)
3. [Algoritmo de selección de preguntas](#3-algoritmo-de-selección-de-preguntas)
4. [Rutas del backend](#4-rutas-del-backend)
5. [Lógica de negocio detallada](#5-lógica-de-negocio-detallada)
6. [Orden de implementación](#6-orden-de-implementación)
7. [Frontend (planificación general)](#7-frontend-planificación-general)

---

## 1. Scope del MVP

### Incluido

- **Lecciones diarias**: 5 preguntas seleccionadas por algoritmo, registro de resultados, puntuación y XP.
- **Cursos digitales**: CRUD para clubes, listado para jugadores, progreso por lección.
- **Rachas**: individual y compartida, con multiplicador de nivel.
- **Herramienta de creación**: clubes crean preguntas y cursos desde web-app y mobile.

### Excluido (decisiones tomadas)

| Feature | Motivo |
|---------|--------|
| Badges / insignias | Se gestionarán en un sistema global, fuera de este módulo |
| Objetivos semanales | Irán en el módulo "Coach IA" |
| Generación por IA | MVP es manual |
| Tipos de pregunta zona_impacto / selección_múltiple | V2 |
| Certificación integrada con reservas | V2 |

---

## 2. Tablas de base de datos

Archivo a crear: `backend/db/014_learning_module.sql`

Se ejecuta manualmente en el SQL Editor de Supabase (patrón del proyecto).

### 2.1 `learning_questions` — Pool de preguntas

```sql
create table if not exists public.learning_questions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('test_classic', 'true_false', 'multi_select', 'match_columns', 'order_sequence')),
  level numeric not null default 1.0,
  area text not null check (area in ('technique', 'tactics', 'physical', 'mental_vocabulary')),
  has_video boolean not null default false,
  video_url text,
  content jsonb not null,
  created_by_club uuid references public.clubs(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_lq_active_level on public.learning_questions(is_active, level);
create index if not exists idx_lq_club on public.learning_questions(created_by_club);
create index if not exists idx_lq_type on public.learning_questions(type);
```

**Formato del campo `content` según tipo:**

- `test_classic`: `{ "question": str, "options": [str x4], "correct_index": 0-3, "video_pause_at": int|null }`
- `true_false`: `{ "statement": str, "correct_answer": bool }`
- `multi_select`: `{ "question": str, "options": [str x4], "correct_indices": [int x2-3] }`
- `match_columns`: `{ "pairs": [{ "left": str, "right": str } x3-5] }`
- `order_sequence`: `{ "steps": [str x3-6] }`

### 2.2 `learning_question_log` — Historial de respuestas

```sql
create table if not exists public.learning_question_log (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  question_id uuid not null references public.learning_questions(id) on delete cascade,
  answered_correctly boolean not null,
  response_time_ms integer not null,
  answered_at timestamptz not null default now()
);

create index if not exists idx_lql_player on public.learning_question_log(player_id);
create index if not exists idx_lql_player_question on public.learning_question_log(player_id, question_id);
create index if not exists idx_lql_player_date on public.learning_question_log(player_id, answered_at);
```

### 2.3 `learning_sessions` — Registro de sesiones completadas

> No está explícita en el PRD pero es necesaria para:
> - Saber si el usuario ya completó la lección del día (rachas).
> - Registrar la puntuación total de la sesión.
> - Calcular XP de la sesión.
>
> **Nota:** El módulo de aprendizaje no modifica `players.elo_rating`. En el futuro, las lecciones diarias modificarán levemente un desglose del nivel por área (técnica, táctica, físico, mental) que aún no existe en el proyecto.

```sql
create table if not exists public.learning_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  correct_count integer not null,
  total_count integer not null default 5,
  score integer not null,
  xp_earned integer not null,
  timezone text not null default 'UTC',
  completed_at timestamptz not null default now()
);

create index if not exists idx_ls_player_date on public.learning_sessions(player_id, completed_at);
```

**¿Por qué `timezone`?** El cliente envía su timezone al completar la sesión. Esto permite saber en qué "día local" del usuario cayó la sesión, lo cual es crítico para el cálculo de rachas.

### 2.4 `learning_courses` — Cursos digitales

```sql
create table if not exists public.learning_courses (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references public.clubs(id) on delete set null,
  title text not null,
  description text,
  banner_url text,
  level_required numeric not null default 0,
  pedagogical_goal text,
  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_lc_status on public.learning_courses(status);
create index if not exists idx_lc_club on public.learning_courses(club_id);
create index if not exists idx_lc_level on public.learning_courses(level_required);
```

### 2.5 `learning_course_lessons` — Lecciones dentro de un curso

```sql
create table if not exists public.learning_course_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.learning_courses(id) on delete cascade,
  "order" integer not null,
  title text not null,
  description text,
  video_url text,
  duration_seconds integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_lcl_course on public.learning_course_lessons(course_id, "order");
```

### 2.6 `learning_course_progress` — Progreso del jugador en un curso

```sql
create table if not exists public.learning_course_progress (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  lesson_id uuid not null references public.learning_course_lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (player_id, lesson_id)
);

create index if not exists idx_lcp_player on public.learning_course_progress(player_id);
```

### 2.7 `learning_streaks` — Racha individual

```sql
create table if not exists public.learning_streaks (
  player_id uuid primary key references public.players(id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_lesson_completed_at timestamptz
);
```

### 2.8 `learning_shared_streaks` — Rachas compartidas

```sql
create table if not exists public.learning_shared_streaks (
  id uuid primary key default gen_random_uuid(),
  player_id_1 uuid not null references public.players(id) on delete cascade,
  player_id_2 uuid not null references public.players(id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  player1_completed_today boolean not null default false,
  player2_completed_today boolean not null default false,
  last_both_completed_at timestamptz,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  constraint chk_different_players check (player_id_1 <> player_id_2),
  unique (player_id_1, player_id_2)
);

create index if not exists idx_lss_player1 on public.learning_shared_streaks(player_id_1);
create index if not exists idx_lss_player2 on public.learning_shared_streaks(player_id_2);
```

### Diagrama de relaciones

```
players
  │
  ├── learning_question_log ──→ learning_questions ←── clubs
  │
  ├── learning_sessions
  │
  ├── learning_course_progress ──→ learning_course_lessons ──→ learning_courses ←── clubs
  │
  ├── learning_streaks
  │
  └── learning_shared_streaks (player_id_1 + player_id_2)
```

---

## 3. Algoritmo de selección de preguntas

El algoritmo vive íntegramente en el backend. El cliente solo llama a `GET /learning/daily-lesson` y recibe las 5 preguntas ya seleccionadas.

### 3.1 Filosofía

No usar un cooldown fijo. En su lugar, un sistema de **peso dinámico** que evalúa cada pregunta candidata y le asigna una puntuación. Las 5 preguntas con mayor peso se seleccionan, respetando las reglas de variedad.

### 3.2 Variables que afectan el peso de una pregunta

Para cada pregunta candidata `q` y el usuario `u`:

| Variable | Cómo se obtiene | Efecto |
|----------|----------------|--------|
| **Distancia de nivel** | `abs(q.level - u.elo_rating)` | Penaliza preguntas muy lejos del nivel del usuario |
| **Veces respondida** | `count(log WHERE question_id = q.id AND player_id = u.id)` | A más veces respondida, menos peso |
| **Última vez respondida** | `max(answered_at) WHERE question_id = q.id AND player_id = u.id` | Más días desde la última vez → más peso |
| **Ratio de acierto** | `correctas / total` para esa pregunta por ese usuario | Afecta según el caso (ver abajo) |
| **Fue fallada alguna vez** | `exists(log WHERE answered_correctly = false)` | Prioridad para refuerzo |

### 3.3 Cálculo del peso

```
peso(q, u) = peso_base
           + bonus_fallada(q, u)
           + bonus_novedad(q, u)
           + bonus_tiempo(q, u)
           - penalización_nivel(q, u)
           - penalización_repetición(q, u)
```

**Detalle de cada componente:**

```typescript
const PESO_BASE = 100;

// +50 si el usuario la falló alguna vez y no la ha acertado después.
// +25 si la falló pero luego la acertó (refuerzo parcial).
function bonusFallada(q, historial): number {
  if (!historial.length) return 0;
  const ultimaRespuesta = historial[historial.length - 1];
  const falloAlgunaVez = historial.some(h => !h.answered_correctly);
  if (!falloAlgunaVez) return 0;
  if (!ultimaRespuesta.answered_correctly) return 50;  // Falló la última vez
  return 25;  // Falló antes pero la última fue correcta
}

// +40 si el usuario nunca ha visto esta pregunta.
function bonusNovedad(q, historial): number {
  return historial.length === 0 ? 40 : 0;
}

// Cuántos días han pasado desde la última respuesta.
// Más días = más peso. Tope en 30 días.
function bonusTiempo(q, historial): number {
  if (!historial.length) return 30; // Nunca vista = máximo bonus tiempo
  const diasDesdeUltima = diasEntre(historial[historial.length - 1].answered_at, ahora);
  return Math.min(diasDesdeUltima * 3, 30);
}

// Penaliza preguntas fuera del rango de nivel del usuario.
// 0 penalización si está dentro de ±0.5. Crece linealmente después.
function penalizaciónNivel(q, eloUsuario): number {
  const distancia = Math.abs(q.level - eloUsuario);
  if (distancia <= 0.5) return 0;
  return Math.min((distancia - 0.5) * 40, 80);
}

// A más veces respondida, menos interesante.
function penalizaciónRepetición(q, historial): number {
  return Math.min(historial.length * 8, 60);
}
```

### 3.4 Proceso completo de selección

```
1. FILTRAR: solo preguntas con is_active = true.

2. CARGAR HISTORIAL: para el usuario, obtener todos los registros
   de learning_question_log agrupados por question_id.

3. CALCULAR PESO: para cada pregunta activa, calcular peso(q, u).

4. ORDENAR: de mayor a menor peso.

5. SELECCIONAR 5 aplicando reglas de variedad:
   a. La primera pregunta es type = 'test_classic' si hay alguna
      con peso > 0 de ese tipo.
   b. No repetir el mismo tipo dos veces seguidas si hay alternativas.
   c. Intentar incluir al menos 2 áreas distintas.

6. Si hay menos de 5 preguntas disponibles:
   a. Ampliar el rango de nivel (ignorar penalización de nivel).
   b. Si aún hay menos de 5, devolver las que haya.

7. ALEATORIZAR el orden dentro del resultado final
   (excepto que la primera siga siendo test_classic).
```

### 3.5 Optimización de queries

Para no hacer N queries (una por pregunta), el enfoque es:

```sql
-- 1. Todas las preguntas activas (pool no debería superar miles en MVP)
SELECT id, type, level, area, has_video, video_url, content
FROM learning_questions
WHERE is_active = true;

-- 2. Todo el historial del usuario (una sola query)
SELECT question_id, answered_correctly, answered_at
FROM learning_question_log
WHERE player_id = $1
ORDER BY answered_at ASC;

-- 3. elo_rating del usuario
SELECT elo_rating FROM players WHERE id = $1;
```

Con esas 3 queries se tiene todo lo necesario para calcular pesos en memoria. En el MVP (40-200 preguntas), esto es instantáneo.

### 3.6 Evolución futura del algoritmo

El diseño por pesos permite iterar fácilmente:
- Ajustar constantes (PESO_BASE, multiplicadores) sin cambiar la estructura.
- Añadir nuevas variables (área menos practicada, rendimiento reciente).
- Eventualmente migrar a SM-2 o similar si se necesita repaso espaciado real.

---

## 4. Rutas del backend

Archivo: `backend/src/routes/learning.ts`

Registro en `backend/src/routes/index.ts`:
```typescript
import learningRouter from './learning';
router.use('/learning', learningRouter);
```

### 4.1 Autenticación

El router aplica `attachAuthContext` a nivel global. Se necesita un guard simple para rutas de jugador:

```typescript
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.authContext) {
    res.status(401).json({ ok: false, error: 'Token requerido' });
    return;
  }
  next();
}
```

Rutas de jugador → `requireAuth`
Rutas de creación de contenido → `requireClubOwnerOrAdmin`

### 4.2 Tabla de rutas

#### Lecciones diarias (jugador)

| Método | Ruta | Guard | Descripción |
|--------|------|-------|-------------|
| `GET` | `/learning/daily-lesson` | requireAuth | Devuelve 5 preguntas seleccionadas por el algoritmo |
| `POST` | `/learning/daily-lesson/complete` | requireAuth | Registra resultado de la sesión |

#### Cursos (jugador)

| Método | Ruta | Guard | Descripción |
|--------|------|-------|-------------|
| `GET` | `/learning/courses` | requireAuth | Lista cursos activos disponibles para el nivel del usuario |
| `GET` | `/learning/courses/:id` | requireAuth | Detalle de curso con lecciones y progreso del usuario |
| `POST` | `/learning/courses/:id/complete-lesson` | requireAuth | Marca lección como completada |

#### Rachas (jugador)

| Método | Ruta | Guard | Descripción |
|--------|------|-------|-------------|
| `GET` | `/learning/streak` | requireAuth | Racha individual del usuario + multiplicador activo |
| `GET` | `/learning/shared-streaks` | requireAuth | Rachas compartidas del usuario |
| `POST` | `/learning/shared-streaks` | requireAuth | Crear racha compartida (invitar a otro jugador) |

#### Herramienta de creación (club owner / admin)

| Método | Ruta | Guard | Descripción |
|--------|------|-------|-------------|
| `POST` | `/learning/questions` | requireClubOwnerOrAdmin | Crear pregunta |
| `PUT` | `/learning/questions/:id` | requireClubOwnerOrAdmin | Actualizar pregunta |
| `PATCH` | `/learning/questions/:id/deactivate` | requireClubOwnerOrAdmin | Desactivar pregunta |
| `GET` | `/learning/questions` | requireClubOwnerOrAdmin | Listar preguntas del club |
| `POST` | `/learning/courses` | requireClubOwnerOrAdmin | Crear curso (draft) |
| `PUT` | `/learning/courses/:id` | requireClubOwnerOrAdmin | Actualizar curso |
| `POST` | `/learning/courses/:id/lessons` | requireClubOwnerOrAdmin | Añadir lección a curso |
| `PUT` | `/learning/courses/:id/lessons/:lessonId` | requireClubOwnerOrAdmin | Actualizar lección |
| `DELETE` | `/learning/courses/:id/lessons/:lessonId` | requireClubOwnerOrAdmin | Eliminar lección |
| `POST` | `/learning/courses/:id/submit` | requireClubOwnerOrAdmin | Enviar a revisión |

#### Multiplicador (para consumo de otros módulos)

| Método | Ruta | Guard | Descripción |
|--------|------|-------|-------------|
| `GET` | `/learning/multiplier/:playerId` | requireAuth | Devuelve multiplicador de racha activo |

---

## 5. Lógica de negocio detallada

### 5.1 `GET /learning/daily-lesson`

```
1. Obtener player_id del usuario autenticado (via email en players).
2. Verificar si ya completó lección hoy (en su timezone).
   → Si sí: devolver { ok: true, already_completed: true, session: últimaSession }
   → Si no: continuar.
3. Ejecutar algoritmo de selección (sección 3).
4. Devolver las 5 preguntas con su contenido.
   IMPORTANTE: no enviar correct_index ni correct_answer al cliente.
   El cliente solo recibe las opciones/enunciado.
```

**Response:**
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
        "question": "¿Cuál es la posición correcta...?",
        "options": ["Opción A", "Opción B", "Opción C", "Opción D"]
        // SIN correct_index
      }
    }
  ]
}
```

### 5.2 `POST /learning/daily-lesson/complete`

**Request:**
```json
{
  "timezone": "Asia/Shanghai",
  "answers": [
    { "question_id": "uuid", "selected_answer": 2, "response_time_ms": 4500 },
    { "question_id": "uuid", "selected_answer": 0, "response_time_ms": 3200 },
    ...
  ]
}
```

**Proceso completo:**

```
1. VALIDAR: exactamente 5 respuestas, question_ids válidos, response_time_ms > 0.

2. CORREGIR: para cada respuesta, consultar la pregunta y verificar si es correcta.
   - test_classic: selected_answer === content.correct_index
   - true_false: selected_answer === content.correct_answer (0=false, 1=true)
   - multi_select: selected_answer es array de índices, comparar (ordenados) con content.correct_indices
   - match_columns: selected_answer es array de pares, comparar con content.pairs
   - order_sequence: selected_answer es array ordenado, comparar con content.steps

3. PUNTUAR:
   - Base por correcta: 100 puntos.
   - Penalización tiempo: si response_time_ms > 10000 → -30.
     Si entre 5000-10000 → proporcional entre 0 y -30.
     Si < 5000 → 0 penalización.
   - Puntuación sesión = suma de las 5.
   - XP = Math.round(puntuación / 10).

4. REGISTRAR en learning_question_log: una fila por pregunta.

5. REGISTRAR en learning_sessions: una fila con el resumen.

   NOTA: El módulo de aprendizaje no modifica players.elo_rating.
   En el futuro modificará un desglose por área (técnica/táctica/físico/mental)
   que aún no existe en el proyecto.

6. ACTUALIZAR RACHA INDIVIDUAL (learning_streaks):
   - Obtener last_lesson_completed_at.
   - Calcular "hoy" y "ayer" en la timezone del usuario.
   - Si last_lesson == hoy → ya contada, no hacer nada.
   - Si last_lesson == ayer → current_streak += 1.
   - Si last_lesson < ayer o null → current_streak = 1.
   - Actualizar longest_streak si current > longest.
   - Guardar last_lesson_completed_at = now().

7. ACTUALIZAR RACHAS COMPARTIDAS:
   - Buscar shared_streaks donde el jugador participa.
   - Marcar player_X_completed_today = true.
   - Si ambos completed_today → no hacer nada más (ya contada).
   - La lógica de incremento de racha compartida se ejecuta cuando
     el SEGUNDO jugador completa (ambos true).
     En ese momento: current_streak += 1, actualizar longest,
     guardar last_both_completed_at.

8. RESPONDER con resultados completos.
```

**Response:**
```json
{
  "ok": true,
  "session": {
    "id": "uuid",
    "correct_count": 3,
    "total_count": 5,
    "score": 370,
    "xp_earned": 37,
    "streak": {
      "current": 5,
      "longest": 12,
      "multiplier": 0.5
    }
  },
  "results": [
    {
      "question_id": "uuid",
      "correct": true,
      "correct_answer": 2,
      "points": 85
    },
    ...
  ]
}
```

### 5.3 Reset diario de rachas compartidas

Las banderas `player1_completed_today` y `player2_completed_today` deben resetearse cada día. Opciones:

**Opción elegida: Reset lazy (sin cron job).**

Al consultar o actualizar una racha compartida, el backend compara `last_both_completed_at` con la fecha actual en la timezone de la racha. Si ha pasado más de un día desde la última vez que ambos completaron, resetea las flags. Si nadie completó ayer, resetea la racha a 0.

Esto evita necesitar un cron job y funciona correctamente porque las flags solo importan cuando alguien interactúa.

### 5.4 `GET /learning/courses`

```
1. Obtener elo_rating del jugador.
2. SELECT de learning_courses WHERE status = 'active' AND level_required <= elo_rating.
3. Para cada curso, contar lecciones totales y lecciones completadas por el usuario.
4. Devolver con progreso.
```

**Response:**
```json
{
  "ok": true,
  "courses": [
    {
      "id": "uuid",
      "title": "Fundamentos del revés",
      "description": "...",
      "banner_url": "...",
      "level_required": 1.0,
      "club_name": "Club Padel Shanghai",
      "total_lessons": 6,
      "completed_lessons": 2,
      "is_completed": false
    }
  ]
}
```

### 5.5 `GET /learning/courses/:id`

```
1. Obtener curso con sus lecciones ordenadas por "order".
2. Obtener progreso del usuario (qué lecciones completó).
3. Determinar si el curso está completado (todas las lecciones hechas).
4. Marcar cada lección como completed/locked/available.
   - Lección 1: siempre available.
   - Lección N: available si lección N-1 está completed.
   - Resto: locked.
```

### 5.6 `POST /learning/courses/:id/complete-lesson`

**Request:**
```json
{
  "lesson_id": "uuid"
}
```

```
1. Verificar que la lección pertenece al curso.
2. Verificar que la lección anterior está completada (o es la primera).
3. Insertar en learning_course_progress (upsert por unique constraint).
4. Verificar si con esto se completa el curso entero.
5. Devolver progreso actualizado.
```

### 5.7 Multiplicador de racha

```typescript
function getMultiplier(currentStreak: number): number {
  if (currentStreak <= 2) return 0;
  if (currentStreak <= 7) return 0.5;
  if (currentStreak <= 20) return 1.0;
  if (currentStreak <= 45) return 1.5;
  return 2.0;
}
```

`GET /learning/multiplier/:playerId` devuelve este valor. El sistema de partidos puede llamar a esta ruta para obtener el multiplicador.

### 5.8 Creación de preguntas (`POST /learning/questions`)

```
1. Validar que el usuario es club owner del club indicado (o admin).
2. Validar type está en los 5 tipos permitidos.
3. Validar content según el tipo:
   - test_classic: question (string), options (array de 4 strings), correct_index (0-3).
   - true_false: statement (string), correct_answer (boolean).
   - multi_select: question (string), options (array de 4 strings), correct_indices (array de 2-3 ints, cada uno 0-3, sin duplicados).
   - match_columns: pairs (array de 3-5 objetos con left y right).
   - order_sequence: steps (array de 3-6 strings).
4. Validar level (numeric, >= 0).
5. Validar area está en los 4 valores permitidos.
6. Si has_video, validar video_url no vacío.
7. Insertar en learning_questions con created_by_club = club_id del owner.
```

### 5.9 Creación de cursos y lecciones

```
POST /learning/courses:
1. Validar campos obligatorios: title.
2. club_id se obtiene del authContext (primer club del owner).
3. Crear con status = 'draft'.

POST /learning/courses/:id/lessons:
1. Validar que el curso es del club del owner.
2. Validar que el curso está en draft.
3. Calcular order = max(order en ese curso) + 1.
4. Insertar lección.

POST /learning/courses/:id/submit:
1. Verificar que el curso tiene al menos 2 lecciones.
2. Cambiar status a 'pending_review'.
```

---

## 6. Orden de implementación

### Fase 1 — Infraestructura ✅ COMPLETADA

| # | Tarea | Estado |
|---|-------|--------|
| 1.1 | Crear SQL de tablas (`backend/db/014_learning_module.sql`) | ✅ Hecho |
| 1.2 | Ejecutar SQL en Supabase | ✅ Hecho |
| 1.3 | Crear `learning.ts` con router base + registro en `index.ts` | ✅ Hecho |

### Fase 2 — Lecciones diarias (core) ✅ COMPLETADA

| # | Tarea | Estado |
|---|-------|--------|
| 2.1 | Helper: `getPlayerFromAuth` (busca player por `auth_user_id`) | ✅ Hecho |
| 2.2 | Algoritmo de selección (pesos dinámicos, 5 componentes, reglas de variedad) | ✅ Hecho |
| 2.3 | `GET /learning/daily-lesson` (verifica si completó hoy por timezone, sanitiza respuestas) | ✅ Hecho |
| 2.4 | `POST /learning/daily-lesson/complete` (corrección por tipo, puntuación, XP, elo, log + sesión) | ✅ Hecho |
| 2.5 | Documentar rutas en `backend/API.md` | ✅ Hecho |

> TypeScript compila sin errores. Servidor arranca correctamente con `npm run dev`.

### Fase 3 — Rachas ✅ COMPLETADA

| # | Tarea | Estado |
|---|-------|--------|
| 3.1 | Lógica de racha individual (`updateIndividualStreak`, comparación por día local en tz del cliente) | ✅ Hecho |
| 3.2 | Integrar racha en `POST /complete` (multiplicador aplicado al XP antes de guardar la sesión) | ✅ Hecho |
| 3.3 | `GET /learning/streak` (racha + multiplicador, lectura pura) | ✅ Hecho |
| 3.4 | Multiplicador para otros módulos: en lugar de un endpoint HTTP, se exportan `getMultiplier(currentStreak)` y `getPlayerStreakMultiplier(playerId)` desde `learning.ts` para uso intra-backend (matches, Coach IA, Season Pass). Menos superficie HTTP. | ✅ Hecho |
| 3.5 | Rachas compartidas (CRUD + reset lazy) | ✅ Hecho |

### Fase 4 — Cursos ✅ COMPLETADA

| # | Tarea | Estado |
|---|-------|--------|
| 4.0 | Renombrar `level_required` → `elo_min`, añadir `elo_max` a `learning_courses` (rango de elo por curso, 0-7) | ✅ Hecho |
| 4.1 | `GET /learning/courses` (lista con progreso + locked por rango de nivel) | ✅ Hecho |
| 4.2 | `GET /learning/courses/:id` (detalle con lecciones y estado; sin lecciones si locked) | ✅ Hecho |
| 4.3 | `POST /learning/courses/:id/complete-lesson` (marcar progreso, validación de nivel y orden) | ✅ Hecho |

### Fase 5 — Herramienta de creación (club) ✅ COMPLETADA

| # | Tarea | Estado |
|---|-------|--------|
| 5.1 | CRUD de preguntas (POST, PUT, PATCH deactivate, GET list con filtros) | ✅ Hecho |
| 5.2 | CRUD de cursos (POST create draft, PUT update, POST/PUT/DELETE lessons, POST submit a revisión) | ✅ Hecho |

### Fase 6 — Testing y ajustes

| # | Tarea |
|---|-------|
| 6.1 | Probar flujo completo de lección diaria con Postman/curl |
| 6.2 | Probar algoritmo con distintos estados de historial |
| 6.3 | Probar rachas: día consecutivo, salto de día, primer día |
| 6.4 | Probar cursos: progreso, desbloqueo, completar |

---

## 7. Frontend (planificación general)

> No se desarrolla ahora. Se deja planificado para la siguiente fase.

### 7.1 Archivos a crear (mobile-app)

| Archivo | Propósito |
|---------|-----------|
| `api/learning.ts` | Funciones fetch para todas las rutas del backend |
| `hooks/useDailyLesson.ts` | Hook para obtener y gestionar la lección diaria |
| `hooks/useCourses.ts` | Hook para lista de cursos y progreso |
| `hooks/useStreak.ts` | Hook para racha individual |
| `screens/LearningHomeScreen.tsx` | Pantalla principal del módulo (hub) |
| `screens/DailyLessonScreen.tsx` | Pantalla de la lección: muestra preguntas una a una |
| `screens/LessonResultsScreen.tsx` | Pantalla de resultados post-lección |
| `screens/CoursesListScreen.tsx` | Lista de cursos disponibles |
| `screens/CourseDetailScreen.tsx` | Detalle de un curso con sus lecciones |
| `screens/CourseLessonScreen.tsx` | Reproducción de lección de video |
| `components/learning/QuestionCard.tsx` | Componente que renderiza una pregunta según su tipo |
| `components/learning/TestClassicQuestion.tsx` | Pregunta tipo test clásico |
| `components/learning/TrueFalseQuestion.tsx` | Verdadero/Falso |
| `components/learning/MatchColumnsQuestion.tsx` | Emparejar columnas |
| `components/learning/OrderSequenceQuestion.tsx` | Ordenar secuencia |
| `components/learning/StreakBadge.tsx` | Widget de racha con llama/número |
| `components/learning/CourseCard.tsx` | Card de curso para la lista |
| `components/learning/LessonProgress.tsx` | Barra de progreso de lecciones |

### 7.2 Archivos a crear (web-app — herramienta de clubes)

| Archivo | Propósito |
|---------|-----------|
| Página de gestión de preguntas | CRUD de preguntas con formulario según tipo |
| Página de gestión de cursos | CRUD de cursos, añadir/ordenar lecciones, subir vídeos |
| Traducciones `es/` y `zh/` | Claves i18n para la herramienta |

### 7.3 Navegación

- Añadir estados al `useState` de `MainApp.tsx` para las pantallas del módulo.
- El tab `competir` (vacío actualmente) es el punto de entrada natural.
- Flujo: Tab competir → LearningHome → DailyLesson → Results → LearningHome.

### 7.4 Estado local durante la lección

La pantalla `DailyLessonScreen` gestiona internamente:
- `currentQuestionIndex` (0-4)
- `answers[]` — respuestas del usuario con timestamps
- `startTime` por pregunta para calcular `response_time_ms`
- Al terminar las 5, hace POST /complete y navega a ResultsScreen.

---

*Fin del plan. Las decisiones pendientes del PRD (sección 10) que no se resuelven aquí quedan para el momento de implementación de cada feature.*
