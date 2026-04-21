# Analisis del Frontend — Modulo de Aprendizaje

> Fecha del analisis: 2026-04-16
> Alcance: mobile-app + web-app, solo frontend
> Referencia: `docs/learning/PLAN_DESARROLLO_MODULO_APRENDIZAJE.md`, seccion 7

---

## 1. Resumen ejecutivo

| Capa | Estado |
|------|--------|
| Backend | 18 endpoints implementados y testeados en `/learning/*` |
| Mobile-app | 5 archivos placeholder, 0 pantallas funcionales, 0 endpoints consumidos |
| Web-app | 0 archivos de learning (los de School son un modulo diferente) |
| Carpeta `components/learning/` | No existe (vacia) |

**Conclusion: el backend esta 100% listo pero el frontend no consume ninguno de sus endpoints. Todo lo visible en la app son placeholders estaticos.**

---

## 2. Inventario de archivos existentes

### 2.1 Mobile-app

| Archivo | Proposito | Conexion con API |
|---------|-----------|-----------------|
| `components/home/inicio/DailyLessonCard.tsx` | Tarjeta "Leccion diaria" en Home con gradiente naranja, dias de semana, boton "Empezar" | Ninguna. UI decorativa |
| `components/home/inicio/InicioQuickActions.tsx` | Grid de acciones rapidas. Incluye boton "Clases" | Ninguna. Boton sin funcionalidad |
| `screens/HomeScreen.tsx` | Pantalla principal. Renderiza DailyLessonCard e InicioQuickActions | No llama a endpoints de learning |
| `hooks/useHomeStats.ts` | Hook de estadisticas del home. Tiene campo `classesToday` | Hardcodeado a 0 |
| `api/home.ts` | Funcion `fetchHomeStats`. Tiene campo `classesToday` | Hardcodeado a 0 (linea 68) |

### 2.2 Web-app

**No existe ningun archivo de learning.** Los archivos de School son un modulo diferente:

| Archivo | Modulo | Relacion con learning |
|---------|--------|----------------------|
| `components/School/ClubSchoolTab.tsx` | School (clases presenciales) | NINGUNA |
| `features/grilla/components/SchoolCourseModal.tsx` | School | NINGUNA |
| `services/schoolCourses.ts` | School → `/school-courses` | NINGUNA |
| `types/schoolCourses.ts` | School | NINGUNA |

---

## 3. Problemas detectados

### P1 — DailyLessonCard navega a tab 'partidos'

- **Archivo:** `screens/HomeScreen.tsx`, linea 164
- **Codigo:** `<DailyLessonCard onPress={() => onNavigateToTab?.('partidos')} />`
- **Problema:** La tarjeta "Leccion diaria" lleva al usuario a la pantalla de partidos. No existe destino de learning.

### P2 — DailyLessonCard no recibe bonusText

- **Archivo:** `screens/HomeScreen.tsx`, linea 164
- **Problema:** La prop `bonusText` no se pasa. El componente muestra "Bonus: -" siempre. No hay hook ni API call que obtenga el multiplicador de racha (`GET /learning/streak`).

### P3 — Dias de semana en DailyLessonCard son placeholder estatico

- **Archivo:** `components/home/inicio/DailyLessonCard.tsx`, lineas 62-71
- **Problema:** Los 7 dias de la semana (L, M, X, J, V, S, D) muestran `DASH` ("-") hardcodeado. No hay integracion con el endpoint `GET /learning/streak` para mostrar actividad real de la semana.

### P4 — Boton "Clases" sin onPress

- **Archivo:** `components/home/inicio/InicioQuickActions.tsx`, linea 88
- **Codigo:** `<Pressable style={({ pressed }) => [styles.halfCard, pressed && styles.pressed]}>` (sin onPress)
- **Problema:** El boton "Clases" no es funcional. Los otros 3 botones (Buscar Partido, Pistas, Torneos) si tienen `onPress={() => onNavigateToTab?.(...)}`. El count muestra `DASH` siempre (linea 97).

### P5 — classesToday hardcodeado a 0

- **Archivo:** `api/home.ts`, linea 68
- **Codigo:** `classesToday: 0,`
- **Problema:** `fetchHomeStats` devuelve `classesToday: 0` como constante. No consulta ningun endpoint de learning. El valor se propaga por `useHomeStats` pero no se muestra directamente en UI.

### P6 — Tab "competir" del PRD no existe

- **Archivo:** `screens/MainApp.tsx`
- **Problema:** El PRD menciona que "el tab `competir` ya existe y esta vacio — es el candidato natural para conectar el modulo de aprendizaje". Sin embargo, los tabs actuales son: `inicio`, `pistas`, `partidos`, `tienda`, `torneos`. No existe tab `competir`. Hay que decidir el punto de entrada antes de implementar.

### P7 — MainApp.tsx sin estados de navegacion para learning

- **Archivo:** `screens/MainApp.tsx`
- **Problema:** El switch de `renderContent()` solo maneja los 5 tabs existentes mas sub-pantallas de detalle. No hay ningun estado para LearningHomeScreen, DailyLessonScreen, LessonResultsScreen, etc. Sera necesario anadir estados al `useState` de navegacion.

---

## 4. Distincion School vs Learning

Estos son dos modulos completamente independientes que no deben confundirse:

| Aspecto | School (existente) | Learning (por implementar) |
|---------|-------------------|---------------------------|
| Naturaleza | Clases presenciales en club | Contenido digital (quizzes, videos) |
| Usuarios | Staff del club (gestion) | Jugadores (consumo) + Staff (creacion) |
| Backend | `GET/POST /school-courses` | `GET/POST /learning/*` (18 endpoints) |
| Frontend web | `ClubSchoolTab.tsx` (CRUD completo) | No existe |
| Frontend mobile | No existe | Solo placeholders |
| Datos clave | sport, level, staff, court, weekdays, horarios | type, area, content (JSONB), elo_min/max |
| Traducciones | `school_*` en common.json (es/en/zh) | No existen |
| Servicio frontend | `schoolCourses.ts` | No existe |

---

## 5. Cobertura de endpoints

18 endpoints implementados en el backend. **0 tienen consumidor en el frontend.**

### Endpoints de jugador (mobile-app)

| # | Endpoint | Consumido | Archivo que deberia consumirlo |
|---|----------|-----------|-------------------------------|
| 1 | `GET /learning/daily-lesson` | No | `api/learning.ts` → `hooks/useDailyLesson.ts` |
| 2 | `POST /learning/daily-lesson/complete` | No | `api/learning.ts` → `DailyLessonScreen.tsx` |
| 3 | `GET /learning/streak` | No | `api/learning.ts` → `hooks/useStreak.ts` |
| 4 | `GET /learning/shared-streaks` | No | `api/learning.ts` → `hooks/useStreak.ts` |
| 5 | `POST /learning/shared-streaks` | No | `api/learning.ts` |
| 6 | `GET /learning/courses` | No | `api/learning.ts` → `hooks/useCourses.ts` |
| 7 | `GET /learning/courses/:id` | No | `api/learning.ts` → `CourseDetailScreen.tsx` |
| 8 | `POST /learning/courses/:id/complete-lesson` | No | `api/learning.ts` → `CourseLessonScreen.tsx` |

### Endpoints de club (web-app)

| # | Endpoint | Consumido | Archivo que deberia consumirlo |
|---|----------|-----------|-------------------------------|
| 9 | `POST /learning/questions` | No | `services/learningQuestions.ts` |
| 10 | `PUT /learning/questions/:id` | No | `services/learningQuestions.ts` |
| 11 | `PATCH /learning/questions/:id/deactivate` | No | `services/learningQuestions.ts` |
| 12 | `GET /learning/questions` | No | `services/learningQuestions.ts` |
| 13 | `POST /learning/courses` (club) | No | `services/learningCourses.ts` |
| 14 | `PUT /learning/courses/:id` (club) | No | `services/learningCourses.ts` |
| 15 | `POST /learning/courses/:id/lessons` | No | `services/learningCourses.ts` |
| 16 | `PUT /learning/courses/:id/lessons/:lessonId` | No | `services/learningCourses.ts` |
| 17 | `DELETE /learning/courses/:id/lessons/:lessonId` | No | `services/learningCourses.ts` |
| 18 | `POST /learning/courses/:id/submit` | No | `services/learningCourses.ts` |

---

## 6. Gap analysis: Estado actual vs Plan de desarrollo (seccion 7)

### Mobile-app — 18 archivos planificados, 0 implementados

| Archivo planificado | Estado |
|---------------------|--------|
| `api/learning.ts` | No existe |
| `hooks/useDailyLesson.ts` | No existe |
| `hooks/useCourses.ts` | No existe |
| `hooks/useStreak.ts` | No existe |
| `screens/LearningHomeScreen.tsx` | No existe |
| `screens/DailyLessonScreen.tsx` | No existe |
| `screens/LessonResultsScreen.tsx` | No existe |
| `screens/CoursesListScreen.tsx` | No existe |
| `screens/CourseDetailScreen.tsx` | No existe |
| `screens/CourseLessonScreen.tsx` | No existe |
| `components/learning/QuestionCard.tsx` | No existe |
| `components/learning/TestClassicQuestion.tsx` | No existe |
| `components/learning/TrueFalseQuestion.tsx` | No existe |
| `components/learning/MatchColumnsQuestion.tsx` | No existe |
| `components/learning/OrderSequenceQuestion.tsx` | No existe |
| `components/learning/StreakBadge.tsx` | No existe |
| `components/learning/CourseCard.tsx` | No existe |
| `components/learning/LessonProgress.tsx` | No existe |

### Web-app — 3 entregables planificados, 0 implementados

| Entregable planificado | Estado |
|------------------------|--------|
| Pagina de gestion de preguntas (CRUD con formulario por tipo) | No existe |
| Pagina de gestion de cursos digitales (CRUD + lecciones + videos) | No existe |
| Traducciones `learning_*` en es/en/zh | No existen |

---

## 7. Recomendaciones de prioridad

### Prioridad 1 — Core mobile: leccion diaria

Lo minimo para que un jugador pueda completar su primera leccion diaria.

1. Crear `mobile-app/src/api/learning.ts` con funciones para los 8 endpoints de jugador
2. Crear `hooks/useDailyLesson.ts` y `hooks/useStreak.ts`
3. Crear `screens/DailyLessonScreen.tsx` (muestra 5 preguntas una a una)
4. Crear `screens/LessonResultsScreen.tsx` (resultado post-leccion)
5. Crear componentes de pregunta: `QuestionCard.tsx` como dispatcher + un componente por tipo (TestClassic, TrueFalse, MultiSelect, MatchColumns, OrderSequence)
6. Corregir P1: DailyLessonCard debe navegar a DailyLessonScreen, no a 'partidos'
7. Corregir P2/P3: integrar `GET /learning/streak` para mostrar racha real y bonus

### Prioridad 2 — Navegacion mobile

1. Decidir punto de entrada: crear tab nuevo, reusar existente, o sub-navegacion desde Home
2. Actualizar `MainApp.tsx` con estados para las pantallas de learning
3. Crear `LearningHomeScreen.tsx` como hub del modulo
4. Conectar boton "Clases" de InicioQuickActions con onPress funcional (P4)

### Prioridad 3 — Cursos mobile

1. Crear `hooks/useCourses.ts`
2. Crear `CoursesListScreen.tsx`, `CourseDetailScreen.tsx`, `CourseLessonScreen.tsx`
3. Crear componentes `CourseCard.tsx` y `LessonProgress.tsx`

### Prioridad 4 — Web-app: herramienta de clubes

1. Crear `services/learningQuestions.ts` y `services/learningCourses.ts`
2. Crear pagina de gestion de preguntas con formulario dinamico segun tipo
3. Crear pagina de gestion de cursos digitales con lecciones
4. Agregar traducciones `learning_*` en es/en/zh
5. Registrar rutas en el router y menu lateral

---

## 8. Dependencias y riesgos

| Riesgo | Impacto | Mitigacion |
|--------|---------|-----------|
| No hay preguntas en BD | Sin preguntas, `GET /daily-lesson` devuelve array vacio | Crear seed de preguntas de prueba antes de testear el frontend |
| Tab "competir" no existe | No hay punto de entrada claro al modulo | Decidir navegacion antes de implementar pantallas |
| `MultiSelectQuestion.tsx` no esta en el plan | El tipo `multi_select` existe en backend pero no se listo componente especifico en seccion 7 | Anadir componente al plan |
| Traducciones mobile | Mobile usa espanol hardcodeado (sin i18n) | Confirmar que todos los textos del modulo siguen este patron |
| Cursos sin contenido real | Sin cursos activos en BD, la lista estara vacia | Crear curso de prueba desde la API de club |
