# WeMatch · Plan para el módulo PadelPuzzle

> Hoja de ruta para llevar la idea de padelchess a una versión más eficiente,
> mejor diseñada y con un editor de puzzles propio. Escrita asumiendo
> **Expo SDK 54+ · TypeScript · Supabase · NativeWind v4**.

---

## TL;DR

> **Estas decisiones son revisables.** Están tomadas con el contexto que
> tenemos hoy (análisis de padelchess + tu descripción del stack). Cuando
> abras Claude Code en el monorepo real con todo el código a la vista,
> puede que la realidad pida ajustarlas — especialmente la decisión de los
> dos renderers.

| Decisión | Recomendación | Por qué |
| --- | --- | --- |
| **Rendering en mobile (visor)** | `react-native-svg` + Reanimated, **sin canvas/Skia** | A 10-20 elementos no hay diferencia de rendimiento; ganamos bundle ligero, touch nativo y NativeWind compatible |
| **Rendering en web (editor)** | `react-konva` | UX de edición pulida out-of-the-box (Transformer, snap, selección, undo) sin construir 500 LOC |
| **Sprites de jugador** | PNG de 1 frame (356×815, ~22 KB) + scale animado en loop | Mismo efecto visual que el sprite de 8 frames con 1/8 del peso |
| **Pelota / personajes** | Ya recortados / disponibles en `assets/` | — |
| **Storage** | Supabase Postgres + Storage (thumbnails) + RLS | Encaja con tu stack actual |
| **Editor de puzzles** | Dentro de la web RN existente (`/admin`), no Next.js separado | Reutiliza auth, deploy y layout que ya tienes |
| **Caché de puzzles** | MMKV + prefetch de los siguientes 3 | Cero latencia entre puzzles |
| **Backend** | Supabase directo + Node solo para validación, thumbnails y bulk import | Aprovecha PostgREST + RLS; Node solo donde aporta |

**Decisiones a re-validar al abrir el monorepo**:

- La de **dos motores de render distintos** (SVG mobile + Konva web).
  Alternativas vivas si la duplicación duele:
  * SVG en todos lados (un solo motor, editor cuesta más).
  * Skia en todos lados (requiere asumir +3 MB en el bundle mobile).
- La estructura de **packages compartidos** (`puzzle-schema`, `puzzle-config`,
  `puzzle-assets`, `puzzle-canvas-svg`, `puzzle-canvas-konva`) — quizá tu
  monorepo ya tenga convenciones distintas.
- El alcance del **backend Node**: si ya tienes endpoints sobre los que
  encajar las nuevas rutas o si conviene migrar todo a Supabase Edge Functions.

---

## 1. Arquitectura de rendering (app mobile)

Padelchess pone **todo** dentro de un canvas Konva (court, jugadores, pelota,
opciones, shapes, drag-drop). Es elegante pero pesado y no es lo más natural
en RN. Mi propuesta es separar por capas y usar la herramienta correcta para
cada una:

```
┌─────────────────────────────────────────────┐
│ <Pressable> overlay para tap libre          │  Capa 5: gestos / opciones tappeables
├─────────────────────────────────────────────┤
│ react-native-svg (arrows, circles, rects)   │  Capa 4: shapes anotativos
├─────────────────────────────────────────────┤
│ <Animated.Image> sprites + ball             │  Capa 3: actores animados
├─────────────────────────────────────────────┤
│ react-native-svg court.svg                  │  Capa 2: pista (estática)
├─────────────────────────────────────────────┤
│ <View> bg-base-200 (NativeWind)             │  Capa 1: fondo
└─────────────────────────────────────────────┘
```

### Por qué NO Skia

`@shopify/react-native-skia` es la opción "obvia" y la usamos en muchos
proyectos, pero para este caso concreto es overkill:

- Bundle: añade ~3 MB al binario.
- No nos hace falta lo que Skia hace mejor (shaders, blurs, drawing primitives).
- Los gestos sobre objetos canvas requieren hit-testing manual; con Pressable es nativo.
- El equipo móvil ya conoce Reanimated y SVG; Skia tiene curva de aprendizaje.

### Anatomía del componente `PadelPuzzle`

```tsx
<View className="flex-1 bg-base-200">
  {/* 1. Pista (SVG estático) */}
  <Svg viewBox="0 0 1080 2080" className="absolute inset-0">
    <CourtSVG />
  </Svg>

  {/* 2. Sombras de "huellas" para dar profundidad */}
  <Footprints positions={frame.players} />

  {/* 3. Jugadores con animación idle */}
  {frame.players.map(p => (
    <Player key={p.id} {...p} userTeam={userTeam} />
  ))}

  {/* 4. Pelota con animación de tiro */}
  <Ball ball={frame.ball} animate={isAnimating} />

  {/* 5. Shapes anotativos (flechas, círculos) */}
  <Svg viewBox="0 0 1080 2080" className="absolute inset-0 pointer-events-none">
    {frame.shapes?.map(s => <Shape key={s.id} {...s} />)}
  </Svg>

  {/* 6. Opciones A/B/C como botones absolutamente posicionados */}
  {question.options.map(opt => (
    <OptionBadge
      key={opt.id}
      option={opt}
      selected={selected?.id === opt.id}
      confirmed={confirmed}
      onPress={() => selectOption(opt)}
    />
  ))}
</View>
```

### Animación idle del jugador (sin sprite sheet)

```tsx
// hooks/useBreathing.ts
export function useBreathing() {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.015, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.000, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, []);
  return useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }));
}

// Player.tsx
const breath = useBreathing();
return (
  <Animated.Image
    source={require('@/assets/player-white-back.png')}
    style={[styles.player, breath, { left, top, transform: [{ scaleX: flipX ? -1 : 1 }] }]}
  />
);
```

### Animación de la pelota (lob, chiquita, spin)

Mismo modelo que padelchess (analizado en `padelchess-analysis.md` §6) pero en Reanimated:

```tsx
const progress = useSharedValue(0);
useEffect(() => {
  progress.value = withTiming(1, { duration: ball.duration ?? 800 });
}, [ball]);

const animatedStyle = useAnimatedStyle(() => {
  const t = progress.value;
  const isLob = ball.shot_type === 'lob';
  const ease = isLob ? t : 1 - Math.pow(1 - t, 3);
  const x = start.x + (target.x - start.x) * ease;
  const y = start.y + (target.y - start.y) * ease;
  // arc for lob
  const arc = isLob ? 4 * 3.6 * t * (1 - t) : 0;
  const scale = isLob ? 6 / (6 - arc) : 1;
  // spin
  const rotation = ball.spin === 'clockwise' ? t * 270 : 0;
  return {
    transform: [
      { translateX: x }, { translateY: y },
      { scale }, { rotate: `${rotation}deg` },
    ],
  };
});
```

---

## 2. Data model en Supabase

Híbrido: columnas tipadas para lo que se filtra/consulta, JSONB para el árbol
de frames (que es muy variable y nunca se queryea con SQL).

```sql
-- Puzzles
create table puzzles (
  id              bigserial primary key,
  slug            text unique,
  title           text,
  content         text not null,                 -- enunciado en idioma base
  difficulty      smallint check (difficulty between 1 and 5),
  court_position  text default 'left' check (court_position in ('left','right','both')),
  folder_id       uuid references puzzle_folders(id),
  published       boolean default false,
  data            jsonb not null,                -- { courtPositions, options, shapes, … }
  translations    jsonb default '{}',            -- { es: { content, options }, fr: {…} }
  thumbnail_url   text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index puzzles_published_diff_idx on puzzles (published, difficulty)
  where published = true;
create index puzzles_court_position_idx on puzzles (court_position) where published = true;

-- Carpetas para organizar (categoría/lección)
create table puzzle_folders (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  parent_id   uuid references puzzle_folders(id),
  order_index int default 0
);

-- Progreso por usuario (un row por user; el detalle por puzzle va en JSONB)
create table user_progress (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  total_points         int default 0,
  level                int default 1,
  current_streak       int default 0,
  best_streak          int default 0,
  daily_solved_count   int default 0,
  last_solved_date     date,
  solved_puzzles       jsonb default '{}',       -- { "puzzleId": { points, attempts, lastAt } }
  saved_puzzles        bigint[] default '{}',
  preferences          jsonb default '{}',       -- { courtPosition, playerModel, userLevel }
  is_premium           boolean default false,
  updated_at           timestamptz default now()
);

-- Votos
create table puzzle_votes (
  user_id     uuid references auth.users(id) on delete cascade,
  puzzle_id   bigint references puzzles(id) on delete cascade,
  vote        smallint check (vote in (-1, 1)),
  created_at  timestamptz default now(),
  primary key (user_id, puzzle_id)
);

-- Roles (admin para el editor)
create table user_roles (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  role     text check (role in ('admin', 'editor', 'viewer')) default 'viewer'
);
```

### RLS (Row Level Security) — políticas mínimas

```sql
alter table puzzles enable row level security;
alter table user_progress enable row level security;
alter table puzzle_votes enable row level security;

-- Cualquiera autenticado puede leer puzzles publicados
create policy puzzles_read_published on puzzles
  for select to authenticated
  using (published = true);

-- Editores y admins pueden leer todo y escribir
create policy puzzles_admin_all on puzzles
  for all to authenticated
  using (exists (
    select 1 from user_roles
    where user_id = auth.uid() and role in ('admin','editor')
  ));

-- Usuarios solo leen/escriben su propio progreso
create policy progress_self on user_progress
  for all to authenticated
  using (user_id = auth.uid());

-- Función para el límite diario (5 puzzles para no premium)
create or replace function award_puzzle_points(
  p_puzzle_id bigint,
  p_points    int
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_user uuid := auth.uid();
  v_progress user_progress;
begin
  if v_user is null then
    return jsonb_build_object('error','unauthorized');
  end if;

  select * into v_progress from user_progress where user_id = v_user for update;

  -- Daily limit
  if not v_progress.is_premium
     and v_progress.last_solved_date = current_date
     and v_progress.daily_solved_count >= 5 then
    return jsonb_build_object('error','daily_limit');
  end if;

  -- Streak + counters
  if v_progress.last_solved_date <> current_date then
    update user_progress set daily_solved_count = 0 where user_id = v_user;
  end if;

  update user_progress set
    total_points       = total_points + p_points,
    daily_solved_count = daily_solved_count + 1,
    last_solved_date   = current_date,
    current_streak     = case when p_points > 0 then current_streak + 1 else 0 end,
    best_streak        = greatest(best_streak,
                                  case when p_points > 0 then current_streak + 1 else 0 end),
    solved_puzzles     = solved_puzzles ||
                         jsonb_build_object(p_puzzle_id::text,
                           jsonb_build_object('points', p_points, 'at', now())),
    updated_at         = now()
  where user_id = v_user
  returning * into v_progress;

  return to_jsonb(v_progress);
end;
$$;
```

Ventajas vs lo que hace padelchess:
- El daily limit y el ELO se calculan **server-side** dentro de una transacción
  (imposible de saltar desde el cliente).
- Los puzzles publicados se filtran por RLS sin que el cliente pueda pedir
  borradores.
- El admin no necesita un endpoint custom: edita directamente con PostgREST.

---

## 3. Caché y prefetch (zero-latency UX)

El cuello de botella en padelchess es que cada puzzle nuevo carga su
thumbnail y refetchea `/api/questions` si la cola se vacía. Hagámoslo mejor:

```ts
// hooks/usePuzzleQueue.ts
const QUEUE_KEY = 'wematch:puzzle-queue';
const POOL_SIZE = 50;     // puzzles cacheados
const PREFETCH_AHEAD = 3; // imágenes precargadas

export function usePuzzleQueue(filters: Filters) {
  // 1. Carga una pool de 50 puzzles del lado/dificultad del user
  const { data: pool } = useQuery({
    queryKey: ['puzzle-pool', filters],
    queryFn: () => supabase.from('puzzles')
      .select('id, content, data, translations, thumbnail_url, court_position, difficulty')
      .eq('published', true)
      .eq('court_position', filters.courtPosition)
      .order('difficulty')
      .limit(POOL_SIZE)
      .throwOnError()
      .then(r => shuffle(r.data!)),
    staleTime: 30 * 60_000,   // 30 min
  });

  // 2. Persiste la cola en MMKV (resume offline)
  const [queue, setQueue] = useMMKV<number[]>(QUEUE_KEY, []);

  // 3. Prefetch de imágenes/thumbnails de los siguientes 3
  useEffect(() => {
    queue.slice(0, PREFETCH_AHEAD).forEach(id => {
      const p = pool?.find(x => x.id === id);
      if (p?.thumbnail_url) Image.prefetch(p.thumbnail_url);
    });
  }, [queue, pool]);

  return { current, next, refill };
}
```

Sprites (jugadores, pelota) van en `require('…')` → Metro los meta en el
bundle. Sounds con `expo-audio` precargados al arrancar la pantalla.

---

## 4. Editor de puzzles → en la web RN existente (mismo repo, ruta /admin)

**No metas el editor en la app mobile.** Razones:

- Crear puzzles es trabajo de autoría (tú o un equipo de coaches), no del
  usuario final.
- Drag-drop con ratón es **mucho** más preciso que con el dedo.
- Reduces el bundle de la app mobile (~30%) sacando todo el código de edición.
- El editor puede iterar rápido sin afectar a usuarios.

### Stack del editor — aprovechar tu stack actual

Como ya tienes una **web React Native** (con react-native-web suponiendo) +
Supabase + backend Node, el editor debe vivir ahí. Concretamente:

- **Frontend**: nueva pantalla `/admin/puzzles` dentro de la web RN existente.
- **Backend**: tu Node ya conectado a Supabase — solo añadir las funciones que
  el cliente Supabase no resuelve solo (validaciones complejas, generación de
  thumbnails server-side, bulk import).
- **Autorización**: la misma sesión Supabase + check de `user_roles.role IN ('admin','editor')` con RLS.

Así reaprovechas:
- Auth (ya la tienes resuelta)
- Cliente Supabase, env vars, deploy
- Sistema de routing y layout que ya uses en la web

### Decisión: motores distintos, optimizando UX en cada lado

> **Decisión actual (revisable)**: SVG + Reanimated en mobile, react-konva
> en el editor web. La duplicación del renderer (~500 LOC) se acepta a
> cambio de UX óptima en cada plataforma.
>
> **A revisar cuando abras Claude Code en el monorepo real** con el
> contexto del código existente (estructura del repo, dependencias ya
> instaladas, patrones del equipo, performance real medida en device).
> Las dos alternativas que pueden volver a la mesa:
>
> - **SVG en todos lados**: si la duplicación duele más de lo previsto o
>   el equipo prefiere un solo motor.
> - **Skia (`@shopify/react-native-skia`) en todos lados**: si ya está en
>   el bundle por otra razón o si surgen requisitos de efectos visuales
>   avanzados (shaders, blurs, transiciones canvas-style).

#### Mobile — `react-native-svg` + Reanimated

- Visor del puzzle (10-20 elementos): rinde a 60 fps perfectos, no hay
  diferencia perceptible vs canvas.
- Touch nativo en cada forma (taps a las opciones A/B/C sin hit-testing manual).
- Bundle ligero (~150 KB vs ~3 MB de Skia).
- Compatible con NativeWind (`className` en cada `<Rect>`/`<Path>`).
- Accesibilidad disponible si algún día se requiere.

#### Web (editor) — `react-konva`

- UX de edición pulida sin tener que construirla:
  * `Konva.Transformer` → handles de resize/rotate listos.
  * Selección múltiple, drag con snap, hit-testing complejo.
  * `stage.toJSON()` / `fromJSON()` para undo/redo trivial.
  * Pan/zoom del lienzo via matriz de transformación (sin re-renderizar nodos).
- Es exactamente la API que padelchess usa → patrones documentados,
  comunidad amplia.
- Vive **solo** en el bundle web; no añade nada al de mobile.

#### Cómo se comparte sin duplicar lo importante

Lo que NO se duplica (vive en `packages/`):

- `puzzle-schema` — tipos Zod (`Question`, `Option`, `Player`, `Ball`, `Shape`).
- `puzzle-config` — `courtConfig`, `correctnessTier`, easings (`lob`, `chiquita`, `spin`).
- `puzzle-assets` — `court.svg`, `ball.svg`, sprites PNG, sonidos.
- Lógica de scoring, daily limit, niveles, streak (toda en RPC Postgres,
  llamada por igual desde cualquier cliente).

Lo único que se reescribe (~500 LOC):

- El renderer en sí: `PuzzleCanvas` (SVG en mobile, Konva en editor).

#### Truco para que el autor vea lo mismo que el usuario

El editor tiene dos vistas:

1. **Edit mode** → canvas Konva con drag/handles/snap.
2. **Preview mode** → renderiza con el **mismo `PuzzleCanvas` SVG** que la
   app mobile, compilado para web via `react-native-web`. El autor pulsa
   "Preview" y ve **exactamente** lo que verá el jugador en el móvil.

### Estructura de archivos en el monorepo

Asumiendo que tu repo está más o menos así (ajusta a la realidad):

```
wematch/
├── apps/
│   ├── mobile/                       ← Expo (la que ya tienes)
│   │   └── src/screens/PuzzlesScreen.tsx       ← usa <PuzzleCanvasSvg/>
│   ├── web/                          ← React Native Web (la que ya tienes)
│   │   └── src/screens/
│   │       ├── admin/
│   │       │   ├── PuzzleListScreen.tsx
│   │       │   ├── PuzzleEditorScreen.tsx      ← usa <PuzzleCanvasKonva/>
│   │       │   └── components/
│   │       │       ├── OptionsPanel.tsx        ← form A/B/C, points, tags
│   │       │       ├── ShapeToolbar.tsx        ← draggable origins
│   │       │       ├── TranslationsTabs.tsx
│   │       │       └── PreviewPane.tsx         ← usa <PuzzleCanvasSvg/> en RNW
│   │       └── ...
│   └── api/                          ← Node backend (el que ya tienes)
│       └── src/routes/
│           ├── puzzles.ts            ← list/create/update/delete + validate
│           ├── thumbnails.ts         ← genera PNG server-side con @napi-rs/canvas
│           └── puzzles-import.ts     ← bulk import CSV
└── packages/
    ├── puzzle-schema/                ← Zod compartido por mobile/web/api
    │   └── src/index.ts
    ├── puzzle-config/                ← courtConfig, correctnessTier, easings
    │   └── src/index.ts              ← (lob, chiquita, spin) en pure TS
    ├── puzzle-assets/                ← court.svg, ball.svg, sprites, sounds
    │   └── src/index.ts              ← exports tipados de cada asset
    ├── puzzle-canvas-svg/            ← renderer SVG (mobile + preview del editor)
    │   └── src/
    │       ├── PuzzleCanvasSvg.tsx
    │       ├── Court.tsx             ← <Svg> court.svg inline
    │       ├── Player.tsx            ← <Animated.Image> + breathing
    │       ├── Ball.tsx              ← <Animated.Image> + lob/chiquita/spin
    │       ├── OptionBadge.tsx       ← <Pressable> squircle + letra
    │       └── shapes/{Arrow,Circle,Rect,TextTag}.tsx
    └── puzzle-canvas-konva/          ← renderer Konva (solo bundle web del editor)
        └── src/
            ├── PuzzleCanvasKonva.tsx ← <Stage>/<Layer>
            ├── PlayerNode.tsx
            ├── BallNode.tsx
            ├── OptionNode.tsx
            ├── shapes/{ArrowNode,CircleNode,RectNode,TextTagNode}.tsx
            └── hooks/
                ├── useTransformer.ts ← anchors de resize/rotate
                ├── useSnap.ts        ← snap a grid 0.25 m
                └── useUndoRedo.ts    ← stage.toJSON() history stack
```

Lo importante:

- **`puzzle-schema`, `puzzle-config`, `puzzle-assets`** son la "fuente de
  verdad" — cualquier cambio se propaga a los dos renderers automáticamente.
- **`puzzle-canvas-svg`** rueda en mobile (Expo) y en web (react-native-web).
- **`puzzle-canvas-konva`** vive solo en el bundle web del editor.
- El **editor importa los dos**: Konva para el modo edición, SVG para el preview.

### Endpoints Node que añadirás

La mayoría de operaciones puede hacerlas el cliente directamente contra
Supabase (PostgREST + RLS). Tu Node solo necesita endpoints donde el
cliente no puede:

| Endpoint | Por qué en Node |
| --- | --- |
| `POST /admin/puzzles/validate` | Validación compleja con Zod antes de guardar (mismo schema que la app) |
| `POST /admin/puzzles/:id/thumbnail` | Genera el PNG con `node-canvas` o `@napi-rs/canvas` server-side (no obligas a cada autor a tener Konva web abierto) |
| `POST /admin/puzzles/import` | Sube CSV/JSON con N puzzles, valida y crea todos en una transacción |
| `POST /admin/puzzles/:id/duplicate` | Atómico, copia incluyendo translations |

Todo lo demás (CRUD, list, publish toggle) → cliente directo a Supabase.

### MVP del editor (sprint 1-2)

Pantallas:
1. **Login** (reutilizas la de la web RN).
2. **`/admin/puzzles`** — Lista paginada con filtros (publicado, dificultad,
   lado, carpeta) y búsqueda por contenido. Click → abre editor.
3. **`/admin/puzzles/new`** y **`/admin/puzzles/:id`** — Editor:
   - Canvas central con la pista (mismo `courtConfig` que la app).
   - Sidebar izquierdo: paleta de jugadores (drag al canvas).
   - Sidebar derecho: panel de opciones A/B/C con `text`, `explanation`,
     `points` (0/1/2), `tag` opcional.
   - Toolbar inferior: shapes (arrow, circle, rect, textTag) que se arrastran
     dentro del canvas.
   - Tabs arriba: idiomas (al cambiar idioma se editan solo los textos del
     `translations[lang]`, todo lo geométrico se hereda del base).
   - Botón "Preview animación": ejecuta la simulación tal como la verá el
     usuario en la app — **reusa el mismo componente `PadelPuzzle`** de
     la app mobile compilado para web.
   - Botón "Publish" (toggle) → marca `published=true`.

### Polish v2 (sprint 3+)

- **Snap a la grid** cada 0.25 m para alinear posiciones.
- **Validación visual**: mínimo 1 jugador por equipo, exactamente 1 pelota,
  mínimo 2 opciones, exactamente 1 opción con `points=2`.
- **Atajos teclado**: `Delete` borra selección, `D` duplica, flechas mueven
  1 px (Shift = 10 px), `Cmd+S` guarda.
- **Bulk import**: subir CSV con coordenadas para auto-generar variaciones.
- **AI assist** (opcional, llamando a Anthropic/OpenAI desde el Node):
  sugerir explicaciones a partir de la posición y la opción correcta.
- **Comments** entre editores (revisión).

---

## 5. Estructura interna de la app mobile

```
apps/mobile/src/
├── app/                              ← Expo Router
│   ├── (tabs)/
│   │   ├── puzzles.tsx               ← usa <PuzzleScreen/>
│   │   ├── leaderboard.tsx
│   │   └── profile.tsx
│   └── _layout.tsx
├── screens/
│   └── PuzzleScreen.tsx              ← orquestador + estado
├── components/
│   ├── ChatBubble.tsx                ← enunciado / explicación
│   ├── ConfirmBar.tsx                ← A/B/C + Confirm/Next
│   ├── RightRail.tsx                 ← avatar, streak, score
│   └── sheets/
│       ├── PaywallSheet.tsx
│       └── LevelUpSheet.tsx
├── hooks/
│   ├── usePuzzleQueue.ts
│   ├── useAwardPoints.ts             ← llama RPC award_puzzle_points
│   └── useSounds.ts                  ← expo-audio precarga
├── lib/
│   └── supabase.ts
└── stores/
    └── puzzleStore.ts                ← Zustand: state global del puzzle activo
```

El render del puzzle vive en `packages/puzzle-canvas` (compartido). La app
mobile importa `<PuzzleCanvas editMode={false} {...puzzle} />`, le envuelve
en sus chrome (chat-bubble, confirm-bar, right-rail) y conecta los gestos
de tap con los handlers de scoring.

---

## 6. Performance budget

| Métrica | Objetivo |
| --- | --- |
| Bundle de la app | < 35 MB |
| Cold start hasta puzzle | < 1.5 s |
| Tiempo entre puzzle N y N+1 | < 100 ms (precacheado) |
| Animación lob/chiquita | 60 fps consistente |
| Memoria por puzzle | < 5 MB |
| Sounds | 4 MP3 × ~50 KB = ~200 KB, precargados al montar la pantalla |
| Sprites totales | 2 PNG (back + face) × ~25 KB = ~50 KB; +2 si se añaden personajes negros |
| Pista | `court.svg` ~15 KB inline en el bundle |
| Pelota | `ball.svg` <1 KB |

Cosas que ayudan:
- `react-native-fast-image` o `expo-image` (caché disco automática).
- `react-native-mmkv` para storage (10× más rápido que AsyncStorage).
- `Reanimated 3+` con worklets (animaciones en el thread UI).
- `React Compiler` (opt-in en Expo SDK 54+) → menos `useMemo` boilerplate.

---

## 7. Roadmap propuesto

| Sprint | Entregable |
| --- | --- |
| **1** | Schema Supabase + Auth + componente `PadelPuzzle` mínimo (court + 1 player + ball estático) |
| **2** | Opciones A/B/C tappeables + Confirm + sounds + scoring local |
| **3** | Animaciones (idle, lob, chiquita, spin) + Reanimated + tween de jugadores |
| **4** | Niveles, streak, daily limit (RPC `award_puzzle_points`) + paywall opcional |
| **5** | i18n + leaderboard + saved puzzles |
| **6** | Editor web Next.js (MVP — list + create + edit + publish) |
| **7** | Editor v2 (translations, shapes avanzados, validación, snap-to-grid) |
| **8** | Pulido: rolling release, A/B test de paywall, analítica con PostHog |

---

## 8. Decisiones que NO he tomado por ti

1. **Modelo de monetización**: ¿free + premium (5/día gratis tipo padelchess),
   suscripción mensual, freemium con anuncios? Afecta a `is_premium`, paywall,
   integración con RevenueCat/Stripe.
2. **Multi-tenant** (academias / clubs con sus propios puzzles): si quieres
   esto, las tablas necesitan `organization_id` y RLS adicional desde el día 1.
3. **Algoritmo de selección**: padelchess hace shuffle puro. Para WeMatch
   propondría **spaced repetition** (SM-2 simplificado) priorizando puzzles
   fallados — es el mayor valor diferencial vs padelchess.
4. **Stack de auth**: Supabase Auth nativo es lo más simple, pero si tienes
   ya Clerk o quieres Sign in with Apple obligatorio en iOS, tiene impacto.

Avísame cuando quieras y arrancamos por el sprint 1: bootstrap del proyecto
con el schema Supabase y un primer `PadelPuzzle` renderizando un puzzle hardcoded.
