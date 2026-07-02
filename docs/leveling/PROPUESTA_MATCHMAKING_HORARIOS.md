# Propuesta: rediseño de la búsqueda de matchmaking por horarios

> Estado: **IMPLEMENTADO Y VERIFICADO E2E**. Migración 092 aplicada. Pendiente solo: commit (a la espera del OK del usuario).
> Objetivo: permitir elegir **varios días** y **diferentes franjas horarias** al buscar
> partida por matchmaking, en lugar de una sola franja del día de hoy.
>
> Archivos tocados:
> - Backend: `db/092_matchmaking_availability_slots.sql` (nuevo), `services/matchmakingShared.ts`,
>   `services/matchmakingService.ts`, `services/matchmakingNearMiss.ts`,
>   `services/matchmakingPairInviteService.ts`, `routes/matchmaking.ts`.
> - Mobile: `lib/matchAvailabilityWindow.ts`, `api/matchmaking.ts`,
>   `components/matchmaking/AvailabilitySelector.tsx` (nuevo),
>   `components/matchmaking/PreferredClubsStrip.tsx` (nuevo), `screens/CompetitiveLeagueScreen.tsx`,
>   i18n `sections/competitive.ts` + `locales/{es,zh-HK}/competitive.ts`.
> - Verificado: `tsc --noEmit` OK en backend y mobile; test unitario de `parseAvailabilitySlots` /
>   `intersectSlots` / `hasMatchWindow` (11/11 OK).
> - E2E (2026-07-03): (A) 4 jugadores con franjas disjuntas → `runMatchmakingCycle` forma partido en la
>   ventana común 17:00–19:00 y reserva **17:00–18:30** (90 min, alineado a :00/:30), `formed=1`.
>   (B) curl real a `POST /matchmaking/join`: rechaza slots vacíos / bordes no :00/:30 / tramos <90 min (400),
>   acepta franjas válidas disjuntas (200) y persiste `availability_slots` + derivados `from/until`.
>
> Rediseño UI del paso `prefs` (feedback del usuario): (1) eliminado el bloque "2v2 por parejas";
> (2) modalidad + lado ahora en tarjeta compacta precargada del perfil (`preferences.preferredSide`)
> con botón "Editar" que abre un sheet inline (no toca MainApp); modalidad editable, default 'any';
> (3) clubes preferidos como scroll horizontal de tarjetas (estilo `FrequentClubsCard` del perfil).

## 1. Situación actual

### Backend
- Cada entrada de `matchmaking_pool` guarda **una sola ventana continua**:
  `available_from` / `available_until` (`timestamptz NOT NULL`, migración `014_leveling_matchmaking.sql:186-187`).
- Emparejamiento (`matchmakingShared.ts`, `matchmakingService.ts`):
  - `overlap()` (`matchmakingShared.ts:207-213`): solape pairwise de dos ventanas.
  - `intersectRange()` (`matchmakingShared.ts:215-228`): intersección de las 4 ventanas, exige ≥1h.
  - `runMatchmakingCycle` (`matchmakingService.ts:336-380`): desliza un slot fijo de **90 min**
    en pasos de **15 min** dentro de la intersección, buscando pista libre + horario de club.
- **Limitación:** no admite franjas disjuntas ("sábado mañana **o** domingo tarde"). Solo un intervalo continuo.

### Mobile (flujo real = `CompetitiveLeagueScreen.tsx`, paso `prefs`)
- El usuario **solo elige una franja (mañana/tarde/noche) del día de HOY** (`OptionRow` en `:1319-1330`).
- `form.day` existe en el tipo pero está fijado a `'hoy'` y **nunca se renderiza** un selector.
- `matchAvailabilityWindow.ts` (`computeMatchAvailabilityWindow`) traduce chip → ventana ~3h (Europe/Madrid → ISO UTC).
- `AiMatchModal.tsx` (con selector día+hora) es **código muerto**: no se importa en ninguna pantalla.

### Referencia reutilizable (`mobile-app/src/components/filters/` y `partidos/`)
Sistema de filtros ya usado en Pistas / Partidos / Torneos:
- `MultiDateStripPicker` — selección multi-día (hasta 7, franja horizontal de pills).
- `DateStripPicker` — un solo día.
- `TIME_RANGE_PRESETS` (`utils/formatSearch.ts:54-59`): `allday` / `morning` 08–14 / `afternoon` 14–20 / `evening` 20–23.
- `FilterBottomSheet` + `FilterApplyFooter` (patrón draft/aplicar, recuento en vivo).
- Estructura de datos: `selectedDateKeys: string[]` (`"YYYY-MM-DD"`) + `timeRange: {start,end}|null`.

## 2. Decisiones de diseño (recomendadas)

| Decisión | Opción elegida | Alternativa descartada |
|---|---|---|
| Modelo de disponibilidad | **Múltiples franjas disjuntas**, varios tramos por día | Un solo rango continuo |
| Selección de hora | **Tramos "desde / hasta"** | Presets fijos / chips de horas sueltas |
| Granularidad | **30 min (:00 y :30)** | Horas enteras / 15 min |
| Tramos por día | **Varios por día** (mañana y noche saltando la tarde) | Uno solo por día |
| Paso del motor | **30 min alineado a :00/:30** (fix de bug) | 15 min (actual, erróneo) |

> Decisiones tras feedback del usuario:
> - Se descartan los presets fijos (mañana/tarde/noche) y los chips de horas sueltas.
> - El jugador elige días y, por cada día, uno o varios tramos "desde X hasta Y".
> - Granularidad :00/:30 porque los clubs solo abren slots en punto o y media; esto resuelve la
>   limitación de que alguien que solo puede a las 9:30 no pudiera excluir las 9:00.
> - El paso de 15 min del motor es un **bug** (propone inicios inexistentes) y se corrige a 30 min.

## 3. Modelo de datos nuevo (backend)

Añadir a `matchmaking_pool` una lista de franjas:

```sql
-- backend/db/09X_matchmaking_availability_slots.sql
ALTER TABLE public.matchmaking_pool
  ADD COLUMN availability_slots jsonb NOT NULL DEFAULT '[]'::jsonb;
-- Formato: [{ "start_at": "<iso>", "end_at": "<iso>" }, ...]
```

- Mantener `available_from` / `available_until` como **derivados** = `min(start_at)` / `max(end_at)`
  de `availability_slots` (para índices, TTL `expires_at` y compatibilidad de lectura).
- La lista se genera en **cliente**: una franja por cada día con su rango desde/hasta.
  Ej.: `sáb 17:00–22:00` + `dom 10:00–14:00` → `[{sáb 17–22}, {dom 10–14}]`.
- `expires_at` / TTL del pool debe cubrir hasta `max(end_at)` (hoy asume ventana cercana).

Igual para el flujo de pareja: `matchmaking_pair_invites.prefs` (jsonb) y `PairInvitePrefs`
(`matchmakingPairInviteService.ts:16-26`) pasan a llevar `availability_slots`.

## 4. Algoritmo de matching nuevo

Reemplazar la lógica de "intersección de 4 ventanas únicas" por "slot candidato cubierto por
alguna franja de cada jugador":

- Cada `PoolRow` pasa a exponer `slots: {start,end}[]` (además de los derivados from/until).
- `overlap()` → nueva `slotsOverlap(aSlots, bSlots)`: ∃ franja de A y franja de B que solapan ≥ duración mínima.
  Usada en `quartetPreCourtValid` (`matchmakingShared.ts:378-379`) para el filtro pairwise previo.
- `intersectRange()` → se elimina/adapta. La búsqueda del hueco de 90 min en
  `runMatchmakingCycle` (`matchmakingService.ts:336-380`) cambia a:
  1. Construir candidatos `[t, t+90min]` con `t` **alineado a la rejilla :00/:30** sobre la **unión**
     de franjas del cuarteto (ver corrección del paso, abajo).
  2. Un candidato es válido si **para cada uno de los 4 jugadores existe una franja suya que contiene `[t, t+90]`**.
     Nótese que esto ya codifica la semántica del `hasta` = fin del partido: el último `t` válido en un
     tramo `[from, end]` es `end − 90 min` (porque `t + 90 ≤ end`). No hace falta lógica extra.
  3. Sobre los candidatos válidos, seguir aplicando `hasCourtConflict` + `assertBookingWithinClubOperatingHours` (sin cambios).
- No se toca: near-miss (`matchmakingNearMiss.ts`), expansión de distancia/lado/género (`matchmakingExpansion.ts`).
  El horario sigue sin relajarse en las ofertas de expansión.

### ⚠️ Corrección de bug: paso de 15 min → 30 min alineado a :00/:30
El motor actual desliza en pasos de **15 min** (`stepMs = 15*60*1000`, `matchmakingService.ts:352`),
pero los clubs **solo ofrecen slots en punto o y media** (:00 / :30). Es un bug: puede proponer inicios
(ej. 9:15, 9:45) que no existen como slot reservable.
- Cambiar `stepMs` a **30 min** y **alinear el primer candidato** al siguiente múltiplo de :00/:30
  ≥ inicio de la franja (no partir de `rangeStart` en crudo).
- Como el partido dura 90 min (múltiplo de 30), el fin también cae en :00/:30.
- Con esto, las franjas del jugador (cuyos bordes ya son :00/:30, ver §5) y los candidatos quedan
  todos sobre la misma rejilla.

Complejidad: O(franjas × pasos × 4 jugadores × pistas) — irrelevante para tamaños reales del pool.

## 5. UI mobile nueva (`CompetitiveLeagueScreen.tsx`, paso `prefs`)

Sustituir el único `OptionRow` de franja (`:1319-1330`) por un selector de disponibilidad
día + rango horario:

1. **`MultiDateStripPicker`** — elige uno o varios días.
2. **Editor de tramos por día** — por cada día seleccionado, **uno o varios** tramos
   `Desde [hh:mm] — Hasta [hh:mm]`, con botón "+ añadir tramo". Permite disponibilidad disjunta
   dentro del mismo día (ej. mañana y noche, saltándose la tarde).
   No existe un componente reutilizable de rango desde/hasta (el `ClubDetailScreen` usa slots discretos,
   y los filtros usan presets), así que hay que crear uno pequeño: `TimeRangeRow`
   (dos selectores de hora + validación de duración mínima, ver abajo).

**Semántica del tramo: `desde` = hora más temprana de INICIO, `hasta` = hora de FIN del partido.**
Como el partido dura 90 min, la **última reserva** de un tramo empieza en `hasta − 90 min`.
Ej.: `hasta 11:30` → el último inicio ofrecido es **10:00** (10:00 + 90 = 11:30). Hay que dejarlo
claro en la UI (microcopy tipo "Hasta = fin del partido").

**Duración mínima del tramo: 90 min = 3 slots de media hora.** Si `hasta − desde < 90 min` no cabe
ningún partido → el tramo es inválido (deshabilitar el "hasta" por debajo de `desde + 90 min` en el
picker, o mostrar aviso). Tramo mínimo válido: `desde 10:00 – hasta 11:30` (exactamente una partida).

**Granularidad de los pickers: 30 min, solo :00 y :30.** Es intencional y resuelve la limitación
real: un jugador que solo puede a partir de las 9:30 fija `desde 9:30`, y así el motor **nunca**
le propone las 9:00. Los bordes de tramo siempre en :00/:30, alineados con la rejilla de slots
del club y con el paso corregido del motor (§4).

Mockup:
```
Días:  [Sáb 5] [Dom 6]   (+ añadir)

Tu disponibilidad:
  Sáb 5   9:30 – 12:00   ✕
          18:00 – 21:00  ✕
          + añadir tramo
  Dom 6   10:00 – 14:00  ✕
          + añadir tramo
```

Cambios de estado / tipos:
- `SearchForm` (`:72-78`): reemplazar `day: MatchSearchDay` + `time: MatchSearchTimeSlot` por
  `daySlots: { dateKey: string; ranges: { from: string; until: string }[] }[]`
  (`from`/`until` en `"HH:MM"`, solo `:00`/`:30`).
  Default sugerido: un día (hoy) con un tramo razonable (ej. 18:00–22:00) editable.
- `matchAvailabilityWindow.ts`: `computeMatchAvailabilityWindow` deja de devolver una ventana única y
  pasa a devolver `availability_slots: {start_at,end_at}[]`, convirtiendo cada `daySlot`
  (fecha + hora local) a ISO UTC (Europe/Madrid, reutilizando `madridHourToIso`).
- `handleJoinQueue` (`:602-694`): el payload envía `availability_slots` (y opcionalmente los derivados).

## 6. API (payload)

`MatchmakingJoinPayload` (`mobile-app/src/api/matchmaking.ts:28-38`) y validación en
`backend/src/routes/matchmaking.ts:304-317`:
- Sustituir `available_from` / `available_until` por `availability_slots: {start_at,end_at}[]`
  (o aceptar ambos durante una transición). Endpoints afectados: `POST /matchmaking/join`,
  `POST /matchmaking/pair-invite/:id/start-search`, `.../accept-and-search`.
- Validar: lista no vacía; cada slot con **`end_at − start_at ≥ 90 min`** (si no, no cabe partido);
  bordes alineados a :00/:30; y `max(end_at)` en el futuro. (El backend re-valida aunque la UI ya
  impida crear tramos < 90 min.)

## 7. Impacto / migración / puntos abiertos

- **Migración**: SQL en `backend/db` (numerada) por convención del proyecto (no `supabase/migrations`).
  Backfill de filas vivas: `availability_slots = [{available_from, available_until}]`.
- **Compatibilidad**: durante la transición, el backend puede aceptar el payload viejo (from/until)
  y normalizarlo a un slot único.
- **Limpieza**: `AiMatchModal.tsx` (código muerto) — decidir si borrarlo o reaprovechar su UI.
- **Timezone**: la app asume Europe/Madrid en `matchAvailabilityWindow.ts`; los filtros de Partidos
  usan zona horaria del club (`dayKeyInClubTz`). Alinear criterio.
- **TTL del pool**: `expires_at` debe recalcularse con `max(end_at)`.
- **Testing**: curl contra backend (patrón del proyecto) cubriendo: 1 día 1 franja, N días 1 franja,
  N días N franjas, franjas disjuntas que no solapan entre 4 jugadores, y match en día futuro.

## 8. Orden de implementación sugerido

1. **Fix del paso del motor a 30 min alineado a :00/:30** (`matchmakingService.ts:352` y generación de
   candidatos). Es un bug independiente y se puede hacer/mergear antes que el resto.
2. Migración `matchmaking_pool.availability_slots` + backfill.
3. Backend: tipos (`PoolRow`, `PairInvitePrefs`), validación de endpoints, `slotsOverlap`, nueva búsqueda de slot.
4. Mobile: `matchAvailabilityWindow.ts` → genera slots; `SearchForm` + UI del paso `prefs` (`TimeRangeRow`); payload.
5. Flujo de pareja (`start-search` / `accept-and-search`) con el nuevo shape.
6. Testing curl + limpieza de `AiMatchModal`.
