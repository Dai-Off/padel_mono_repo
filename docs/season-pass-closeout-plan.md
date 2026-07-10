# Season Pass — Plan de cierre (post-reunión 2026-07-09)

> Reescrito tras la reunión: cambian la estructura de temporada, la economía de
> misiones y los tipos de recompensa. Se ejecuta por fases, commit por bloque,
> type-check en backend y mobile, aviso de qué SQL ejecutar.

---

## 0. Decisiones cerradas en la reunión (2026-07-09)

1. **Temporada a la mitad:** **50 niveles** (antes 100) y **45 días** (antes 90).
2. **Recompensa destacada cada 5 niveles:** en 5, 10, 15… 50 la recompensa es
   claramente mejor que en el resto.
3. **Nuevos tipos de recompensa:**
   - **Rerolls extra** (tokens de cambio de misión).
   - **Color/gradiente del nombre** en el perfil.
   - **TEMAS** = cover + animación de fondo de todo el perfil (burbujas como el
     home, nieve, etc.). **A diseñar** — de momento van como placeholders en el
     track y se completa el render cuando llegue el diseño.
   *(Avatares y banners sueltos quedan absorbidos: el banner es parte del TEMA.)*
4. **Misiones recalibradas para subir más rápido, diferenciando esfuerzo:** las
   acciones **físicas** (jugar partido, reservar pista, asistir a clase) cuestan
   dinero, tiempo y esfuerzo y no se repiten muchas veces al día → dan **muchos
   más SP** que las acciones **simples in-app** (lección, comentar, valorar,
   login, compartir).
   - **Objetivo de calibración:** jugar **30 partidos** en la temporada = llegar
     al final **MUY de sobra**; **15–20 partidos + otras misiones** = también
     llegar. (Total para completar = 50 × 1.000 = **50.000 SP**, capado en nivel 50.)

---

## Fase 1 — Estructura de temporada (50 niveles / 45 días)

- `season_pass_seasons` (s1): `max_level 100 → 50`; `ends_at` a 45 días
  (**fechas a confirmar**: si mantenemos "inicio 2026-06-01" ya se pasó; para S1
  de prueba conviene replantear el inicio a fecha reciente → fin ~45 días vista).
- **Propagación automática:** `max_level` es data-driven (fila de temporada), así
  que `computeSeasonPass`, el track (`/me` genera 1..max_level) y la barra del
  hero se ajustan solos a 50. Verificar textos ("/100" → "/50") y el
  auto-centrado del track.
- Migración: `update` en `094` (o una nueva) para `max_level` y `ends_at`.

---

## Fase 2 — Recalibración económica de misiones

**Regla:** SP por misión según coste real de la acción. Físicas ≫ simples.

Propuesta inicial (a afinar al sembrar):

| Categoría | Ejemplos | SP diaria | SP semanal | SP mensual/temporada |
|---|---|---|---|---|
| **Física alta** | jugar partido, ganar partido, liga/matchmaking | 500–700 | 1.500–2.200 | 4.000–7.000 |
| **Física media** | reservar pista, asistir a clase | 300–400 | 1.000–1.500 | 3.000–4.500 |
| **Simple** | lección diaria | 150 (ancla) | 500 | 1.400 |
| **Muy simple** | login, comentar, valorar, compartir, seguir | 40–70 | 300–400 | 800–1.200 |

**Comprobación del objetivo (aprox):** un partido cuenta a la vez para la diaria
de partido, una semanal y una de temporada → ~1.500 SP efectivos por partido.
- 30 partidos ≈ 45.000 SP solo de partidos + lección (150×45 ≈ 6.750) + otras →
  **>50.000, sobra**.
- 15–20 partidos ≈ 25–30.000 + lección + semanales/mensuales no-partido
  (reservas, clases, comunidad) → **~50.000, llega**.

**Acción:** re-seed del pool en `094` con los nuevos `sp_reward`. Revisar que el
boost de racha (cap ×2) no dispare de más con los nuevos valores.

---

## Fase 3 — Track de recompensas (50 niveles, cada 5 destacado)

- **Banco de cosméticos** (generable sin assets): títulos, marcos procedurales,
  insignias — suficientes para poblar 50 niveles × 2 carriles con variedad.
- **Cada 5 niveles (5,10,…,50):** recompensa **destacada** — cosmético de rareza
  alta, un TEMA (placeholder), o un pack (booster grande + cosmético).
- **Resto de niveles:** cosmético menor / SP / booster / reroll.
- **Elite en los 50 niveles** (no solo algunos) — recompensa en cada nivel en
  ambos carriles.
- **TEMAS como placeholder:** filas de recompensa tipo `theme` con display
  genérico ("Tema — próximamente") en algunos hitos, para reservar el hueco; el
  render final llega con el diseño.
- Re-seed `092`/`093` para 50 niveles.

---

## Fase 4 — Implementar los tipos nuevos de recompensa

### 4a. Rerolls extra (tokens)
- Recompensa que otorga **tokens de reroll** (cambios de misión adicionales).
- Backend: un contador de tokens por jugador (columna/tabla) que el endpoint de
  reroll consume antes de aplicar el límite gratuito. `reward_type` o kind nuevo.
- Mobile: mostrar tokens disponibles junto al reroll.

### 4b. Color/gradiente del nombre
- Nuevo `kind` de unlockable (`name_color`) con paleta en `colors`.
- Mobile: aplicar el color/gradiente al nombre del jugador en perfil (y donde se
  luzca). Componente de render nuevo.

### 4c. TEMAS (cover + animación de perfil)
- Nuevo `kind` (`theme`) con cover + preset de animación (reutilizar el motor de
  `InicioAmbientBackground`/partículas del home).
- **Diseño pendiente:** ahora solo placeholders en el track; el render del tema
  aplicado al perfil se implementa cuando haya diseño.

---

## Fase 5 — Performance: cache + warm start

Siguiendo patrones de la app (AsyncStorage `lib/dailyLessonStorage.ts`; cache en
memoria + cooldowns de `HomeDataContext`).

- **Warm start:** `lib/seasonPassStorage.ts` (save/load/clear por userId). Al
  abrir el pase, pintar el último `/me` cacheado al instante y refetch en
  background (stale-while-revalidate); persistir el fresco. Invalidar en logout.
- **Cache en memoria + cooldowns:** afinar el refetch de `seasonPassMe` en
  `HomeDataContext` (no refetch si reciente; `force` tras acciones que cambian
  el pase).
- **Backend `/me`:** memoizar `getActiveSpBonus` por request, cache corto del
  payload por jugador (10–15 s, invalidado por escrituras), confirmar índices.

---

## Fase 6 — Verificación y cierre

- **Prueba end-to-end** con backend real: `/me` (track 50, boosts), completar
  lección, reroll (con tokens), cruzar nivel (grants + level-up), modales,
  comprar Elite (retroactivo + modal éxito).
- **Migración 095** — SP por temporada con reset (antes del fin de temporada).

---

## Orden sugerido

1. **Fase 1** (temporada 50/45) — barato y desbloquea el resto.
2. **Fase 2** (recalibración de misiones) — el corazón del cambio.
3. **Fase 3** (track 50 niveles, cada 5 destacado, elite completo, placeholders de temas).
4. **Fase 4** (tipos nuevos: rerolls → color de nombre → temas placeholder).
5. **Fase 5** (performance).
6. **Fase 6** (e2e + 095).

**Decisiones que necesito de ti antes de sembrar:**
- **Fechas exactas** de la temporada de 45 días (inicio/fin).
- Confirmar la **tabla de SP por categoría** (Fase 2) o ajustarla.
- Cuántos **TEMAS placeholder** reservar y en qué hitos.
