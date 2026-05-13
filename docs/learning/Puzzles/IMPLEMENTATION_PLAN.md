# Plan de implementación — Módulo Puzzles para WeMatch

> Adaptación del plan teórico (`docs/wematch-plan.md`) al estado real del monorepo
> `padel_mono_repo`. Resultado del análisis del 2026-05-05 sobre `develop`.
>
> Branch de trabajo: `feature/learningPuzzles` (creada desde `develop`).

---

## 0. Decisiones tomadas para este repo

| Tema | Decisión | Justificación específica del repo |
| --- | --- | --- |
| **Tipo nuevo de pregunta** | Añadir `'puzzle'` a la lista de tipos existente | `backend/src/routes/learningClubQuestions.ts:12` ya define un enum `VALID_QUESTION_TYPES` con 5 tipos. Encaja como sexto. **Sin video**: `video_url`/`has_video` quedan `null/false` para puzzles. |
| **Persistencia** | Tabla nueva `learning_puzzles` 1:1 con `learning_questions` (FK `question_id UNIQUE`). El árbol del puzzle (frames, players, shapes, options) vive en columnas jsonb dentro de esa tabla. | Modelo relacional para lo queryable (court_position, schema_version, FK), jsonb para sub-entidades que siempre se cargan juntas y nunca se filtran sueltas. 1 query para cargar el puzzle completo. |
| **Editor (web-app)** | `react-konva` + `konva` + Radix/Tailwind existentes | El editor pide drag/transformer/snap; Konva los trae out-of-the-box. Web-app no tiene canvas libs todavía. |
| **Visor (mobile-app)** | `react-native-svg` (ya instalado) + **`react-native-reanimated`** + **`expo-image`** | App grande → performance crítica. Reanimated corre worklets en thread UI sin bridge a JS; `expo-image` decodifica nativo y cachea en disco. Animated API descartada para no saturar el thread JS. |
| **Tipos compartidos** | NO hay workspaces. Schema Zod en backend + duplicado tipo TS en mobile-app y web-app, sincronizado a mano | Las 4 carpetas son proyectos independientes. Evitamos crear `packages/` para no introducir un build system nuevo. |
| **Assets** | Copiar los 4 archivos de `docs/learning/Puzzles/assets/` a `mobile-app/assets/puzzles/` y `web-app/public/puzzles/` | Drop-in. |
| **Scoring/streak/diario** | Reutilizar el sistema existente (`learning_question_log`, `learning_sessions`, `learning_streaks`) | Ya hay 5 tipos respondiendo dentro de la lección diaria de 5 preguntas; el puzzle es una pregunta más. **No replicamos** el sistema de niveles ni el paywall de padelchess. |
| **i18n** | El `content` puzzle se guarda en idioma del club; reutilizar `react-i18next` para los textos de UI del editor/visor | Coherente con el resto del módulo. |

### Decisiones que **no** copiamos del plan original

- `award_puzzle_points` RPC con paywall diario → ya tenemos `learning_sessions` y rachas.
- Tabla `puzzles` separada → usamos `learning_questions` (un solo flujo de creación/curado).
- Packages `puzzle-schema/config/assets/canvas-*` → no aplica sin workspaces.
- Editor en Next.js separado → va dentro de `web-app/`.

---

## 1. Modelo de datos

### 1.1 Esquema relacional

Sistema de coordenadas: pista de **10 m × 20 m** en unidades internas (mismo sistema que padelchess). El equipo del usuario (team=1) ocupa la mitad inferior `[0..10, 10..20]`; el rival (team=2), la superior `[0..10, 0..10]`.

```sql
create table learning_puzzles (
  id                bigserial primary key,
  question_id       bigint not null unique
                      references learning_questions(id) on delete cascade,
  schema_version    smallint not null default 1,
  statement         text not null,
  court_position    text not null default 'both'
                      check (court_position in ('left','right','both')),
  general_explanation text,

  -- Sub-árbol del puzzle (sólo se carga junto al puzzle entero):
  initial_frame     jsonb not null,   -- { players: Player[], ball: Ball, shapes?: Shape[] }
  options           jsonb not null,   -- Option[]: cada opción con su reveal_frame opcional

  thumbnail_url     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index learning_puzzles_court_idx
  on learning_puzzles (court_position);
```

Decisión deliberada de qué va relacional vs jsonb:

| Campo | Por qué relacional / jsonb |
| --- | --- |
| `question_id` (FK) | Linkeo 1:1 con `learning_questions`. ON DELETE CASCADE para que borrar la pregunta limpie el puzzle. |
| `court_position` | Se filtra en queries (lección personalizada por lado del usuario). |
| `schema_version` | Permite migrar puzzles entre versiones del schema sin romper. |
| `statement` | Indexable, buscable por texto a futuro. |
| `initial_frame`, `options` | Sub-entidades que **siempre se cargan juntas con el puzzle entero**. Nunca se queryean sueltas. JSONB con validación en el backend. |

### 1.2 Estructura de los campos jsonb

```ts

// initial_frame:
type InitialFrame = {
  players: Player[];     // 2-4 jugadores
  ball: Ball;
  shapes?: Shape[];      // anotaciones siempre visibles
};

interface Player {
  id: number;            // 1..4
  team: 1 | 2;
  x: number;             // 0..10
  y: number;             // 0..20
  facing?: 'face' | 'back';
  speech_label?: string; // bocadillo "you", etc.
}

interface Ball {
  x: number;
  y: number;
  shot_type?: 'lob' | 'chiquita';
  spin?: 'clockwise' | 'counter-clockwise' | 'random';
}

interface Option {
  id: 1 | 2 | 3;                       // letra A/B/C
  text: string;                        // pregunta corta
  explanation: string;                 // texto largo post-confirmación
  points: 0 | 1 | 2;                   // 0 mala, 1 parcial, 2 correcta
  badge_position?: { x: number; y: number };
  reveal_frame?: {                     // animación al confirmar
    players: Player[];
    ball: Ball;
    shapes?: Shape[];
    duration_ms?: number;              // default 800
  };
}

interface Shape {
  id: number;
  type: 'arrow' | 'circle' | 'rect' | 'triangle' | 'text_tag';
  color?: string;
  // arrow
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  control?: { x: number; y: number };  // curvatura
  pointer_at_start?: boolean;
  pointer_at_end?: boolean;
  tag_text?: string;
  // circle
  cx?: number; cy?: number; r?: number; dashed?: boolean;
  // rect
  x?: number; y?: number; w?: number; h?: number;
  // triangle
  points?: number[];                   // [x1,y1,x2,y2,x3,y3]
  // text_tag
  text?: string; font_size?: number;
}
```

**Reglas de validación** (las aplicará el backend):

- 2 ≤ `players.length` ≤ 4, exactamente 1 con `team=1` y 1 con `team=2` mínimo.
- `options.length` ∈ [2, 3]; los `id` son únicos y consecutivos (1, 2, [3]).
- Exactamente 1 opción con `points: 2`. Las otras pueden ser 0 o 1.
- Coordenadas dentro de `[0..10] × [0..20]`.
- `statement.length` entre 8 y 280 caracteres.

---

## 2. Backend — cambios concretos

| Archivo | Cambio |
| --- | --- |
| `backend/db/020_learning_puzzles.sql` *(nuevo)* | Migración con la tabla `learning_puzzles` (§1.1) + índices. |
| `backend/src/routes/learningClubQuestions.ts:12` | Añadir `'puzzle'` a `VALID_QUESTION_TYPES`. |
| `backend/src/routes/learningClubQuestions.ts:15-65` | En `validateQuestionContent`, caso `'puzzle'`: delega a helper. El `content` que envía el cliente para puzzles es **el árbol completo** (initial_frame + options + meta). |
| `backend/src/lib/puzzleValidator.ts` *(nuevo)* | `validatePuzzleContent(content): string \| null`. Implementa todas las reglas de §1.3 (validación). Estilo `if/typeof` para simetría con el resto del módulo (sin Zod). |
| `backend/src/routes/learningClubQuestions.ts` POST/PUT | Tras validar, **transacción**: insert/update en `learning_questions` (con `type='puzzle'`, `video_url=null`, `has_video=false`) **y** en `learning_puzzles` (1:1). El `content` jsonb de `learning_questions` queda vacío (`{}`) o reservado para metadatos auxiliares; el árbol del puzzle vive en `learning_puzzles`. |
| `backend/src/routes/learningClubQuestions.ts` GET | Para `type='puzzle'`, hacer LEFT JOIN con `learning_puzzles` y devolver el árbol completo en el payload. |
| `backend/src/routes/learningDailyLesson.ts` | Pequeño ajuste: cuando una pregunta de la sesión es `type='puzzle'`, hacer JOIN con `learning_puzzles` y devolver el árbol en el payload de la pregunta. |

**Decisión sobre Zod**: el resto de `learningClubQuestions.ts` valida con `if/typeof`. Mantener consistencia y no añadir Zod sólo para puzzles. Si más adelante se introduce Zod en el módulo, se migra todo de golpe.

**Endpoints ya existentes que aplican sin cambios**:

- `POST /learning/questions` — crea pregunta con `type='puzzle'`.
- `PUT /learning/questions/:id` — actualiza.
- `PATCH /learning/questions/:id` (activate/deactivate).
- `GET /learning/questions?club_id=…` — lista.
- `POST /learning/daily-lesson/complete` — registra respuestas.

**Endpoint nuevo opcional** (Sprint 2):
- `POST /learning/questions/:id/thumbnail` — sube PNG generado por el editor (Konva `stage.toDataURL`) a Supabase Storage. Útil para previews en listados. **Posponible** si el listado no lo necesita en MVP.

---

## 3. Web-app — Editor de puzzles

### Ubicación

Modal nuevo en `web-app/src/components/Learning/Questions/PuzzleEditorModal.tsx`, abierto desde el listado de preguntas existente cuando el usuario selecciona "Tipo: puzzle".

### Dependencias a instalar

```bash
cd web-app
npm install konva react-konva use-image
```

(Tamaño aprox: ~200 KB añadidos al bundle del admin, no afecta a la mobile-app.)

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Header: título + select tipo + idioma del club                   │
├───────────────┬───────────────────────────────┬──────────────────┤
│ Sidebar L     │  Canvas Konva (pista vert.)   │ Sidebar R        │
│ ───────       │  ─────────────                │ ─────────        │
│ Paleta:       │  - court fondo                │ Tabs:            │
│  + jugador 1  │  - jugadores draggable        │  • Opciones      │
│  + jugador 2  │  - pelota draggable           │     A/B/C        │
│  + flecha     │  - opciones (badges A/B/C)    │     points 0/1/2 │
│  + círculo    │  - shapes anotativos          │  • Frames        │
│  + rect       │                                │     (initial /   │
│  + triángulo  │  Toolbar inferior:            │      reveal por  │
│  + tag texto  │   [↶ undo] [↷ redo]           │      opción)     │
│               │   [grid 0.25 m] [snap on]     │  • JSON raw      │
│               │   [Preview animación]         │     (read-only)  │
├───────────────┴───────────────────────────────┴──────────────────┤
│ Footer: [Cancelar]  [Guardar borrador]  [Publicar]               │
└──────────────────────────────────────────────────────────────────┘
```

### Componentes nuevos

```
web-app/src/components/Learning/Questions/PuzzleEditor/
├── PuzzleEditorModal.tsx       ← contenedor + estado + guardado
├── PuzzleStage.tsx             ← <Stage>/<Layer> Konva, gestión de selección
├── nodes/
│   ├── CourtBackground.tsx     ← líneas + red dibujadas con Konva.Shape
│   ├── PlayerNode.tsx          ← Konva.Image draggable + selection ring
│   ├── BallNode.tsx            ← Konva.Image draggable
│   ├── OptionBadge.tsx         ← squircle + letra A/B/C
│   └── shapes/{ArrowNode, CircleNode, RectNode, TriangleNode, TextTagNode}.tsx
├── panels/
│   ├── ToolPalette.tsx         ← sidebar L
│   ├── OptionsPanel.tsx        ← sidebar R tab "Opciones"
│   ├── FramesPanel.tsx         ← sidebar R tab "Frames" (initial vs reveal)
│   └── JsonPreview.tsx         ← debug
├── hooks/
│   ├── useEditorState.ts       ← estado central (Zustand, ya disponible)
│   ├── useUndoRedo.ts          ← stack de snapshots JSON
│   ├── useSnapToGrid.ts        ← snap a 0.25 m
│   └── useKonvaImage.ts        ← wrap de useImage para sprites
├── lib/
│   ├── courtConfig.ts          ← copia de la constante del análisis (§4 de padelchess-analysis.md)
│   ├── coords.ts               ← metros ↔ píxeles, viewport
│   └── validators.ts           ← mirror de las reglas backend para feedback inmediato
└── types.ts                    ← Puzzle, Player, Ball, Option, Shape (sin Zod)
```

### UX clave

- **Snap a 0.25 m** activable, default ON.
- **Multi-selección** con Shift-click; transformer de Konva para resize/rotate de shapes (no de jugadores ni pelota).
- **Frames**: cada opción A/B/C tiene tab para definir su `reveal_frame`. Si no hay reveal_frame, la animación de confirmación queda en el frame inicial.
- **Preview animación** (botón): renderiza el componente del visor mobile (vía react-native-web si conseguimos importarlo cómodamente; alternativa Sprint 1: re-render con el mismo `PuzzleStage` en modo readonly).
- **Atajos**: `Delete` borra selección, `D` duplica, flechas mueven 1 px (Shift = 10 px), `Cmd/Ctrl+Z/Y` undo/redo, `Cmd/Ctrl+S` guarda.
- **Validación en vivo**: lista de errores en footer ("falta opción correcta", "menos de 2 jugadores"…). Botón Publicar deshabilitado si hay errores.

### Integración con el listado existente

`web-app/src/components/Learning/Questions/QuestionFormModal.tsx` actualmente cubre los 5 tipos. Estrategia:

- En el `<Select type>` añadir opción **"Puzzle táctico"**.
- Cuando el usuario la selecciona, en lugar del form normal se monta `PuzzleEditorModal` (que ya hace su propio guardado contra `POST /learning/questions`).

---

## 4. Mobile-app — Visor de puzzles

### Ubicación

Nuevo componente `mobile-app/src/components/learning/PuzzleQuestion.tsx`. Se enchufa en el switch existente:

```tsx
// QuestionCard.tsx (línea ~26-66)
case 'puzzle':
  return <PuzzleQuestion question={question} onAnswer={onAnswer} />;
```

### Dependencias

Lo que ya hay: `react-native-svg@15.12.1`.

A instalar en Sprint 1 (performance crítica):
```bash
cd mobile-app
npx expo install react-native-reanimated expo-image
```

`react-native-reanimated` requiere config en `babel.config.js` (plugin) — añadir en el primer commit que lo use.

### Estructura

```
mobile-app/src/components/learning/puzzle/
├── PuzzleQuestion.tsx          ← orquestador + estado + onAnswer
├── PuzzleStage.tsx             ← capa SVG + capa imágenes superpuestas
├── Court.tsx                   ← <Svg> con líneas/red dibujadas (igual al editor)
├── Player.tsx                  ← <Image> RN posicionada absolutamente
├── Ball.tsx                    ← <Image> RN con animación de tiro (Animated.Value)
├── OptionBadge.tsx             ← <Pressable> squircle + letra (colores success/warning/error)
├── ShapesLayer.tsx             ← <Svg> con flechas, círculos, rects, tags
├── ChatBubble.tsx              ← enunciado / explicación tras confirmar
├── ConfirmBar.tsx              ← botones A/B/C grandes + Confirm/Next (DOM mirror)
├── hooks/
│   ├── useCourtDimensions.ts   ← pixelsPerMeter según viewport
│   ├── useBallAnimation.ts     ← parábola + spin con Animated API
│   └── usePlayerTween.ts       ← interpola entre frames
└── lib/
    ├── courtConfig.ts          ← copia idéntica al editor
    └── coords.ts               ← metros ↔ píxeles
```

### Estrategia de animaciones (Reanimated + zero-JS-bridge)

Reglas estrictas para que la app grande no sufra:

1. **Todo con `useSharedValue` + worklets**. Cero `setState` durante la animación. La transición `initial → reveal` cambia transforms vía shared values; el árbol React no re-renderiza.
2. **Pre-cómputo en montaje**: al recibir el puzzle, un `useMemo` calcula:
   - Trayectoria interpolada de la pelota (puntos discretos cada 16 ms para evitar Math en el worklet).
   - Posiciones intermedias de los jugadores entre frames.
   - Bounding boxes de shapes.
   El worklet sólo lee de un array pre-calculado.
3. **`expo-image`** para sprites (cache disco + decode nativo). Bajado de prioridad cuando no son visibles.
4. **`React.memo` agresivo**: cada Player/Shape/Ball compara `id+x+y+team`; nada más.
5. **Lazy-load del componente**: `const PuzzleQuestion = React.lazy(() => import('./puzzle/PuzzleQuestion'))` en `QuestionCard.tsx` para no tocar el cold-start.
6. **No animar shadows ni blurs en mobile**: caros en GPU. Sombras estáticas ya rasterizadas en el SVG/PNG.
7. **Limit FPS opcional**: en pantallas de 120 Hz no hace falta animar a 120 fps; usar `Easing` con duración fija (800 ms para tiros) y dejar que Reanimated optimice.

Presupuesto: < 5 MB RAM por puzzle activo, 60 fps consistente, 0 frames perdidos en la transición de confirmación.

### Mapeo de puntuación al sistema existente

`learning_question_log` ya guarda `is_correct` boolean. Convertimos:
- `points === 2` → `is_correct = true`
- `points === 0` o `1` → `is_correct = false` (pero guardamos `points` en `selected_answer` jsonb para análisis posteriores)

Esto deja el resto del flujo (rachas, sesión diaria, XP) intacto.

---

## 5. Assets

```bash
# Copiar de docs/learning/Puzzles/assets/ al runtime:
docs/learning/Puzzles/assets/court.svg              → web-app/public/puzzles/court.svg
                                                    → mobile-app/assets/puzzles/court.svg
docs/learning/Puzzles/assets/ball.svg               → web-app/public/puzzles/ball.svg
                                                    → mobile-app/assets/puzzles/ball.svg
docs/learning/Puzzles/assets/player-white-back.png  → ambos
docs/learning/Puzzles/assets/player-white-face.png  → ambos
```

**Sonidos**: pendientes de licenciar/grabar. No bloqueantes para MVP.

---

## 6. Roadmap por sprints

| Sprint | Entregable | Tests manuales (curl/UI) |
| --- | --- | --- |
| **1 — BBDD + Backend + tipos** | Migración `020_learning_puzzles.sql`; `'puzzle'` aceptado por `POST/PUT /learning/questions` con transacción a `learning_puzzles`; validador completo; GET hace JOIN; assets copiados; tipos TS sincronizados en mobile y web | `curl POST /learning/questions` con payload puzzle válido e inválido (200 / 400). Verificar que la fila aparece en ambas tablas. |
| **2 — Visor mobile básico** | Instalar Reanimated + expo-image + plugin Babel; render estático de pista + jugadores + pelota; opciones tappeables; envía respuesta a `daily-lesson/complete` con `points` en `selected_answer` | Crear puzzle vía curl, abrir lección diaria en mobile, ver render correcto, responder y validar log |
| **3 — Editor web MVP** | `PuzzleEditorModal` con: drag de jugadores/pelota, 1 shape (flecha), opciones A/B/C, guardado a `POST /learning/questions` | Crear un puzzle desde admin, verificar JSON guardado, verificar que el visor mobile lo renderiza |
| **4 — Animaciones** | Animación de pelota (lob, chiquita, spin) + tween jugadores entre initial y reveal frame; badge con estados de color | Probar puzzle con `reveal_frame` distinto al inicial; observar transición fluida |
| **5 — Editor v2** | Resto de shapes (círculo, rect, triángulo, text_tag); undo/redo; snap-to-grid; validación en vivo; preview animación | Crear puzzle complejo con 3 opciones, 2 frames y varios shapes, publicar y abrir en mobile |
| **6 — Pulido** | i18n editor; thumbnail server-side; explicaciones largas; haptics en mobile; testing exhaustivo | E2E manual: 10 puzzles distintos creados por admin y respondidos en mobile |

**MVP demostrable** = Sprint 3 cerrado.

---

## 7. Riesgos identificados

1. **react-native-svg + Animated API en jugadores**: si renderizamos `<Image>` con `Animated.View` envolviendo, el flicker en Android puede aparecer. Plan B: Reanimated 3.
2. **Tamaño del bundle web**: `react-konva` añade ~150 KB gz. Aceptable porque sólo carga en `/admin`.
3. **Coordenadas relativas en distintos viewports mobile**: hay que probar en pantallas pequeñas (iPhone SE) y grandes (iPad). El layout vertical 1:2 lo facilita.
4. **Sin tipos compartidos**: si el schema cambia, hay que actualizar 3 archivos. Mitigación: documentar el schema canónico aquí (§1) y referenciar desde los 3 sitios.

---

## 8. Próximo paso inmediato

Sprint 1, primer commit: migración SQL + tipo `'puzzle'` válido en backend con validador completo + transacción dual a `learning_questions` y `learning_puzzles`. Sin tocar UI. Esto desbloquea poder crear puzzles vía curl/SQL para poblar BD mientras se construye el editor.

```
backend/db/020_learning_puzzles.sql         (nuevo, migración)
backend/src/lib/puzzleValidator.ts          (nuevo)
backend/src/routes/learningClubQuestions.ts (modificado: enum + transacción + JOIN en GET)
backend/src/routes/learningDailyLesson.ts   (modificado: JOIN al servir puzzles)
docs/learning/Puzzles/IMPLEMENTATION_PLAN.md (este documento)
```

Commit propuesto: `feat(learning): añadir tipo puzzle con tabla learning_puzzles y validación completa`
