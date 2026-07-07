# Season Pass — Plan de implementación (Temporada 1)

> Fecha: 2026-07-06 · Actualizado: 2026-07-07 (decisiones: SP única moneda, lección como misión fija, UX de misión completada)
> Fuentes: `docs/REGLAS PASE DE TEMPORADA resumen Copy.pdf` (documento de producto),
> `docs/leveling/09_season_pass.md`, `docs/leveling/01_modelo_jugador.md`, código actual del repo.

---

## 1. Contexto y corrección de premisa

El pase **no es solo visual**: existe un MVP funcional de punta a punta, pero mínimo.

**Lo que ya funciona hoy:**

| Pieza | Dónde | Estado |
|---|---|---|
| Tablas del pase (`player_season_pass`, `season_pass_seasons`, `season_pass_mission_definitions`, `season_pass_sp_how_rows`) | `backend/db/049_season_pass_mvp.sql`, `050_season_pass_content.sql`, `051_*.sql` | Funcional |
| Endpoint `GET /season-pass/me` (nivel, SP, misiones, track, textos) | `backend/src/routes/seasonPass.ts` | Funcional |
| Grant de SP (`addSeasonPassSp`, con cap `max_level * sp_per_level`) | `backend/src/services/seasonPassService.ts` | Funcional |
| Compra Pase Elite vía Stripe (`finalizeSeasonPassElitePurchase`) | `seasonPassService.ts` + `payments.ts` | Funcional |
| Evaluador de misiones (`evaluateCondition`) | `backend/src/services/seasonPassMissions.ts` | **Solo soporta `daily_lesson`** |
| Pantalla completa del pase (tabs recompensas/misiones, daily/weekly/monthly, compra Elite) | `mobile-app/src/screens/SeasonPassScreen.tsx` | Conectada al backend real |
| Card del Home + sección de misiones | `SeasonPassHomeCard.tsx`, `MissionsHomeSection.tsx`, `HomeDataContext.tsx` | Funcional |
| Lección diaria con racha y multiplicador (bonus original) | `learningStreaks.ts`, `learningDailyLesson.ts`, `DailyLessonScreen.tsx` | Funcional |

**Los huecos grandes** (lo que pide el PDF y no existe):

1. Pool de misiones diarias/semanales/mensuales con rotación (hoy hay 1 misión: lección diaria).
2. Evaluadores de condiciones para partidos, reservas, ratings, horarios, clubes, compañeros…
3. Recompensas reales por nivel (free/elite): hoy el track de la app pinta **placeholders**; no hay tabla de recompensas ni grant al subir de nivel.
4. Sistema de boosters de XP/SP (recompensa del pase según el PDF).
5. Reroll, misiones de comunidad, catch-up.
6. Features de producto que algunas misiones asumen y **no existen**: voto MVP, follows, muro de partido, compartir en RRSS.

---

## 2. Glosario — evitar la confusión XP/SP

Hoy hay tres progresiones y el PDF solo habla de una:

| Término | Qué es | Decisión (2026-07-07) |
|---|---|---|
| **SP (Season Points)** | La "XP del pase" del PDF. 1.000 SP = 1 nivel, 100 niveles. | **Única moneda de engagement.** Nombre interno y de UI |
| **XP de aprendizaje** | `xp_earned` por sesión de lección. Verificado: **no alimenta nada** — se escribe en `learning_sessions` y solo se lee para pintar "+X XP" en la pantalla de resultados | **Se elimina como concepto de usuario.** El score del quiz se mantiene (es acierto, no progresión) |
| **ELO / nivel de juego** | Nivel deportivo (OpenSkill). | Se mantiene aparte — mide habilidad, no engagement. Las lecciones siguen empujándolo vía `DELTA_LESSON_CORRECT` |

Cuando el PDF dice "XP" del pase, en código es **SP**. Alinear el copy con producto para que la documentación futura hable de SP.

---

## 3. Decisión clave: ¿los "Boosters" del PDF y el bonus de lecciones diarias son lo mismo?

### Qué es cada cosa

- **Bonus de lecciones (existente, tu planteamiento):** multiplicador **pasivo y persistente** que se gana manteniendo racha de lecciones diarias. Fórmula en `learningStreaks.getMultiplier()`: racha 3–7 → ×1.5, 8–20 → ×2, 21–45 → ×2.5, 46+ → ×3. Hoy se aplica a **dos cosas**: la XP de la lección y el SP que la lección otorga al pase (`lesson_sp_base * (1 + multiplier)`).
- **Boosters del PDF (no existen):** multiplicadores **consumibles y temporales** (+30%, +50%, +60% XP/SP) que se **reciben como recompensa** en niveles del pase (sobre todo carril Elite) y sirven para cerrar el "gap" final de 12.400 SP.

### Análisis

Son la **misma familia mecánica** (multiplicadores de SP) pero con origen, duración y propósito distintos:

| | Bonus de racha (lecciones) | Booster (recompensa del pase) |
|---|---|---|
| Origen | Constancia diaria (earned) | Recompensa de nivel (granted) |
| Duración | Mientras la racha viva | Consumible (N misiones o ventana temporal) |
| Propósito | Retención diaria / hábito | Economía del pase (cerrar gap, premiar Elite) |
| Estado | Implementado | Por construir |

### Propuesta: unificar en un único "SP Boost Engine"

No son lo mismo, pero **deben vivir en el mismo sistema**: un motor central de multiplicadores de SP con **fuentes** distintas. Así el jugador ve un solo concepto ("Boost activo: +X%") y el backend aplica una sola fórmula.

```
sp_final = round(sp_base * clamp(1 + Σ bonus_activos, 1, CAP))

Fuentes de bonus:
├── lesson_streak   → pasivo, derivado de learning_streaks (no expira, se cae con la racha)
├── pass_reward     → consumible, otorgado por niveles del pase (+0.30 / +0.50 / +0.60)
├── catch_up        → sistema, +0.15 en las primeras 10 misiones si entras en el último mes
└── (futuro) event  → eventos especiales de temporada
```

- **Apilado aditivo** con **cap global configurable por temporada** (propuesta: ×2.0). Evita que racha + booster +60% dispare la economía.
- Se aplica **centralizadamente** en un nuevo `grantSeasonPassSp(playerId, baseSp, context)` que envuelve `addSeasonPassSp()`. Todas las fuentes de SP pasan por ahí — la lección incluida (vía misión, ver abajo).
- Al eliminarse la XP de aprendizaje (§2), el multiplicador ×1.5–×3 de la racha se queda sin objeto sobre el que aplicar. El valor de la racha pasa a expresarse en: **(a)** el boost global de SP, **(b)** los unlockables por racha que ya existen (`unlock_type = daily_lesson_streak`), y **(c)** las rachas compartidas. La pantalla de resultados muestra "Racha: N días → Boost +X% SP en todo el pase".

**Respuesta corta a tu duda:** englobarlos como una misma cosa, sí — un solo sistema de boosts de SP donde la racha de lecciones es una fuente pasiva y las recompensas del pase son fuentes consumibles. Es exactamente lo que `docs/leveling/09_season_pass.md` ya anticipaba ("el `streak_bonus` del módulo de aprendizaje multiplica el SP ganado en todas las acciones"), generalizado para absorber los boosters del PDF.

### Recalibración necesaria del bonus de racha sobre SP

Con la config actual (`lesson_sp_base = 600`, racha ×3) la lección puede dar **1.800 SP/día** = casi 2 niveles/día solo por lecciones. La economía del PDF presupone ~29.200 SP/mes en total. Dos ajustes:

1. La lección diaria pasa a ser una **misión diaria fija ("ancla")**: siempre visible, fuera del sorteo del pool (~100–150 SP base). Matiz (corregido 2026-07-07): la racha **no depende** de esta misión — se cuenta al completar la lección y su boost global sigue activo aunque la misión no existiera. El anclaje se decide igualmente por consistencia: que la lección tenga recompensa SP directa **todos** los días refuerza el hábito. El pool del PDF (D01–D12) ignora las lecciones — esta integración es nuestra. Nota de economía: añade ~100–150 SP/día al presupuesto de diarias del PDF (250/día) → o se rebajan ligeramente las rotativas o se acepta que el gap final se estrecha (knob de producto).
2. El efecto de la racha sobre SP pasa de multiplicar la lección ×3 a un **bonus global**: **+15% / +30% / +50% / +70%** (rachas 3 / 8 / 21 / 46 — decidido 2026-07-07). Aplica a *todo* el SP ganado ("tu racha potencia todo el pase"). Valores deliberadamente generosos por dos razones de producto: (a) la lección diaria es la palanca principal de retención y la constancia debe pesar mucho; (b) la economía del PDF hacía el nivel 100 demasiado duro para actividad mayormente presencial (jugar partidos). El cap global (×2.0) sigue acotando el apilado con boosters.
3. **Desaparece el grant directo de SP** al completar la lección (`learningDailyLesson.ts:624`): la lección completa su misión y es el **motor de misiones** quien otorga el SP, como con cualquier otra misión. Un solo camino de grant → se eliminan los parches (`seasonPassLessonSpRepair.ts`, el override de `sp_reward` en `buildMissionsForPlayer`) y `lesson_sp_base` queda obsoleto.

> ⚠️ Esto **reduce el SP que hoy da la lección** (600–1800 → ~150–180). Hay que validarlo con producto y comunicarlo si ya hay usuarios acumulando SP.

---

## 4. Reconciliación económica (PDF ↔ repo)

Economía objetivo del PDF (temporada de 3 meses, 100 niveles × 1.000 SP = 100.000 SP):

| Fuente | SP/mes (PDF) | 3 meses |
|---|---|---|
| 3 diarias/día (~250 SP/día) | 7.500 | 22.500 |
| 4 de 6 semanales (~1.800 SP/sem) | 7.200 | 21.600 |
| ~10 de 14 mensuales | 14.500 | 43.500 |
| **Total jugador activo** | **29.200** | **87.600** |
| Gap hasta 100.000 | — | 12.400 → boosters + juego impecable |

Con los valores decididos (racha +15/30/50/70%), el gap deja de ser un muro: un jugador activo con racha alta gana +50–70% sobre ~29.200/mes ≈ **+14.600–20.400 SP/mes extra** y completa el pase con holgura antes del fin de temporada (el SP capea en nivel 100, `addSeasonPassSp` ya lo acota). Es una desviación **consciente** respecto al PDF: producto considera que su economía complicaba demasiado llegar al último nivel siendo actividad presencial, y que la lección diaria debe recompensar fuerte la constancia. Los boosters Elite quedan como acelerador para quien no mantiene racha.

**Cambios de seed necesarios:** la temporada `s1` sembrada en `050` (`ends_at 2026-04-30`) **ya expiró y sigue `active=true`**. Hay que sembrar la temporada real (fechas 3 meses) y desactivar/ajustar `s1`. `lesson_sp_base` queda obsoleto (el `sp_reward` de la misión fija de lección es la fuente de verdad).

---

## 5. Gap analysis: requisito del PDF → estado → acción

### 5.1 Misiones diarias (pool D01–D12, 3 aleatorias/día por usuario)

| ID | Evento backend | ¿Trackeable hoy? | Dónde engancha |
|---|---|---|---|
| D01 login | `daily_active` | ✅ Decidido: cuenta **abrir la app** (día activo) | Nueva tabla `player_active_days` (migración 096) alimentada con throttle 1/día desde requests autenticadas (`getPlayerIdFromBearer` o bootstrap del Home) |
| D02 partido completado | `match_completed` | ✅ | Confirmación de marcador en `matchScores.ts` → `runLevelingPipeline` / `applyFriendlyPlayCounts`; datos en `matches` + `match_players` |
| D03 partido de Liga | `match_completed (league)` | ✅ | Ídem, filtrando tipo de partido |
| D04 partido Matchmaking IA | `match_completed (match_ia)` | ✅ | Ídem |
| D05/D06 victoria | `match_victory` | ✅ | `match_players.result = 'win'` (ya lo usa `unlockablesEngine.computeSignals`) |
| D07 reserva creada | `booking_created` | ✅ | `bookings.ts` `POST /` (línea ~1488) |
| D08 valoración enviada | `rating_submitted` | ✅ | `matchFeedback.ts` `POST /:id/feedback` |
| D09 voto MVP | `mvp_vote_submitted` | ❌ La feature no existe | **Descartada** (decidido 2026-07-07) |
| D10 seguir usuario | `user_follow` | ❌ Aún no hay grafo social | Se queda en el pool **inactiva** hasta que se lance el sistema de follows — plan propio: `docs/follow-system-implementation-plan.md` |
| D11 comentario | `community_comment` | ✅ El feed de comunidad ya existe (`community.ts` `POST /posts/:id/comments`) | **Remapeada a "Comenta en la comunidad"** (no es el feedback post-partido — eso es D08). Trackeable ya, sin feature nueva |
| D12 compartir en RRSS | `share_external` | 🔜 En construcción — plan propio: `docs/sharing-implementation-plan.md`, se implementa **antes** del pase | Nacerá activa: cuenta `community_share_events` con `channel in ('external','join_link')` en el período |
| — lección diaria | `daily_lesson` | ✅ Ya implementado | **Misión diaria fija (ancla)**, fuera del sorteo; se elimina el grant directo de SP (§3) |

### 5.2 Misiones semanales (6 fijas por calendario, lunes)

Todas las W01–W14 y W16 son **derivables de datos ya persistidos** (`matches`, `match_players`, `bookings`, `learning_sessions`, misiones diarias completadas): partidos por tipo, victorias, sets (hay marcadores por set), clubes distintos, franjas horarias (fin de semana / >20:00 / <14:00), compañeros/rivales distintos, reservas, clases. Excepciones:

- **W13 (asistir a 2 clases de Academia):** decidido 2026-07-07 — **la reserva de clase cuenta como asistencia** (v1). Fuente: `bookings` de tipo clase.
- **W15 (ser votado MVP):** **descartada** junto con D09 (la feature de MVP no existe ni entra en S1).

### 5.3 Misiones mensuales

Derivables casi todas (volumen de partidos, victorias, rachas de victorias, logins en 15 días, clases, reservas, clubes, compañero fijo, misiones semanales completadas). Excepciones: **MVP ×4** (**descartada**, como D09/W15). La de **"contador de penalizaciones en 0"** queda resuelta (2026-07-07): se refiere a las **penalizaciones de matchmaking** — tabla `matchmaking_reject_faults` (`backend/db/040_matchmaking_reject_sanctions.sql`), cuyas filas se crean en `matchmakingService.ts:600` al rechazar un partido encontrado en cola (sistema ya existente, con penalizaciones LP escalantes y bloqueos temporales en `matchmaking_player_blocks`). Condición de la misión: **0 faults con `created_at` dentro del mes**. Nota de motor: esta misión solo puede darse por completada **al cerrar el período** — el evaluador la muestra en progreso durante el mes ("0 penalizaciones — mantente así") y el grant se hace diferido en el primer `/me` tras acabar el mes (pequeña extensión del motor: misiones de "grant al cierre").

### 5.4 Mecánicas nuevas del PDF

| Mecánica | Estado | Acción |
|---|---|---|
| Reroll (1 diaria + 1 semanal; 1º gratis, resto moneda virtual) | ❌ | v1 solo gratis (sin moneda). **No existe moneda virtual de jugador** (la wallet actual es club-scoped) — la moneda es proyecto aparte |
| Misiones de comunidad (contadores globales) | ❌ | Fase 4 — requiere agregación global + reparto de XP |
| Catch-up (+15% primeras 10 misiones si entras el último mes) | ❌ | Fuente `catch_up` del boost engine (fase 3) |
| Asignación híbrida (diarias aleatorias por usuario / semanales fijas por calendario) | ❌ | Motor de asignación (fase 1, ver §6.2) |

### 5.5 Recompensas (niveles 1–100, free/elite)

| Requisito PDF | Estado repo | Acción |
|---|---|---|
| 42 iconos con variaciones de rareza | ❌ No hay assets en el repo (solo logo + SVGs de puzzle) | **Aplazado** (decidido 2026-07-07): S1 sale sin iconos; se incorporarán como kind `icon` de `unlockables` cuando lleguen de diseño |
| Títulos estáticos/animados, marcos animados | ⚠️ Existe el motor `unlockables` (`077`–`082`: kinds `title`/`frame`, rarezas, colores, animaciones) data-driven en backend, y render procedural en mobile (`profileCatalog.ts`, `frames.ts`) | **Decidido: S1 usa el sistema de personalización existente** (títulos, insignias, trofeos y marcos). Los **marcos** se reservan a hitos difíciles: niveles altos y carril Elite |
| Boosters de XP como recompensa | ❌ | Boost engine (§3) |
| Tabla de recompensas por nivel free/elite | ❌ No existe | Nueva tabla `season_pass_rewards` (§6.3) |
| Grant al subir de nivel + retroactivo al comprar Elite | ❌ | Servicio de grant + hook en `finalizeSeasonPassElitePurchase` |

> ⚠️ Duplicación existente a resolver: el catálogo cosmético está **hardcodeado en mobile** (`profileCatalog.ts`) y **data-driven en backend** (`unlockables`). Para el pase, la fuente de verdad debe ser el backend: `/season-pass/me` devolverá descriptores de render (kind, rareza, colores, animación) y mobile los pinta con su sistema procedural.

---

## 6. Diseño técnico propuesto

### 6.1 Modelo de datos (migraciones nuevas, siguiente número libre: `091_`)

**`091_season_pass_missions_v2.sql`**
```sql
-- Extiende season_pass_mission_definitions (el pool)
alter table season_pass_mission_definitions
  add column assignment text not null default 'monthly_all'
    check (assignment in ('daily_fixed','daily_pool','weekly_calendar','monthly_all')),
  -- daily_fixed: misión ancla siempre activa (lección diaria), fuera del sorteo
  add column condition_params jsonb not null default '{}'::jsonb;
  -- condition_params: {"match_type":"league"}, {"time_after":"20:00"}, {"distinct":"club"}...

-- Asignaciones y progreso por jugador
create table player_season_pass_missions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id),
  mission_id uuid not null references season_pass_mission_definitions(id),
  period_start date not null,          -- día (daily), lunes (weekly), día 1 (monthly)
  progress int not null default 0,
  completed_at timestamptz,
  sp_granted int,                      -- SP final otorgado (con boosts), null si no completada
  notified_at timestamptz,             -- null = celebración pendiente de mostrar en la app
  rerolled_to uuid references season_pass_mission_definitions(id),
  unique (player_id, mission_id, period_start)
);
```

**`092_season_pass_rewards.sql`**
```sql
create table season_pass_rewards (
  id uuid primary key default gen_random_uuid(),
  season_slug text not null references season_pass_seasons(slug),
  level int not null,
  tier text not null check (tier in ('free','elite')),
  reward_type text not null check (reward_type in ('unlockable','sp_boost','sp')),
  unlockable_id uuid references unlockables(id),   -- si reward_type = 'unlockable'
  boost_config jsonb,   -- {"bonus":0.5,"scope_missions":5} si reward_type = 'sp_boost'
  sp_amount int,        -- si reward_type = 'sp'
  display jsonb not null default '{}'::jsonb,  -- {icon, label, rarity, colors, animated}
  unique (season_slug, level, tier, reward_type, unlockable_id)
);

create table player_season_pass_reward_grants (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id),
  reward_id uuid not null references season_pass_rewards(id),
  granted_at timestamptz not null default now(),
  notified_at timestamptz,             -- null = pendiente de modal (patrón player_unlockables)
  unique (player_id, reward_id)
);
```

**`093_player_sp_boosts.sql`**
```sql
create table player_sp_boosts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id),
  source text not null check (source in ('pass_reward','catch_up','event')),
  bonus numeric(4,2) not null,          -- 0.30, 0.50, 0.60, 0.15
  remaining_missions int,               -- soportado para futuras temporadas
  expires_at timestamptz,               -- S1: ventana temporal 48-72h, activacion automatica al otorgar (decidido 2026-07-07)
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
-- La fuente 'lesson_streak' NO se materializa: se deriva en runtime de learning_streaks.
```

**`094_season_pass_season_s1.sql`** — decidido 2026-07-07: **extender `s1`** como si hubiera empezado el 2026-06-01:
```sql
update season_pass_seasons
  set ends_at = '2026-09-01T00:00:00Z', subtitle = 'Jun – Sep 2026'
  where slug = 's1';
```
(3 meses; a fecha de hoy la temporada iría por ~1/3). Este `update` es un one-liner que conviene aplicar en prod **ya**, sin esperar al resto de la fase 1, porque corrige la temporada caducada visible en la app. La migración añade además `boost_cap` por temporada y siembra el pool completo de misiones (lección fija + D01–D08 + D11 remapeada, semanales, mensuales trackeables) con `sp_reward` según el PDF.

**`095_player_season_pass_per_season.sql`** — decidido: el SP es **por temporada y se resetea**. `player_season_pass` pasa a clave compuesta `(player_id, season_slug)` (backfill: las filas actuales se asignan a `s1`); `has_elite` también pasa a ser por temporada (el pase Elite se compra en cada temporada). Las filas de temporadas pasadas quedan como histórico (visible en perfil si algún día se quiere). `addSeasonPassSp`, `computeSeasonPass`, `finalizeSeasonPassElitePurchase` y `GET /season-pass/me` pasan a operar sobre la temporada activa.

**`096_player_active_days.sql`** — tabla `player_active_days (player_id, day date, primary key (player_id, day))` alimentada con throttle 1/día desde requests autenticadas. Soporta D01 ("abrir la app" = día activo, decidido 2026-07-07) y la mensual "login en 15 días distintos".

### 6.2 Motor de misiones (backend)

**Asignación — sin cron, lazy y determinista.** En vez de un job a las 00:00 (el PDF lo sugiere, pero no hay infra de cron sólida y el repo ya evalúa on-read):

- **Diarias:** al primer `GET /season-pass/me` del día, si no hay filas `player_season_pass_missions` para `(player, hoy)`, se materializan la **misión fija de lección (`daily_fixed`)** más **3 del pool con PRNG sembrado por `hash(player_id + fecha)`** → aleatorio por usuario (objetivo del PDF: no saturar pistas), reproducible e idempotente sin estado extra.
- **Semanales:** fijas por calendario para toda la comunidad (PDF §3.1): las 6 activas se derivan de `hash(season_slug + iso_week)` sobre el pool semanal — mismas para todos, sin asignación por usuario (solo fila de progreso lazy).
- **Mensuales:** todas activas desde el día 1 del mes.

**Evaluación — on-read, siguiendo el patrón existente** (`seasonPassMissions.evaluateCondition` + `unlockablesEngine.evaluateAndGrant`):

- Extender `evaluateCondition(conditionKey, params, playerId, periodRange)` con un evaluador por `condition_key`, todos consultas sobre tablas ya persistidas: `matches`/`match_players` (partidos, victorias, tipos, sets, horarios, clubes, compañeros, rivales), `bookings` (reservas, clases), `match_feedback` (ratings), `learning_sessions` (lección), `player_season_pass_missions` (misiones-meta tipo W16).
- Al detectar `done && completed_at is null` → marcar completada y otorgar SP vía `grantSeasonPassSp()` (transaccional/idempotente por el unique de la tabla). Cooldown en memoria como en `unlockablesEngine` para no reevaluar en cada request.
- Único evento **no persistido hoy**: "día activo" (D01, mensual "login 15 días"). Solución mínima: tabla `player_active_days (player_id, day)` alimentada con throttle desde `getPlayerIdFromBearer` o desde el bootstrap del Home.

**Timezone:** el cliente ya envía `?timezone=` y existe `learningTimezone.getTodayRange()`. Los períodos (día/semana/mes) se calculan con la timezone del request, igual que la lección diaria.

### 6.3 Recompensas por nivel

1. Al otorgar SP, `grantSeasonPassSp` recalcula el nivel (`computeSeasonPass`); si sube, otorga las recompensas de los niveles cruzados: tier `free` siempre, tier `elite` solo si `has_elite`.
2. Los cosméticos se otorgan **creando la fila en `player_unlockables`** (reuso del motor y del modal de desbloqueo existente `UnlockModalHost`); los boosters crean fila en `player_sp_boosts`; los `sp` directos re-entran por `grantSeasonPassSp` (sin boosts, para no recursar).
3. **Compra Elite retroactiva:** `finalizeSeasonPassElitePurchase()` pasa a otorgar todas las recompensas `elite` de niveles ya alcanzados.
4. `GET /season-pass/me` se amplía: `track_levels` pasa a incluir las recompensas por nivel con su `display`, estado (`locked/unlocked/granted`) y tier.

### 6.4 Boost engine

```ts
// seasonPassBoosts.ts
async function getActiveSpBonus(playerId): Promise<{ total: number; breakdown: BoostRow[] }> {
  // 1. lesson_streak: derivar de learning_streaks → +0.15/+0.30/+0.50/+0.70 (rachas 3/8/21/46)
  // 2. player_sp_boosts activos (remaining_missions > 0 || expires_at > now)
  // 3. catch_up: si la temporada está en su último mes y el jugador tiene <10 misiones completadas
  // total = clamp(Σ, 0, season.boost_cap - 1)
}

async function grantSeasonPassSp(playerId, baseSp, ctx: { missionId?, source }): Promise<GrantResult> {
  const { total } = await getActiveSpBonus(playerId);
  const finalSp = Math.round(baseSp * (1 + total));
  await addSeasonPassSp(playerId, finalSp);
  // decrementar remaining_missions de boosters consumibles si ctx.missionId
  // detectar level-up → otorgar recompensas (§6.3)
}
```

**Migración de la lección al camino único:** el endpoint de completar lección deja de otorgar SP directamente (`learningDailyLesson.ts:624`); en su lugar invoca la evaluación de misiones de forma síncrona y devuelve el delta del pase en la respuesta (ver §6.7). Se eliminan `seasonPassLessonSpRepair.ts` y el override de `sp_reward` en `buildMissionsForPlayer`. Se deja de escribir `learning_sessions.xp_earned` (la columna se conserva como histórico; el score del quiz sigue calculándose igual).

### 6.5 Endpoints nuevos / modificados

| Endpoint | Cambio |
|---|---|
| `GET /season-pass/me` | + recompensas del track con estado, + boosts activos (`{total_bonus, breakdown}`), + info de reroll disponible, + `pending_celebrations` (misiones con `notified_at IS NULL`) |
| `POST /season-pass/missions/:id/reroll` | Nuevo. v1: 1 gratis/día (daily) y 1 gratis/semana (weekly); regenera con el PRNG excluyendo la descartada |
| `POST /season-pass/missions/ack` | Nuevo: marcar `notified_at` de misiones celebradas (batch de ids) |
| `POST /season-pass/boosts/:id/activate` | **Descartado** — los boosters se activan automáticamente al otorgarse (decidido 2026-07-07) |
| `POST /season-pass/rewards/ack` | Nuevo: marcar `notified_at` (modal visto) |

Además, los endpoints de acciones in-app que pueden completar misiones (completar lección, crear reserva, enviar valoración…) incluyen en su respuesta un bloque `season_pass` con el delta (§6.7), para que la celebración sea inmediata sin esperar al siguiente `/me`.

### 6.6 Cambios en mobile

La pantalla ya soporta misiones por período y progreso (`current/target`), así que la fase 1 es casi gratis en cliente. Cambios:

1. **`src/api/seasonPass.ts`**: ampliar tipos (`track_rewards`, `boosts`, `reroll`, `pending_celebrations`), nuevas funciones para reroll/ack/activate.
2. **`SeasonPassScreen.tsx`**: track de recompensas real (render procedural con los descriptores `display` — reutilizar `frames.ts`/`rarity.ts`), estados locked/granted, CTA de reroll en `MissionRow`, banner de boost activo ("Racha de N días: +15% SP en todo").
3. **`DailyLessonScreen.tsx` (pantalla de resultados)**: desaparece la métrica de XP. La recompensa se presenta como **misión completada**: tarjeta "✅ Misión completada — Lección diaria: +150 SP", con línea secundaria de racha ("Racha: 12 días → Boost +10% SP en todo el pase"). Es el mismo componente de celebración de §6.7, no un diseño exclusivo de lecciones.
4. **`DailyLessonCard.tsx` (Home)**: actualizar copy — la racha ya no promete "×2 XP" sino "+X% SP en el pase".
5. **Componente de celebración de misiones** (nuevo, ver §6.7): consumido por la pantalla de resultados de lección y por cualquier flujo que reciba un delta `season_pass`.
6. **`UnlockModalHost`**: ya montado globalmente — las recompensas cosméticas del pase entran solas por `player_unlockables.notified_at`.
7. **`HomeDataContext`**: procesa `pending_celebrations` del `/me` y alimenta la cola de celebraciones diferidas.

---

### 6.7 UX de misión completada (entrega visual)

La celebración de misiones tiene **dos canales**, porque las misiones se completan de dos maneras distintas:

**Canal instantáneo — acciones dentro de la app.** Cuando la acción que completa la misión ocurre en la app (completar lección, crear reserva, enviar valoración), el endpoint de la acción evalúa las misiones síncronamente y devuelve el delta en su respuesta:

```jsonc
"season_pass": {
  "completed_missions": [{ "slug": "daily_lesson", "title": "Lección diaria", "sp_granted": 150 }],
  "sp_total": 12450,
  "boost_applied": 0.10,                    // desglose para el copy "incluye +10% por racha"
  "level_up": { "from": 12, "to": 13, "rewards": [ /* display descriptors */ ] } | null
}
```

El cliente celebra en el momento: tarjeta/overlay "✅ Misión completada — {título}: +{SP} SP", contador de SP animado, y modal de nivel si hay `level_up`. En la lección diaria esta tarjeta se integra en la pantalla de resultados (sustituye a la métrica de XP).

**Canal diferido — completadas "fuera".** Muchas misiones se completan sin que el jugador esté mirando (el rival confirma el marcador horas después, la misión semanal cae al confirmar el tercer partido…). Para estas: `player_season_pass_missions.notified_at IS NULL` marca la celebración pendiente; `GET /season-pass/me` las devuelve en `pending_celebrations`; el Home muestra la cola de celebraciones al abrir la app (mismo patrón que `UnlockModalHost` con `player_unlockables.notified_at`) y hace ack vía `POST /season-pass/missions/ack`.

**Tratamiento visual (mismo componente en ambos canales):** tarjeta de misión con check animado + SP sumándose, stack si hay varias pendientes, confetti/modal solo en level-up (no en cada misión, para no fatigar). Reutilizar la infraestructura de modales global existente.

---

## 7. Plan por fases

### Fase 1 — Motor de misiones core (el grueso)
Pool completo de misiones trackeables + asignación híbrida lazy (lección fija + 3 rotativas) + evaluadores + grant idempotente de SP vía motor de misiones + **unificación de moneda** (retirar la XP de aprendizaje de la UI, eliminar el grant directo de la lección y sus parches) + **UX de misión completada** (§6.7, ambos canales) + nueva temporada sembrada. Mobile: pantalla de resultados de lección rediseñada (framing de misión), componente de celebración, cola diferida en Home.
**Entregable:** el pase progresa con la actividad real (partidos, reservas, ratings, lecciones, horarios, clubes) y cada misión completada se celebra visualmente.

### Fase 2 — Recompensas por nivel
Tablas de rewards + grant on level-up + Elite retroactivo + track real en la app con modal de desbloqueo.
**Entregable:** subir de nivel entrega cosméticos free/elite visibles y equipables.
**Dependencia externa:** assets/definición de los "42 iconos" (o decisión de render procedural).

### Fase 3 — Boost engine unificado
`player_sp_boosts` + bonus global de racha + boosters como recompensa + catch-up + UI de boosts.
**Entregable:** la racha de lecciones potencia todo el SP; los niveles Elite entregan boosters consumibles.

### Fase 4 — Extras
Reroll v1 (gratis) → luego con moneda virtual (proyecto aparte). Misiones de comunidad. (Follows y Compartir ya **no** van aquí: se implementan **antes** del pase — planes propios en `docs/follow-system-implementation-plan.md` y `docs/sharing-implementation-plan.md`, orden conjunto en §9 de este último — de modo que D10/D11/D12 nacen activas. El voto MVP queda descartado.)

**Orden recomendado:** 1 → 2 → 3 → 4. Las fases 1–3 son independientes de features nuevas de producto; la 4 no bloquea el lanzamiento de la temporada.

---

## 8. Riesgos y notas operativas

- **Temporada `s1` caducada pero `active=true`** (`ends_at 2026-04-30`): la app sigue mostrándola. Decidido: extender a 2026-09-01 ("Jun – Sep 2026"); el `update` de una línea (§6.1, migración 094) conviene aplicarlo en prod cuanto antes, sin esperar a la fase 1.
- **Recalibración del SP de la lección**: baja de 600–1800 a ~150–180/día. Si hay usuarios con SP acumulado, decidir si se conserva (recomendado: sí, no se toca lo ya ganado).
- **Números de migración duplicados** en `backend/db/` (dos `049_`, `050_`…): confirmar el siguiente número libre (`091_`) en el momento de crear las migraciones.
- **Idempotencia del grant**: todo pasa por uniques de tabla (`player_season_pass_missions`, `player_season_pass_reward_grants`) — sin doble grant aunque se reevalúe on-read.
- **Rendimiento del on-read**: con ~10 misiones activas por jugador y consultas indexadas por período es asumible; si crece, migrar a contadores incrementales por evento (el diseño lo permite sin cambiar el modelo).
- **Sin push notifications** en el repo: los avisos de misión completada / nivel subido quedan in-app (modal + card del Home). Push es proyecto aparte.
- **Moneda virtual**: no existe wallet de jugador global (la actual exige `club_id`). El reroll de pago y las "monedas" del PDF la necesitan — decisión de producto separada.

---

## 9. Decisiones tomadas y pendientes

### Decisiones tomadas (2026-07-07)

1. **Moneda única: SP.** La XP de aprendizaje desaparece de la UI; el score del quiz se mantiene como feedback de acierto.
2. **Lección diaria = misión diaria fija** sin grant directo de SP. Resultados con framing "Misión completada — Lección diaria: +N SP". (Matiz: la racha no depende de la misión — el anclaje es por consistencia de recompensa, no porque la racha lo exija.)
3. **UX de misión completada** (§6.7): dos canales (instantáneo en la respuesta de la acción + cola diferida con `notified_at`), mismo componente visual.
4. **Boosters consumibles: ventana temporal con activación automática al otorgarse**, duración generosa (48–72 h) para minimizar el desperdicio de activarse en mal momento. El esquema soporta también "por N misiones" para futuras temporadas.
5. **Cap de apilado: ×2.0** total.
6. **Bonus global de racha: +15% / +30% / +50% / +70%** (rachas 3 / 8 / 21 / 46). Deliberadamente generoso: la constancia con la lección diaria debe recompensar mucho, y la economía del PDF hacía el nivel 100 demasiado duro para actividad presencial. Esto resuelve también la antigua pregunta 10: la racha **es** la gran recompensa (junto a los unlockables por hito).
7. **Misiones sociales del PDF:** D09 (voto MVP), W15 y la mensual MVP×4 — **descartadas** (la feature no existe). D10 (seguir usuario) y D12 (compartir RRSS) — cubiertas por sus planes propios (`docs/follow-system-implementation-plan.md` y `docs/sharing-implementation-plan.md`), que se implementan **antes** del pase → nacen activas. D11 — **remapeada a "Comenta en la comunidad"** (el feed ya existe; no es el feedback post-partido).
8. **W13 clases:** la reserva de clase cuenta como asistencia (v1).
9. **"Login diario":** cuenta abrir la app → `player_active_days` (migración 096).
10. **SP por temporada con reset:** `player_season_pass` pasa a `(player_id, season_slug)`; `has_elite` por temporada (migración 095).
11. **Recompensas S1:** sistema de personalización existente (títulos, insignias, trofeos, marcos). Los **marcos**, reservados a hitos difíciles (niveles altos / Elite). Los "42 iconos" aplazados hasta que lleguen de diseño (semi-abierto).
12. **Temporada `s1`: se extiende** como si hubiera empezado el 2026-06-01 → termina el **2026-09-01** ("Jun – Sep 2026"). El `update` puede aplicarse en prod ya.
13. **"Penalizaciones en 0"** (mensual): definida — son las **penalizaciones de matchmaking** (`matchmaking_reject_faults`, creadas al rechazar partidos encontrados en cola). Condición: 0 faults en el mes; grant al cierre del período (§5.3).
14. **Compartir (D12 y misiones de share):** plan propio en `docs/sharing-implementation-plan.md` — pieza central: **join link de partido** (cualquiera con el link se une, incluso a partidos privados); además share al feed (partidos, logros, hitos del pase, torneos, repost) + externo a RRSS, todo con tracking en `community_share_events`. Se implementa antes del pase.

### Pendientes

1. **Iconos de recompensa:** añadir kind `icon` a `unlockables` cuando lleguen los assets de diseño.
2. **Ajuste fino de economía tras datos reales de S1** (valores de misiones, % de racha, duración de boosters).

---

## 10. Reparto entre equipos y puntos de contrato

Contexto (2026-07-07): **follows y compartir los implementan otros devs**; el season pass va aparte. El pase es **implementable de forma independiente al completo**: de todo el pool, solo D10 (follow) y D12 (share) dependen de los otros sistemas, y ambas se siembran con `active=false` hasta que existan. Todo lo demás evalúa sobre tablas que ya existen hoy.

Puntos de contrato con los otros equipos:

1. **Esquemas acordados** (los evaluadores del pase leerán exactamente esto — avisar si cambian al implementar):
   - `player_follows`: `created_at` = primera vez del par (no cambia al re-seguir; unfollow = soft-delete). La misión D10 cuenta `created_at` en el período.
   - `community_share_events`: la misión D12 cuenta `channel in ('external','join_link')` en el período.
2. **Canal instantáneo de celebración (§6.7):** el motor del pase expondrá un helper reutilizable (p. ej. `evaluateMissionsAndBuildDelta(playerId)`) que los endpoints de follow y de compartir deben invocar y adjuntar como bloque `season_pass` en sus respuestas. Ese helper lo provee el equipo del pase; los otros equipos solo lo llaman.
3. **Activación de misiones:** al desplegar cada feature social, flip de `active=true` en `season_pass_mission_definitions` (una fila SQL por misión).
4. **Números de migración:** el pase reserva `091`–`096`; los equipos de social deben coger los siguientes números libres y coordinarlo al mergear (ya hay duplicados históricos en `backend/db/` — no añadir más).
5. **Zonas de conflicto de merge previsibles en mobile:** `MainApp.tsx` (ambos bloques registran pantallas/estados nuevos), archivos de i18n (`es` + `zh-HK`) y `HomeDataContext.tsx`. Coordinar orden de merge.
