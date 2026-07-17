# Season Pass — Plan de mejoras de UX/UI

> Fecha: 2026-07-08
> Contexto: fases 1–4 del pase implementadas y verificadas end-to-end. Este plan
> recoge las notas de revisión visual/UX sobre `SeasonPassScreen` y la pantalla
> de resultados de lección (`DailyLessonScreen`). Se ejecuta por bloques.
> Fuente de verdad del motor: `docs/season-pass-implementation-plan.md`.

---

## 0. Resumen de bloques

| Bloque | Zona | Núcleo |
|---|---|---|
| A | Resultados de lección | Cuadrar cards, botón "ver en el pase", copy boost |
| B | Hero del pase | SP con contexto de nivel, contraste del gris |
| C | Tab recompensas / track | Track completo navegable + modal de recompensa + auto-centrado |
| D | Tab misiones | Compactar filas + countdown por período con urgencia |
| E | Cómo ganar SP | Pasar a modal de ayuda con botón (?) |
| F | Modal Elite | Rehacer con el bottomsheet estándar de la app |
| G | Estructura del módulo | Revisión de la organización en tabs (decisión de producto) |

Orden sugerido: **A → B → D → E → C → F**, con **G decidido antes de empezar**
(condiciona el resto). C y F son los más grandes.

---

## A. Pantalla de resultados de lección (`DailyLessonScreen`)

Referencia visual: captura 1 (nivel subido a 7, +150 SP).

### A1. Cuadrar las cards de celebración
**Problema:** la card "Misión completada" y el banner "¡Has subido al nivel N!"
tienen demasiado gap arriba y quedan pegados a "Impacto en tus stats".
**Acción:** revisar el bloque `missionCelebrations` (marginTop 14) y el
`streakResultCard` — homogeneizar el espaciado vertical con el resto de la
pantalla (mismo ritmo que la `metricsCard`). Separar de `LessonImpactRadar` con
el gap estándar.
**Archivos:** `DailyLessonScreen.tsx` (zona de resultados + estilos
`missionCelebrations`, `levelUpBanner`).

### A2. Botón "Ver en el pase de temporada"
**Problema:** no hay salida directa desde la celebración al pase.
**Acción:** CTA dentro de la card de misión completada (o bajo el banner de
level-up): "Ver en el pase de temporada →" que navegue a `SeasonPassScreen`
posicionado en el nivel actual (engancha con C3, auto-centrado).
**Dependencia:** la navegación a `SeasonPassScreen` desde resultados de lección
— verificar cómo se monta hoy (¿tab perfil? ¿ruta directa?). Punto de contacto
con `MainApp`. **Decisión menor:** confirmar si abre el pase encima (modal/push)
o cambia de tab.
**Archivos:** `DailyLessonScreen.tsx`, posible prop de navegación + `MainApp.tsx`.

### A3. "Siguiente bonus" → lenguaje de boost
**Problema:** el `nextBonusRow` dice "Siguiente bonus…" — el concepto ya no es
"bonus" sino "boost", y no dice el % siguiente.
**Acción:** reescribir con el **mismo lenguaje que el card del Home**
(`DailyLessonCard.getBonusInfo`): mostrar el próximo umbral de racha y su boost
("A N días: Boost +30% SP"). Reutilizar la tabla de tiers (+15/30/50/70%).
**Archivos:** `DailyLessonScreen.tsx` (`getNextStreakMilestone`, `nextBonusText`),
i18n `learning.dailyLessonNextBonus` (es + zh-HK).

---

## B. Hero del pase (bloque de nivel + SP)

Referencia visual: captura 2 ("SP TOTALES 6.000").

### B1. SP con contexto de nivel
**Problema:** "SP TOTALES" a secas no orienta sobre cuánto falta para subir.
**Propuesta (recomendada):** mantener el número grande pero cambiar el rótulo y
añadir contexto: **"SP · faltan {N} para nivel {L+1}"**. La barra ya muestra
`into/total` — reforzar arriba con los SP restantes al siguiente nivel (dato
`sp_to_next`, ya en `/me`). Alternativa: formato `{into}/{spPerLevel}` como cifra
principal. **Decisión:** confirmar rótulo preferido.
**Archivos:** `SeasonPassScreen.tsx` (hero, `barLabels`/`barFoot`), i18n `alerts.seasonPass`.

### B2. Contraste del texto gris
**Problema:** algunos textos grises se leen mal (sobre el gradiente del hero).
**Acción:** auditar los grises del módulo (`#9CA3AF`, `rgba(255,255,255,0.55)`,
`barTiny`) contra `theme.colors` — alinear con el `textMuted` estándar de la app
y subir opacidad donde el fondo es oscuro/gradiente. Objetivo: contraste AA.
**Archivos:** `SeasonPassScreen.tsx` (estilos), referencia `theme.ts`.

---

## C. Tab recompensas / track (el bloque grande)

Referencia visual: captura 2 (track horizontal de niveles).

### C1. Track completo navegable
**Problema:** solo se ven ~6 niveles por delante (el backend devuelve
`track_levels` con radio 6 alrededor del actual). No se ve cuántos niveles hay
ni las recompensas lejanas.
**Propuesta:** el track pasa a mostrar **toda la temporada (1..100)**, scrollable,
como un battle pass. Niveles sin recompensa = nodo simple; niveles con premio =
thumb(s).
**Recompensa en cada nivel (decisión de arriba 2026-07-08):** los 100 niveles
deben entregar algo (free siempre; elite en muchos). Implica ampliar el catálogo
y re-sembrar el track (092/093) — ver §11.2 del plan de implementación. Trabajo
de contenido aparte del render; el render de C solo debe soportar que casi
todos los niveles tengan thumb.
**Backend:** `/me` deja de recortar por radio. Nueva forma: devolver
`track` completo = todos los niveles `1..max_level` con sus `rewards[]` (vacío o
no) y su `status` (locked/unlocked/granted por nivel). Peso asumible (100 filas).
Mantener `track_levels`/`track_rewards` mientras mobile migra, o sustituir.
**Archivos:** `backend/src/routes/seasonPass.ts` (construcción del track),
`backend/src/services/seasonPassRewards.ts` si hace falta helper; mobile
`api/seasonPass.ts` (tipos), `SeasonPassScreen.tsx` (render + `computeTrackLevels`
deja de acotar).

### C2. Modal de detalle de recompensa
**Problema:** en el track solo se ve el icono; no se sabe qué es cada premio.
**Propuesta:** pulsar un thumb abre un **modal de detalle** (bottomsheet estándar,
ver F) con: render grande del premio (rareza/colores/animación del descriptor
`display`), nombre, tipo (título/marco/insignia/SP/boost), carril (free/elite) y
**estado**: bloqueado ("Alcanza el nivel N") / desbloqueado ("Conseguido") /
disponible. Reutiliza `RewardThumb` en grande + `RARITY_CONFIG`.
**Archivos:** nuevo `components/seasonPass/RewardDetailSheet.tsx`,
`SeasonPassScreen.tsx` (estado del modal + onPress en thumbs).

### C3. Auto-centrado en el último nivel completado
**Problema:** al abrir, el scroll no está posicionado en el progreso del jugador.
**Acción:** `scrollTo` horizontal para centrar el **nivel actual** al montar (y
al navegar desde A2). Verificar: hoy no está implementado.
**Archivos:** `SeasonPassScreen.tsx` (ref del ScrollView + `scrollTo` on layout).

---

## D. Tab de misiones

### D1. Compactar las filas
**Problema:** cada `MissionRow` ocupa demasiado; 4 diarias ya obligan a scroll,
peor en semanales/mensuales.
**Acción:** rediseñar `MissionRow` más denso (menos padding vertical, icono más
pequeño, barra de progreso fina en línea). Mantener legibilidad y el botón de
reroll.
**Archivos:** `SeasonPassScreen.tsx` (`MissionRow` + estilos).

### D2. Countdown por período con urgencia
**Problema:** la caducidad ("Cierra mié, 23:59") va por misión y es poco urgente.
**Acción:** mover el countdown al **header de cada período** (una vez por
Diarias/Semanales/Mensuales), y expresarlo como **tiempo restante**:
- Diarias: "Faltan 15h 30m"
- Semanales: "Faltan 4d 3h"
- Mensuales: "Faltan 12d"
Quitar `expires_label`/`missionCloses` de cada `MissionRow`. El dato base
(`period_end_iso`) ya viene por misión; se puede derivar por período.
**Archivos:** `SeasonPassScreen.tsx` (header de período en la tab misiones),
helper de formato de tiempo restante, i18n.

### D3. Limpiar la fila
Consecuencia de D2: la `MissionRow` pierde la línea de cierre. Revisar
`reward_hint` (¿se mantiene? ocupa línea) — evaluar moverlo al detalle o quitarlo.

---

## E. "Cómo ganar SP" → modal de ayuda

**Problema:** la sección `spBox` inline ocupa y ensucia la tab de recompensas.
**Propuesta:** convertirla en **modal de ayuda** abierto por un botón **(?)** /
(i) en la cabecera del pase. Contenido: las `sp_how` rows (lección, diarias,
semanales, mensuales, racha) como instrucciones. Quita la sección inline.
**Archivos:** nuevo `components/seasonPass/HowToEarnSheet.tsx` (bottomsheet
estándar), `SeasonPassScreen.tsx` (botón en header + quitar `spBox` inline).

---

## F. Modal Elite → bottomsheet estándar

Referencia visual: captura 2 (bottomsheet Elite actual).
**Problema:** el bottomsheet de compra Elite no sigue el estilo de los sheets de
la app.
**Hallazgo:** existe `components/filters/FilterBottomSheet.tsx` — contenedor
reutilizable estándar (overlay, handle, header con cierre, `animationType="slide"`,
safe area). Es el patrón de la casa (búsqueda, filtros, partidos…).
**Propuesta:** extraer un **bottomsheet base común** (o reutilizar
`FilterBottomSheet` si encaja) y reconstruir el modal Elite sobre él, conservando
el contenido premium (corona, bullets, CTA dorado). Igualar radios, handle,
overlay y animación al resto.
**Nota:** el mismo contenedor base sirve para C2 (detalle de recompensa) y E
(ayuda) → extraerlo primero rentabiliza los tres.
**Archivos:** posible `components/common/AppBottomSheet.tsx` (extraído del patrón),
`SeasonPassScreen.tsx` (modal Elite migrado).

---

## G. Estructura del módulo (decisión de producto — resolver primero)

**Problema planteado:** con las misiones en su propia tab, la tab de recompensas
puede quedar "vacía"; ¿es la división correcta?

**Análisis:** tras este plan, la tab de recompensas gana mucho peso (track
completo navegable + modales de detalle), y la de misiones se compacta. El patrón
battle pass estándar hace del **track la pantalla protagonista** y deja las
misiones como sección secundaria.

**Opciones:**
1. **Dos tabs, recompensas como principal (recomendada).** Se mantiene la
   navegación actual; recompensas deja de estar vacía por C1/C2; misiones
   compactadas en su tab. Cambio menor de estructura, foco en pulir cada tab.
2. **Pantalla única con scroll vertical.** Hero → track de recompensas →
   misiones por período debajo. Sin tabs. Más "todo a la vista" pero pantalla
   larga; el track horizontal dentro de scroll vertical puede chocar en gestos.
3. **Tabs invertidas / renombradas.** Recompensas primero siempre, misiones como
   "Retos".

**Recomendación:** opción 1. Requiere decisión antes de C/D porque define dónde
vive cada pieza (boost banner, botón de ayuda, counters).

---

## Decisiones

### Cerradas (2026-07-08)
1. **G — estructura: DOS TABS, recompensas como principal.** Se mantienen las
   tabs Recompensas / Misiones; recompensas es la pantalla estrella (track
   completo + modales) y misiones se compacta.
2. **C1 — alcance del track: TODOS los niveles 1..100.** Los niveles sin
   recompensa se muestran como nodo simple para transmitir cuántos hay y el
   ritmo de progreso.

### Abiertas (menores, se confirman al llegar al bloque)
1. **B1 — rótulo del hero:** ¿"faltan N para nivel L+1" bajo el número, o cifra
   `into/total`?
2. **A2 — navegación al pase:** ¿el pase se abre como push/modal encima de la
   lección o cambiando de tab? (depende de cómo se monta hoy `SeasonPassScreen`).

---

## Notas de implementación

- **No hay SQL nuevo** en este plan (todo es cliente + forma de respuesta de
  `/me`). El track completo (C1) es cambio de serialización, no de esquema.
- Extraer el bottomsheet base (F) antes de C2 y E evita triplicar el contenedor.
- i18n: cada bloque con texto nuevo toca `es` + `zh-HK` + la sección tipada.
- Type-check `npx tsc --noEmit` en mobile (y backend si se toca `/me`) por bloque.
- Commits por bloque con `feat(pase)`/`fix(pase)`, sin co-author.
