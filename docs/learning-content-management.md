# Gestión de Contenido de Aprendizaje

Herramienta para crear y gestionar preguntas de lecciones diarias y cursos digitales dentro de la plataforma WeMatch.

Dos interfaces:
- **Panel de club** (`/contenido-aprendizaje`) — para club owners
- **Panel de admin** (`/admin/learning`) — para administradores de WeMatch

---

## Panel de club

Accesible desde el menú lateral > "Escuela y competición" > "Contenido de aprendizaje".

### Preguntas de lecciones diarias

CRUD completo con filtros por tipo, área y estado (activa/inactiva).

**Tipos soportados:**
- Test clásico (4 opciones, 1 correcta)
- Verdadero / Falso
- Selección múltiple (4 opciones, 2-3 correctas)
- Emparejar columnas (3-5 pares)
- Ordenar secuencia (3-6 pasos)

**Áreas:** Técnica, Táctica, Físico, Mental/Vocabulario

**Nivel:** 0–7 con incrementos de 0.5

**Video:** Upload directo (drag & drop o click). Límite: 30MB, 15 segundos. Validación inmediata al seleccionar el archivo. Bucket Supabase: `learning-daily-lessons`.

**Toggle activar/desactivar:** Switch on/off funcional con endpoint de activación y desactivación.

### Cursos digitales

CRUD completo con flujo de publicación.

**Flujo de estados:**
```
draft → pending_review → active
         ↓ (rechazo)
        draft (con review_notes)
```

**Campos del curso:** Título, descripción, nivel mínimo/máximo (0–7, step 0.5, rango máximo 3 puntos), objetivo pedagógico, coach (vinculado a staff del club).

**Lecciones:** CRUD dentro del curso (solo en estado draft). Cada lección tiene título, descripción, duración y video opcional. Video: límite 300MB, 7 minutos. Bucket: `learning-courses`. Se requieren al menos 2 lecciones para enviar a revisión.

**Restricciones:** Los cursos solo son editables en estado `draft`. Una vez enviados a revisión o publicados, la interfaz es read-only.

---

## Panel de admin

Accesible desde `/admin` > botón "Aprendizaje".

### Cola de revisión
- Lista de cursos en estado `pending_review` de cualquier club
- Modal slide-in con detalle del curso y lecciones
- Acciones: Aprobar (→ `active`) / Rechazar (→ `draft` + motivo opcional guardado en `review_notes`)
- Badge con contador de pendientes

### Contenido WeMatch
- Reutiliza los componentes del panel de club (QuestionsTab, CoursesTab)
- Opera sobre el club "WeMatch" (ID: `ec0bc05c-f21b-465b-82b0-6bd75d1f4163`)
- Sub-tabs: Preguntas / Cursos

### Moderación
- Vista global de preguntas y cursos de todos los clubes
- Filtros: club, tipo, área, estado
- Toggle activar/desactivar preguntas de cualquier club
- Click en curso → detalle read-only (o con acciones si está en pending_review)

### Estadísticas
- Total preguntas activas / total
- Total cursos activos / total
- Cursos pendientes de revisión
- Rankings: top clubes por preguntas y por cursos

---

## Arquitectura técnica

### Endpoints backend

**Club** (requieren `requireClubOwnerOrAdmin`):

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/learning/questions?club_id=...` | Listar preguntas del club |
| POST | `/learning/questions` | Crear pregunta |
| PUT | `/learning/questions/:id` | Editar pregunta |
| PATCH | `/learning/questions/:id/activate` | Activar pregunta |
| PATCH | `/learning/questions/:id/deactivate` | Desactivar pregunta |
| GET | `/learning/club-courses?club_id=...` | Listar cursos del club |
| GET | `/learning/club-courses/:id` | Detalle de curso con lecciones |
| POST | `/learning/courses` | Crear curso |
| PUT | `/learning/courses/:id` | Editar curso (solo draft) |
| POST | `/learning/courses/:id/lessons` | Agregar lección |
| PUT | `/learning/courses/:id/lessons/:lessonId` | Editar lección |
| DELETE | `/learning/courses/:id/lessons/:lessonId` | Eliminar lección |
| POST | `/learning/courses/:id/submit` | Enviar a revisión |

**Admin** (requieren `requireAdmin`):

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/admin/learning/pending-courses` | Cursos pendientes de revisión |
| GET | `/admin/learning/courses/:id` | Detalle de curso (admin) |
| POST | `/admin/learning/courses/:id/approve` | Aprobar curso |
| POST | `/admin/learning/courses/:id/reject` | Rechazar curso |
| GET | `/admin/learning/courses` | Todos los cursos (filtros: status, club_id) |
| GET | `/admin/learning/questions` | Todas las preguntas (filtros: club_id, type, area, is_active) |
| PATCH | `/admin/learning/questions/:id/activate` | Activar pregunta (admin) |
| PATCH | `/admin/learning/questions/:id/deactivate` | Desactivar pregunta (admin) |
| GET | `/admin/learning/stats` | Estadísticas globales |

### Archivos clave

**Backend:**
- `backend/src/routes/learningClubQuestions.ts` — endpoints de preguntas (club)
- `backend/src/routes/learningClubCourses.ts` — endpoints de cursos (club)
- `backend/src/routes/adminLearning.ts` — endpoints admin

**Frontend — Panel de club:**
- `web-app/src/components/Learning/LearningContentView.tsx` — página principal
- `web-app/src/components/Learning/Questions/QuestionsTab.tsx` — listado de preguntas
- `web-app/src/components/Learning/Questions/QuestionFormModal.tsx` — crear/editar pregunta
- `web-app/src/components/Learning/Courses/CoursesTab.tsx` — listado de cursos
- `web-app/src/components/Learning/Courses/CourseFormModal.tsx` — crear/editar curso
- `web-app/src/components/Learning/Courses/CourseDetailModal.tsx` — detalle + lecciones
- `web-app/src/components/Learning/Courses/LessonFormModal.tsx` — crear/editar lección

**Frontend — Panel de admin:**
- `web-app/src/components/Admin/Learning/AdminLearningPage.tsx` — página principal
- `web-app/src/components/Admin/Learning/ReviewTab.tsx` — cola de revisión
- `web-app/src/components/Admin/Learning/ReviewDetailModal.tsx` — detalle + aprobar/rechazar
- `web-app/src/components/Admin/Learning/WeMatchTab.tsx` — contenido WeMatch
- `web-app/src/components/Admin/Learning/ModerationTab.tsx` — moderación global
- `web-app/src/components/Admin/Learning/StatsTab.tsx` — estadísticas

**Servicios y tipos:**
- `web-app/src/services/learningContent.ts` — servicio club + upload de video
- `web-app/src/services/adminLearning.ts` — servicio admin
- `web-app/src/types/learningContent.ts` — tipos de preguntas, cursos, lecciones
- `web-app/src/types/adminLearning.ts` — tipos admin

### Supabase Storage

| Bucket | Uso | Límites |
|--------|-----|---------|
| `learning-daily-lessons` | Videos de preguntas | 30MB, 15s |
| `learning-courses` | Videos de lecciones de cursos | 300MB, 7 min |

### Columnas añadidas a `learning_courses`

- `staff_id` (uuid, nullable, FK a `club_staff`) — coach del curso
- `review_notes` (text, nullable) — motivo de rechazo

### i18n

Claves en `web-app/src/locales/{es,en,zh}/files/common.json`:
- Prefijo `learning_*` — panel de club (~70 claves)
- Prefijo `admin_learning_*` — panel de admin (~30 claves)
