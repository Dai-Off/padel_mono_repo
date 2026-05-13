# Visual reference — shapes, badges y speech bubbles

Solo describe los **elementos nuevos** que hay que añadir. Court (SVG), sprites de jugador, animación de pelota (lob/chiquita/spin) y layout de pantalla ya están — no se documentan aquí.

Para ver estos elementos renderizados en vivo: abre `viewer.html` con `npx serve .`. Carga 3 puzzles muestra con sus 7 estados cada uno (init · select-X · confirm-X).

> Nota sobre los thumbnails de `reference-thumbnails/`: son del producto original y vienen pre-renderizados sin shapes y sin badges en pista. Sirven solo para confirmar **proporciones y posición de jugadores/pelota**. Para shapes y badges, mira el viewer.

---

## Shapes — los 6 tipos

**Cada tipo necesita dos implementaciones:**

- **Web admin editor (canvas)**: dibujar, mover, redimensionar, borrar. Es donde los admins crean los puzzles.
- **Mobile (visor del usuario, SVG + `react-native-svg`)**: solo lectura. Animaciones con la librería `Animated` de React Native cuando los frames cambien.

Coordenadas en metros, sistema 10×20 con (0,0) arriba-izquierda. La capa de shapes va por encima del court SVG y por debajo de jugadores/pelota.

### Filtrado `visible_only_after_confirmation` (a nivel shape)

Independiente del frame. En el `initial_frame` y en el `select_frame`, las shapes con este flag a `true` se omiten al renderizar. Solo aparecen en `confirmation_frame`. Es lo que hace que los rects rojo/verde, las anotaciones de texto y los garabatos a mano (line) solo sean visibles tras pulsar Confirm.

```ts
const visibleShapes = (state === 'confirmed')
  ? frame.shapes
  : frame.shapes.filter(s => !s.visible_only_after_confirmation);
```

### 1. `circle` — el más común

Highlight de posiciones (jugador, pelota antes/después, zona destino).

```json
{
  "type": "circle",
  "x": 3.6, "y": 17.7,
  "radius": 0.5,
  "color": "yellow",
  "dashed": true
}
```

- Render como circunferencia con stroke (sin fill por defecto).
- `dashed: true` → línea discontinua. Sugerido `[0.3 m, 0.2 m]`.
- `color` default `#ffcf68` si no viene.
- SVG: `<Circle cx={x} cy={y} r={radius} stroke={color} strokeWidth={0.12} strokeDasharray={dashed ? "0.3 0.2" : undefined} fill="none" />`.

### 2. `arrow`

Trayectoria entrante, movimiento esperado de un jugador, dirección del golpe.

```json
{
  "type": "arrow",
  "startPoint": { "x": 0, "y": 19.9 },
  "endPoint": { "x": 1.13, "y": 7.59 },
  "controlPoint": { "x": 0.4, "y": 14 },
  "color": "yellow",
  "dashed": true
}
```

- Con `controlPoint` → curva cuadrática Bézier `Q`. Sin él → línea recta.
- Cabeza triangular al final (longitud ~0.5 m), orientada por el ángulo de salida.
- `pointerAtBeginning: true` (raro) → cabeza también al inicio.
- `tagText` (raro) → label flotante sobre el trazado en `tagPosition` (fracción 0..1).
- SVG: `<Path d="M sx,sy Q cx,cy ex,ey" stroke={...} fill="none" />` + `<Polygon>` para la cabeza.

### 3. `rect`

Zonas objetivo. Casi siempre llevan `visible_only_after_confirmation: true`. Rojo/coral = mala, verde = buena, amarillo = neutra.

```json
{
  "type": "rect",
  "x": 0.25, "y": 9.07,
  "width": 3.08, "height": 0.95,
  "fillColor": "#ff9182",
  "color": "#ff9182",
  "fillOpacity": 0.7,
  "visible_only_after_confirmation": true
}
```

- Fill con `fillColor` + `fillOpacity`, luego stroke con `color` a opacidad 1.
- SVG: `<Rect x={x} y={y} width={width} height={height} fill={fillColor} fillOpacity={fillOpacity} stroke={color} strokeWidth={0.12} />`.

### 4. `line`

Polilínea libre del autor (anotaciones manuscritas, subrayados). Casi todas con `visible_only_after_confirmation: true`.

```json
{
  "type": "line",
  "points": [5.80, 0.08, 5.84, 0.08, 5.92, 0.07, 5.97, 0.07],
  "strokeWidth": 0.12,
  "color": "red"
}
```

- `points` viene como `[x1, y1, x2, y2, ...]`.
- SVG: `<Polyline points="x1,y1 x2,y2 ..." stroke={color} strokeWidth={strokeWidth} fill="none" />`.

### 5. `text`

Etiquetas sobre la pista (medidas, anotaciones tácticas). Casi todas con `visible_only_after_confirmation: true`.

```json
{
  "type": "text",
  "text": "92 centimeters",
  "x": 3.19, "y": 10.83,
  "fontSize": 14,
  "color": "red"
}
```

- `fontSize` viene en píxeles del stage original. Para convertir a metros: `Math.max(0.45, fontSize × 0.05)`.
- Sugerido: stroke negro 0.08 m + fill `color` para legibilidad sobre cualquier fondo.
- SVG: `<Text x={x} y={y} fontSize={sizeMetros} fill={color} stroke="black" strokeWidth={0.08} textAnchor="middle" alignmentBaseline="middle">{text}</Text>`.

### 6. `triangle`

Zonas objetivo no rectangulares (uso raro, solo 8 apariciones).

```json
{
  "type": "triangle",
  "points": [1.78, 7.96, 0.70, 16.66, 2.87, 16.66],
  "fillColor": "yellow",
  "fillOpacity": 0.5,
  "color": "yellow"
}
```

- `points` como `[x1, y1, x2, y2, x3, y3]`.
- Render igual que rect: fill con `fillColor` + `fillOpacity`, stroke con `color`.
- SVG: `<Polygon points="x1,y1 x2,y2 x3,y3" fill={fillColor} fillOpacity={fillOpacity} stroke={color} strokeWidth={0.12} />`.

---

## Badges A/B/C — squircles dentro de la pista

Cuadrados redondeados (no círculos perfectos) posicionados encima del court, dentro del canvas/SVG, en `option.badge_position`.

### Posición

`option.badge_position?: { x: number; y: number }` ya está en el tipo. Si no viene, usar el default `{ x: 2 + 2.5 × option.id, y: 4 }` (mismas coords que padelchess). Cuando el autor lo customiza, suele ser para que el badge tenga sentido espacial con la respuesta (p.ej. en puzzles de "dónde te colocas", el badge va donde te tendrías que colocar).

### Tamaño y forma

- Lado del squircle: ~1.8 m (lado = `0.9 × 2` en términos del helper que usa el viewer).
- Border radius: ~0.22 m.
- Sombra suave por debajo (offset ~0.06 m, blur ~0.18 m, alpha 0.35).
- Stroke fino negro a ~55% alpha, grosor 0.06 m.
- Letra centrada: Bebas Neue o fallback Impact, peso 900, color negro o muy oscuro. Tamaño ~1.2 m.

### Estados (3, no 5)

| Estado | Fill | Color del texto |
|---|---|---|
| `default` | blanco `#ffffff` | `#111111` |
| `selected` | naranja `#fb923c` | `#1a0a00` |
| `confirmed` | depende de `is_correct` (ver abajo) | depende |

Para `confirmed`:
- `option.is_correct === true` → fill verde `#22c55e`, texto `#06210f`
- `option.is_correct === false` → fill rojo `#ef4444`, texto `#2a0606`

El estado se llama **`confirmed` siempre**, no se desdobla. El color es un cálculo de la función de pintura comparando `is_correct`.

### Regla derivada — dimming (no es un estado)

Cuando algún badge del puzzle está en `selected` o `confirmed`, los **otros** se renderizan al **40% de opacidad** (siguen blancos, solo bajan en alpha). Se calcula:

```ts
const anyActive = badges.some(b => b.state !== 'default');
const alpha = (anyActive && b.state === 'default') ? 0.4 : 1.0;
```

### Tap / sincronización con los DOM buttons

Los badges en pista y los `Pressable`s de `optionsRow` son espejo:

- Tocar un badge en pista → `setSelected(option)`. Toca de nuevo el mismo → `setSelected(null)` (toggle off, opcional).
- Tocar otro badge → reemplaza el `selected` por el nuevo. Animar opacidad y escala 200/400 ms.
- Pulsar Confirm → `setConfirmed(true)`. Los confirms cambian el badge a `confirmed`; ya no se puede tocar nada hasta avanzar.

### Animación al seleccionarse

- Escala del badge `selected`: 1× → 1.4× con un pequeño bounce. Duración ~200 ms.
- Dim/undim de los otros: opacidad 1 → 0.4 (o viceversa) con ease-out cúbico. Duración ~400 ms.

---

## Speech bubbles

Bocadillo blanco con borde negro y "rabo" hacia abajo apuntando a la cabeza del jugador.

```
   ┌────────┐
   │  YOU   │
   └───┐ ┌──┘
       └─┘
        ↓
     (jugador)
```

- Padding: 0.25 m horizontal, 0.18 m vertical.
- Border radius: 0.15 m.
- Centrado horizontalmente sobre el jugador, ~0.5 m por encima de la cabeza.
- Texto en negro, bold, tamaño 0.5 m.
- Fill blanco `#ffffff`, stroke negro 0.05 m a 80% alpha.

**Cuándo aparece:**

- `"YOU"` automático sobre el jugador con `is_user: true` en el `initial_frame` (aunque no venga `speech_label`). Se quita al pasar a `select` / `confirm`.
- `speech_label` custom en cualquier frame, cualquier jugador. Los puzzles de comunicación (#41, #189–196 y similares) lo usan con frases como `"Mine!"`, `"Yours!"`, `"Both up!"`, `"Both back!"`. En esos puzzles **el bocadillo es parte de la pregunta** — sin él, el puzzle no se entiende.

En SVG mobile: `<G>` con un `<Rect>` redondeado (rounded rect del bocadillo) + un `<Polygon>` triangular para el rabo + un `<Text>` centrado.

---

## Orden Z del render

De abajo hacia arriba:

1. **Court** (SVG, ya existe).
2. **Shapes** (nueva capa).
3. **Players** (sprites ya existen).
4. **Ball** (animada, ya existe).
5. **Badges A/B/C** (nueva capa).
6. **Speech bubbles** (encima de todo, salen del sprite del jugador).

Las shapes van **entre** court y players para que un círculo o flecha que pase por encima de un jugador quede tapada por el jugador (más natural visualmente). Los badges van **encima** de todo el contenido del campo (excepto bubbles) para ser siempre tappables.

---

## Animaciones — duraciones de referencia

| Elemento | Animación | Duración |
|---|---|---|
| Cambio entre frames | Interpolación de jugadores y bola | `frame.duration_ms` (default 1500) |
| Badge al seleccionarse | Escala 1× → 1.4× | 200 ms |
| Badge dimming / undimming | Opacidad 1 → 0.4 | 400 ms |
| Aparición de shapes vOAC | Fade-in al confirmar | 300 ms |
| Speech bubble | Fade-in al entrar al frame | 200 ms |

En mobile usar `Animated.timing` o `Animated.spring` (lo que ya use el resto del componente). Las shapes pueden interpolar opacidad por separado; jugadores y bola siguen su animación habitual.
