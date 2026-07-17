# Season Pass — Catálogo de recompensas S1 (100 niveles)

> Fecha: 2026-07-08 · **Borrador EN PAUSA** — a la espera de cerrar qué tipos de
> recompensa usamos (ver §0) antes de detallar los 200 items.
> Decisión de arriba (2026-07-08): **recompensa en cada nivel** (free siempre;
> elite en la mayoría). Reemplaza la idea previa de "cada 5 niveles".

---

## 0. Restricción de assets y banco de tipos de recompensa

**Actualizado (2026-07-08):** el pase es **mobile-only hoy** (la miniapp no
muestra ni el pase ni las insignias), así que las insignias usan **iconos
Ionicons** (se ven mejor que emoji). Si en el futuro el pase/perfil llega a la
miniapp, habrá que resolver los iconos allí (fallback). Los 42 iconos custom del
PDF siguen aplazados (sin assets).

**Tipos viables sin assets custom:**

| Tipo | Cómo | Estado |
|---|---|---|
| **Títulos** (texto) | estáticos y **animados** (rareza = animación) | ✅ soportado |
| **Marcos** (procedurales) | 6 estilos × 10 animaciones × paletas de color | ✅ soportado |
| **Insignias** | glyph Ionicons + rareza (mobile) | ✅ soportado |
| **Boosters de SP** | temporales (+%) | ✅ soportado |
| **SP directo** | relleno | ✅ soportado |

**Ideas que darían variedad pero requieren soporte nuevo (no gratis):**
- **Color/gradiente del nombre** en el perfil (texto estilizado, sin iconos).
- **Banner/cover de perfil** procedural (gradiente/patrón).
- **Rerolls extra** de misión como recompensa (funcional, no cosmético).
- (Futuro, con assets) iconos custom, stickers de chat.

> Con solo los tipos "gratis" (título / marco / emoji-insignia / booster / SP) la
> variedad es limitada y con "recompensa en cada nivel" **se notará repetitivo**.
> Para romper eso hay que decidir si invertimos en color-de-nombre / banners
> (trabajo de render nuevo) o esperamos assets. **Decisión pendiente** — por eso
> este catálogo queda en pausa.

---

## 1. Filosofía

- **Temática S1:** "Llamas del Pádel" (fuego) + progresión de pádel.
- **Rareza creciente por tramos** (4 bloques del PDF):

| Bloque | Niveles | Rareza dominante | Boosters |
|---|---|---|---|
| 1 · Calentamiento | 1–25 | común / raro (picos épicos en 10, 20, 25) | pequeños (+15/30%) |
| 2 · Entrando a pista | 26–50 | raro / épico | medios (+30/50%) |
| 3 · Punto de oro | 51–75 | épico (algún legendario) | altos (+50/60%) |
| 4 · Maestría legendaria | 76–100 | épico / legendario | altos, cierre en 100 |

- **Free vs Elite:**
  - **Free** — cada nivel da algo, pero mayoría común-raro: títulos, insignias, SP directo, boosters moderados, algún marco. Picos épicos solo en múltiplos de 10.
  - **Elite** — cada nivel algo mejor: marcos animados, títulos de prestigio, insignias épicas/legendarias, boosters altos y más SP. Concentra lo legendario.
- **Sin doble camino:** todos los cosméticos del pase se crean con `unlock_type = 'manual'` (los otorga el pase, nunca el motor de señales). No se reutilizan los 082 que se ganan jugando (matches/wins/…).

---

## 2. Banco de cosméticos a crear

### 2.1 Títulos (kind `title`, solo texto)

**Común** (1–25): `Novato`, `Debutante`, `Peloteo`, `Aprendiz`, `Aficionado`, `Habitual`, `Constante`, `Pala Nueva`
**Raro** (26–50): `Competidor`, `Retador`, `Dedicado`, `Táctico`, `Sangre Nueva`, `Guerrero de Pista`, `Compañero Fiel`, `En Racha`
**Épico** (51–75): `Calculador`, `Sangre Fría`, `Muro de Vidrio`, `Metralla`, `Estrella Real`, `Virtuoso`, `Implacable`, `Resiliente`
**Legendario** (76–100): `Mente Maestra`, `Señor de la Pista`, `Depredador`, `Cazagigantes`, `Alma de WeMatch`, `Rey de la Pista`

### 2.2 Marcos (kind `frame`, procedurales · `animation_type` + `style` + `colors`)

Estilos: `solid/thin/double/glow/bevel`. Animaciones: `rotate/orbit/warp/glitch/ripple/morph/pulse/breathe/flicker/shake` (o sin animación).

**Raro** (estático o glow suave):
- `Brasa` — glow · `["#F97316","#FBBF24"]`
- `Ceniza` — thin · `["#9CA3AF","#D1D5DB"]`
- `Ascua` — solid · `["#EF4444","#F97316","#FBBF24"]`

**Épico** (animados):
- `Chispa Viva` — pulse/glow · `["#F97316","#FBBF24","#EF4444"]`
- `Fuego Fatuo` — flicker/glow · `["#22D3EE","#67E8F9"]`
- `Llama Azul` — breathe/glow · `["#3B82F6","#60A5FA","#93C5FD"]`

**Legendario** (animados complejos):
- `Llamas Eternas` — ripple/glow · `["#DC2626","#F97316","#FBBF24"]`
- `Corona de Llamas` — morph/bevel · `["#FBBF24","#F97316","#DC2626","#FDE68A"]`
- `Fénix` — warp/glow · `["#F59E0B","#EF4444","#FDE68A","#DC2626"]`

*(Ya sembrados en 092/093: `s1_ember`, `s1_llamas_eternas`, `s1_corona_llamas` — se reubican en la tabla de abajo.)*

### 2.3 Insignias (kind `badge`/`trophy`, glyph Ionicons + rareza)

**Común:** `Iniciado` (flame), `Primer Saque` (tennisball→resolver), `Pala Limpia` (shield)
**Raro:** `Constante` (medal), `Veterano S1` (ribbon), `Pionero` (star)
**Épico:** `Imparable` (flame), `Mitad de Temporada` (medal), `Elite S1` (crown→ribbon)
**Legendario:** `Campeón S1` (trophy), `Semifinalista` (medal)

*(Reutilizables de 092: `s1_iniciado`, `s1_constante`, `s1_imparable`, `s1_veterano`, `s1_mitad`, `s1_elite`.)*

---

## 3. Distribución por nivel

Leyenda de tipo: **T** título · **M** marco · **B** insignia/trofeo · **SP** SP directo · **⚡** booster.

### Bloque 1 — Calentamiento (1–25)

| Nivel | Free | Elite |
|---|---|---|
| 1 | B Iniciado (común) | B Elite S1 (raro) |
| 2 | SP +150 | ⚡ +30% 48h |
| 3 | T Novato | SP +200 |
| 4 | SP +150 | T Sangre Nueva |
| 5 | B Primer Saque (común) | M Brasa (raro) |
| 6 | SP +150 | SP +250 |
| 7 | T Debutante | ⚡ +30% 48h |
| 8 | SP +200 | B Pionero (raro) |
| 9 | SP +150 | SP +250 |
| 10 | M Ceniza (raro) | M Chispa Viva (épico) |
| 11 | SP +150 | SP +250 |
| 12 | T Peloteo | ⚡ +30% 48h |
| 13 | SP +200 | T Compañero Fiel |
| 14 | B Pala Limpia (común) | SP +300 |
| 15 | T Aprendiz | M Fuego Fatuo (épico) |
| 16 | SP +200 | SP +300 |
| 17 | SP +150 | ⚡ +50% 72h |
| 18 | T Aficionado | B Constante (raro) |
| 19 | SP +200 | SP +300 |
| 20 | M Ascua (raro) | T En Racha (raro) |
| 21 | SP +200 | SP +300 |
| 22 | ⚡ +15% 24h | ⚡ +50% 72h |
| 23 | T Habitual | SP +350 |
| 24 | SP +250 | B Veterano S1 (raro) |
| 25 | B Constante (raro) | M Llama Azul (épico) |

### Bloque 2 — Entrando a pista (26–50)

| Nivel | Free | Elite |
|---|---|---|
| 26 | SP +250 | SP +350 |
| 27 | T Constante | ⚡ +50% 72h |
| 28 | SP +250 | M Llama Azul (épico) |
| 29 | B Pala Nueva (común) | SP +400 |
| 30 | T Competidor (raro) | T Calculador (épico) |
| 31 | SP +250 | SP +400 |
| 32 | ⚡ +30% 48h | ⚡ +50% 72h |
| 33 | T Retador | SP +400 |
| 34 | SP +300 | B Imparable (épico) |
| 35 | M Brasa (raro) | T Sangre Fría (épico) |
| 36 | SP +300 | SP +400 |
| 37 | T Dedicado | ⚡ +60% 72h |
| 38 | SP +300 | M Chispa Viva (épico) |
| 39 | SP +250 | T Metralla (épico) |
| 40 | B Veterano S1 (raro) | T Muro de Vidrio (épico) |
| 41 | SP +300 | SP +450 |
| 42 | T Táctico | ⚡ +60% 72h |
| 43 | SP +350 | SP +450 |
| 44 | ⚡ +30% 48h | M Fuego Fatuo (épico) |
| 45 | T Guerrero de Pista (raro) | T Estrella Real (épico) |
| 46 | SP +350 | SP +450 |
| 47 | SP +300 | ⚡ +60% 72h |
| 48 | B Compañero Fiel (raro) | M s1_ember (épico) |
| 49 | SP +350 | T Competidor (épico) |
| 50 | M Ascua (épico) | M Sinapsis (épico, breathe) |

### Bloque 3 — Punto de oro (51–75)

| Nivel | Free | Elite |
|---|---|---|
| 51 | T Sangre Fría (épico) | T Muro de Vidrio (épico) |
| 52 | SP +350 | ⚡ +60% 72h |
| 53 | SP +400 | SP +500 |
| 54 | B Imparable (épico) | M Llamas Eternas (legendario) |
| 55 | T Calculador (épico) | T Implacable (épico) |
| 56 | SP +400 | SP +500 |
| 57 | ⚡ +50% 72h | ⚡ +60% 72h |
| 58 | SP +400 | M Chispa Viva (épico) |
| 59 | T Virtuoso (épico) | SP +550 |
| 60 | M Chispa Viva (épico) | T Resiliente (épico) |
| 61 | SP +400 | ⚡ +60% 72h |
| 62 | SP +450 | SP +550 |
| 63 | T Metralla (épico) | B Mitad de Temporada (épico) |
| 64 | ⚡ +50% 72h | M Fénix (legendario) |
| 65 | B Mitad de Temporada (épico) | T Metralla (épico) |
| 66 | SP +450 | SP +600 |
| 67 | SP +400 | ⚡ +60% 72h |
| 68 | T Estrella Real (épico) | M s1_llamas_eternas (legendario) |
| 69 | SP +450 | SP +600 |
| 70 | M Fuego Fatuo (épico) | T Estrella Real (legendario) |
| 71 | SP +450 | ⚡ +60% 72h |
| 72 | ⚡ +50% 72h | SP +650 |
| 73 | T Implacable (épico) | SP +650 |
| 74 | SP +500 | B Elite S1 (legendario) |
| 75 | M Llama Azul (legendario) | M Corona de Llamas (legendario) |

### Bloque 4 — Maestría legendaria (76–100)

| Nivel | Free | Elite |
|---|---|---|
| 76 | T Resiliente (épico) | T Mente Maestra (legendario) |
| 77 | SP +500 | ⚡ +60% 72h |
| 78 | SP +500 | T Cazagigantes (legendario) |
| 79 | T Virtuoso (épico) | SP +700 |
| 80 | M Llama Azul (legendario) | T Señor de la Pista (legendario) |
| 81 | SP +550 | SP +700 |
| 82 | ⚡ +50% 72h | M Fénix (legendario) |
| 83 | T Implacable (legendario) | T Señor de la Pista (legendario) |
| 84 | SP +550 | ⚡ +60% 72h |
| 85 | B Semifinalista (épico) | T Depredador (legendario) |
| 86 | SP +550 | SP +800 |
| 87 | T Metralla (legendario) | SP +800 |
| 88 | ⚡ +50% 72h | M Corona de Llamas (legendario) |
| 89 | SP +600 | ⚡ +60% 72h |
| 90 | M Fénix (legendario) | T Depredador (legendario) |
| 91 | SP +600 | SP +900 |
| 92 | T Estrella Real (legendario) | SP +900 |
| 93 | SP +600 | B Campeón S1 (legendario) |
| 94 | ⚡ +50% 72h | ⚡ +60% 72h |
| 95 | M Llamas Eternas (legendario) | M Fénix (legendario) |
| 96 | SP +700 | SP +1000 |
| 97 | T Depredador (legendario) | SP +1000 |
| 98 | SP +700 | ⚡ +60% 72h |
| 99 | T Alma de WeMatch (legendario) | T Alma de WeMatch (legendario, variante animada) |
| 100 | B Rey de la Pista (legendario) + M Llamas Eternas | M Campeón Supremo S1 (legendario) + T Rey de la Pista |

---

## 4. Notas de implementación

- **Volumen a sembrar:** ~30 títulos, ~10 marcos, ~10 insignias nuevos (unlockables `manual`), + ~100 filas free y ~100 elite en `season_pass_rewards`. Re-seed de 092 (cosméticos + track) y 093 (boosters ya cuadran, se reubican).
- **SP directo como relleno:** presente en muchos niveles para que ninguno quede vacío sin gastar cosméticos; importes crecen por tramo (150 → 1000).
- **Repetición de títulos entre free y elite:** cuando un título aparece en ambos carriles a distinta rareza (p. ej. "Metralla" épico en free, legendario en elite), son **items distintos** (dos filas de `unlockables`) o el mismo con variante — decidir al sembrar.
- **Iconos custom (42):** al llegar, sustituyen SP-relleno de niveles clave por el icono correspondiente.
- **Pendiente de tu revisión:** nombres, qué rareza en cada nivel, y el reparto SP/cosmético/booster. Ajusta libremente antes de sembrar.
