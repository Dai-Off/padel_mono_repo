# Propuesta — Progresión de ligas estilo videojuego

> Borrador de propuesta. Fecha: 2026-06-17
> Relacionado: [PROPUESTA_PAREJA_LIGA_COMPETITIVA.md](PROPUESTA_PAREJA_LIGA_COMPETITIVA.md), [10_ligas.md](10_ligas.md), [06_matchmaking.md](06_matchmaking.md), [04_cuestionario_inicial.md](04_cuestionario_inicial.md), [03_algoritmo_actualizacion.md](03_algoritmo_actualizacion.md)

## 0. Objetivo

Rediseñar la progresión de ligas para resolver cuatro problemas del modelo actual, tomando ideas de los sistemas de ranking de videojuegos (Rocket League, Valorant, LoL) **sin** introducir *placement matches* (el cuestionario de onboarding ya calibra el `mu` inicial).

El principio rector: **separar el skill interno (`mu`, para matchmaking) del rango visible (liga, para motivación y progresión).** El `mu` te empareja bien desde el primer partido; la liga se gana jugando.

---

## 1. Estado actual (resumen)

### Onboarding
- Cuestionario (Fase 1 + Fase 2) → ELO final ∈ [0.5, 6.25] → `mu = eloToMu(elo)`, `sigma = 8.333`, `beta = 4.167`.
- **Liga inicial asignada directamente** por `ligaFromEloWithBands(elo, bands)` → un autoevaluado alto entra en oro/elite sin jugar.
- `onboardingService.ts` + ruta `POST /players/onboarding-answers` (`routes/players.ts`).

### Durante la temporada (`matchmakingLeagueEconomy.ts`)
- `LP_WIN_BASE = 15`, `LP_LOSS_BASE = 12`, empate = 0.
- Ascenso: al llegar a `lps >= 100` se restan 100 y se sube un escalón → `mm_shield_matches = 5`.
- Descenso: tras derrota con `lps == 0`, fuera de bronce y sin escudo → baja un escalón, `lps = 45`.
- Bonus/penalidad cross-liga (`CROSS_LIGA_LP_PER_INDEX_GAP = 4`, `CROSS_LIGA_LOSS_EXTRA_PER_INDEX_GAP = 3`) — **rara vez se activa** porque el matchmaking empareja por liga similar.
- Reconciliación: `reconcileLigaWithElo` realinea la liga solo si diverge **≥2 escalones** del elo.

### Reset de temporada (`matchmakingSeasonService.ts`)
- Archiva snapshot en `player_league_history` (`liga`, `final_lps`, `highest_liga`).
- `lps = 0`, `mm_shield_matches = 0`, `mm_peak_liga = liga` actual.
- **La liga se mantiene** — no hay descenso entre temporadas.

### Matchmaking (`matchmakingShared.ts`, `matchmakingService.ts`) — dato clave
El emparejamiento usa **dos capas obligatorias e independientes**:
1. **Liga** — `leaguesMatchmakingCompatible`, spread de liga ≤1.
2. **Skill real** — `exceedsLevelSpread` (`MAX_LEVEL_SPREAD = 1.0` sobre elo 0-7) + ventana adaptativa por racha (`±0.5`, o `[-0.2,+0.8]` / `[-0.8,+0.2]`) + balance de equipos con OpenSkill `predictWin` en `[0.35, 0.65]`.

> **Implicación crítica para esta propuesta:** aunque metamos a todos en bronce, la segunda capa (elo/mu) sigue impidiendo que un jugador fuerte se empareje con uno flojo. La calidad de los partidos **no se degrada** por arrancar a todos en bronce.

---

## 2. Problemas a resolver

1. **Liga inflada desde el onboarding** — el cuestionario es subjetivo; un autoevaluado alto entra en oro y distorsiona la percepción (no el matchmaking, que ya filtra por elo).
2. **Sin progresión entre temporadas** — si ya estás en elite empiezas en elite; los veteranos pierden la sensación de "volver a escalar".
3. **Sin corrección rápida** — un mal colocado necesita muchas derrotas acumuladas para bajar.
4. **`mu` y liga divergen** — el `mu` se ajusta cada partido, la liga solo por LP; `reconcileLigaWithElo` es un parche.

---

## 3. Decisiones tomadas

| # | Decisión | Detalle |
|---|----------|---------|
| D1 | **Todos a bronce tras onboarding** | La liga visible se gana jugando. El `mu` del cuestionario solo alimenta el matchmaking y el acelerador de LP. |
| D2 | **Soft reset de −1 tramo por temporada** | elite→oro, oro→plata, plata→bronce, bronce→bronce. |
| D3 | **`mu`/`sigma` intactos en el reset** | El skill interno no se toca entre temporadas. Solo cambian liga visible y LP. |
| D4 | **Acelerador de LP modulado por `mu` (gravedad unidireccional)** | Multiplica las ganancias de LP cuando estás **infravalorado** respecto a tu skill real. Nunca penaliza. |
| D5 | **Sin *placement matches*** | El onboarding ya calibra el `mu`. No hay estado "en calibración" ni UI asociada. |

### Razonamiento de las decisiones delicadas

**D1 — ¿Por qué es seguro meter a todos en bronce?** Porque el matchmaking equilibra por elo/mu en una capa independiente de la liga (ver §1). Un principiante y un experto en bronce **no** se emparejarán: el filtro de elo (`±1.0`) lo impide. La liga pasa a ser un marcador de progresión/motivación, no el filtro de skill.

**D2 — ¿Por qué solo 1 tramo?** Con solo 4 ligas, 1 tramo ya es el 25% de la escalera. En videojuegos un "−1 tramo" se siente suave porque hay decenas de escalones; aquí bajar 2 tramos colapsaría a casi todos en bronce y se sentiría como castigo. **1 tramo es lo correcto con 4 ligas.** Un soft reset más matizado requiere subdivisiones (ver §6, mejora opcional).

**D4 — ¿Por qué gravedad por `mu` y no "x2 las primeras 10 partidas"?**
- El matchmaking empareja por nivel real → winrate ~50% → con +15/−12 el drift neto es lento (+3 cada 2 partidas). Un buen jugador en bronce **no** sube rápido solo por ganar, porque rara vez gana mucho más del 50%.
- Un multiplicador plano por contador se lo daría también al ya bien colocado y se apagaría por un número arbitrario.
- La gravedad por `mu` **se auto-apaga sola** cuando llegas a tu liga real (gap→0) y no necesita campos/contadores nuevos de temporada.
- Resuelve a la vez los problemas #3 (corrección rápida) y #4 (divergencia mu↔liga), y deja `reconcileLigaWithElo` como mera red de seguridad.

**¿Por qué unidireccional (no penalizar al sobrevalorado)?**
- Si un jugador gana de verdad, su `mu` sube con él → casi nunca queda en gap negativo legítimamente.
- El único gap negativo real viene del drift lento de +15/−12, y **eso ya lo corrige el soft reset** (D2). No hace falta un segundo mecanismo.
- Amortiguar ganancias es visible en el efecto ("gano menos LP") → se sentiría como castigo confuso. El acelerador solo-positivo solo se nota como "subo rápido" = buena sensación.
- La derrota se mantiene en **−12 base** (sin amortiguar): es el freno natural que evita que un autoevaluado altísimo salga disparado sin evidencia en pista.

---

## 4. Diseño técnico

### 4.1 Liga inicial = bronce (D1)

En el flujo de onboarding (`onboardingService.ts` / `POST /players/onboarding-answers`):

```diff
- liga = ligaFromEloWithBands(finalElo, leagueBands)
+ liga = 'bronce'   // LEAGUE_ORDER[0]
  mu = eloToMu(finalElo)   // SIN cambios — sigue alimentando matchmaking y acelerador
  sigma = 8.333            // SIN cambios
  lps = 0
  mm_peak_liga = 'bronce'
  mm_shield_matches = 0
```

El `mu` (y por tanto el `elo_rating` derivado) se conserva tal cual: es lo que hace que el acelerador de LP (§4.4) lleve rápido al jugador a su liga real.

### 4.2 Acelerador de LP por gap de `mu` (D4)

Se calcula en `computeMatchmakingLeagueUpdates()` (`matchmakingLeagueEconomy.ts`), usando el **elo conservador post-partido** (`mu − 2·sigma`, ya disponible como `elo_rating` nuevo que el pipeline calcula antes de reconciliar) y las bandas de liga:

```
ligaObjetivo = ligaFromEloWithBands(eloConservadorNuevo, bands)
gap          = leagueIndex(ligaObjetivo) − leagueIndex(ligaActual)

boost        = gap >= 1 ? min(1 + K_BOOST * gap, BOOST_MAX) : 1     // K_BOOST = 0.5, BOOST_MAX = 2.5

LP_win   = round(LP_WIN_BASE * boost) [+ bonus cross-liga existente]
LP_loss  = −LP_LOSS_BASE                                            // SIN cambios
empate   = 0
```

Efecto con `K_BOOST = 0.5`:

| gap (ligas que te faltan según tu skill) | boost | LP por victoria |
|---|---|---|
| 0 (bien colocado o por encima) | x1.0 | 15 |
| 1 | x1.5 | ~23 |
| 2 | x2.0 | 30 |
| 3 (bronce con skill de elite) | x2.5 (cap) | ~38 |

**Por qué el elo conservador (`mu − 2σ`) y no `mu` crudo:** un recién llegado tiene `sigma` alto → su elo conservador es más bajo → el boost es **prudente al principio** y se hace fuerte a medida que el sistema gana certeza (`sigma` baja con los partidos). Así un autoevaluado altísimo no se dispara antes de tener evidencia en pista. Encaja con D1.

**Auto-apagado:** cuando el jugador llega a su liga real, `gap → 0`, `boost → 1`, y con winrate ~50% se estabiliza ahí. El acelerador cambia la **velocidad** del viaje, no el **destino**.

### 4.3 Soft reset −1 tramo (D2) + `mu`/`sigma` intactos (D3)

En `closeActiveMatchmakingSeason()` (`matchmakingSeasonService.ts`), al resetear cada jugador:

```diff
  // 1. Archivar snapshot con la liga AL CIERRE (antes de bajar)
  player_league_history.liga        = ligaActual
  player_league_history.final_lps   = lps
  player_league_history.highest_liga = highestLigaSnapshot(...)

  // 2. Reset para la nueva temporada
+ nuevaLiga          = prevLiga(ligaActual)   // un escalón abajo, suelo en bronce
+ liga               = nuevaLiga
  lps                = 0
  mm_shield_matches  = 0
+ mm_peak_liga       = nuevaLiga              // pico arranca en la liga ya bajada
  league_season_id   = newSeasonId
  // mu, sigma, beta, beta_residuals → NO se tocan (D3)
```

- `prevLiga()` — añadir helper en `matchmakingLeague.ts` si no existe (espejo de `nextLiga()`), con suelo en `LEAGUE_ORDER[0]`.
- El snapshot archiva la liga **antes** de bajar (refleja lo conseguido esa temporada); el reset baja un tramo para la nueva.
- Como `mu`/`sigma` no se tocan, el jugador que baja queda **infravalorado** (liga < skill real) → el acelerador de §4.2 lo devuelve rápido a su sitio. Soft reset y acelerador trabajan juntos: la sensación de "re-escalar" sin grind tedioso.

### 4.4 `reconcileLigaWithElo` — se mantiene como red de seguridad

No se elimina, pero pasa a ser secundario: el acelerador mantiene `mu` y liga alineados de forma continua, así que el realineamiento de ≥2 escalones casi nunca debería dispararse. Se conserva para casos extremos (p. ej. un jugador que vuelve tras una larga inactividad con `mu` recalculado).

### 4.5 Sin estado "en calibración" ni UI nueva (D5)

No se añade `placement_matches_remaining` ni barra de calibración. El jugador ve su liga real (bronce al empezar) y sus LP desde el primer partido. El acelerador es **invisible** salvo por el efecto natural de ganar más LP por victoria cuando está infravalorado.

---

## 5. Cambios por archivo

| Archivo | Cambio |
|---------|--------|
| `backend/src/services/onboardingService.ts` y/o `routes/players.ts` | Asignar `liga = 'bronce'` fija tras onboarding; mantener `mu`/`sigma`. |
| `backend/src/services/matchmakingLeagueEconomy.ts` | Añadir cálculo de `boost` por gap de elo conservador; aplicar a `LP_win`. Nuevas constantes `K_BOOST`, `BOOST_MAX`. Recibir `eloConservadorNuevo` y `bands` como entrada. |
| `backend/src/services/levelingService.ts` | Pasar el elo conservador post-partido y las bandas a `computeMatchmakingLeagueUpdates()`. |
| `backend/src/services/matchmakingLeague.ts` | Añadir `prevLiga()` (con suelo en bronce) si no existe. |
| `backend/src/services/matchmakingSeasonService.ts` | Soft reset: `liga = prevLiga(liga)` y `mm_peak_liga = nuevaLiga` al resetear, conservando `mu`/`sigma`. |
| Migración nueva (`backend/db/0XX_*.sql`) | **No imprescindible.** Solo si se quiere persistir `K_BOOST`/`BOOST_MAX` en config en vez de constantes en código. |
| Mobile/web | **Ningún cambio funcional obligatorio.** Opcional: mensaje informativo de soft reset al inicio de temporada ("Nueva temporada: has bajado a {liga}, ¡vuelve a escalar!"). |

---

## 6. Mejora opcional (fase futura) — Subdivisiones + boost continuo

Con solo 4 ligas, el acelerador usa un **gap discreto** de índices de liga. Cuando se añadan subdivisiones (bronce III/II/I, plata III/II/I…):

- Cada escalón es estrecho → conviene un boost **continuo** sobre la **distancia de elo** a tu división, en vez del salto discreto: el multiplicador se atenúa suavemente al acercarte a tu sitio (la "zona neutra" alrededor de tu división que comentabas), sin escalones bruscos.
- El soft reset podría bajar una **subdivisión** en lugar de una liga entera, dando un re-escalado más matizado.
- La fórmula de §4.2 es trivial de migrar: se sustituye `gap = leagueIndex(objetivo) − leagueIndex(actual)` por una distancia continua `gap_elo = (eloConservador − eloTechoDivisionActual)` normalizada.

> Hoy (4 ligas): gap discreto, boost solo si gap ≥ 1, LP normal dentro de tu liga. Cada liga es una banda de elo ancha → "estar dentro de tu liga" **ya es** un rango con LP normal.

---

## 7. Parámetros a calibrar

| Parámetro | Valor propuesto | Notas |
|-----------|-----------------|-------|
| `K_BOOST` | 0.5 | Pendiente del multiplicador por escalón de gap. |
| `BOOST_MAX` | 2.5 | Techo del multiplicador (gap de 3 = bronce↔elite). |
| Tramos de soft reset | 1 | Atado a la estructura de 4 ligas (ver §6 para subdivisiones). |
| `LP_WIN_BASE` / `LP_LOSS_BASE` | 15 / 12 | Sin cambios. |
| Reconciliación | ≥2 escalones | Sin cambios (red de seguridad). |

---

## 8. Riesgos y cuestiones abiertas

1. **Climber que adelanta a sus pares de elo y choca con el filtro de liga (spread ≤1).** Riesgo bajo: el boost depende del elo, así que los jugadores de elo parecido suben juntos y sus ligas se mantienen sincronizadas; además `reconcileLigaWithElo` y la propia capa de elo del matchmaking lo amortiguan. **A vigilar en datos reales.**
2. **Velocidad de subida tras "todos a bronce".** Con winrate ~50% y boost x2 (gap 2): ~30 LP/victoria, ~+18 neto cada 2 partidos → ~11 partidos para 100 LP. Con 2-3 partidos/semana, ~1 mes para cruzar una liga estando 2 escalones infravalorado. Ajustar `K_BOOST` si se quiere más rápido.
3. **¿El soft reset aplica también a quien está en bronce?** No baja (suelo), pero pierde sus LP como todos. Correcto.
4. **¿Reset de temporada automático o manual?** Hoy es manual (`POST /matchmaking/close-season` con `x-cron-secret`). Fuera del alcance de esta propuesta, pero conviene un cron si el soft reset va a ser periódico.
5. **Comunicación al usuario del soft reset.** Decidir si se muestra mensaje al inicio de temporada (recomendado para que la bajada no se perciba como bug).

---

## 9. Resumen de una línea

Todos arrancan en **bronce**; el **`mu`** del onboarding empareja bien y, vía un **acelerador de LP unidireccional por gap de skill**, lleva rápido a cada jugador a su liga real; entre temporadas un **soft reset de −1 tramo** (con `mu` intacto) reaviva la escalada sin grind, apoyándose en el mismo acelerador para recolocar.
