# PadelPuzzle — prompt para Claude Code en el monorepo de WeMatch

Copia esta carpeta entera al monorepo de WeMatch (sugerencia: `wematch/docs/padel-puzzle/`) y pasa el bloque de prompt al Claude Code que abras en ese repo.

---

## Prompt para pegar en Claude Code

> Voy a extender el componente `PadelPuzzle` que ya existe en WeMatch para soportar el catálogo importado de puzzles tácticos (115 puzzles). El componente base ya está montado: court (SVG), sprites de jugador, animaciones de bola (lob/chiquita/spin), layout (chat bubble + botones DOM A/B/C + Confirmar), schema `learning_puzzles` y `PuzzleQuestion.tsx` con flujo init/reveal.
>
> El delta a implementar es mucho más pequeño de lo que parece. Está documentado en esta carpeta (`docs/padel-puzzle/` o donde la hayas copiado).
>
> **Antes de tocar código, haz lo siguiente:**
>
> 1. Lee los 2 documentos en orden:
>    - `01-DELTA.md` — qué hay que añadir y dónde. Cinco bloques bloqueantes (shapes, badges en pista, schema split, flujo de 3 frames, speech bubbles) + polish opcional + reglas de validación para la importación.
>    - `02-SHAPES-AND-BADGES.md` — spec visual solo de los elementos nuevos: los 6 tipos de shape con ejemplo JSON y sugerencia de SVG/canvas, los 3 estados del badge en pista, speech bubble, orden Z y duraciones de animación.
>
> 2. Arranca el viewer incluido:
>    ```bash
>    cd <ruta-a-este-kit>
>    npx serve .
>    # abrir http://localhost:3000/viewer.html
>    ```
>    Muestra 3 puzzles de muestra con sus 7 estados cada uno (initial · select-X · confirm-X). Es la referencia más completa para ver shapes y badges renderizados. Está en Canvas 2D como mock — tu implementación va en SVG (mobile) y canvas (editor web admin).
>
> 3. **Verifica el estado actual del repo** antes de proponer nada. El snapshot que tengo es informativo pero puede haber cambiado:
>    - `055_learning_puzzles.sql` (o equivalente más reciente) — schema actual de `learning_puzzles.options[].reveal_frame`.
>    - `puzzle.ts` (tipo compartido) — campos `PuzzleOption`, `PuzzleFrame`, `PuzzlePlayer`, `PuzzleShape`. Confirma que `badge_position`, `speech_label` y `facing` están reservados.
>    - `PuzzleStage.tsx` — capas que renderiza hoy (`Court`, `AnimatedPlayer`, `AnimatedBall`). Aquí van las dos capas nuevas (`<Shapes>` y `<Badges>`).
>    - `PuzzleQuestion.tsx` — cómo decide `displayedFrame` hoy y dónde meter la rama de `confirmed`.
>    - `AnimatedPlayer.tsx` — cómo se renderiza el jugador hoy y dónde añadir el `<SpeechBubble>`.
>    - Web admin editor de puzzles — encuentra el componente/canvas que usan los admins para crear/editar puzzles. Las shapes nuevas se editan ahí.
>    - Validador backend de puzzles — donde se acepta hoy `reveal_frame`. Hay que cambiarlo a `select_frame` + `confirmation_frame`.
>    - Seeds existentes (`docs/learning/Puzzles/seed_puzzles.sql` o similar) — habrá que migrarlos al nuevo schema.
>
> 4. Una vez tengas el mapa real, **dame un plan que diga**:
>    - Confirmación de qué piezas existentes reutilizamos.
>    - Lista de archivos que vas a tocar, agrupados por bloque del delta.
>    - Orden de implementación. Sugerencia personal: schema split primero (migración + tipos + validador) → flujo de 3 frames en `PuzzleQuestion.tsx` con un puzzle hardcodeado → shapes (lo gordo, ambos contextos web/mobile) → badges en pista → speech bubbles → polish.
>    - Dudas o decisiones bloqueantes para resolver conmigo antes de tirar.
>
> **No empieces a codear hasta que aprobemos el plan.**
>
> ---
>
> ### Dos contextos de render para las shapes
>
> Esto es clave y conviene tenerlo claro desde el principio:
>
> - **Web admin editor → canvas.** Los admins crean y editan puzzles aquí, así que necesitan tooling para dibujar/arrastrar/redimensionar/borrar cada uno de los 6 tipos de shape.
> - **Mobile (visor del usuario) → SVG + `react-native-svg`.** Solo lectura. Animaciones con la librería `Animated` de React Native cuando los frames cambien. Nada de Skia, nada de Canvas.
>
> No mezcles las dos implementaciones. La spec en `02-SHAPES-AND-BADGES.md` es rendering-agnostic — describe qué se pinta, no con qué; tú decides la API concreta de cada lado.
>
> ---
>
> ### Reglas clave
>
> - Coordenadas en metros, pista 10×20, (0,0) arriba-izquierda. Equipo del usuario (`team: 1`) abajo `[0..10, 10..20]`, rival (`team: 2`) arriba `[0..10, 0..10]`.
> - Opciones binarias: `is_correct: boolean`. Sin puntos, sin parciales.
> - Tres estados de badge: `default` / `selected` / `confirmed`. El color del `confirmed` (verde/rojo) se calcula en render desde `is_correct` — **no** es un estado separado.
> - El dimming al 40% de los badges no seleccionados es una **regla derivada**, no un estado.
> - `select_frame` y `confirmation_frame` por opción. Si vienen iguales del origen, son el mismo objeto — la única diferencia visual es el filtrado de shapes con `visible_only_after_confirmation: true` + el color del badge.
> - Orden Z: court (SVG) → shapes → players → ball → badges → speech bubbles.
> - Court position: preferencia **suave** del usuario (~70/30 en la cola), no filtro estricto. La táctica de ambos lados forma parte del aprendizaje.
> - Si encuentras shapes que no sabes renderizar todavía, acepta el dato sin romper y deja un TODO. Prioridad de uso: `circle` (1468) → `arrow` (964) → `rect` (40) → `line` (27) → `text` (15) → `triangle` (8).
>
> ---
>
> ### Fase 1 (ahora) — implementar el delta con un puzzle hardcodeado
>
> Implementa todo lo del `01-DELTA.md` usando uno de los 3 puzzles de `sample-puzzles.json` como dato hardcodeado en `PuzzleQuestion.tsx`. No importes el catálogo todavía.
>
> Cuando los 7 estados se rendericen bien (initial · select-A · confirm-A · select-B · confirm-B · select-C · confirm-C), con shapes visibles, badges con sus 3 estados, speech bubbles y la migración del schema aplicada, pasamos a Fase 2.
>
> ### Fase 2 (después) — importación masiva
>
> Te pasaré `puzzles-wematch.json` con los 115 publicados y un `REVIEW.md` con triage editorial para los casos con 2 respuestas correctas y los broken. Escribirás un seeder idempotente que aplique mis decisiones y haga UPSERT por una columna `source_padelchess_id` opcional (o por hash del statement — tú eliges). Saltar los puzzles que vengan marcados como "skip" en el REVIEW.

---

## Contenido de esta carpeta

| Archivo | Tipo | Propósito |
|---|---|---|
| `00-PROMPT.md` | doc | Este archivo. |
| `01-DELTA.md` | spec | Solo el delta: qué falta en WeMatch y dónde tocar. |
| `02-SHAPES-AND-BADGES.md` | spec | Cómo se debe ver lo nuevo: shapes, badges, speech bubbles. |
| `sample-puzzles.json` | data | 3 puzzles muestra en formato WeMatch (`select_frame` + `confirmation_frame`): |
| | | • `#1` — muchas shapes en el confirm (rects rojo/verde, anotaciones de texto) |
| | | • `#27` — uso de `speech_label` |
| | | • `#151` — minimalista, pocas shapes |
| `viewer.html` + `viewer-data.json` | tool | Visor con los 3 sample puzzles. `npx serve .` y abrir `http://localhost:3000/viewer.html`. |
| `reference-thumbnails/` | imágenes | 8 capturas del producto referenciado. **Vienen sin shapes ni badges en pista** (padelchess pre-renderiza thumbnails limpios). Sirven como referencia de **proporciones y posiciones de jugadores/pelota**, no de estilo final. Para shapes y badges usa el viewer. |
