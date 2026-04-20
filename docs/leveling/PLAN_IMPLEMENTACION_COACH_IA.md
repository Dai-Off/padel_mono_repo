# Plan Maestro de Implementacion — Areas de Nivel + Coach IA + Feedback

> Orden de implementacion para multiples desarrolladores trabajando en paralelo.
> Fecha: 2026-04-14

---

## Grafo de dependencias

```
Fase 0: Base de datos (columnas area_* en players + tablas coach)
  |
  +---> Fase 1A: Lecciones diarias actualizan areas
  |       (modifica POST /learning/daily-lesson/complete)
  |
  +---> Fase 1B: Pipeline nivelacion arrastra areas al ganar/perder
  |       (modifica levelingService.ts)
  |
  +---> Fase 1C: Feedback post-partido reformulado
  |       (modifica matchFeedback.ts + nuevo GET /feedback-form)
  |
  +---> Fase 1D: Endpoint Coach Plan (objetivos)
  |       (nuevo GET /learning/coach/plan — independiente de areas)
  |
  +---> Fase 1E: Endpoint Coach Summary (radar)
          (nuevo GET /learning/coach/summary — lee areas de players)
          |
          +---> Fase 2: Frontend Coach IA (depende de 1D + 1E)
```

**Nota:** Las fases 1A-1E son todas independientes entre si y solo dependen de Fase 0.

---

## Fase 0 — Base de datos

**Responsable:** Cualquier dev backend (dia 1)
**Bloquea:** Todo lo demas
**Tiempo estimado:** 1-2 horas

| Tarea | SQL |
|-------|-----|
| Anadir columnas area_* a players | `ALTER TABLE players ADD COLUMN area_technique float8, area_tactics float8, area_physical float8, area_mental float8;` |
| Migracion jugadores existentes | `UPDATE players SET area_technique = elo_rating, area_tactics = elo_rating, area_physical = elo_rating, area_mental = elo_rating WHERE area_technique IS NULL;` |
| Crear tabla coach_objectives | Ver `docs/leveling/11_coach_ia.md` seccion 3.1 |
| Crear tabla coach_objective_targets | Ver `docs/leveling/11_coach_ia.md` seccion 3.2 |
| Insertar seeds de objetivos | Ver `docs/leveling/11_coach_ia.md` seccion 3.1 y 3.2 |

Todo se ejecuta en el SQL Editor de Supabase.

---

## Fase 1A — Lecciones diarias actualizan areas

**Responsable:** Dev Backend 1
**Depende de:** Fase 0
**Paralelo con:** 1B, 1C, 1D, 1E

**Archivo a modificar:** `backend/src/routes/learningDailyLesson.ts`

**Tareas:**

| # | Tarea | Referencia |
|---|-------|-----------|
| 1A.1 | Crear helper `applyDelta(area, delta, eloRating)` con soft cap | Componente 01, seccion 4.4 |
| 1A.2 | En POST /daily-lesson/complete, despues del paso 5 (registrar sesion), anadir paso 5b: leer areas del jugador, aplicar deltas por pregunta, clamp, UPDATE players | Componente 01, seccion 4.4, Fuente 1 |
| 1A.3 | Anadir `area_updates` al response del endpoint | Plan aprendizaje, seccion 5.2 |
| 1A.4 | Exponer areas en GET /players/me y GET /players/:id | Componente 01, seccion 4.4 |
| 1A.5 | Testing: verificar que completar leccion modifica las areas correctas, soft cap funciona, clamp respetado |

---

## Fase 1B — Pipeline nivelacion arrastra areas

**Responsable:** Dev Backend 1
**Depende de:** Fase 0
**Paralelo con:** 1A, 1C, 1D, 1E
**Mejor hacer despues de 1A** (reutiliza helper applyDelta)

**Archivo a modificar:** `backend/src/services/levelingService.ts`

**Tareas:**

| # | Tarea | Referencia |
|---|-------|-----------|
| 1B.1 | En el pipeline de actualizacion de nivel, despues de calcular nuevo elo_rating, leer las 4 areas del jugador | Componente 01, seccion 4.4, Fuente 2 |
| 1B.2 | Calcular `delta_elo = new_elo - old_elo`, aplicar `delta_area = delta_elo * DRAG_FACTOR (0.5)` a las 4 areas | Componente 01, seccion 4.4, Fuente 2 |
| 1B.3 | Clamp areas a [new_elo - 1.0, new_elo + 1.0], incluir en el UPDATE atomico del jugador |
| 1B.4 | Testing: verificar que ganar un partido sube las 4 areas, perder las baja, clamp respetado |

---

## Fase 1C — Feedback post-partido reformulado

**Responsable:** Dev Backend 2
**Depende de:** Fase 0
**Paralelo con:** 1A, 1B, 1D, 1E

**Archivos a modificar:**
- `backend/src/routes/matchFeedback.ts`
- `backend/src/routes/players.ts` (feedback-summary)

**Tareas:**

| # | Tarea | Referencia |
|---|-------|-----------|
| 1C.1 | Implementar logica de asignacion de areas a preguntar: consultar ultimos 12 feedbacks del jugador valorado, elegir area menos preguntada, evitar repeticion entre los 3 jugadores del formulario | Componente 08, seccion 4.1 |
| 1C.2 | Crear endpoint `GET /matches/:id/feedback-form` que devuelve jugadores con sus areas asignadas | Componente 08, seccion 4.1 |
| 1C.3 | Actualizar validacion de POST /matches/:id/feedback para aceptar `area_asked` y `area_perceived` | Componente 08, seccion 4.3 |
| 1C.4 | Anadir paso de ajuste de areas y elo del jugador valorado tras guardar feedback | Componente 08, seccion 4.2 |
| 1C.5 | Ampliar GET /players/:id/feedback-summary con desglose por areas | Componente 08, seccion 3.3 |
| 1C.6 | Documentar nuevas rutas en backend/API.md |
| 1C.7 | Testing: verificar rotacion de areas, ajustes de nivel por feedback, feedback-summary con areas |

---

## Fase 1D — Endpoint Coach Plan (objetivos)

**Responsable:** Dev Backend 2
**Depende de:** Fase 0 (tablas coach_objectives)
**Paralelo con:** 1A, 1B, 1C, 1E
**Independiente de areas** — no necesita que las areas esten implementadas

**Archivo a crear:** `backend/src/routes/learningCoachIA.ts`

**Tareas:**

| # | Tarea | Referencia |
|---|-------|-----------|
| 1D.1 | Crear archivo con helper getTierFromElo, constantes de tier | Componente 11, seccion 4 |
| 1D.2 | Implementar funcion de calculo de periodo (semana/mes actual en timezone) | Componente 11, seccion 6.3 |
| 1D.3 | Implementar 10 calculadores de progreso (1 por objetivo) | Componente 11, seccion 6.4 |
| 1D.4 | Implementar calculo de metricas del header (ritmo de mejora, totales) | Componente 11, seccion 6.5 |
| 1D.5 | Implementar query de cursos recomendados | Componente 11, seccion 6.6 |
| 1D.6 | Ensamblar GET /learning/coach/plan | Componente 11, seccion 6.3 |
| 1D.7 | Registrar subrouter en learning.ts |
| 1D.8 | Documentar ruta en backend/API.md |
| 1D.9 | Testing: caso feliz por tier, jugador sin datos, edge cases de periodos |

---

## Fase 1E — Endpoint Coach Summary (radar)

**Responsable:** Dev Backend 2 (despues de 1D, reutiliza getTierFromElo)
**Depende de:** Fase 0 (columnas area_* en players)
**Paralelo con:** 1A, 1B, 1C

**Archivo a modificar:** `backend/src/routes/learningCoachIA.ts` (creado en 1D)

**Tareas:**

| # | Tarea | Referencia |
|---|-------|-----------|
| 1E.1 | Definir mapa AREA_TEXTS completo (4 areas x 4 tiers x 3 textos) | Componente 11, seccion 6.2 |
| 1E.2 | Implementar GET /learning/coach/summary: leer areas, ordenar, buscar textos | Componente 11, seccion 6.1 |
| 1E.3 | Testing: verificar que devuelve radar correcto, fortalezas/a mejorar coherentes, jugador sin areas (null) |

---

## Fase 2 — Frontend Coach IA

**Responsable:** Dev Frontend
**Depende de:** Fase 1D + 1E completadas (endpoints listos)
**Puede empezar parcialmente con mocks** mientras los endpoints no estan listos

**Tareas:**

| # | Tarea | Referencia |
|---|-------|-----------|
| 2.1 | Anadir funciones fetch en api/learning.ts (fetchCoachSummary, fetchCoachPlan) | Componente 11, seccion 7.1 |
| 2.2 | Crear hooks: useCoachSummary, useCoachPlan | Componente 11, seccion 7.2 |
| 2.3 | Crear RadarChart.tsx (SVG con react-native-svg) | Componente 11, seccion 7.3 |
| 2.4 | Crear componentes tab Resumen: StrengthsCard, ImprovementCard, CoachRecommendation | Componente 11, seccion 7.3 |
| 2.5 | Crear componentes tab Plan: CoachHeader, ObjectiveCard, ObjectivesList, RecommendedCourses | Componente 11, seccion 7.3 |
| 2.6 | Crear CoachIAScreen.tsx con 2 tabs | Componente 11, seccion 7.2 |
| 2.7 | Integrar navegacion en MainApp.tsx | Componente 11, seccion 7.4 |

---

## Asignacion recomendada

| Dev | Semana 1 | Semana 2 |
|-----|----------|----------|
| **Backend 1** | Fase 0 (dia 1) → Fase 1A (dias 2-3) → Fase 1B (dias 4-5) | Soporte/bugfixes, review de 1C |
| **Backend 2** | Fase 1C (dias 1-3) → Fase 1D (dias 3-5) | Fase 1E (dia 1) → Soporte frontend |
| **Frontend** | Puede empezar componentes con datos mock | Fase 2 completa (dias 1-5) |

---

## Notas

- **Antes de implementar 1D:** Verificar estructura exacta de `tournament_inscriptions` y campos de fecha de `matches`.
- **Fase 0 es bloqueante:** No empezar nada sin las columnas en la BD.
- **1A y 1B comparten el helper `applyDelta`:** Si un dev hace ambas, mejor hacer 1A primero.
- **1D es totalmente independiente de areas:** Puede empezarse sin esperar a que las areas funcionen.
- **El frontend puede empezar con mocks** de los endpoints para no esperar al backend.

---

## V2 (futuro, no incluido en este plan)

| Feature | Depende de |
|---------|-----------|
| Tabla `player_ai_profiles` | Feedback con textos en produccion |
| Pipeline de analisis IA sobre feedback | `player_ai_profiles` creada |
| Recomendaciones personalizadas del Coach | Pipeline IA funcionando |
| Progreso historico mensual | Varios meses de datos acumulados |
