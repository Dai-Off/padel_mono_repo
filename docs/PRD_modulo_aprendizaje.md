# WeMatch Padel — PRD Módulo de Aprendizaje
**Product Requirements Document · MVP**

> Documento vivo. Se actualiza durante el desarrollo a medida que se cierran decisiones o surgen nuevos requisitos.

---

## Índice

1. [Contexto y propósito](#1-contexto-y-propósito)
2. [Integración con el proyecto existente](#2-integración-con-el-proyecto-existente)
3. [Lecciones diarias](#3-lecciones-diarias)
4. [Cursos](#4-cursos)
5. [Engagement y retención](#5-engagement-y-retención)
6. [Perfil del jugador](#6-perfil-del-jugador)
7. [Herramienta de creación de contenido para clubes](#7-herramienta-de-creación-de-contenido-para-clubes)
8. [Internacionalización](#8-internacionalización)
9. [Fuera del alcance del MVP](#9-fuera-del-alcance-del-mvp)
10. [Decisiones pendientes y preguntas abiertas](#10-decisiones-pendientes-y-preguntas-abiertas)

---

## 1. Contexto y propósito

### ¿Qué es este documento?

Este PRD define los requisitos funcionales y técnicos del módulo de aprendizaje de WeMatch para su implementación en el MVP. Es el documento de referencia durante el desarrollo — ni tan cerrado como para no poder adaptarse, ni tan abierto como para generar ambigüedad.

No cubre diseño visual — ese trabajo vive en el Figma del proyecto.

### Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend mobile | React Native 0.81 + Expo 54 + TypeScript |
| Frontend web | React + Vite + TypeScript + Tailwind (panel de clubes) |
| Backend | Express 4 + TypeScript + Node.js |
| Base de datos | Supabase (PostgreSQL) — gestionado desde el dashboard web |
| Almacenamiento de vídeo | Supabase Storage. Optimizar para controlar costes. |
| Idiomas | Español (único idioma en mobile por ahora) |

### Flujo de datos — regla crítica

**La mobile app NO se comunica con Supabase directamente.** Todo el acceso a datos desde mobile pasa por el backend Express mediante `fetch()` con `Authorization: Bearer token`. Ver sección 2 para los patrones exactos.

La web app sí tiene cliente Supabase directo, pero solo para flujos de auth (reset password). El resto también va por el backend.

### Flujo de trabajo Git

- La rama `main` nunca se toca directamente.
- Todo el desarrollo activo ocurre en `develop`.
- Cada feature se desarrolla en su propia rama: `feature/nombre-feature` (ej: `feature/daily-lessons`, `feature/streak-system`).
- Las ramas de feature se fusionan a `develop` mediante pull request.

---

## 2. Integración con el proyecto existente

> **Esta sección es crítica.** Antes de escribir código para cualquier feature, revisar lo que ya existe. No crear nada que ya esté creado.

### 2.1 Arquitectura de la mobile app

La navegación es **manual con `useState`** — no usa React Navigation. Todo el árbol de pantallas vive en `MainApp.tsx`. Para añadir pantallas del módulo de aprendizaje hay que:

1. Añadir los nuevos estados de navegación al `useState` de `MainApp.tsx`.
2. Añadir los casos de renderizado condicional correspondientes.
3. Si se añade un tab nuevo, actualizar el tipo `TabId` y el array `TABS` en `BottomNavbar.tsx`.

El tab `competir` ya existe y está vacío — es el candidato natural para conectar el módulo de aprendizaje.

### 2.2 Patrón de autenticación

```typescript
// En cualquier pantalla o hook del módulo
import { useAuth } from '../contexts/AuthContext';

const { session } = useAuth();
const token = session?.access_token;
const userId = session?.user?.id;
```

Para obtener el ID del jugador (distinto del user ID de auth):

```typescript
import { fetchMyPlayerId } from '../api/players';

const playerId = await fetchMyPlayerId(token);
```

El campo de nivel del jugador en la base de datos se llama **`elo_rating`** en la tabla `players`.

### 2.3 Patrón de llamadas al backend

Todas las llamadas al backend siguen el patrón de `api/matches.ts`. Crear un archivo `api/learning.ts` (o `api/courses.ts`, `api/lessons.ts`) siguiendo exactamente este patrón:

```typescript
import { API_URL } from '../config';

export async function fetchCourses(token: string) {
  const res = await fetch(`${API_URL}/learning/courses`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json.courses ?? [];
}
```

### 2.4 Patrón de hooks de datos

Todos los hooks siguen el patrón de `useHomeStats.ts`:

```typescript
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function useCourses() {
  const { session } = useAuth();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    const data = await fetchCourses(session.access_token);
    setCourses(data);
    setLoading(false);
  }, [session?.access_token]);

  useEffect(() => { load(); }, [load]);

  return { courses, loading, reload: load };
}
```

### 2.5 Patrones de UI

- **Estilos:** `StyleSheet.create()` con valores del `theme.ts` para spacing y fontSize. Colores hardcodeados como en el resto del proyecto.
- **Color primario de marca:** `#E31E24`
- **Layout de pantalla:** todas las pantallas nuevas usan `ScreenLayout` + `BackHeader` (para pantallas de detalle) o el layout de tab (para pantallas principales).
- **Estados de carga:** usar `Skeleton.tsx` que ya existe.
- **Iconos:** `@expo/vector-icons` (Ionicons) — ya instalado.
- **Gradientes:** `expo-linear-gradient` — ya instalado.

### 2.6 Rutas del backend que ya existen

Antes de crear rutas nuevas, verificar estas:

| Ruta | Descripción |
|------|-------------|
| `GET /school-courses` | Lista cursos de escuela del club |
| `POST /school-courses` | Crear curso |
| `PUT /school-courses/:id` | Actualizar curso |
| `DELETE /school-courses/:id` | Eliminar curso |

**Verificar el contenido exacto de `backend/src/routes/schoolCourses.ts`** antes de definir nuevas rutas de cursos — puede que cubra parte de lo necesario o que haya que extenderlo.

### 2.7 Tablas de Supabase que ya existen

Verificadas en el código. Antes de crear tablas nuevas en el dashboard de Supabase, confirmar si estas ya cubren el caso:

| Tabla | Campos conocidos | Relevancia para el módulo |
|-------|-----------------|--------------------------|
| `players` | id, first_name, last_name, **elo_rating** | Nivel del jugador. `elo_rating` es el campo de nivel. |
| `clubs` | id, name, address, city | FK para contenido creado por clubes |
| `club_school_courses` | id, club_id, court_id, starts_on, ends_on, is_active | Puede ser la base para los cursos del módulo — **verificar campos completos en Supabase** |
| `club_school_course_days` | course_id, weekday, start_time, end_time | Relacionada con la anterior |

### 2.8 Checklist antes de empezar cada feature

- [ ] ¿He revisado si las rutas del backend que necesito ya existen?
- [ ] ¿He revisado si las tablas de Supabase que necesito ya existen?
- [ ] ¿He confirmado el nombre exacto de los campos que voy a leer?
- [ ] ¿He buscado en `components/` si el componente UI que necesito ya existe?
- [ ] ¿Estoy usando los valores de `theme.ts` para spacing y fontSize?
- [ ] ¿Estoy siguiendo el patrón de `api/*.ts` para las llamadas al backend?
- [ ] ¿Estoy usando `useAuth()` para obtener el token?

---

## 3. Lecciones diarias

El core del módulo. Cada lección diaria consiste en 5 preguntas seleccionadas por el algoritmo para el usuario en ese momento.

### 3.1 Estructura de datos — Pregunta

**Tabla nueva en Supabase: `learning_questions`**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid | Identificador único |
| `type` | text | `test_classic` \| `true_false` \| `match_columns` \| `order_sequence` |
| `level` | numeric | Nivel de dificultad (0.5, 1.0, 1.5…). Misma escala que `elo_rating` en `players`. |
| `area` | text | `technique` \| `tactics` \| `physical` \| `mental_vocabulary` |
| `has_video` | boolean | Si la pregunta tiene vídeo asociado |
| `video_url` | text | URL del vídeo en Supabase Storage. Null si no hay vídeo. |
| `content` | jsonb | Contenido según tipo (ver 3.2) |
| `created_by_club` | uuid | FK a `clubs.id`. Null si es contenido de WeMatch. |
| `is_active` | boolean | Las preguntas inactivas no aparecen en lecciones |
| `created_at` | timestamptz | |

> **Nota:** antes de crear esta tabla, verificar si `club_school_courses` o alguna tabla relacionada ya tiene una estructura de preguntas.

### 3.2 Tipos de pregunta — MVP

#### Test clásico (`test_classic`)

```json
{
  "question": "string",
  "options": ["string", "string", "string", "string"],
  "correct_index": 0,
  "video_pause_at": 12
}
```

#### Verdadero / Falso (`true_false`)

```json
{
  "statement": "string",
  "correct_answer": true
}
```

#### Empareja columnas (`match_columns`)

```json
{
  "pairs": [
    { "left": "string", "right": "string" },
    { "left": "string", "right": "string" },
    { "left": "string", "right": "string" }
  ]
}
```

Mínimo 3 pares, máximo 5. El orden se aleatoriza en cada sesión.

#### Ordena la secuencia (`order_sequence`)

```json
{
  "steps": ["string", "string", "string", "string"]
}
```

El orden se aleatoriza en cada sesión.

### 3.3 Flujo de una lección

#### Fase 1 — Preguntas

1. El backend selecciona 5 preguntas mediante el algoritmo (ver 3.5) y las devuelve al cliente.
2. El usuario ve la pregunta. Si tiene vídeo, se reproduce automáticamente y se pausa en `video_pause_at`.
3. El usuario responde. Flash verde (correcto) o rojo (incorrecto) de forma inmediata.
4. Las preguntas falladas se marcan localmente en el estado de la pantalla.
5. Se repite para las 5 preguntas.

#### Fase 2 — Pantalla de resultados

Al completar las 5 preguntas, se muestra la pantalla de resultados con:

- Puntuación de la sesión
- XP ganados
- Número de correctas sobre el total (ej. 3/5)
- Impacto en el nivel del jugador
- Estado de la racha activa y multiplicador vigente
- Lista de las 5 preguntas con indicador verde/rojo
- Opción de valorar cada pregunta (👍 / 👎) — opcional

**Botones de acción:**

- **Repasar fallos** (opcional): el usuario repite solo las preguntas falladas.
- **Continuar** (flujo principal): vuelve a la pantalla principal del módulo.

### 3.4 Puntuación y XP

| Concepto | Valor |
|----------|-------|
| Base por pregunta correcta | 100 puntos |
| Penalización por tiempo | Hasta –30 puntos. El contador NO es visible para el usuario. |
| Puntuación de sesión | Suma de las 5 preguntas. Máximo: 500. |
| XP ganados | `Math.round(puntuación / 10)` |
| Impacto en nivel | El backend calcula la variación de `elo_rating` y la devuelve en la respuesta. |

> El tiempo se registra en el cliente por pregunta. Se envía al backend como parte del resultado de la sesión.

### 3.5 Algoritmo de selección — MVP

El algoritmo vive en el **backend**. La mobile app llama a `GET /learning/daily-lesson` y recibe las 5 preguntas ya seleccionadas.

**Reglas (por orden de prioridad):**

1. Excluir preguntas respondidas correctamente en los últimos N días (cooldown). Valor de N: **pendiente de definir** — ver sección 10.
2. Priorizar preguntas falladas en sesiones anteriores (sin cooldown).
3. Seleccionar preguntas cuyo `level` esté en rango `elo_rating_usuario ± 0.5`.
4. Si no hay suficientes, ampliar el rango de nivel hasta completar 5.
5. La primera pregunta siempre es `test_classic` si hay disponible.
6. No repetir el mismo tipo dos veces seguidas si hay alternativas.

**Tabla nueva: `learning_question_log`**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid | |
| `player_id` | uuid | FK a `players.id` |
| `question_id` | uuid | FK a `learning_questions.id` |
| `answered_correctly` | boolean | |
| `response_time_ms` | integer | Tiempo de respuesta en milisegundos |
| `answered_at` | timestamptz | |

### 3.6 Rutas del backend para lecciones diarias

Nuevas rutas a crear en `backend/src/routes/learning.ts`:

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/learning/daily-lesson` | Devuelve las 5 preguntas seleccionadas para el usuario autenticado |
| `POST` | `/learning/daily-lesson/complete` | Registra el resultado de la sesión completa |

### 3.7 Pool de contenido inicial — MVP

- 40 preguntas creadas y validadas por el equipo WeMatch.
- 20 con vídeo, 20 sin vídeo.
- Distribuidas entre los 4 tipos del MVP.
- Nivel 0–1.

> **Costes de vídeo en Supabase Storage:** MP4 H.264, máximo 1080p, máximo 30 segundos. Evaluar comprimir en el cliente antes de subir.

---

## 4. Cursos

### 4.1 Relación con `school-courses` existente

El backend ya tiene rutas `/school-courses` y en Supabase existe la tabla `club_school_courses`. **Antes de diseñar tablas nuevas, verificar si esta estructura cubre los requisitos o si hay que extenderla.**

Si la estructura existente es insuficiente, se crearán tablas nuevas con el prefijo `learning_` para no colisionar.

### 4.2 Estructura de datos — Curso

**Tabla: `learning_courses`** (o extensión de `club_school_courses` — verificar primero)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid | |
| `club_id` | uuid | FK a `clubs.id`. Null si es contenido de WeMatch. |
| `title` | text | Título del curso en español |
| `description` | text | Descripción |
| `banner_url` | text | URL de portada en Supabase Storage |
| `level_required` | numeric | Nivel mínimo (`elo_rating`) para acceder |
| `pedagogical_goal` | text | Objetivo pedagógico |
| `status` | text | `draft` \| `pending_review` \| `active` \| `inactive` |
| `created_at` | timestamptz | |

**Tabla: `learning_course_lessons`**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid | |
| `course_id` | uuid | FK a `learning_courses.id` |
| `order` | integer | Posición en el curso. Empieza en 1. |
| `title` | text | |
| `description` | text | |
| `video_url` | text | URL en Supabase Storage |
| `duration_seconds` | integer | |

### 4.3 Desbloqueo de cursos

En el MVP: solo por nivel del jugador (`elo_rating >= level_required`).

### 4.4 Estados del curso

| Estado | Descripción |
|--------|-------------|
| `draft` | En creación. No visible para usuarios. |
| `pending_review` | Enviado a revisión por WeMatch. |
| `active` | Aprobado y visible. |
| `inactive` | Desactivado. |

### 4.5 Certificación — MVP

Al completar todas las lecciones de un curso, aparece el botón de certificación. Flujo simple en el MVP:

1. El usuario pulsa «Obtener certificación».
2. Pantalla informativa: es una sesión práctica, no un examen.
3. Se muestra información de contacto del club.
4. El usuario contacta al club por el canal disponible.

> **Fuera del MVP:** integración con el sistema de reservas.

### 4.6 Rutas del backend para cursos

Verificar primero qué hace `GET /school-courses`. Completar o crear según lo que falte:

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/learning/courses` | Lista cursos disponibles para el nivel del usuario |
| `GET` | `/learning/courses/:id` | Detalle de curso con sus lecciones |
| `POST` | `/learning/courses/:id/complete-lesson` | Marca una lección como completada |

---

## 5. Engagement y retención

### 5.1 Sistema de rachas

> **Importante:** verificar en Supabase si la tabla `players` ya tiene campos `current_streak`, `longest_streak` o `last_lesson_completed_at`. Si no existen, hay que añadirlos o crear una tabla separada `learning_streaks`.

#### Racha individual

La racha aumenta en 1 cada día que el usuario completa su lección diaria. Si no completa la lección en un día, vuelve a 0 en silencio — sin notificación pública.

**Campos necesarios** (en `players` o tabla nueva `learning_streaks`):

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `player_id` | uuid | FK a `players.id` |
| `current_streak` | integer | Días de racha actual |
| `longest_streak` | integer | Racha más larga histórica |
| `last_lesson_completed_at` | timestamptz | Timestamp de la última lección completada |

> La lección se considera completada cuando el usuario llega a la pantalla de resultados. El día se cuenta en UTC — **pendiente confirmar zona horaria**, ver sección 10.

#### Racha compartida

**Tabla nueva: `learning_shared_streaks`**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid | |
| `player_id_1` | uuid | FK a `players.id` |
| `player_id_2` | uuid | FK a `players.id` |
| `current_streak` | integer | |
| `longest_streak` | integer | |
| `player1_completed_today` | boolean | Se resetea a false al inicio de cada día |
| `player2_completed_today` | boolean | Se resetea a false al inicio de cada día |
| `last_both_completed_at` | timestamptz | |

> Si al final del día alguno de los dos sigue en false, la racha compartida vuelve a 0. La racha individual de cada uno se mantiene independiente.

### 5.2 Multiplicador de nivel por racha

El multiplicador se aplica a la ganancia de `elo_rating` en partidos. El sistema de partidos lee el multiplicador del jugador.

| Días de racha | Multiplicador |
|--------------|--------------|
| 1 – 2 días | Sin bonus |
| 3 – 7 días | ×0,5 |
| 8 – 20 días | ×1,0 |
| 21 – 45 días | ×1,5 |
| +45 días | ×2,0 (máximo) |

El multiplicador activo debe ser accesible desde el sistema de partidos — coordinar cómo se expone.

### 5.3 Objetivos semanales

Se asignan 3–4 objetivos semanales del pool siguiente. Se renuevan cada lunes a las 00:00.

| Objetivo | Condición |
|----------|-----------|
| Completar N lecciones esta semana | N configurable |
| Completar una lección con ≥80% | Al menos una sesión con esa puntuación |
| Avanzar en un curso activo | Completar al menos una lección de curso |
| Jugar un partido en el club | Requiere señal del sistema de partidos — **pendiente confirmar** |
| Crear una racha compartida | Invitar a otro usuario y completar el primer día |
| Mantener la racha 7 días seguidos | 7 días consecutivos en esa semana |

---

## 6. Perfil del jugador

### 6.1 Datos del módulo visibles en el perfil

| Dato | Origen |
|------|--------|
| Nivel global (`elo_rating`) | Tabla `players` — solo lectura |
| Racha individual activa | `learning_streaks` o campo en `players` |
| Racha compartida activa | `learning_shared_streaks` |
| Insignias obtenidas | `learning_badges` |
| Progreso de objetivos semanales | Calculado en tiempo real |

### 6.2 Insignias — MVP

**Tabla nueva: `learning_user_badges`**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid | |
| `player_id` | uuid | FK a `players.id` |
| `badge_id` | text | Identificador del tipo de insignia |
| `earned_at` | timestamptz | |

| `badge_id` | Condición |
|------------|-----------|
| `first_lesson` | Primera lección diaria completada |
| `streak_7` | Racha individual de 7 días |
| `streak_30` | Racha individual de 30 días |
| `first_course` | Primer curso completado |
| `shared_streak_start` | Primera racha compartida iniciada |

El diseño visual de cada insignia está en el Figma del proyecto.

---

## 7. Herramienta de creación de contenido para clubes

Disponible en:
- Vista de administrador de club en la **app móvil** (`mobile-app/`)
- **Panel web** del club (`web-app/`)

Sin IA en el MVP — todo manual.

### 7.1 Creación de pregunta para lección diaria

1. Subir vídeo (galería o cámara). Máximo 30 segundos. Formato MP4. Tamaño máximo: **pendiente definir**.
2. Elegir tipo de pregunta.
3. Rellenar enunciado, opciones y respuesta correcta.
4. Elegir nivel de dificultad.
5. Publicar — queda activa en el pool del algoritmo.

> Sin filtros automáticos en el MVP. Moderación manual.

### 7.2 Creación de curso

1. Título y descripción.
2. Banner (imagen).
3. Nivel mínimo requerido.
4. Añadir lecciones: título, descripción, vídeo. Mínimo 2 lecciones.
5. Enviar para revisión → estado `pending_review`.

### 7.3 Rutas del backend para la herramienta

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/learning/questions` | Crear pregunta de lección diaria |
| `PUT` | `/learning/questions/:id` | Actualizar pregunta |
| `PATCH` | `/learning/questions/:id/deactivate` | Desactivar pregunta |
| `POST` | `/learning/courses` | Crear curso (estado `draft`) |
| `PUT` | `/learning/courses/:id` | Actualizar curso |
| `POST` | `/learning/courses/:id/submit` | Enviar a revisión → `pending_review` |

---

## 8. Internacionalización

### Mobile app

**No hay sistema i18n en mobile.** Todo el texto está hardcodeado en español, igual que el resto de la app. El módulo de aprendizaje sigue el mismo patrón — textos en español directamente en el JSX.

```typescript
// ✅ Correcto — igual que el resto de la mobile app
<Text>Lección del día</Text>
<Text>Empezar lección</Text>

// ❌ No añadir i18next ni ningún sistema de traducción en mobile
```

### Web app (panel de clubes)

La web app sí usa `i18next` + `react-i18next`. Los textos de la herramienta de creación de contenido para clubes siguen el patrón existente:

```typescript
import { useTranslation } from 'react-i18next';
const { t } = useTranslation();
<Text>{t('learning.createQuestion')}</Text>
```

Añadir las claves en los archivos de `web-app/src/locales/es/` y `web-app/src/locales/zh/` siguiendo la estructura existente.

---

## 9. Fuera del alcance del MVP

| Funcionalidad | Nota |
|---------------|------|
| Generación automática de preguntas por IA | La herramienta es manual |
| Filtros automáticos de calidad de contenido | Moderación manual |
| Algoritmo SM-2 de repaso espaciado | Cooldown simple + prioridad de falladas |
| Detección de desequilibrios por área | El algoritmo no diferencia áreas en el MVP |
| Desbloqueo de cursos por actividad en el club | Solo por `elo_rating` |
| Hitos compartibles tipo Strava | V2 |
| Tipos de pregunta: zona de impacto, selección múltiple | V2 |
| Integración completa de certificación con reservas | V2 |
| Insignias de pista | V2 |
| i18n en mobile app | No existe en el proyecto — V2 si se implementa globalmente |

---

## 10. Decisiones pendientes y preguntas abiertas

| Pregunta | Contexto |
|----------|----------|
| ¿La tabla `players` ya tiene campos de racha? | Verificar en dashboard Supabase: `current_streak`, `longest_streak`, `last_lesson_completed_at` |
| ¿`club_school_courses` cubre la estructura de cursos del módulo? | Revisar campos completos en Supabase antes de crear `learning_courses` |
| ¿Qué hace exactamente `GET /school-courses`? | Leer `backend/src/routes/schoolCourses.ts` antes de crear rutas nuevas |
| Cooldown exacto para preguntas acertadas | Punto de partida sugerido: 7 días |
| Tamaño máximo de vídeo para subida | Definir en MB para controlar costes de Supabase Storage |
| Zona horaria para reset de racha y objetivos | ¿UTC o zona horaria del dispositivo? |
| ¿Cómo expone el sistema de partidos el evento «partido jugado»? | Necesario para el objetivo semanal correspondiente |
| ¿Cómo lee el sistema de partidos el multiplicador de racha? | Coordinar con el equipo el contrato de datos |
| Flujo de contacto del club para certificación | ¿WhatsApp, email, teléfono? ¿Qué datos del club están disponibles? |
| ¿El tab «competir» es el punto de entrada del módulo? | Confirmar con el equipo antes de modificar `BottomNavbar.tsx` |

---

*Última actualización: 2025 — Versión post-análisis del repositorio*
