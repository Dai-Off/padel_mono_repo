# PadelChess.me — Análisis técnico

> Reverse-engineering de https://www.padelchess.me/puzzles para reproducir su componente
> de puzzles tácticos en un proyecto **React Native (Expo) + TypeScript + Supabase + NativeWind**.
>
> Fecha de extracción: 2026-04-30 — `dpl_BNU4iY1pB5qeN1REwdR4SdtaPFdM`.

---

## 1. Stack del sitio original

| Capa | Tecnología |
| --- | --- |
| Framework | Next.js 16 (App Router) + Turbopack, despliegue en Vercel |
| UI | React + Tailwind v4 + DaisyUI v5 (clases `btn`, `squircle`, `base-200`, `base-300`, `bg-success`, `font-bebas-neue`, `font-inter`) |
| Iconos | Lucide (inline SVG `lucide-*`) |
| Canvas / animación | **Konva.js** + **react-konva** (`<Stage>`, `<Layer>`, `<Image>`, `<Group>`, `<Sprite>`, `Konva.Animation`, `Konva.Tween`) |
| Auth | NextAuth (`/api/auth`) + Sign in con Google + sesiones server-side |
| Mobile wrapper | Capacitor (con detección de Telegram Web App) |
| Pagos | RevenueCat + Stripe (suscripciones, premium) |
| Telemetría | PostHog |
| Estilo | Pantalla **fija** (`fixed inset-0 h-[100dvh]`), orientación vertical, `aspect-1/2` para la pista |
| Idioma | i18n custom (`useTranslation`, `tc('q{id}_o{id}_exp')`) — claves por puzzle traducibles a varios idiomas |
| PWA | manifest.json + iconos 192/384/512 |

La página `/puzzles` se renderiza como **client component** (`<template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING">`) con un componente `Court` cargado vía `next/dynamic({ ssr:false })`, módulo interno `93372` resuelto a `43129`.

---

## 2. Endpoints de la API

Todas las llamadas son a la propia app (Next.js Route Handlers), no a Supabase directamente:

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/api/questions` | Lista de **puzzles** (mezclados client-side con Fisher-Yates). Acepta `?editMode=true` para devolver también borradores. |
| `POST` | `/api/questions` | Crear puzzle. |
| `PUT` | `/api/questions/{id}` | Actualizar puzzle (cuerpo `{ question }`). |
| `DELETE` | `/api/questions/{id}` | Borrar. |
| `POST` | `/api/questions/vote` | `{ questionId, vote: 'up' \| 'down' }`. |
| `POST` | `/api/thumbnails/{id}` | Sube `imageDataUrl` PNG generado client-side desde Konva (`stage.toDataURL`). |
| `GET` | `/api/user/me` | Sincroniza progreso del usuario autenticado. |
| `PUT` | `/api/user/me` | Persiste cambios incrementales (`{ questionId, points, currentStreak, ... }` o `{ courtPosition, playerModel, userLevel, ... }` o `{ sync:true, localData }`). |
| `DELETE` | `/api/user/me` | Reset progreso. |
| `POST/DELETE` | `/api/user/saved-questions` | Bookmark/unbookmark `{ questionId }`. |
| `GET` | `/api/users/leaderboard?…` | Ranking global / streak / por country / por court position. |
| `GET` | `/api/users/leaderboard/me?…` | Posición propia. |
| `GET` | `/api/users/countries` | Lista países disponibles para filtro. |
| `GET/POST/PUT/DELETE` | `/api/dictionary` y `/api/dictionary/{id}` | Glosario de términos resaltables en explicaciones. |
| `GET` | `/api/exercise-folders` | Carpetas para agrupar puzzles (modo edición). |
| `*` | `/api/auth/*` | NextAuth (Google + email passwordless). |

> Si traducimos esto a Supabase: cada endpoint encaja con una tabla:
> `questions`, `users`, `saved_questions`, `votes`, `dictionary_terms`, `exercise_folders`,
> `thumbnails` (Storage). El servidor Next.js es la única capa que habla con la DB y aplica
> el límite diario (5 puzzles/día gratis) — no se puede mover esa lógica al cliente.

---

## 3. Schema de un Puzzle (`Question`)

Reconstruido a partir de los call-sites:

```ts
type Team = 1 | 2;                       // 1 = blanco (abajo, "tú"); 2 = negro (rivales arriba)
type CourtPosition = 'left' | 'right' | 'both';
type ShotType = 'lob' | 'chiquita' | undefined;
type Spin = 'random' | 'clockwise' | 'counter-clockwise' | undefined;
type Facing = 'face' | 'back' | undefined;

interface Player {
  id: number;
  team: Team;
  x: number;        // metros (0..10)
  y: number;        // metros (0..20)
  facing?: Facing;
  speechLabel?: string;
}

interface Ball {
  x: number;
  y: number;
  shot_type?: ShotType;
  spin?: Spin;
}

interface Shape {
  id: number;
  type: 'circle' | 'arrow' | 'rect' | 'triangle' | 'textTag';
  visibleOnlyAfterConfirmation?: boolean;

  // circle
  x?: number; y?: number; radius?: number; dashed?: boolean;
  // arrow
  startPoint?: { x: number; y: number };
  endPoint?:   { x: number; y: number };
  controlPoint?: { x: number; y: number };
  pointerAtBeginning?: boolean;
  pointerAtEnding?: boolean;
  tagText?: string;        // anotación sobre la flecha
  tagPosition?: number;    // 0..1
  tagFontSize?: number;
  // rect / triangle
  width?: number; height?: number;
  points?: number[];       // triangle: [x1,y1,x2,y2,x3,y3]
  fillColor?: string; fillOpacity?: number;
  // common
  color?: string;
}

interface PositionFrame {
  id?: number;
  duration?: number;                           // ms; en mobile pasa por resolveDurationMs()
  visibleOnlyAfterConfirmation?: boolean;      // frame que sólo se ve tras confirmar
  players: Player[];
  ball: Ball;
  shapes?: Shape[];
}

interface Option {
  id: 1 | 2 | 3;                               // letra = String.fromCharCode(64+id) ⇒ A/B/C
  text: string;                                // pregunta corta del bocadillo
  explanation: string;                         // texto largo que aparece al confirmar
  points: 0 | 1 | 2;                           // 0=mala, 1=parcial, 2=correcta
  coordinates?: { x: number; y: number };      // posición del badge en la pista (default x:2+(id-1)*2.5, y:4)
  tag?: string;                                // texto adicional pegado al badge
  tagPosition?: 'left' | 'right';              // a qué lado del badge
  courtPositions: PositionFrame[];             // frames que se animan al elegir esta opción
}

interface Translation {
  content?: string;
  options?: Array<{ id: number; text?: string; explanation?: string }>;
}

interface Question {
  id: number;
  title?: string;
  content: string;                             // enunciado (también vía i18n key q{id})
  folderId?: string | null;
  courtPosition?: CourtPosition;               // para qué jugador es relevante (filtro UI)
  isCreatedOnMobile?: boolean;
  published?: boolean;
  upvotes?: string[];                          // emails
  downvotes?: string[];

  courtPositions: PositionFrame[];             // frames base (antes de elegir opción)
  options: Option[];                           // 1..3 opciones
  translations?: Record<string, Translation>;  // ej. { es: {...}, fr: {...} }

  scenarios?: Array<{                          // modo "storyboard" para previews/intros
    id: number;
    courtPosition: PositionFrame;
    text: string;
  }>;

  videos?: Array<{ id: string; url: string; ... }>; // YouTube tutoriales asociados
  thumbnailUrl?: string;
}
```

**Notas clave:**

- La pista mide `10 × 20 m` en coordenadas internas. El equipo blanco (id=1) ocupa la
  mitad inferior `[0..10, 10..20]`; el equipo negro (id=2) la superior `[0..10, 0..10]`.
- El cliente nunca conoce "la respuesta correcta" como tal: simplemente cada opción
  trae su `points` y la animación posterior. La función helper:

  ```ts
  // chunk 0piuvchv1jbrb, módulo 1162
  function correctnessTier(points: number | null | undefined) {
    if (points == null || points <= 0) return 'error';
    if (points === 1) return 'warning';
    return 'success';
  }
  ```

  determina el color del feedback (rojo / amarillo / verde).
- Cada opción puede tener su propia animación final: si entre sus `courtPositions`
  hay alguna con `visibleOnlyAfterConfirmation:true`, ése es el frame que se anima
  al confirmar (la pelota se desplaza a su nuevo destino, los jugadores se mueven con
  `Konva.Tween`, las flechas/rectángulos "spoiler" aparecen).

---

## 4. Configuración visual (`courtConfig`)

Constante exportada (chunk `0piuvchv1jbrb`, módulo 85034):

```ts
export const courtConfig = {
  surface: { width: 10, height: 20, color: '#3b82f6' },
  line:    { color: '#ffffff', width: 0.07 },
  post:    { color: '#4d4d4d', width: 0.15, height: 1 },
  net: {
    width: 10,
    heightEdges: 0.92,
    heightCenter: 0.88,
    color: '#d0d0d0',
    meshColor: 'rgba(0,0,0,0.5)',
    meshLineWidth: 0.5,
    meshTargetTilePx: 6,
  },
  player: { radius: 0.6 },
  ball:   { radius: 0.4, color: '#daf843', stroke: 'rgba(0,0,0,0.25)', strokeWidth: 2 },
  arrow:  { color: '#ddd', width: 12, selectedColor: '#ffcf68', selectedWidth: 14 },
  wall: {
    postSize: 0.12,
    postDepth: 0.18,
    postColor:  'rgba(20,20,20,0.9)',
    glassColor: 'rgba(200,220,255,0.35)',
    fenceColor: 'rgba(10,10,10,0.75)',
    glassSectionLength: 4,
    backPanelCount: 5,
    sidePanelCount: 2,
  },
};
```

Las líneas de pista se dibujan así (en metros, `f = surface.height = 20`):

| Línea | Coordenadas | Notas |
| --- | --- | --- |
| Línea central de saque (vertical) | `x = 5`, `y = 2.6 .. 17.4` | Sólo entre líneas de saque, no toda la pista |
| Red (horizontal gruesa) | `y = 10` | `2 × line.width` para destacarla |
| Línea de saque equipo arriba | `y = 3` | (= `f − 17`) |
| Línea de saque equipo abajo | `y = 17` | (= `f − 3`) |

La red se renderiza como una `Shape` con scene-function que dibuja la malla por
cuadrículas de ~6 px, más dos postes laterales, una banda negra superior y la curva
catenaria blanca (la red se hunde 4 cm en el centro).

---

## 5. Renderizado de un Player

Componente `Player` (chunk `02x.3hbn-576r`):

- Es un `<Group>` Konva con `id="player-{id}"`, draggable solo en `editMode`.
- Mapea `team` y `userPlayerModel` a sprite:
  - `team===1` (blanco / "tú") → `/court/player-white-back-sprite-idle.png`
  - `team===1` y `userPlayerModel==='female'` → `/court/player-white-back-female.png`
  - `team===2` (rival) → `/court/player-black-face-sprite-7.png`
  - Si `player.facing==='face'` → fuerza `/court/player-white-face_sprite-idle.png`
  - Si `player.facing==='back'` → fuerza `/court/player-black-back_sprite-idle.png`
- `flipX` calculado en función de la posición de la pelota (el jugador "mira hacia
  donde está la pelota").
- Si `selectedPlayerId === id`, dibuja un anillo verde `#10b981` alrededor.
- Muestra una etiqueta amarilla con `speechLabel` o "you" (para el jugador propio
  cuando aún no se ha elegido opción).
- Tamaño visual: lado del cuadrado `= 3.5 × radius × pixelsPerMeter` ≈ `2.1 m`.
- Memoizado: solo re-renderiza si cambia `id|x|y|team|isUser|editMode`.

---

## 6. Animación de la pelota

Componente `Ball` con `Konva.Animation`:

```ts
// Pseudocódigo del loop por frame
const t = Math.min(elapsed / duration, 1);
const isLob       = ballTarget.shot_type === 'lob';
const isChiquita  = ballTarget.shot_type === 'chiquita';

// Easing: parábola para lob/chiquita; ease-out cúbico para resto
const ease = (isLob || isChiquita) ? t : 1 - Math.pow(1 - t, 3);

x = start.x + (target.x - start.x) * ease;
y = start.y + (target.y - start.y) * ease;

// Spin → rotación
if (spin === 'clockwise')         rotation = (elapsed/1000) *  270;
if (spin === 'counter-clockwise') rotation = (elapsed/1000) * -270;
if (spin === 'random')            rotation = (elapsed/1000) * (Math.random()*180 - 90);

// Lob/chiquita: arco vertical fingido con escala + sombra
if (isLob || isChiquita) {
  const arc = 4 * (isLob ? 3.6 : 1.2) * t * (1 - t);  // pico en t=0.5
  scale       = 6 / (6 - arc);          // se "agranda" al subir
  shadowBlur  = 4 + 20 * arc/6;
  shadowAlpha = 0.2 - 0.15 * arc/6;
  shadowOff   = 2 + 10 * arc/6;
}
```

`duration` por defecto = 800 ms. `resolveDurationMs(d)` se aplica solo a puzzles
`isCreatedOnMobile:true` (probablemente convierte segundos→ms para puzzles legacy).

Animación de los jugadores: `Konva.Tween` con `EaseInOut` y duración tomada del frame.

---

## 7. Renderizado de las opciones A/B/C

Cada `Option` es un `<Group>` clickable en el canvas, posicionado en
`coordinates.x, coordinates.y` (default `x: 2 + 2.5*id`, `y: 4`):

- **Forma "squircle"**: `Konva.Shape` con `sceneFunc` que dibuja una superelipse
  `|x|^0.5 + |y|^0.5 = r` (más cuadrada que un círculo), con sombra y borde.
- **Texto**: letra A/B/C en Bebas Neue, bold, centrado.
- **Tamaño**: `width = 18 * pixelsPerMeter / 20`; **escala** crece de `1×` a
  `1.4× × 1.6` cuando está seleccionada (`Konva.Animation` 200 ms).
- **Color de relleno** según estado:
  - No seleccionada, sin confirmar → blanco
  - Seleccionada, sin confirmar → `#262626` (gris oscuro)
  - Confirmada → `var(--color-success)` / `--color-warning` / `--color-error`
    según `correctnessTier(points)`.
- **Opacidad**: `1` si está seleccionada, `0.4` si hay otra seleccionada, `1` si
  no hay ninguna seleccionada (animación 400 ms con ease-out cúbico).
- **Tag opcional**: `Label` con texto `option.tag` a izquierda o derecha del badge.

Tap (`onPointerDown`) — debounce de 300 ms:

```ts
if (option.id === currentSelected?.id) setOption(null);   // toggle off
else { playSound('/sounds/snap.mp3', 0.8); setOption(option); }
```

Existen **además** botones DOM duplicados en el footer (uno por opción) con la misma
acción + tooltip con número, accesibles vía teclado.

---

## 8. Flujo de respuesta y puntuación

Definido en `AppStateContext` (`chunk 0byf6q2by_cpk`) y dispatcher de teclado
(`chunk 0r6snce77jwfl`):

```
[seleccionar] tap badge / tecla 1/2/3/A/B/C    →  setOption(opt) + snap.mp3
[confirmar]  tap "Confirm" / tecla Espacio     →  setIsOptionConfirmed(true)
                                                  awardPointsIfNotAnswered(opt.points * 100)
                                                  + success.mp3 (points===2) o wrong-answer.mp3
[deshacer]   tecla Esc                          →  setOption(null)
[siguiente]  tap "Next" / tecla Espacio (post)  →  next-question.mp3 + nextQuestion()
```

`awardPointsIfNotAnswered(deltaPoints: number)`:

1. Si la pregunta ya estaba en `answeredQuestions` → no premia, no incrementa daily.
2. Marca el día actual; resetea `dailySolvedCount` si cambió la fecha.
3. **Daily limit** (no premium): si tras esta respuesta `dailySolvedCount > 5`,
   abre paywall (`reach_puzzles_limit` PostHog event), no premia.
4. Suma puntos al score, incrementa `solvedQuestionCounts[questionId]`.
5. Streak: `currentStreak++` si `points>0`, sino `=0`. Actualiza `bestStreak`.
6. Persiste localStorage (`padel-chess-local-progress`) y, si auth, manda
   `PUT /api/user/me {questionId, points, currentStreak, bestStreak}`.
7. Devuelve `true` si premió, `false` si fue 0 puntos.

**Niveles** (función `getCurrentLevel(score)` chunk `0byf6q2by_cpk` módulo 54438):

```ts
const thresholds = [500, 2000, 4000];   // L2, L3, L4
// L5+: cada salto crece 30%: gap_n = gap_{n-1} * 1.3
// L1 = 0..499; L2 = 500..1999; L3 = 2000..3999; L4 = 4000..(4000+gap*1.3); ...
```

`triggerLevelUpModal()` se dispara cuando el nivel calculado supera el
`displayLevel` actual.

---

## 9. UI principal (puzzles page)

```
┌─────────────────────────────────────────┐
│ safe-area top                           │
│ ┌─pista (aspect 1:2)─────┐ ┌right-rail┐ │
│ │ <Stage Konva>          │ │ avatar   │ │
│ │   court + walls + net  │ │ chevron  │ │
│ │   players + ball       │ │ streak🔥  │ │
│ │   shapes (arrows…)     │ │ score    │ │
│ │   options A B C        │ │          │ │
│ │   [overlay Court switch│ │          │ │
│ │    L / B / R when edit]│ │          │ │
│ └────────────────────────┘ └──────────┘ │
│  ┌─chat bubble (texto pregunta/opción)┐ │
│  └───────────────────────────────────┘  │
│  ┌─[A][B][C]  [Confirm] / [↺ ↗ Next]──┐ │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
+ Drawers (bottom-sheet): LevelProgress, Leaderboard, Scoreboard,
  Login, Settings, Dictionary, Tags, Share, Paywall, SuccessPopup, Videos
```

- **Right-rail** muestra avatar (login si no autenticado) y la **gauge de progreso**
  (barra vertical verde con número del score en bebas-neue dentro de un squircle).
- El icono de **flame** se vuelve naranja con la racha (`text-orange-600`).
- En modo edición aparecen flechas para navegar entre puzzles y un drawer de tags.

Filtro de "lado de pista" (Court Position): el usuario elige `left|right|both` y
los puzzles se filtran por `question.courtPosition`. Persistido en `/api/user/me`.

---

## 10. Assets que usaremos en WeMatch

Inventario mínimo (todos en `assets/`, ya empaquetables en la app):

```
assets/
├── court.svg                ← pista vectorial reescrita desde cero
├── ball.svg                 ← pelota original WeMatch (sin atribución externa)
├── player-white-back.png    ← jugador propio (frame único, 356×815, ~22 KB)
└── player-white-face.png    ← jugador rival (frame único, 356×815, ~30 KB)
```

Pendiente cuando se integren:

- **Sonidos**: 4 efectos (`snap`, `success`, `wrong-answer`, `next-question`).
  Hay que crear/licenciar versiones propias antes del release público.
- **Otras variantes de jugador** (femenino, equipo negro/distinto color):
  diseñar/encargar nuevos sprites cuando hagan falta. Mantener el formato
  PNG 356×815 para drop-in compatibility.

**Court / Pista**: NO existe como SVG ni como PNG — se dibuja **íntegramente en
canvas** (Konva) a partir del `courtConfig` y `surface.color`. Para reproducirlo
en React Native podemos:

- Usar `react-native-svg` con paths idénticos a los que dibuja el cliente, o
- Usar `react-native-skia` (recomendado: rendimiento canvas-like, animaciones con
  `Skia.Animation`, soporte de imágenes y sombras), o
- Pre-renderizar la pista como SVG estático y solo animar jugadores+pelota encima
  con `Animated`/`Reanimated`.

**Recomendación**: para `PadelPuzzle` en Expo, usar **`@shopify/react-native-skia`**
(o `react-native-svg + reanimated`) — encaja mejor con el modelo Konva y permite
trasladar `sceneFunc`, `Tween` y `Animation` casi 1:1.

---

## 11. Adaptación a React Native + Supabase

### 11.1. Sugerencia de stack

| Concepto Web (Konva) | Equivalente Expo |
| --- | --- |
| `<Stage>` + `<Layer>` | `<Canvas>` de `@shopify/react-native-skia` |
| `Konva.Image` | `<Image>` de Skia con `useImage(require('./player-white.png'))` |
| `Konva.Animation` | `useFrameCallback` + `useSharedValue` (Reanimated) o `useClock` (Skia) |
| `Konva.Tween` | `withTiming` (Reanimated) o `useTiming` (Skia) |
| `Audio` (DOM) | `expo-audio` (`useAudioPlayer`) |
| `localStorage` | `@react-native-async-storage/async-storage` o `expo-sqlite/kv-store` |
| Bottom-sheets | `@gorhom/bottom-sheet` |
| Tailwind classes | NativeWind v4 (mantén `squircle` con `border-radius` + clip si es necesario) |
| Lucide inline SVG | `lucide-react-native` |
| Fuentes Inter/Bebas | `expo-font` (`@expo-google-fonts/inter`, `@expo-google-fonts/bebas-neue`) |

### 11.2. Tablas Supabase (mínimas)

```sql
create table puzzles (
  id            bigserial primary key,
  title         text,
  content       text not null,
  court_position text default 'left' check (court_position in ('left','right','both')),
  folder_id     uuid references exercise_folders(id),
  published     boolean default false,
  is_created_on_mobile boolean default false,
  court_positions jsonb not null,           -- PositionFrame[]
  options       jsonb not null,             -- Option[]
  translations  jsonb default '{}',
  videos        jsonb default '[]',
  thumbnail_url text,
  upvotes       text[] default '{}',
  downvotes     text[] default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create table user_progress (
  user_id              uuid primary key references auth.users(id),
  total_points         int default 0,
  level                int default 1,
  current_streak       int default 0,
  best_streak          int default 0,
  daily_solved_count   int default 0,
  last_solved_date     date,
  answered_questions   jsonb default '[]',  -- ids
  solved_question_counts jsonb default '{}',
  saved_questions      jsonb default '[]',
  user_level           text default 'intermediate',
  court_position       text default 'left',
  player_model         text default 'male',
  is_premium           boolean default false,
  subscription_plan    text,
  updated_at           timestamptz default now()
);

create table puzzle_votes (
  user_id     uuid references auth.users(id),
  puzzle_id   bigint references puzzles(id),
  vote        smallint check (vote in (-1, 1)),
  created_at  timestamptz default now(),
  primary key (user_id, puzzle_id)
);
```

Para el límite diario, usa una **Edge Function** (`/award-points`) que reciba
`{ puzzle_id, points }`, valide con RLS y `select count(*) from … where date = today`,
y devuelva `{ awarded:bool, daily_count, total_points, level }`.

### 11.3. Componente `PadelPuzzle` propuesto

```
PadelPuzzle/
├── index.tsx                 ← entry export
├── PuzzleProvider.tsx        ← ContextStore (≈ AppStateProvider) + Supabase sync
├── Court.tsx                 ← Skia canvas: surface, lines, net, walls
├── Player.tsx                ← <Image> + flip + selection ring
├── Ball.tsx                  ← Skia animation (lob/chiquita arc + spin)
├── OptionBadge.tsx           ← squircle + letter + tap handler
├── Shapes/
│   ├── Arrow.tsx
│   ├── Circle.tsx
│   ├── Rect.tsx
│   ├── Triangle.tsx
│   └── TextTag.tsx
├── ChatBubble.tsx            ← pregunta/explicación, vincula con Dictionary
├── ConfirmBar.tsx            ← A/B/C buttons + Confirm/Next
├── RightRail.tsx             ← avatar, streak, score gauge
├── sheets/
│   ├── LevelProgressSheet.tsx
│   ├── LeaderboardSheet.tsx
│   ├── PaywallSheet.tsx
│   └── SuccessSheet.tsx
├── hooks/
│   ├── useCourtDimensions.ts  ← (pixelsPerMeter, dimensions, offset)
│   ├── usePuzzleQueue.ts      ← shuffle Fisher-Yates + queue persist
│   ├── useAwardPoints.ts      ← lógica nivel + streak + paywall
│   └── usePuzzleSounds.ts     ← carga expo-audio + volúmenes
├── utils/
│   ├── courtConfig.ts         ← idéntico al original
│   ├── correctnessTier.ts
│   ├── geometry.ts            ← squircle path, easings (lob/chiquita)
│   └── leveling.ts            ← getCurrentLevel/getLevelThreshold
└── types.ts                   ← Question, Option, Player, Ball, Shape, etc.
```

**Eventos a respetar:**

- `setOption(opt)` debe sentirse instantáneo (la UI animará la opacidad y la escala
  con Reanimated en 200/400 ms, igual que el original).
- Al confirmar, los frames `visibleOnlyAfterConfirmation` deben aparecer/animar
  *antes* o *junto* con el modal de explicación.
- En mobile la pista es vertical y ocupa `aspect-[1/2]` casi toda la pantalla;
  el chat-bubble y las opciones quedan **abajo** dentro de un safe-area.
- El nivel diario se persiste server-side: el cliente sólo es optimista.

### 11.4. Detalles de UX que conviene replicar

- **Snap haptics**: el sonido `snap.mp3` al seleccionar combina muy bien con
  `Haptics.selectionAsync()` (expo-haptics).
- Drag-to-confirm está deshabilitado: el usuario debe pulsar Confirm.
- Cuando ya respondiste correctamente un puzzle, no se vuelve a premiar pero sí
  se muestra la explicación (mensaje "You already solved this puzzle.").
- "Save Progress" prompt cuando hay datos locales y el usuario hace login (sync).
- El paywall aparece tras 5 puzzles diarios + bloquea la pista con un overlay
  `bg-black/60 z-20`.
- Si el usuario está en Telegram WebApp (`window.Telegram?.WebApp`), usa
  `h-screen` en vez de `h-[100dvh]` para evitar el footer flotante. (En RN no
  aplica, pero vale anotarlo si en algún momento se embebe).

---

## 12. Lo que deberíamos pedir al equipo de PadelChess (si colaboran)

Lo extraído cubre la lógica visible al cliente, pero no:

- El **algoritmo de selección de puzzles** (¿estrictamente aleatorio o spaced
  repetition basado en `wronglyAnsweredQuestions`/`solvedQuestionCounts`?). El
  código sugiere **shuffle Fisher-Yates puro** del catálogo entero, refilling cuando
  la cola se agota. No hay personalización detectable.
- El **modelo ELO/Rating** del leaderboard (la columna "Rating" no se calcula en
  el cliente).
- Cómo determinan `points: 0/1/2` los autores (¿hay rúbricas internas?).
- Costes / cuotas / cifras reales del paywall.

El resto está cubierto por los assets en `assets/padelchess-reference/` y por los
fragmentos de código incluidos en este documento.
