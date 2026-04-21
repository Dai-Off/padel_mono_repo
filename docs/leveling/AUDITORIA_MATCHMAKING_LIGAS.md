# Auditoría — Matchmaking y Ligas

> Fecha: 2026-04-14
> Compara: `docs/leveling/06_matchmaking.md` y `docs/leveling/10_ligas.md` contra la implementación real en backend.

---

## 1. Resumen ejecutivo

| Área | Estado | Detalle |
|------|--------|---------|
| Pool de matchmaking (join/leave/status) | ✅ Implementado | Conforme al doc + campos extra geo y expansión |
| Ciclo de matching (combinaciones, filtros) | ✅ Implementado | Conforme al doc. Límite de 12.000 iteraciones añadido |
| Filtros (nivel, género, horario, distancia, liga) | ✅ Implementado | Conforme al doc |
| Team split (OpenSkill + sinergias) | ✅ Implementado | Conforme al doc. Fórmula de sinergia definida |
| Ampliación de criterios | ✅ Implementado | Conforme al doc + near-miss triplets no documentados |
| Confirmación y deadline dinámico | ✅ Implementado | Fórmula del doc respetada |
| Sistema de faltas por rechazo | ❌ No implementado | Solo hay penalización fija de 5 LP, sin faltas acumulativas ni bloqueo |
| Economía de LP (ligas MM) | ✅ Implementado | Con constantes provisionales donde el doc dejaba pendiente |
| Ascenso/descenso | ✅ Implementado | Conforme al doc §6 |
| Escudo post-ascenso | ✅ Implementado | 5 partidos, conforme al doc |
| Reconciliación liga vs elo | ✅ Implementado | Gap ≥2 pasos → auto-ajuste |
| Temporadas y cierre | ✅ Implementado | Reset total (LP=0, shield=0) |
| Ligas de club (league_seasons) | ⚠️ Sin documentar | Sistema completo implementado sin doc de diseño |
| Doc §2 "Estado actual" | ❌ Desactualizado | Sigue diciendo "No existe ninguna tabla de pool" |

---

## 2. Matchmaking — Implementado vs Documentado

### 2.1 Endpoints

| Endpoint (doc) | Endpoint (código) | Estado | Notas |
|---|---|---|---|
| `POST /matchmaking/join` | `POST /matchmaking/join` | ✅ | Añade campos `search_lat`, `search_lng`, `expansion_offer`, `expansion_cycle_index` no mencionados en doc |
| `DELETE /matchmaking/leave` | `DELETE /matchmaking/leave` | ✅ | Doc dice "marca como expired o elimina"; código hace DELETE directo |
| `GET /matchmaking/status` | `GET /matchmaking/status` | ✅ | Respuesta añade `expansion_offer` no previsto en doc |
| `GET /players/:id/stats` | — | ❌ Falta | Documentado en §4.3 pero no implementado |
| — | `GET /matchmaking/proposal` | ⚠️ No documentado | Devuelve detalles de propuesta (booking, pago, deadline) |
| — | `POST /matchmaking/expansion-respond` | ⚠️ No documentado | Acepta/rechaza ofertas de expansión |
| — | `POST /matchmaking/reject` | ⚠️ No documentado | Rechaza propuesta con penalización fija de 5 LP |
| — | `POST /matchmaking/run-cycle` | ⚠️ No documentado | Cron endpoint para ejecutar ciclo |
| — | `POST /matchmaking/close-season` | ⚠️ No documentado | Cron endpoint para cerrar temporada |
| — | `GET /matchmaking/league-config` | ⚠️ No documentado | Devuelve configuración de ligas MM |

### 2.2 Tabla `matchmaking_pool`

| Campo (doc) | Campo (código) | Estado |
|---|---|---|
| `id` | `id` | ✅ |
| `player_id` (UNIQUE) | `player_id` (UNIQUE) | ✅ |
| `paired_with_id` | `paired_with_id` | ✅ |
| `club_id` | `club_id` | ✅ |
| `max_distance_km` | `max_distance_km` | ✅ |
| `preferred_side` | `preferred_side` | ✅ |
| `gender` | `gender` | ✅ |
| `available_from` | `available_from` | ✅ |
| `available_until` | `available_until` | ✅ |
| `status` | `status` | ✅ |
| `created_at` | `created_at` | ✅ |
| `expires_at` | `expires_at` | ✅ (pero doc marca como "pendiente de definir") |
| — | `proposed_match_id` | ⚠️ No documentado. Vincula jugador matched con su propuesta |
| — | `reject_count` | ⚠️ No documentado. Contador de rechazos |
| — | `search_lat` | ⚠️ No documentado. Posición del jugador para haversine |
| — | `search_lng` | ⚠️ No documentado. Posición del jugador para haversine |
| — | `expansion_offer` (JSONB) | ⚠️ No documentado. Oferta de expansión activa |
| — | `expansion_cycle_index` | ⚠️ No documentado. Ronda de expansión actual |
| — | `last_expansion_prompt_at` | ⚠️ No documentado. Throttle entre expansiones |

### 2.3 Algoritmo de matching (ciclo)

| Paso (doc) | Implementación | Estado |
|---|---|---|
| Leer pool con `status='searching'` | `matchmakingService.ts:120–125` | ✅ |
| Agrupar jugadores en parejas/solos (unidades) | `matchmakingShared.ts:buildUnits()` | ✅ |
| Generar combinaciones C(N,4) | `matchmakingShared.ts:iterUnitCombos()` | ✅ Con límite de 12.000 iteraciones (no en doc) |
| Filtro género (matriz de compatibilidad) | `matchmakingShared.ts:genderPrefsPairwiseOk()` | ✅ Matriz idéntica al doc |
| Filtro horario (overlap de intervalos) | `matchmakingShared.ts:intersectRange()` | ✅ Mínimo 60 min overlap |
| Filtro club (mismo club) | `matchmakingShared.ts:resolveClubId()` | ✅ |
| Filtro distancia (haversine) | `matchmakingShared.ts:allPlayersWithinMaxDistance()` | ✅ |
| Filtro liga (max 1 salto) | `matchmakingLeague.ts:leaguesMatchmakingCompatible()` | ✅ |
| Filtro nivel (MAX_LEVEL_SPREAD=1.0) | `matchmakingShared.ts:exceedsLevelSpread()` | ✅ |
| Ventana elo dinámica por racha | `matchmakingShared.ts:eloWindowFromRecent()` | ✅ Valores idénticos al doc |
| bestTeamSplit con OpenSkill | `matchmakingShared.ts:bestTeamSplitSync()` | ✅ |
| Umbral probabilidad [0.35, 0.65] | `matchmakingShared.ts:BASE_WIN_PROB_MIN/MAX` | ✅ |
| Sinergia en predicción | `matchmakingShared.ts:synergyMuDelta()` | ✅ Fórmula: `tanh(synergy/5.5)*0.5` (no en doc) |
| Bloqueo temporal de pista | `matchmakingService.ts:259–350` | ✅ Booking con `status='pending_payment'` |
| Deadline dinámico | `matchmakingService.ts:confirmDeadlineIso()` | ✅ `min(max(50% time_to_match, 30min), 24h)` |
| Guardar `pre_match_win_prob` | `matchmakingService.ts:320–340` | ✅ En `match_players` |
| Reglas biológicas (mixed: 1M+1F por equipo) | `matchmakingShared.ts:validateBiologicalRules()` | ✅ |
| Doc dice "extraer hasCourtConflict a bookingService" | No verificado si se extrajo | ⚠️ Pendiente de verificar |

### 2.4 Ampliación de criterios

| Feature (doc) | Implementación | Estado |
|---|---|---|
| Liga se auto-expande sin confirmación | `matchmakingLeague.ts:leaguesMatchmakingCompatible()` con spread ≤1 | ✅ |
| Lado preferido → relajar | `matchmakingExpansion.ts` kind `side_any` | ✅ |
| Género → relajar | `matchmakingExpansion.ts` kind `gender_any` | ✅ |
| Distancia → incrementar | `matchmakingExpansion.ts` kinds `dist_plus_5`, `dist_plus_10` | ✅ |
| Orden: liga → lado → género → distancia | Código: `['side_any','gender_any','dist_plus_5','dist_plus_10']` | ⚠️ Liga es automática (no en la secuencia). El resto sigue el orden del doc excepto que lado va antes que género (doc dice liga→lado→género→distancia, código hace lado→género→distancia sin liga en la secuencia) |
| Confirmación explícita del jugador (excepto liga) | `POST /matchmaking/expansion-respond` con `accept: boolean` | ✅ |
| Grupos de 3 buscando un 4º | `matchmakingNearMiss.ts:runNearMissTripletScan()` | ✅ Pero la lógica de near-miss (ofertas de distancia/género específicas para un grupo de 3) no está en el doc original |
| Tiempo antes de primera expansión | `DEFAULT_FIRST_MS = 3h` | ✅ (doc lo dejaba como "pendiente") |
| Tiempo entre expansiones | `DEFAULT_STEP_MS = 6h` | ✅ (no en doc) |
| Near-miss: delay antes de ofrecer | `DEFAULT_NEAR_MISS_AFTER_MS = 2h` | ✅ (no en doc) |

### 2.5 Confirmación y rechazo

| Feature (doc) | Implementación | Estado |
|---|---|---|
| Todos confirman y pagan → reserva definitiva | `matchmakingService.ts` (booking participants payment tracking) | ✅ |
| Alguien rechaza → liberar propuesta | `releaseMatchmakingProposal()` | ✅ |
| Los otros 3 vuelven a la pool | `releaseMatchmakingProposal()` → status='searching' | ✅ |
| **Penalización LP por rechazo** | `REJECT_LPS_PENALTY = 5` fijo | ⚠️ Parcial |
| **Sistema de faltas acumulativas** | No implementado | ❌ Falta |
| 1 falta = LP base | No implementado (solo 5 LP fijo) | ❌ |
| 2 faltas = LP mayor | No implementado | ❌ |
| 3+ faltas = bloqueo temporal (2 días) + LP | No implementado | ❌ |
| Expiración de faltas (~1 mes) | No implementado | ❌ |
| `reject_count` se incrementa | Sí, en `matchmakingService.ts:applyMatchmakingRejectPenalty()` | ✅ Pero no se usa para escalar penalización |

### 2.6 Restricción partidos abiertos (§7 del doc)

| Feature (doc) | Estado |
|---|---|
| Competitivos: elo_min = creator_elo - 0.5, elo_max = creator_elo + 0.5 | Pendiente de verificar en `routes/matches.ts` |
| Creador no puede modificar rango | Pendiente de verificar |
| Verificación al unirse (prepare-join) | Pendiente de verificar |

---

## 3. Ligas MM — Implementado vs Documentado

### 3.1 Jerarquía y estructura

| Feature (doc) | Implementación | Estado |
|---|---|---|
| Jerarquía: Bronce → Plata → Oro → Elite | `LEAGUE_ORDER = ['bronce','plata','oro','elite']` | ✅ |
| Vinculación con elo_rating | `ligaFromElo()`: <2=bronce, 2-4=plata, 4-5.5=oro, ≥5.5=elite | ✅ (doc dejaba rangos como "pendiente") |
| Tabla `matchmaking_leagues` | Migración 039. Campos: code, sort_order, label, elo_min, elo_max, lps_to_promote | ✅ |
| Subdivisiones (Bronce I/II/III) | No implementado | ❌ (doc lo dejaba como "pendiente") |

### 3.2 Economía de LP

| Feature (doc) | Implementación | Estado |
|---|---|---|
| LP solo en partidos matchmaking competitivos | `computeMatchmakingLeagueUpdates()` solo se llama en pipeline MM | ✅ |
| Partidos abiertos no afectan LP | Correcto por diseño (pipeline no llama economía LP para type≠matchmaking) | ✅ |
| Victoria: +LP | `LP_WIN_BASE = 15` | ✅ (doc dejaba valor como "pendiente") |
| Derrota: -LP | `LP_LOSS_BASE = 12` | ✅ (doc dejaba valor como "pendiente") |
| Empate/timeout: sin cambio LP | `delta = 0` cuando `winnerTeam = null` | ✅ |
| LP nunca negativos (suelo 0) | `lps = max(0, r.lps + delta)` | ✅ |
| Cross-liga: bonus si gana liga inferior | `CROSS_LIGA_LP_PER_INDEX_GAP = 4` por salto | ✅ (doc dejaba valor como "pendiente") |
| Cross-liga: penalidad extra si pierde liga superior | `CROSS_LIGA_LOSS_EXTRA_PER_INDEX_GAP = 3` por salto | ✅ (doc dejaba valor como "pendiente") |
| Cálculo cross-liga usa **media** del índice de liga del equipo | `avgLeagueIndexForTeam()` | ✅ |

### 3.3 Ascenso y descenso

| Feature (doc) | Implementación | Estado |
|---|---|---|
| Ascenso cuando lps ≥ 100 | `LP_PROMOTE_THRESHOLD = 100` | ✅ |
| Se restan 100 LP y se sube 1 escalón | Loop: `lps -= 100`, `liga = nextLiga()` | ✅ |
| Múltiples ascensos posibles en un partido | Sí (loop while) | ⚠️ No mencionado en doc. Podría ser intencional o edge case |
| Descenso: tras derrota, si lps=0, liga≠bronce, shield=0 | Condición exacta en código | ✅ |
| LP tras descenso: 45 | `LP_AFTER_DEMOTE = 45` | ✅ |
| Sin shield tras descenso (puede caer más) | Correcto, shield no se aplica en descenso | ✅ |

### 3.4 Escudo post-ascenso

| Feature (doc) | Implementación | Estado |
|---|---|---|
| 5 partidos MM sin descenso tras ascenso | `MM_SHIELD_MATCHES_AFTER_PROMO = 5` | ✅ |
| Cada partido MM consume 1 shield | `shield = max(0, shield - 1)` (si no ascendió en ese partido) | ✅ |
| Si ascendió en el partido, no consume shield | Correcto: `if (!promoted) shield--` | ✅ |

### 3.5 Reconciliación liga vs elo

| Feature (doc) | Implementación | Estado |
|---|---|---|
| Si liga y banda elo difieren en 2+ pasos → auto-ajuste | `reconcileLigaWithElo()`: gap ≥ 2 → liga = eloLiga | ✅ |
| Se aplica tras LP/ascenso/descenso en partido MM | Integrado en pipeline atómico | ✅ |

### 3.6 Temporadas y cierre

| Feature (doc) | Implementación | Estado |
|---|---|---|
| `POST /matchmaking/close-season` con `x-cron-secret` | `routes/matchmaking.ts:515–529` | ✅ |
| Archivar `player_league_history` | `closeActiveMatchmakingSeason()`: insert por jugador | ✅ |
| Reset: lps=0, shield=0 | Correcto | ✅ |
| mm_peak_liga = liga actual | Correcto | ✅ |
| Nueva temporada en `matchmaking_seasons` | Insert con `ends_at = '2099-12-31'` (placeholder) | ✅ |
| Mecanismo de reset (total vs parcial) | Implementado como **reset total** (LP=0, liga se mantiene) | ⚠️ Doc dejaba como "pendiente". Decisión tomada: conservar liga, resetear LP |

### 3.7 Historial

| Feature (doc) | Implementación | Estado |
|---|---|---|
| Tabla `player_league_history` | Migración 038 | ✅ |
| UNIQUE (player_id, season_id) | Correcto | ✅ |
| Campos: liga, final_lps, highest_liga | Correcto | ✅ |
| `GET /players/me/league-history` | Mencionado en doc §6 de 10_ligas.md | ⚠️ Pendiente de verificar si está implementado en routes |

### 3.8 Campos en `players`

| Campo (doc) | Implementación | Estado |
|---|---|---|
| `liga` | Migración 037 | ✅ |
| `lps` | Migración 037 | ✅ |
| `league_season_id` | Migración 037 | ✅ |
| `mm_shield_matches` | Migración 037 | ✅ |
| `mm_peak_liga` | Migración 037 | ✅ |

---

## 4. Ligas de club — Sistema sin documentación

Existe un sistema completo de **ligas por club** implementado en:
- `backend/src/routes/leagues.ts` (643 líneas)
- `backend/src/services/leaguePromotionService.ts` (76 líneas)
- Migraciones: `029_leagues_skeleton.sql`, `030_league_season_closed.sql`, `032_leagues_players_elo_matches.sql`

**No hay documento de diseño** en `docs/leveling/` para este sistema.

### 4.1 Funcionalidad implementada

| Feature | Detalles |
|---|---|
| Temporadas por club | `league_seasons`: club_id, name, mode (individual/pairs), closed |
| Divisiones | `league_divisions`: code, label, level_index, promote_count, relegate_count, elo_min/elo_max |
| Divisiones por defecto | Si no se especifican: Primera (relegate=2), Segunda (promote=2, relegate=2), Tercera (promote=2) |
| Entries (jugadores/parejas) | `league_division_teams`: player_id_1, player_id_2, team_label, sort_order |
| Validación elo al añadir | Si la división tiene elo_min/elo_max, el jugador debe estar en rango |
| No duplicados | Un jugador no puede estar en 2 entries de la misma temporada |
| Matches de liga | `league_matches`: entry_a vs entry_b, sets, winner, round_number, booking_id |
| Resultado → reordenar ranking | Si el ganador tenía peor sort_order que el perdedor, intercambian posiciones |
| Cierre + promoción/relegación | `POST /leagues/seasons/:id/close-and-promote`: top N suben, bottom M bajan |

### 4.2 Endpoints

| Método | Ruta | Función |
|---|---|---|
| GET | `/leagues/seasons` | Listar temporadas de un club |
| POST | `/leagues/seasons` | Crear temporada (con divisiones opcionales) |
| POST | `/leagues/seasons/:id/entries` | Añadir jugador/pareja a división |
| DELETE | `/leagues/entries/:id` | Eliminar entry |
| GET | `/leagues/seasons/:id/matches` | Listar matches de una temporada |
| POST | `/leagues/seasons/:id/matches` | Crear match de liga |
| POST | `/leagues/matches/:id/result` | Registrar resultado |
| POST | `/leagues/seasons/:id/close-and-promote` | Cerrar temporada y aplicar promoción/relegación |

### 4.3 Observación

Este sistema es independiente del sistema de ligas de matchmaking (Bronce→Elite). Son dos conceptos distintos:
- **Ligas MM**: progresión global por LP, automática, vinculada a matchmaking
- **Ligas de club**: temporadas manuales gestionadas por el club, con divisiones y partidos programados

**Bug potencial en `leaguePromotionService.ts`**: Si `promote_count + relegate_count >= team_count` en una división, un equipo podría aparecer en la lista de promoción Y relegación simultáneamente. No hay validación que lo prevenga.

---

## 5. Implementado sin estar documentado

Elementos que existen en código pero **no** están en `06_matchmaking.md` ni `10_ligas.md`:

| Elemento | Archivo | Detalle |
|---|---|---|
| Sistema completo de ligas de club | `routes/leagues.ts` + `leaguePromotionService.ts` | 8 endpoints, 4 tablas, sin doc |
| `GET /matchmaking/proposal` | `routes/matchmaking.ts:322–393` | Detalles de propuesta (booking, pago, deadline) |
| `POST /matchmaking/expansion-respond` | `routes/matchmaking.ts:245–300` | Aceptar/rechazar expansión |
| `POST /matchmaking/reject` | `routes/matchmaking.ts:414–443` | Rechazar propuesta (5 LP fijo) |
| `POST /matchmaking/run-cycle` | `routes/matchmaking.ts:464–476` | Cron para ejecutar ciclo |
| `POST /matchmaking/close-season` | `routes/matchmaking.ts:515–529` | Cron para cerrar temporada |
| `GET /matchmaking/league-config` | `routes/matchmaking.ts:56–64` | Config de ligas MM |
| Near-miss triplet offers | `matchmakingNearMiss.ts` (254 líneas) | Ofertas cuando hay 3 compatibles y falta 1 |
| Campos geo en pool | `search_lat`, `search_lng` | Para cálculo haversine de distancia |
| `expansion_offer` (JSONB) | `matchmaking_pool` | Oferta de expansión activa con kind, title, message |
| `expansion_cycle_index` | `matchmaking_pool` | Tracking de ronda de expansión (0–4) |
| `last_expansion_prompt_at` | `matchmaking_pool` | Throttle entre ofertas de expansión |
| `proposed_match_id` | `matchmaking_pool` | Vincula jugador matched con su propuesta |
| `reject_count` | `matchmaking_pool` | Contador de rechazos (se incrementa pero no se usa para escalar) |
| Fórmula de sinergia | `synergyMuDelta()`: `tanh(synergy/5.5)*0.5` | Cómo se traduce sinergia a boost de mu |
| Constantes de timing | 3h primera expansión, 6h entre expansiones, 2h near-miss | Tiempos definidos para el sistema de expansión |
| Límite de iteraciones | `MAX_UNIT_COMBINATIONS = 12,000` | Protección contra explosión combinatoria |
| `MAX_TRIPLET_ITERATIONS = 400` | `matchmakingNearMiss.ts` | Límite de iteraciones por jugador en near-miss |
| Precio por defecto | 8.000 cents si falla el cálculo de booking | Fallback en `matchmakingService.ts` |
| Config cache (60s TTL) | `matchmakingLeagueConfigService.ts` | Cache de configuración de ligas con default rows |
| Batch de 200 en cierre temporada | `matchmakingSeasonService.ts` | Archivado de jugadores en lotes |

---

## 6. Contradicciones o divergencias

### 6.1 Doc §2 de 06_matchmaking.md desactualizado

El doc dice textualmente:

> **No existe:**
> - Ninguna tabla de pool de matchmaking
> - Ningún algoritmo de emparejamiento
> - Ninguna ruta para activar/desactivar la búsqueda
> - Ninguna lógica de reserva automática
> - El campo `type` en `matches`

**Realidad:** Todo esto ya está implementado. La sección §2 "Estado actual" refleja el estado ANTES de la implementación y nunca se actualizó.

### 6.2 Sistema de faltas vs penalización fija

**Doc dice (§5, confirmación y rechazo):**
> - 1 falta = pérdida de LP base
> - 2 faltas = pérdida de LP mayor
> - 3+ faltas = bloqueo temporal de matchmaking (ej. 2 días) + pérdida de LP
> - Las faltas expiran individualmente (~1 mes)

**Código hace:**
- Penalización fija de `REJECT_LPS_PENALTY = 5` LP por cada rechazo
- `reject_count` se incrementa pero **nunca se consulta** para escalar penalización
- No hay bloqueo temporal
- No hay expiración de faltas

**Impacto:** La consecuencia disuasoria del rechazo es significativamente menor que lo diseñado.

### 6.3 Doc dice crear archivos que ya existen

El doc §3 y §4 dicen "Qué hay que cambiar" y "Qué hay que crear nuevo", listando archivos a crear (`matchmaking.ts`, `matchmakingService.ts`, `bookingService.ts`). Estos ya existen. El doc no fue actualizado post-implementación.

### 6.4 Doc 10_ligas.md §4 — "Decisiones pendientes" ya resueltas

El doc marca 14 decisiones como "NO está definido" pero el código ya resolvió la mayoría con constantes provisionales (ver sección 7 abajo). El doc no refleja estas decisiones.

### 6.5 Tabla `leagues` opcional del doc nunca creada

El doc 10_ligas.md §5 propone una tabla `leagues` opcional con campos `lps_to_promote` y `lps_to_demote`. En su lugar se creó `matchmaking_leagues` con estructura ligeramente diferente (sin `lps_to_demote`; el campo `lps_to_promote` existe pero no se usa en el código — el umbral es global: `LP_PROMOTE_THRESHOLD = 100`).

### 6.6 Múltiples ascensos en un partido

El código permite múltiples ascensos en un solo partido (si LP acumulados ≥ 200, sube 2 ligas). El doc no menciona este escenario. Puede ser intencional o un edge case no previsto.

---

## 7. Decisiones pendientes — resueltas vs pendientes reales

### Del doc 06_matchmaking.md

| # | Decisión pendiente (doc) | Estado actual |
|---|---|---|
| 1 | `expires_at` en pool | ✅ Campo existe. No hay lógica de expiración automática |
| 2 | Frecuencia del ciclo (5/1 min) | ⚠️ Parcial. Existe `POST /run-cycle` como cron, pero no hay scheduler configurado |
| 3 | Valores de incremento/decremento de sinergia | ✅ `tanh(synergy/5.5)*0.5` para boost en MM. Actualización de sinergia en pipeline: +0.1 win, -0.1 loss |
| 4 | `STREAK_THRESHOLD` (4 sugerido) | ✅ Implementado como 4 |
| 5 | Límite máximo de expansión de distancia | ✅ `dist_plus_5`: max_distance < 120; `dist_plus_10`: max_distance < 110 |
| 6 | LP exactos por rechazo | ✅ `REJECT_LPS_PENALTY = 5` (pero sin escalado por faltas) |
| 7 | Expiración de faltas (~1 mes) | ❌ No implementado |
| 8 | Duración bloqueo por 3+ faltas (~2 días) | ❌ No implementado |
| 9 | `MAX_LEVEL_SPREAD` (1.0 sugerido) | ✅ Implementado como 1.0 |
| 10 | Filtro precio máximo por jugador | ❌ No implementado |
| 11 | Tiempo antes de primera expansión | ✅ `DEFAULT_FIRST_MS = 3h` |
| 12 | Scheduler: node-cron vs Edge Function vs reactivo | ⚠️ Implementado como endpoint cron (`x-cron-secret`). Sin scheduler interno |
| 13 | Umbral win_prob dinámico vs fijo | ✅ Fijo: [0.35, 0.65] |

### Del doc 10_ligas.md

| # | Decisión pendiente (doc) | Estado actual |
|---|---|---|
| 1 | Número exacto de ligas y nombres | ✅ 4 ligas: bronce, plata, oro, elite |
| 2 | Rangos de elo por liga | ✅ Bronce: 0–2, Plata: 2–4, Oro: 4–5.5, Elite: 5.5+ |
| 3 | Subdivisiones (Bronce I/II/III) | ❌ No implementado |
| 4 | LP base por victoria/derrota | ✅ Victoria: 15, Derrota: 12 |
| 5 | Fórmula LP (fija vs variable) | ✅ Fija + bonus/penalidad cross-liga |
| 6 | Ajuste LP cross-liga | ✅ Bonus: +4/gap, Penalidad: +3/gap |
| 7 | Umbrales ascenso/descenso | ✅ Ascenso: 100 LP. Descenso: lps=0 tras derrota |
| 8 | Protección contra descenso | ✅ Shield de 5 partidos MM post-ascenso |
| 9 | Mecanismo reset temporada | ✅ Reset total: LP=0, shield=0, liga se mantiene |
| 10 | Asignación liga inicial | ✅ Por elo_rating del cuestionario (`ligaFromElo()`) |
| 11 | Reconciliación liga vs elo | ✅ Auto-ajuste si gap ≥ 2 pasos |
| 12 | Visibilidad en perfil | ❌ No definido qué ve el jugador |
| 13 | Recompensas por liga | ❌ No implementado |
| 14 | LP mínimo (negativo o suelo 0) | ✅ Suelo en 0 |

---

## 8. Observaciones adicionales

### 8.1 Coherencia doc ↔ doc

El doc `10_ligas.md` tiene una sección §6 "Implementación backend" que **sí** refleja los valores provisionales implementados (LP_WIN_BASE=15, etc.). Esta sección fue añadida después de la implementación y es la más precisa del doc. Sin embargo, la sección §4 "Lo que NO está definido" sigue listando estos valores como pendientes, creando contradicción interna.

### 8.2 Atomicidad

La aplicación de LP/liga es atómica con el pipeline de nivelación (mu/sigma/elo) via RPC `apply_leveling_pipeline`, conforme a lo especificado en los docs.

### 8.3 Campo `lps_to_promote` sin uso

La tabla `matchmaking_leagues` tiene un campo `lps_to_promote` (100 para bronce/plata/oro, null para elite) pero el código usa la constante global `LP_PROMOTE_THRESHOLD = 100` en lugar de consultar este campo. Esto implica que cambiar el umbral por liga en la DB no tendría efecto hasta que se cablee en el código.

### 8.4 Archivos de servicio bien organizados

La implementación sigue una separación clara:
- `matchmakingShared.ts` — validaciones y algoritmo de split (puras, sin DB)
- `matchmakingService.ts` — ciclo principal con acceso a DB
- `matchmakingExpansion.ts` — expansión progresiva
- `matchmakingNearMiss.ts` — near-miss triplets
- `matchmakingLeague.ts` — enum y mapeo de ligas
- `matchmakingLeagueEconomy.ts` — cálculos de LP (pura, sin DB)
- `matchmakingLeagueConfigService.ts` — config con cache
- `matchmakingSeasonService.ts` — lifecycle de temporadas
