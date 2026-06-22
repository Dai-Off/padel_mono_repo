# Propuesta — Entrar a la liga competitiva con un compañero elegido (party / premade duo)

> Borrador de propuesta. Fecha: 2026-06-17
> Relacionado: [PROPUESTA_PROGRESION_LIGAS.md](PROPUESTA_PROGRESION_LIGAS.md), [06_matchmaking.md](06_matchmaking.md), [10_ligas.md](10_ligas.md)

## 0. Objetivo

Permitir que un jugador entre a la cola de **matchmaking competitivo** junto a un **compañero elegido** (no aleatorio), manteniendo la calidad de los partidos para todos. Es un requisito **MUST**.

El reto: si un jugador fuerte trae a un compañero más flojo, el matchmaking no debe regalarle el partido emparejándolos con rivales débiles. Hay que **inflar el nivel efectivo** de la pareja para que los rivales sean acordes a la capacidad del fuerte de "cargar" con el equipo.

---

## 1. Estado actual

### Lo que YA existe (infraestructura parcial)
- **DB:** `matchmaking_pool.paired_with_id uuid` (migración `014_leveling_matchmaking.sql`).
- **Endpoint:** `POST /matchmaking/join` ya acepta `paired_with_id` en el body (`routes/matchmaking.ts`); solo valida que el jugador referenciado exista.
- **Formación:** `fixedPairsFromRows()` extrae las parejas y `bestTeamSplitSync()` las **fuerza al mismo equipo** (`matchmakingShared.ts`).

### Lo que FALTA (y el obstáculo)
- **No hay validación de compatibilidad de nivel** entre los dos miembros de la pareja.
- **Los filtros de spread rechazarían una pareja desequilibrada** antes de formar el partido:
  - `exceedsLevelSpread` (`MAX_LEVEL_SPREAD = 1.0` sobre elo 0-7): si la diferencia entre el mejor y el peor de los 4 supera 1.0, se descarta el cuarteto.
  - `groupSatisfiesEloWindows` (ventana `±0.5` por jugador): exige que cada jugador caiga en la ventana de los demás.
- **No hay flujo de consentimiento** definido (ver §3.5).

> En resumen: el "esqueleto" de parejas existe, pero el sistema actual **mataría** el caso 5.0 + 3.5. Esta propuesta añade la validación de elegibilidad + el inflado de nivel efectivo + las exenciones de filtro necesarias.

---

## 2. Decisiones tomadas

| # | Decisión | Detalle |
|---|----------|---------|
| D1 | **Gap real máximo de pareja = 1.5** | Un 5.0 puede traer hasta un 3.5. Más de eso, se rechaza al encolar. |
| D2 | **Inflado del débil hasta `fuerte − 1.0`** | El 3.5 cuenta como 4.0 para buscar rivales (~4.5). Absorbe el exceso de gap como dificultad para el débil, asumiendo que el fuerte carga. |
| D3 | **Handicap SOLO en el emparejamiento** | El LP/`mu` post-partido se calcula con el nivel **real**. OpenSkill ya premia al débil si gana a rivales superiores y le castiga poco si pierde. |
| D4 | **Exención intra-pareja de los filtros de spread/ventana** | Los dos miembros se eligieron a propósito; no se aplican entre ellos los checks de `MAX_LEVEL_SPREAD` ni de ventana. Sí se aplican contra los rivales (con el nivel efectivo). |

---

## 3. Diseño técnico

### 3.1 Elegibilidad al encolar (`POST /matchmaking/join`)

Cuando el body trae `paired_with_id`, validar antes de insertar en `matchmaking_pool`:

```
gapReal = |elo_rating(A) − elo_rating(B)|
si gapReal > PREMADE_MAX_GAP (1.5)  → 400 "La diferencia de nivel con tu compañero es demasiado alta"
```

- `A` = quien encola, `B` = `paired_with_id` (o viceversa; da igual el orden, se calcula el gap absoluto).
- Mantener la validación actual de que el jugador exista.
- (Ver §3.5 sobre consentimiento mutuo.)

### 3.2 Nivel efectivo del compañero débil (inflado)

Sea `F` el miembro fuerte (mayor elo) y `D` el débil (menor elo) de la pareja. Para la **formación del partido**:

```
elo_efectivo(D) = max( elo_real(D), elo_real(F) − PREMADE_EFFECTIVE_FLOOR_GAP )   // FLOOR_GAP = 1.0
elo_efectivo(F) = elo_real(F)                                                      // el fuerte no cambia
```

Para que OpenSkill (`predictWin`) "vea" al equipo más fuerte, se infla también el **`mu`** de `D` de forma proporcional (manteniendo `sigma`):

```
Δelo = elo_efectivo(D) − elo_real(D)
Δmu  = Δelo × (50 / 7)            // inversa de calcEloRating: elo = (mu − 2σ)·7/50
mu_efectivo(D) = mu_real(D) + Δmu
```

Estos valores efectivos se calculan **en memoria** al construir el contexto del ciclo (`eloById`, `skillsById`, `ligaById` en `matchmakingService.ts`) y **solo** se usan para formar el partido. Como un jugador con `paired_with_id` **siempre** se empareja junto a su compañero (`fixedPairs` lo fuerza), es seguro precalcular su nivel efectivo.

### 3.3 Exenciones de filtro para la pareja

Con el inflado a `fuerte − 1.0`, la pareja queda a exactamente 1.0 de distancia efectiva → fallaría la ventana `±0.5` entre sus dos miembros. Por eso:

- **Entre los dos miembros de la pareja:** NO se aplican `exceedsLevelSpread` ni `groupSatisfiesEloWindows` (se eligieron a propósito, hasta 1.5 real).
- **Entre la pareja y los rivales:** SÍ se aplican, usando el **elo efectivo** de `D` (4.0 en el ejemplo). Así los rivales se sitúan en ~[4.0, 5.0] (media ~4.5).
- **Compatibilidad de liga** (`leaguesMatchmakingCompatible`): se evalúa con la **liga derivada del elo efectivo** de `D`, y se exime la diferencia de liga *interna* de la pareja.
- **Balance de equipos** (`bestTeamSplitSync`, win prob en `[0.35, 0.65]`): usa el `mu` efectivo de `D`, de modo que el split contra los rivales ~4.5 quede equilibrado.

Implementación: pasar a `quartetPreCourtValid` y a los checks de spread/ventana el conjunto de ids que forman pareja fija (ya disponible vía `fixedPairsFromRows`), para saltarse los pares internos y usar los valores efectivos.

### 3.4 Recompensas con nivel real (handicap solo en formación)

El pipeline de nivelación (`runLevelingPipeline`) lee `mu`/`sigma` **frescos de la tabla `players`**, no los valores efectivos en memoria. Por tanto, sin tocar nada:

- Si la pareja gana contra rivales ~4.5, el débil (real 3.5) **sube mucho** `mu`/LP (sobrerrendimiento) y el fuerte sube modesto.
- Si pierde, el débil **baja poco** (resultado esperado) y el fuerte algo más.

Esto es justo y lo da gratis OpenSkill. **No** se añade ninguna penalización/bonus de LP por premade.

> Importante para la implementación: garantizar que el inflado de `mu`/elo **nunca** se persista ni se pase al pipeline de nivelación. Vive solo en el contexto del ciclo de matchmaking.

### 3.5 Flujo de consentimiento (pendiente de definir)

Hoy `fixedPairsFromRows()` empareja a `A` con `B` si `A.paired_with_id = B` y `B` está en el pool, **sin exigir reciprocidad**. Para una feature de "party" conviene consentimiento explícito. Opciones:

- **(Recomendada) Reciprocidad obligatoria:** ambos deben encolar con `paired_with_id` apuntándose mutuamente; si no, no se forma la pareja (cada uno queda como agente libre o se rechaza).
- **Flujo de invitación:** `A` invita, `B` acepta (push notification), y al aceptar ambos entran al pool emparejados.

Decisión de producto/UX pendiente. Afecta a mobile-app y a la validación del endpoint.

---

## 4. Cambios por archivo

| Archivo | Cambio |
|---------|--------|
| `backend/src/routes/matchmaking.ts` (`POST /join`) | Validar `gapReal ≤ PREMADE_MAX_GAP` (1.5). (Opcional según §3.5: exigir reciprocidad.) Error claro si excede. |
| `backend/src/services/matchmakingService.ts` | Al construir el contexto del ciclo, calcular `elo_efectivo`/`mu_efectivo` para el miembro débil de cada pareja y poblar `eloById`/`skillsById`/`ligaById` con esos valores efectivos. |
| `backend/src/services/matchmakingShared.ts` | `quartetPreCourtValid`, `exceedsLevelSpread`, `groupSatisfiesEloWindows`: hacerlos *premade-aware* — saltar los pares internos y usar elo efectivo contra rivales. Nuevas constantes `PREMADE_MAX_GAP = 1.5`, `PREMADE_EFFECTIVE_FLOOR_GAP = 1.0`. |
| `backend/src/services/matchmakingLeague.ts` | Compatibilidad de liga con liga efectiva del débil (derivada del elo efectivo). |
| `backend/src/services/levelingService.ts` | **Sin cambios** — sigue usando ratings reales (D3). Solo verificar que nunca reciba valores efectivos. |
| `mobile-app` | UI para invitar/elegir compañero al entrar a competitiva; mensaje si el gap supera 1.5; aviso de "partido exigente" cuando hay inflado. |

---

## 5. Parámetros a calibrar

| Parámetro | Valor propuesto | Notas |
|-----------|-----------------|-------|
| `PREMADE_MAX_GAP` | 1.5 | Gap real máximo para encolar como pareja. |
| `PREMADE_EFFECTIVE_FLOOR_GAP` | 1.0 | El débil se trata como `fuerte − 1.0` (= `MAX_LEVEL_SPREAD`). |
| `MAX_LEVEL_SPREAD` | 1.0 | Sin cambios. Se sigue aplicando contra los rivales con el elo efectivo. |
| Win prob aceptable | [0.35, 0.65] | Sin cambios. |

---

## 6. Ejemplo numérico (el caso 5.0 + 3.5)

1. `A` (elo 5.0) encola con `paired_with_id = B`; `B` (elo 3.5).
2. **Elegibilidad:** gap real = 1.5 ≤ 1.5 → ✅ permitido.
3. **Inflado:** `elo_efectivo(B) = max(3.5, 5.0 − 1.0) = 4.0`. `Δelo = 0.5` → `Δmu ≈ 3.57` → `mu_efectivo(B) = mu_real(B) + 3.57`.
4. **Búsqueda de rivales:** el matchmaking ve el equipo como {5.0, 4.0} (media efectiva 4.5) → busca 2 rivales en ~[4.0, 5.0] para equilibrar `predictWin` a ~0.5. **No** salen rivales de 4.25.
5. **Exención:** el par interno (5.0 vs 3.5) se exime de spread/ventana; los rivales sí cumplen spread/ventana contra {5.0, 4.0}.
6. **Partido:** el 3.5 juega contra ~4.5 → realmente difícil; el 5.0 puede cargar.
7. **Post-partido (nivel real):**
   - Si ganan: `B` sube mucho (`mu` real 3.5 batió a 4.5s), `A` sube modesto.
   - Si pierden: `B` baja poco (esperado), `A` algo más.

---

## 7. Riesgos y cuestiones abiertas

1. **Tiempo de espera:** una pareja inflada busca rivales más fuertes → puede tardar más en encontrar partido si hay poca densidad de cola en ese rango. Aceptable; vigilar con datos.
2. **Experiencia de los rivales:** se enfrentan a un equipo con un "eslabón" real de 3.5; pueden intentar explotarlo. Es inherente a la feature y está dentro de lo razonable con gap ≤1.5. Con gap >1.5 sería abusivo (por eso el tope).
3. **Consentimiento (§3.5):** decisión de producto pendiente (reciprocidad vs invitación). Afecta a endpoint y mobile.
4. **`matchmakingNearMiss.ts`** excluye hoy a jugadores con `paired_with_id` de las ofertas de ampliación (`if (pRow.paired_with_id) continue;`). Revisar si las parejas deben recibir o no ofertas de expansión.
5. **Interacción con el acelerador de LP** de la propuesta de progresión: el débil infravalorado que gana partidos duros subirá aún más rápido (boost por gap de `mu` + sobrerrendimiento real). Es coherente y deseable, pero conviene observarlo junto.
6. **Persistencia del inflado:** riesgo de bug si el valor efectivo se filtra al pipeline de nivelación o a la DB. Debe quedar estrictamente en memoria durante la formación del ciclo (test específico recomendado).

---

## 8. Resumen de una línea

Puedes entrar a competitiva con el compañero que quieras hasta **1.5 de diferencia de nivel**; el matchmaking **infla** al más flojo hasta `fuerte − 1.0` para buscar rivales acordes a la capacidad del fuerte (partido exigente, no regalado), mientras que **el LP/`mu` se reparte según el nivel real** — premiando al débil si rinde por encima.
