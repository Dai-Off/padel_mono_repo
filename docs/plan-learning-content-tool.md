# Plan: Herramienta de Gestión de Contenido de Aprendizaje (web-app)

## Contexto

El módulo de aprendizaje tiene endpoints backend listos para que club owners gestionen preguntas de lecciones diarias y cursos digitales (`POST/GET/PUT/PATCH /learning/questions`, `POST/PUT/DELETE /learning/courses`, etc.), pero la web-app no tiene ninguna UI para esto. Se necesita una nueva página standalone para gestionar este contenido.

---

## Decisión arquitectónica

**Página standalone** (como `PreciosView`), NO una tab dentro de `ClubDashboard`. La funcionalidad es compleja (2 secciones con CRUD completo + formularios dinámicos) y justifica su propia vista con tabs internas.

---

## 1. Archivos a crear

### 1.1 Tipos — `src/types/learningContent.ts`
- `QuestionType`: `'test_classic' | 'true_false' | 'multi_select' | 'match_columns' | 'order_sequence'`
- `QuestionArea`: `'technique' | 'tactics' | 'physical' | 'mental_vocabulary'`
- `CourseStatus`: `'draft' | 'pending_review' | 'active'`
- Interfaces de contenido por tipo: `TestClassicContent`, `TrueFalseContent`, `MultiSelectContent`, `MatchColumnsContent`, `OrderSequenceContent`
- `Question`: id, club_id, type, level, area, has_video, video_url, content, is_active, created_at
- `Course`: id, club_id, title, description, banner_url, elo_min, elo_max, pedagogical_goal, status, created_at
- `CourseLesson`: id, course_id, title, description, video_url, duration_seconds, sort_order

### 1.2 Servicio API — `src/services/learningContent.ts`
Patrón funcional (como `schoolCoursesService` en `src/services/schoolCourses.ts`) usando `apiFetchWithAuth` directo:
- `listQuestions(clubId, filters?)` → GET `/learning/questions?club_id=...&type=...&area=...&is_active=...`
- `createQuestion(body)` → POST `/learning/questions`
- `updateQuestion(id, body)` → PUT `/learning/questions/:id`
- `deactivateQuestion(id)` → PATCH `/learning/questions/:id/deactivate`
- `listCourses(clubId)` → GET `/learning/courses?club_id=...` **(endpoint nuevo, ver sección 1.3)**
- `createCourse(body)` → POST `/learning/courses`
- `updateCourse(id, body)` → PUT `/learning/courses/:id`
- `addLesson(courseId, body)` → POST `/learning/courses/:id/lessons`
- `updateLesson(courseId, lessonId, body)` → PUT `/learning/courses/:id/lessons/:lessonId`
- `deleteLesson(courseId, lessonId)` → DELETE `/learning/courses/:id/lessons/:lessonId`
- `submitCourse(courseId)` → POST `/learning/courses/:id/submit`

### 1.3 Endpoint backend nuevo — `backend/src/routes/learningClubCourses.ts`
**Problema**: El GET actual (`learningCourses.ts:200`) es para jugadores — solo devuelve cursos `active` con progreso del jugador. **No existe un endpoint para que el club owner liste sus cursos.**

**Solución**: Crear `GET /learning/courses` en `learningClubCourses.ts`:
- Middleware: `requireClubOwnerOrAdmin`
- Query param: `club_id` (obligatorio)
- Validación: `canAccessClub(req, club_id)`
- Devuelve todos los cursos del club (draft, pending_review, active) con count de lecciones
- Respuesta: `{ ok: true, data: [{ id, club_id, title, description, banner_url, elo_min, elo_max, pedagogical_goal, status, lesson_count, created_at, updated_at }] }`

> **Nota sobre conflicto de rutas**: Ambos routers (`learningCourses.ts` y `learningClubCourses.ts`) registran rutas bajo `/learning/courses`. El router de club usa `requireClubOwnerOrAdmin` y el de jugador usa `requireAuth`. Hay que verificar el orden de montaje en `learning.ts` para asegurar que no haya conflicto. Lo más probable es que se necesite un path diferenciado como `GET /learning/club-courses?club_id=X` o registrar el GET del club antes que el del jugador.

### 1.4 Página principal — `src/components/Learning/LearningContentView.tsx`
Patrón exacto de `PreciosView.tsx`:
- Estado: `isMenuOpen`, `loading`, `isAdmin`, `club`
- `useEffect` con `cancelled` flag → `authService.getMe()` → resolver club desde `me.clubs[0]`
- Layout: `PortalTealHeader` + `GrillaQuickNav` + `MainMenu`
- Dos tabs internas: **Preguntas** y **Cursos** (usando pills estilizadas como filtros existentes)
- Renderiza `QuestionsTab` o `CoursesTab` según tab activa

### 1.5 Componentes de Preguntas

**`src/components/Learning/Questions/QuestionsTab.tsx`**
- Props: `clubId: string`
- Fetch: `learningContentService.listQuestions(clubId, filters)`
- Filtros: tipo de pregunta, área, estado (activa/inactiva/todas) — usando pills como en `ClubPlayersTab`
- Grid de tarjetas (`bg-white rounded-2xl border border-gray-100`)
- Cada tarjeta muestra: badge de tipo, área, extracto del contenido, indicador activo/inactivo
- Botón "Nueva pregunta" (`bg-[#E31E24]` con icono `Plus` de lucide-react)
- Acciones por tarjeta: editar (abre modal), desactivar (confirmación + toast)

**`src/components/Learning/Questions/QuestionFormModal.tsx`**
- Modal crear/editar (`fixed inset-0 z-50 bg-black/40`)
- Campos comunes: type (select), level (number input), area (select), has_video (toggle), video_url (input condicional si has_video)
- Sección de contenido dinámica según tipo seleccionado:
  - `test_classic`: pregunta (textarea) + 4 opciones (inputs) + selector de respuesta correcta (radio)
  - `true_false`: enunciado (textarea) + toggle verdadero/falso
  - `multi_select`: pregunta (textarea) + 4 opciones (inputs) + checkboxes para seleccionar correctas (2-3)
  - `match_columns`: pares izquierda/derecha (inputs dinámicos con botones add/remove, 3-5 pares)
  - `order_sequence`: pasos ordenados (inputs dinámicos con add/remove, 3-6 pasos)
- Botones Cancel/Save con estilo existente

### 1.6 Componentes de Cursos

**`src/components/Learning/Courses/CoursesTab.tsx`**
- Props: `clubId: string`
- Fetch: `learningContentService.listCourses(clubId)`
- Grid de tarjetas con: título, descripción truncada, status badge (colores por estado), nº lecciones, rango ELO
- Botón "Nuevo curso"
- Click en tarjeta → abre `CourseDetailModal`

**`src/components/Learning/Courses/CourseFormModal.tsx`**
- Modal crear/editar datos básicos del curso
- Campos: title (input), description (textarea), banner_url (input), elo_min (select 0-7), elo_max (select 0-7), pedagogical_goal (textarea)
- Solo editable si `status === 'draft'`

**`src/components/Learning/Courses/CourseDetailModal.tsx`**
- Vista de detalle del curso con lista de lecciones
- Header con datos del curso + badge de status
- Lista de lecciones ordenadas por sort_order
- Cada lección muestra: título, descripción, video_url, duración formateada
- Acciones (solo si status es draft):
  - Editar datos del curso (abre `CourseFormModal`)
  - Editar lección (abre `LessonFormModal`)
  - Eliminar lección (confirmación + toast)
  - Agregar lección (abre `LessonFormModal` en modo crear)
  - Botón "Enviar a revisión" (solo si draft y >= 2 lecciones)
- Si no es draft: vista read-only

**`src/components/Learning/Courses/LessonFormModal.tsx`**
- Modal crear/editar una lección
- Campos: title (input), description (textarea), video_url (input), duration_seconds (number input, mostrar como minutos)

---

## 2. Archivos a modificar

### 2.1 `src/App.tsx`
Agregar ruta protegida:
```tsx
<Route path="/contenido-aprendizaje" element={<ProtectedRoute><LearningContentView /></ProtectedRoute>} />
```

### 2.2 `src/components/Layout/MainMenu.tsx`
Agregar item en la sección "Escuela y competición" (después de torneos, línea 73):
```tsx
{ id: 'contenido-aprendizaje', path: '/contenido-aprendizaje', icon: BookOpen, label: t('menu_learning_content'), color: 'rgb(99, 102, 241)', bgColor: 'rgba(99, 102, 241, 0.06)' }
```
Importar `BookOpen` de lucide-react.

### 2.3 `src/locales/es/files/common.json`
Agregar ~30 claves con prefijo `learning_`:

**Menú y navegación:**
- `menu_learning_content`: "Contenido de aprendizaje"
- `learning_tab_questions`: "Preguntas"
- `learning_tab_courses`: "Cursos"

**Tipos de pregunta:**
- `learning_type_test_classic`: "Test clásico"
- `learning_type_true_false`: "Verdadero / Falso"
- `learning_type_multi_select`: "Selección múltiple"
- `learning_type_match_columns`: "Emparejar columnas"
- `learning_type_order_sequence`: "Ordenar secuencia"

**Áreas:**
- `learning_area_technique`: "Técnica"
- `learning_area_tactics`: "Táctica"
- `learning_area_physical`: "Físico"
- `learning_area_mental_vocabulary`: "Mental / Vocabulario"

**Acciones:**
- `learning_add_question`: "Nueva pregunta"
- `learning_edit_question`: "Editar pregunta"
- `learning_add_course`: "Nuevo curso"
- `learning_edit_course`: "Editar curso"
- `learning_add_lesson`: "Agregar lección"
- `learning_edit_lesson`: "Editar lección"
- `learning_submit_review`: "Enviar a revisión"
- `learning_delete_lesson`: "Eliminar lección"

**Status:**
- `learning_status_draft`: "Borrador"
- `learning_status_pending_review`: "En revisión"
- `learning_status_active`: "Activo"

**Mensajes:**
- `learning_empty_questions`: "No hay preguntas creadas aún"
- `learning_empty_courses`: "No hay cursos creados aún"
- `learning_deactivate_confirm`: "¿Desactivar esta pregunta?"
- `learning_submit_confirm`: "¿Enviar curso a revisión? No podrás editarlo después."
- `learning_min_lessons_warning`: "El curso necesita al menos 2 lecciones para enviarse a revisión"
- `learning_delete_lesson_confirm`: "¿Eliminar esta lección?"

**Feedback:**
- `learning_save_success`: "Guardado correctamente"
- `learning_save_error`: "Error al guardar"
- `learning_deactivate_success`: "Pregunta desactivada"
- `learning_submit_success`: "Curso enviado a revisión"
- `learning_delete_success`: "Lección eliminada"

**Filtros:**
- `learning_filter_all_types`: "Todos los tipos"
- `learning_filter_all_areas`: "Todas las áreas"
- `learning_filter_active`: "Activas"
- `learning_filter_inactive`: "Inactivas"
- `learning_filter_all_status`: "Todas"

**Campos de formulario:**
- `learning_field_level`: "Nivel"
- `learning_field_area`: "Área"
- `learning_field_type`: "Tipo"
- `learning_field_video`: "Video"
- `learning_field_video_url`: "URL del video"
- `learning_field_question`: "Pregunta"
- `learning_field_statement`: "Enunciado"
- `learning_field_options`: "Opciones"
- `learning_field_correct_answer`: "Respuesta correcta"
- `learning_field_pair_left`: "Columna A"
- `learning_field_pair_right`: "Columna B"
- `learning_field_step`: "Paso"
- `learning_field_title`: "Título"
- `learning_field_description`: "Descripción"
- `learning_field_banner_url`: "URL del banner"
- `learning_field_elo_range`: "Rango ELO"
- `learning_field_pedagogical_goal`: "Objetivo pedagógico"
- `learning_field_duration`: "Duración (minutos)"

### 2.4 `src/locales/zh/files/common.json`
Mismas claves traducidas al chino simplificado.

### 2.5 `src/locales/en/files/common.json`
Mismas claves en inglés.

---

## 3. Orden de implementación

| Fase | Qué | Archivos | Estado |
|------|-----|----------|--------|
| **1** | Endpoint backend GET courses por club | `backend/src/routes/learningClubCourses.ts` | HECHO |
| **2** | Tipos + Servicio API frontend | `src/types/learningContent.ts`, `src/services/learningContent.ts` | HECHO |
| **3** | i18n (las 3 locales) | `src/locales/{es,en,zh}/files/common.json` | HECHO |
| **4** | Página shell + routing + menú | `src/components/Learning/LearningContentView.tsx`, `src/App.tsx`, `src/components/Layout/MainMenu.tsx` | HECHO |
| **5** | Tab de preguntas (listado + filtros) | `src/components/Learning/Questions/QuestionsTab.tsx` | HECHO |
| **6** | Modal de preguntas (crear/editar con contenido dinámico) | `src/components/Learning/Questions/QuestionFormModal.tsx` | HECHO |
| **7** | Tab de cursos (listado) | `src/components/Learning/Courses/CoursesTab.tsx` | HECHO |
| **8** | Modales de cursos y lecciones | `src/components/Learning/Courses/CourseFormModal.tsx`, `CourseDetailModal.tsx`, `LessonFormModal.tsx` | HECHO |

---

## 4. Consideraciones técnicas

- **PATCH**: `ApiServiceWithAuth` no tiene método `patch`. Para `deactivateQuestion` usar `apiFetchWithAuth` directo con `{ method: 'PATCH' }`.
- **GET /learning/courses por club (NO EXISTE)**: El GET actual (`learningCourses.ts:200`) es para jugadores — solo devuelve cursos `active` con progreso del jugador. **Hay que crear un nuevo endpoint** `GET /learning/courses?club_id=X` en `learningClubCourses.ts` que use `requireClubOwnerOrAdmin`, filtre por `club_id`, devuelva todos los status (draft, pending_review, active), e incluya el count de lecciones. Verificar conflicto de rutas con el GET existente del jugador.
- **Cursos no editables post-draft**: Deshabilitar UI de edición cuando `status !== 'draft'`. El backend ya protege, pero la UI debe reflejarlo visualmente.
- **Validación client-side antes de submit**: Verificar >= 2 lecciones antes de llamar `submitCourse`, mostrar `toast.error` si no se cumple.
- **Framer Motion**: Usar `motion.div` con `initial={{ opacity: 0 }} animate={{ opacity: 1 }}` en transiciones de tabs y aparición de tarjetas.

---

## 5. Verificación

1. Levantar backend (`cd backend && npm run dev`)
2. Levantar web-app (`cd web-app && npm run dev`)
3. Login como club owner
4. Navegar a `/contenido-aprendizaje` desde el menú lateral (sección "Escuela y competición")
5. **Preguntas**: crear una pregunta de cada tipo, editar alguna, desactivar, verificar filtros por tipo/área/estado
6. **Cursos**: crear un curso, agregar 2+ lecciones, editar lección, eliminar lección, enviar a revisión
7. Verificar que cursos en `pending_review`/`active` no permiten edición en la UI
8. Cambiar idioma a chino y verificar que todas las traducciones aparecen
9. Type-check: `cd web-app && npx tsc --noEmit`

---

## Archivos de referencia (patrones a seguir)
- **Patrón página standalone**: `src/components/Precios/PreciosView.tsx`
- **Patrón CRUD con modales y filtros**: `src/components/School/ClubSchoolTab.tsx`
- **Patrón servicio funcional**: `src/services/schoolCourses.ts`
- **Routing**: `src/App.tsx`
- **Menú lateral**: `src/components/Layout/MainMenu.tsx`
- **Endpoints backend**: `backend/src/routes/learningClubQuestions.ts`, `backend/src/routes/learningClubCourses.ts`
