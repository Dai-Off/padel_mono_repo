# Delta — qué hay que añadir a WeMatch para soportar los puzzles importados

Esto es **solo lo que falta**. Court, sprites de jugador, animaciones de bola (lob/chiquita/spin), layout (chat bubble + botones DOM + Confirmar) y el schema base ya están. Si te encuentras escribiendo código para alguna de esas piezas, te has equivocado de fichero — verifica en el repo antes de duplicar.

---

## 1. Shapes sobre la pista (bloqueante, el grueso del trabajo)

6 tipos: `circle`, `arrow`, `rect`, `line`, `text`, `triangle`. Aparecen en 125/126 puzzles del catálogo. Sin esto, el jugador no entiende de dónde viene la pelota ni qué se le pregunta.

**Dos contextos de render, ambos necesarios:**

- **Web admin editor**: usa canvas. Los admins crean y editan puzzles desde aquí — necesitan poder dibujar, arrastrar, redimensionar y borrar cada tipo de shape. El estado del editor ya trabaja sobre canvas, así que añade aquí el tooling para los 6 tipos.
- **Mobile (visor del usuario)**: usa SVG + `react-native-svg` y la librería `Animated` de React Native. Las shapes son `<Circle>`, `<Path>` (para arrow con `controlPoint` curvado, y line con polyline), `<Rect>`, `<Text>`, `<Polygon>` (triangle). Solo lectura — no se editan en mobile.

Schema detallado de cada tipo (campos, defaults, render) en `02-SHAPES-AND-BADGES.md`.

**Filtrado a nivel shape:** además del flag a nivel frame, cada shape puede llevar `visible_only_after_confirmation: true`. En `initial_frame` y en `select_frame` esas shapes se omiten; solo aparecen en `confirmation_frame`. Es lo que hace que los rects rojo/verde de las zonas objetivo solo se vean tras confirmar la respuesta — sin este filtro, el spoiler se ve desde el inicio.

**Sitios a tocar:**
- Web: el componente/canvas del editor admin (donde sea que viva el editor de puzzles).
- Mobile: `PuzzleStage.tsx` — hoy solo renderiza `Court + AnimatedPlayer + AnimatedBall`; hay que añadir una capa `<Shapes>` por encima del court y por debajo de jugadores/pelota (orden Z: court → shapes → players → ball → badges).

---

## 2. Badges A/B/C dentro del canvas/SVG (bloqueante)

El campo `badge_position?: { x: number; y: number }` ya está reservado en `puzzle.ts:37` pero ningún componente lo pinta. Hoy los A/B/C solo existen como `Pressable`s en `optionsRow` debajo de la pista.

**Lo que falta:** squircles A/B/C **dentro** del canvas/SVG, en `option.badge_position` (o el default `{ x: 2 + 2.5 × option.id, y: 4 }` si no viene). Lado ~1.8 m, border radius ~0.22 m, sombra suave.

Los DOM buttons de abajo y los badges en pista son **espejo** — pulsar uno equivale al otro y reflejan el mismo estado. La capa DOM se queda para accesibilidad y fallback en pantallas pequeñas.

**Tres estados** (no se renombran a "correcto" / "incorrecto"):

- `default` — fondo blanco
- `selected` — fondo naranja (`#fb923c`)
- `confirmed` — fondo verde (`#22c55e`) si `option.is_correct === true`, rojo (`#ef4444`) si `false`

El color del `confirmed` no es un estado propio — se calcula en el render desde `is_correct`. Un único nombre de estado, dos posibles fills.

**Regla derivada (no es un estado):** cuando algún badge está en `selected` o `confirmed`, los otros se renderizan al **40% de opacidad** (siguen blancos, solo atenuados). Es un cálculo del render, no metadato.

Detalle visual completo (squircle path, tipografía, dimensiones) en `02-SHAPES-AND-BADGES.md`.

**Sitios a tocar:**
- Web: capa de badges en el editor canvas (solo posicionables, no editables más allá de mover).
- Mobile: añadir capa `<Badges>` en `PuzzleStage.tsx`, sincronizada con el estado `selected` / `confirmed` que ya maneja `PuzzleQuestion.tsx`.

---

## 3. Schema split: `reveal_frame` → `select_frame` + `confirmation_frame` (bloqueante)

Hoy en `puzzle.ts` y en `055_learning_puzzles.sql` cada opción tiene un único `reveal_frame`. Hay que partirlo en dos.

**Diferencia funcional:**

- `select_frame`: el estado al pulsar la opción, **antes** de confirmar. Trae contexto (flechas de trayectoria entrante, círculos resaltando jugadores). Sin spoilers — todas las shapes con `visible_only_after_confirmation` se filtran al renderizar.
- `confirmation_frame`: el estado tras pulsar Confirm. Mismo contenido + spoilers (rects rojo/verde, texto explicativo, posición final de la pelota).

**Cuándo son el mismo objeto:** cuando el origen del puzzle solo definió un frame, `select_frame` y `confirmation_frame` apuntan a la misma estructura. La única diferencia visual entonces es el filtrado de shapes con vOAC + el color del badge.

**Surfaces a actualizar:**
- Migración SQL — bump de schema_version + transformar `options[].reveal_frame` en `options[].select_frame` y `options[].confirmation_frame` (duplicar contenido para los puzzles ya seeded).
- Validador backend — aceptar el nuevo shape, rechazar `reveal_frame` o normalizarlo a los dos nuevos.
- Tipos compartidos / `puzzle.ts` — reemplazar `reveal_frame?: PuzzleFrame` por `select_frame?: PuzzleFrame; confirmation_frame?: PuzzleFrame`.
- Editor web admin — UI para editar los dos frames por opción (probablemente dos tabs o dos "estados" del lienzo).
- Visor mobile — leer los dos campos en lugar de uno.
- Seeds existentes (`docs/learning/Puzzles/seed_puzzles.sql`) — actualizar al nuevo formato.

El JSON de `sample-puzzles.json` ya viene en el nuevo formato. Cuando hagas el import masivo, usarás `puzzles-wematch.json` (no incluido aquí — se lo daré en Fase 2) que tiene los 115 puzzles publicados con la misma forma.

---

## 4. Flujo de tres frames en `PuzzleQuestion.tsx` (bloqueante)

Hoy en `PuzzleQuestion.tsx:45`:

```ts
const displayedFrame = selected?.reveal_frame ?? content.initial_frame;
```

Solo dos posibles frames mostrados: `initial_frame` (si nadie ha seleccionado) o `reveal_frame` (si hay opción seleccionada — independientemente de si está confirmada o no).

**Nuevo flujo:**

1. **init** (`selected === null`) → `initial_frame`
2. **select** (`selected !== null && !confirmed`) → `selected.select_frame`
3. **confirm** (`selected !== null && confirmed`) → `selected.confirmation_frame`

Transición animada entre frames con `Animated.timing` o `withTiming` usando `frame.duration_ms` (default 1500 ms). Players y ball interpolan posición; shapes hacen fade-in/out (las que aparecen o desaparecen entre frames).

**Atención al `unselect`:** si el usuario toca el badge ya seleccionado (toggle off), vuelves a `initial_frame`. Si toca otra opción, transición directa de un `select_frame` a otro.

---

## 5. Speech bubbles (bloqueante para puzzles de comunicación, polish para el resto)

El tipo `PuzzlePlayer.speech_label?: string` ya está declarado y el validador lo acepta, pero ningún componente lo renderiza.

**Casos a cubrir:**

- **`"YOU"` automático** sobre el jugador con `is_user: true` en el `initial_frame` (sin que venga `speech_label`). Da contexto inmediato de "ése eres tú".
- **`speech_label` custom** en cualquier frame, cualquier jugador. Aparece sobre todo en puzzles de comunicación entre compañeros: `"Mine!"`, `"Yours!"`, `"Both up!"`, `"Both back!"`. En esos puzzles, el bocadillo **es la pregunta** — sin él, el puzzle no se entiende.

Aspecto del bocadillo en `02-SHAPES-AND-BADGES.md`.

**Sitio a tocar:** `AnimatedPlayer.tsx` — añadir componente `<SpeechBubble>` opcional encima del sprite cuando `player.speech_label || (player.is_user && state === 'init')`.

---

## 6. Estado de los badges: renombrado conceptual (cosmético)

En las primeras conversaciones empecé llamando a los estados confirmados `confirmed-correct` y `confirmed-wrong`. Eso es incorrecto — son un único estado `confirmed`, y el color verde/rojo se decide en el render comparando `is_correct` de la opción confirmada.

No es un cambio de lógica, solo de nomenclatura. Cualquier sitio donde uses `'confirmedCorrect'` o `'confirmedWrong'` o similar debería colapsarse a `'confirmed'` + una función de pintura que decida el color.

---

## Polish opcional (no bloqueante)

- **flipX del jugador** según posición de la pelota: voltea el sprite en horizontal para que mire hacia donde está la bola. Sin él, el sprite siempre apunta al mismo lado independientemente de dónde pase la acción. Da más realismo pero no es necesario para que el puzzle se entienda.
- **Sombra de la pelota** en lob/chiquita: durante el arco, una sombra elíptica que se difumina y se desplaza con la altura simulada. Refuerza el efecto de altura.
- **`player.facing` (`face` / `back`)** como override del sprite: cuando el dato lo pide explícitamente, ignora el default por team. Útil para puzzles donde un rival está de espaldas o un jugador propio está de frente.
- **Selection ring** verde alrededor del jugador propio (anillo `#10b981`) en el `initial_frame`. Padelchess lo usa para reforzar "ése eres tú" junto con el bocadillo "YOU". Si haces el "YOU", el ring es redundante.

Pueden ir en una segunda iteración tras tener el flujo principal funcionando.

---

## Validaciones a aplicar al importar (Fase 2)

Cuando recibas `puzzles-wematch.json` con los 115 puzzles publicados (Fase 2):

1. Exactamente una opción con `is_correct: true` por puzzle. Si no, marcar para revisión.
2. 2 o 3 opciones por puzzle (no más, no menos).
3. `initial_frame.players` no vacío, `initial_frame.ball` no null.
4. Coordenadas en rango `x ∈ [0, 10]`, `y ∈ [0, 20]` con margen ±0.5 m para shapes que sobresalgan.
5. `duration_ms` saneado: si < 50 → multiplicar por 1000 (origen en segundos). Si null → default 1500.
6. `statement` no vacío, max 280 chars. `option.text` no vacío. `option.explanation` no vacío.
7. Skip los puzzles que vengan en el `REVIEW.md` con triage editorial pendiente (te lo pasaré también en Fase 2, con mis decisiones por puzzle).
