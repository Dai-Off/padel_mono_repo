# Plan: Sección de Aprendizaje en Panel de Administración

## Contexto

El panel de admin (`/admin`) ya gestiona solicitudes de clubes con un flujo de aprobación/rechazo. Ahora necesita una sección de aprendizaje para: revisar cursos enviados por clubes, gestionar contenido propio de WeMatch, moderar contenido de todos los clubes, y ver estadísticas globales.

Los componentes del panel de club (QuestionsTab, QuestionFormModal, CoursesTab, CourseFormModal, CourseDetailModal, LessonFormModal) son reutilizables — toman `clubId` como prop sin dependencias club-específicas hardcodeadas.

---

## Arquitectura del panel de admin existente

- **Auth**: `authService.getMe()` → verifica `me.roles?.admin_id`, redirige si no es admin
- **Layout**: `AdminHeader` (sticky, backdrop blur) + contenido con `max-w-7xl mx-auto`
- **Navegación**: Botones en `AdminHeader` (ej: "Questions" → `/admin/questions`)
- **Modales**: Slide-in desde la derecha con Framer Motion
- **Filtros**: `TabSwitcher` con Framer Motion animated background
- **Estilos**: `rounded-2xl`, badges de status con colores semánticos, `text-[11px] font-bold text-gray-400 uppercase` para labels
- **Servicios**: Extienden `apiFetchWithAuth`, usan `requireAdmin` middleware en backend

---

## 1. Nuevos endpoints de backend

### 1.1 Cola de revisión de cursos

**`GET /admin/learning/pending-courses`** — `requireAdmin`
- Query: Supabase `learning_courses` con `status = 'pending_review'`, join con `clubs(name)` para nombre del club
- Incluir `lesson_count` (subquery a `learning_course_lessons`)
- Ordenar por `updated_at ASC` (los más antiguos primero)
- Respuesta: `{ ok: true, data: [{ id, club_id, club_name, title, description, elo_min, elo_max, staff_id, status, lesson_count, created_at, updated_at }] }`

**`GET /admin/learning/courses/:id`** — `requireAdmin`
- Misma lógica que `GET /club-courses/:id` pero sin verificar `canAccessClub`
- Devuelve curso completo con lecciones + nombre del club
- Respuesta: `{ ok: true, data: { ...course, club_name, lessons: [...] } }`

**`POST /admin/learning/courses/:id/approve`** — `requireAdmin`
- Valida que el curso esté en `pending_review`
- Cambia status a `active`, guarda `updated_at`
- Respuesta: `{ ok: true, data: { id, status: 'active' } }`

**`POST /admin/learning/courses/:id/reject`** — `requireAdmin`
- Body: `{ reason?: string }`
- Cambia status a `draft` (para que el club pueda editarlo y reenviarlo)
- Guarda el motivo en un campo `review_notes` (requiere añadir columna) o en una tabla de historial
- Respuesta: `{ ok: true, data: { id, status: 'draft' } }`

> **Decisión sobre rechazo**: Al rechazar, el curso vuelve a `draft` para que el club pueda corregirlo y reenviar. No usamos `inactive` para rechazos — `inactive` es para cursos que fueron activos y se desactivaron.

### 1.2 Moderación global

**`GET /admin/learning/courses`** — `requireAdmin`
- Query params: `status` (opcional, filtrar por status), `club_id` (opcional)
- Devuelve todos los cursos de todos los clubes con nombre del club
- Incluir `lesson_count`
- Respuesta: `{ ok: true, data: [...] }`

**`GET /admin/learning/questions`** — `requireAdmin`
- Query params: `club_id` (opcional), `type` (opcional), `area` (opcional), `is_active` (opcional)
- Devuelve todas las preguntas de todos los clubes con nombre del club
- Respuesta: `{ ok: true, data: [...] }`

**`PATCH /admin/learning/questions/:id/activate`** — `requireAdmin`
- Activa una pregunta de cualquier club (sin verificar `canAccessClub`)

**`PATCH /admin/learning/questions/:id/deactivate`** — `requireAdmin`
- Desactiva una pregunta de cualquier club

### 1.3 Estadísticas

**`GET /admin/learning/stats`** — `requireAdmin`
- Queries agregadas a `learning_courses`, `learning_questions`, `learning_course_lessons`
- Respuesta:
```json
{
  "ok": true,
  "data": {
    "total_questions": number,
    "active_questions": number,
    "total_courses": number,
    "active_courses": number,
    "pending_courses": number,
    "questions_by_club": [{ "club_id": string, "club_name": string, "count": number }],
    "courses_by_club": [{ "club_id": string, "club_name": string, "count": number }]
  }
}
```

### 1.4 Archivo de backend

Crear **`backend/src/routes/adminLearning.ts`** con todos los endpoints anteriores. Montarlo en el router principal con `requireAdmin` middleware.

Registrar en **`backend/src/routes/index.ts`** (o donde se monten las rutas) como `/admin/learning`.

### 1.5 Columna de base de datos

Añadir columna `review_notes TEXT` a `learning_courses` para almacenar el motivo de rechazo (opcional).

```sql
ALTER TABLE learning_courses ADD COLUMN review_notes text;
```

---

## 2. Archivos frontend a crear

### 2.1 Servicio admin de aprendizaje — `src/services/adminLearning.ts`

Servicio nuevo con todos los endpoints de admin:
- `getPendingCourses()` → GET `/admin/learning/pending-courses`
- `getCourseDetail(id)` → GET `/admin/learning/courses/${id}`
- `approveCourse(id)` → POST `/admin/learning/courses/${id}/approve`
- `rejectCourse(id, reason?)` → POST `/admin/learning/courses/${id}/reject`
- `listAllCourses(filters?)` → GET `/admin/learning/courses`
- `listAllQuestions(filters?)` → GET `/admin/learning/questions`
- `activateQuestion(id)` → PATCH `/admin/learning/questions/${id}/activate`
- `deactivateQuestion(id)` → PATCH `/admin/learning/questions/${id}/deactivate`
- `getStats()` → GET `/admin/learning/stats`

### 2.2 Tipos admin — `src/types/adminLearning.ts`

- `AdminCourse`: extiende `Course` con `club_name: string`
- `AdminCourseWithLessons`: extiende `CourseWithLessons` con `club_name: string, review_notes: string | null`
- `AdminQuestion`: extiende `Question` con `club_name: string`
- `LearningStats`: tipo para la respuesta de stats

### 2.3 Página principal — `src/components/Admin/Learning/AdminLearningPage.tsx`

Página contenedora con 4 tabs:
- **Revisión** (pendientes de revisión — badge con count)
- **WeMatch** (contenido propio)
- **Moderación** (contenido de todos los clubes)
- **Estadísticas**

Patrón: mismo que `AdminPanel.tsx` — auth check en useEffect, `AdminHeader` con botón "Volver" a `/admin`, `TabSwitcher` para las tabs.

### 2.4 Tab Revisión — `src/components/Admin/Learning/ReviewTab.tsx`

- Fetch: `adminLearningService.getPendingCourses()`
- Grid de tarjetas con: título, club_name, nº lecciones, fecha de envío
- Click en tarjeta → abre `ReviewDetailModal`
- Badge de count pendientes

### 2.5 Modal de revisión — `src/components/Admin/Learning/ReviewDetailModal.tsx`

- Slide-in desde la derecha (patrón de `ApplicationDetailModal`)
- Fetch: `adminLearningService.getCourseDetail(id)` → muestra curso + lecciones
- Acciones: Aprobar / Rechazar (con textarea para motivo)
- Modo rechazo con textarea (patrón exacto de `ApplicationDetailModal.rejectMode`)

### 2.6 Tab WeMatch — `src/components/Admin/Learning/WeMatchTab.tsx`

- Reutiliza directamente `QuestionsTab` y `CoursesTab` del panel de club
- Dos sub-tabs: "Preguntas" / "Cursos" (pills como en `LearningContentView`)
- Pasa `clubId` del club WeMatch (hardcodeado o config)
- Los cursos de WeMatch se aprueban directamente: después de submit, el admin llama a `approveCourse` automáticamente

### 2.7 Tab Moderación — `src/components/Admin/Learning/ModerationTab.tsx`

- Dos sub-tabs: "Preguntas" / "Cursos"
- **Sub-tab Preguntas**: 
  - Fetch: `adminLearningService.listAllQuestions(filters)`
  - Grid de tarjetas (read-only) con nombre del club, tipo, área, estado
  - Toggle activar/desactivar por pregunta
  - Filtros: club, tipo, área, estado
- **Sub-tab Cursos**:
  - Fetch: `adminLearningService.listAllCourses(filters)`
  - Grid de tarjetas con nombre del club, status badge, nº lecciones
  - Click → detalle read-only

### 2.8 Tab Estadísticas — `src/components/Admin/Learning/StatsTab.tsx`

- Fetch: `adminLearningService.getStats()`
- Cards con: total preguntas activas, total cursos activos, cursos pendientes
- Rankings simples: preguntas por club, cursos por club

---

## 3. Archivos a modificar

### 3.1 `src/App.tsx`
Nueva ruta:
```tsx
<Route path="/admin/learning" element={<ProtectedRoute><AdminLearningPage /></ProtectedRoute>} />
```

### 3.2 `src/components/Admin/AdminHeader.tsx`
Añadir botón "Aprendizaje" que navega a `/admin/learning` (como ya existe "Questions" → `/admin/questions`).

### 3.3 `src/components/Admin/AdminPanel.tsx`
Mostrar badge con count de cursos pendientes de revisión (opcional — puede ir solo en la sección de learning).

### 3.4 i18n — `src/locales/{es,en,zh}/files/common.json`
Nuevas claves con prefijo `admin_learning_`:
- Tabs: `admin_learning_review`, `admin_learning_wematch`, `admin_learning_moderation`, `admin_learning_stats`
- Acciones: `admin_learning_approve`, `admin_learning_reject`, `admin_learning_reject_reason`
- Mensajes: `admin_learning_approve_success`, `admin_learning_reject_success`, `admin_learning_no_pending`
- Stats: `admin_learning_total_questions`, `admin_learning_total_courses`, `admin_learning_pending_courses`
- Filtros: `admin_learning_filter_club`, `admin_learning_all_clubs`

---

## 4. Componentes reutilizados vs nuevos

### Reutilizados del panel de club (sin modificar):
| Componente | Uso en admin |
|---|---|
| `QuestionsTab` | Tab WeMatch — pasar `clubId` de WeMatch |
| `QuestionFormModal` | Crear/editar preguntas WeMatch |
| `CoursesTab` | Tab WeMatch — pasar `clubId` de WeMatch |
| `CourseFormModal` | Crear/editar cursos WeMatch |
| `CourseDetailModal` | Ver detalle de curso WeMatch |
| `LessonFormModal` | Gestionar lecciones WeMatch |

### Nuevos componentes admin:
| Componente | Propósito |
|---|---|
| `AdminLearningPage` | Página contenedora con tabs |
| `ReviewTab` | Cola de revisión de cursos pendientes |
| `ReviewDetailModal` | Detalle de curso + aprobar/rechazar |
| `WeMatchTab` | Wrapper que reutiliza componentes de club |
| `ModerationTab` | Vista global de contenido de todos los clubes |
| `StatsTab` | Panel de estadísticas |

---

## 5. Orden de implementación

| Fase | Qué | Archivos |
|------|-----|----------|
| **1** | Backend: endpoints admin de learning | `backend/src/routes/adminLearning.ts`, montar en router | HECHO |
| **2** | DB: columna review_notes | SQL en Supabase | HECHO |
| **3** | Frontend: servicio + tipos admin | `services/adminLearning.ts`, `types/adminLearning.ts` | HECHO |
| **4** | i18n | `locales/{es,en,zh}/files/common.json` | HECHO |
| **5** | Página + routing + header | `AdminLearningPage.tsx`, `App.tsx`, `AdminHeader.tsx` | HECHO |
| **6** | Cola de revisión (tab + modal) | `ReviewTab.tsx`, `ReviewDetailModal.tsx` | HECHO |
| **7** | Tab WeMatch | `WeMatchTab.tsx` | HECHO |
| **8** | Tab Moderación | `ModerationTab.tsx` | HECHO |
| **9** | Tab Estadísticas | `StatsTab.tsx` | HECHO |

---

## 6. Consideraciones técnicas

- **WeMatch club ID**: Necesita estar configurado como constante. Puede ser una variable de entorno `VITE_WEMATCH_CLUB_ID` o hardcodeado en el servicio admin. ¿Ya existe este club en la DB?
- **Auto-aprobación WeMatch**: Cuando un admin crea un curso de WeMatch y lo envía a revisión, llamar `approveCourse` automáticamente después del `submitCourse` (el admin es su propio revisor).
- **`requireAdmin` middleware**: Ya existe en `backend/src/middleware/requireAdmin.ts` — usarlo para todos los endpoints nuevos.
- **No mezclar estilos**: Los componentes reutilizados del club (QuestionsTab, etc.) tienen estilo de club (pills, `bg-white rounded-2xl`). En el contexto de admin esto es aceptable porque el admin panel también usa `rounded-2xl` y cards blancas. La única diferencia es que el admin panel usa modales slide-in desde la derecha — pero los modales de club (centrados) también funcionan bien.

---

## 7. Verificación

1. `cd backend && npx tsc --noEmit`
2. `cd web-app && npx tsc --noEmit && npx vite build`
3. Login como admin → ir a `/admin/learning`
4. Tab Revisión: ver cursos pendientes, aprobar uno, rechazar otro con motivo
5. Tab WeMatch: crear pregunta, crear curso con lecciones, verificar auto-aprobación
6. Tab Moderación: ver preguntas/cursos de todos los clubes, desactivar una pregunta
7. Tab Estadísticas: verificar que los números coinciden

---

## Archivos de referencia
- **Patrón admin page**: `src/components/Admin/AdminPanel.tsx`
- **Patrón admin modal (slide-in + approve/reject)**: `src/components/Admin/ApplicationDetailModal.tsx`
- **Patrón admin header**: `src/components/Admin/AdminHeader.tsx`
- **Patrón admin service**: `src/services/adminApplications.ts`
- **Middleware admin**: `backend/src/middleware/requireAdmin.ts`
- **Componentes reutilizables**: `src/components/Learning/`
