# Plan: Implementar daily lessons (mobile-app)

> Ultima actualizacion: 2026-04-16

## Contexto

Backend 100% listo (18 endpoints). Figma analizado con 4 fases: Intro, Questions (video+pregunta), Review, Results. Proyecto mobile usa: useState en MainApp para navegacion, StyleSheet.create, useAuth/session.access_token, api/*.ts para fetch, hooks/use*.ts, ScreenLayout+BackHeader, Skeleton, Ionicons, expo-linear-gradient, tema oscuro glassmorphism.

## Archivos a crear/modificar

### Fase 1 — API + tipos + hook

**1.1 Crear `mobile-app/src/api/dailyLessons.ts`**
Siguiendo patron de `api/matches.ts`:
- `fetchDailyLesson(token, timezone)` → GET /learning/daily-lesson
- `submitDailyLesson(token, timezone, answers)` → POST /learning/daily-lesson/complete
- `fetchStreak(token)` → GET /learning/streak
- Tipos: `DailyLessonQuestion`, `DailyLessonResult`, `StreakInfo`
- Sin excepciones, retorna `{ ok, data }` o `{ ok: false, error }`

**1.2 Crear `mobile-app/src/hooks/useDailyLesson.ts`**
Siguiendo patron de `hooks/useHomeStats.ts`:
- `useDailyLesson()` → carga preguntas al montar, expone state
- `useStreak()` → carga racha, expone current/longest/multiplier
- Cleanup con `mounted` flag

### Fase 2 — Componentes de pregunta

Crear `mobile-app/src/components/learning/`:

**2.1 `TestClassicQuestion.tsx`**
- 4 opciones A/B/C/D con letras en circulos
- Estados: normal (glass bg), seleccionada (naranja), correcta (verde), incorrecta (rojo)
- Al seleccionar: muestra resultado + explicacion abajo
- Colores del Figma: glass `rgba(255,255,255,0.04)`, borde `rgba(255,255,255,0.08)`

**2.2 `TrueFalseQuestion.tsx`**
- Mismo layout que TestClassic pero con 2 opciones: Verdadero / Falso
- Reutiliza mismos estilos de opciones

**2.3 `MultiSelectQuestion.tsx`**
- Checkboxes en vez de letras
- Label "Selecciona todas las correctas" arriba
- Boton "Comprobar" al final (gradiente naranja)
- Solo corrige cuando pulsa el boton

**2.4 `OrderSequenceQuestion.tsx`**
- Dos zonas: "Toca para ordenar" (disponibles) y "Tu orden" (seleccionados)
- Tap mueve item entre zonas
- Boton "Comprobar orden" al final
- Numeros en circulitos naranjas

**2.5 `MatchColumnsQuestion.tsx`**
- No esta en Figma pero existe en backend. Implementar version simple:
- Dos columnas, tap para emparejar izquierda con derecha
- Lineas de conexion o highlight de pares

**2.6 `QuestionCard.tsx`**
- Dispatcher: recibe `question.type` y renderiza el componente correcto
- Muestra texto de pregunta arriba
- Muestra explicacion abajo (card glass con icono BookOpen naranja) tras responder

**2.7 `ExplanationCard.tsx`**
- Card glass con icono libro naranja + texto gris
- Se muestra tras responder cada pregunta

### Fase 3 — Pantallas

**3.1 Crear `mobile-app/src/screens/DailyLessonScreen.tsx`**
Pantalla principal con 4 fases (useState):

- **phase='intro'**: Fondo #0F0F0F, icono central grande (llama naranja), titulo "Leccion del dia", subtitulo "5 preguntas ~ 3 minutos", badge racha, topic badges (4 areas), boton "Empezar" (gradiente naranja), boton "Cancelar" (gris). Si ya completada: variante verde con "Repetir leccion".

- **phase='questions'**: Progress bar arriba (5 segmentos), pregunta actual con QuestionCard. Si tiene video: mostrar video primero, luego deslizar modal con pregunta. Tras responder: flash verde/rojo (150ms), mostrar explicacion, esperar 2.2s, siguiente pregunta. Encolar falladas para review.

- **phase='review'**: Mismo layout que questions pero con badge "Repaso" naranja. Solo muestra preguntas falladas. Sin penalizacion.

- **phase='results'**: Icono trofeo dorado, titulo segun score (>=80% "Excelente!", >=60% "Bien hecho!", <60% "Sigue practicando!"). Grid 3 columnas: puntuacion, XP, correctas. Card resumen por pregunta (icono verde/rojo + texto truncado). Boton "Continuar" (gradiente naranja).

**3.2 Crear `mobile-app/src/screens/LessonResultsScreen.tsx`**
- Extraer la fase results a componente separado si es demasiado grande
- O mantener todo en DailyLessonScreen si es manejable

### Fase 4 — Widget del Home + Navegacion

**4.1 Modificar `DailyLessonCard.tsx`**
- Integrar datos reales de `useStreak()`
- Grilla semanal con estados reales (completada hoy=verde, pasada=naranja, hoy sin hacer=borde naranja, futura=lock)
- Bonus text real del multiplicador
- Variante completada (gradiente verde)

**4.2 Modificar `MainApp.tsx`**
- Anadir estado: `const [showDailyLesson, setShowDailyLesson] = useState(false)`
- En renderContent: `if (showDailyLesson) return <DailyLessonScreen onBack={...} onComplete={...} />`
- Pasar callback a HomeScreen

**4.3 Modificar `HomeScreen.tsx`**
- DailyLessonCard.onPress → navegar a DailyLessonScreen (no a 'partidos')
- Pasar bonusText real

### Fase 5 — Video player

**5.1 Instalar `expo-video`**
- El proyecto usa Expo SDK 54 y NO tiene ninguna dependencia de video instalada.
- `expo-video` es el modulo moderno de Expo (reemplaza expo-av). Ventajas:
  - API nativa pura (no WebView), menor consumo de memoria
  - Soporte nativo para streaming MP4 desde URLs (Supabase Storage)
  - Mejor rendimiento que expo-av en SDK 54+
  - Controles nativos de sistema
- Instalar: `npx expo install expo-video`

**5.2 Integrar video en flujo de preguntas**
- Si `question.has_video && question.video_url`: mostrar video fullscreen primero
- Overlay con gradiente, boton cerrar, contador "1/5"
- Club branding abajo (nombre club, coach, badge area)
- Tras video (o skip): deslizar modal con pregunta

---

## Orden de implementacion

| Paso | Que | Dependencia |
|------|-----|-------------|
| 1 | api/dailyLessons.ts + tipos | Ninguna |
| 2 | hooks/useDailyLesson.ts + useStreak.ts | Paso 1 |
| 3 | ExplanationCard.tsx | Ninguna |
| 4 | TestClassicQuestion.tsx + TrueFalseQuestion.tsx | Paso 3 |
| 5 | MultiSelectQuestion.tsx + OrderSequenceQuestion.tsx + MatchColumnsQuestion.tsx | Paso 3 |
| 6 | QuestionCard.tsx (dispatcher) | Pasos 4-5 |
| 7 | DailyLessonScreen.tsx (fases intro + questions + review + results) | Pasos 2, 6 |
| 8 | Actualizar DailyLessonCard.tsx con datos reales | Paso 2 |
| 9 | Actualizar MainApp.tsx + HomeScreen.tsx (navegacion) | Paso 7 |
| 10 | Video player con expo-video | Paso 7 |

---

## Patrones a seguir estrictamente

- `StyleSheet.create()` para estilos, NO Tailwind
- Colores hardcodeados, spacing/fontSize de `theme.ts`
- `useAuth()` → `session?.access_token` para token
- `{ ok, error }` return en funciones API, sin throw
- `mounted` flag en useEffect para cleanup
- `Skeleton` para loading, `Ionicons` para iconos
- `useSafeAreaInsets()` para safe areas
- Espanol hardcodeado (sin i18n)
- `Pressable` con `pressed && styles.pressed` (opacity 0.88)
- Glass cards: `rgba(255,255,255,0.04)` bg + `rgba(255,255,255,0.08)` border

---

## Colores del Figma

| Uso | Color |
|-----|-------|
| Fondo | `#0F0F0F` |
| Primario (naranja) | `#F18F34` |
| Primario oscuro | `#C46A20` |
| Primario claro | `#FFB347` |
| Correcto (emerald) | `#10B981` |
| Incorrecto (red) | `#EF4444` |
| Trofeo (amber) | `#FBBF24` → `#D97706` |
| Glass bg | `rgba(255,255,255,0.04)` |
| Glass border | `rgba(255,255,255,0.08)` |
| Texto principal | `#FFFFFF` |
| Texto secundario | `#9CA3AF` |
| Texto terciario | `#6B7280` |
| Area tecnica | `#F18F34` / `#3B82F6` |
| Area tactica | `#A855F7` |
| Area reglas | `#22C55E` |
| Area vocabulario | `#F59E0B` |

---

## Notas

- NO crear subcarpeta para screens (van directamente en `screens/`)
- Componentes de learning en `components/learning/`
- No modificar MainApp.tsx hasta que se indique explicitamente
- Build solo cuando se pida
