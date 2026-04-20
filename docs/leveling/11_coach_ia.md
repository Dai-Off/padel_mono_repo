# 11 — Coach Virtual IA

## 1. Vision objetivo

El Coach Virtual IA es una pantalla dentro del perfil del jugador que combina:
1. Un **panel de analisis** del nivel del jugador desglosado en 4 dimensiones (radar chart + fortalezas + recomendaciones).
2. Un **panel de seguimiento** de objetivos personalizados (semanales y mensuales).

La pantalla tiene dos tabs: **"Resumen"** y **"Plan"**.

---

> Ultima verificacion: 2026-04-14. Nada implementado aun — todo es nuevo.

## 2. Scope del MVP

### Incluido

- **Tab "Resumen"**: radar chart de 4 areas, fortalezas, areas a mejorar, recomendacion del coach.
- **Tab "Plan"**: objetivos semanales, mensuales, metricas header, cursos recomendados.
- **Radar chart**: lee directamente los campos `area_technique`, `area_tactics`, `area_physical`, `area_mental` de la tabla `players` (ver componente 01 para reglas de actualizacion).
- **Fortalezas y A Mejorar**: textos predeterminados por tier + area. No generados por IA.
- **Recomendacion del Coach**: texto fijo segun area mas baja + tier. No generado por IA.
- **Objetivos semanales y mensuales**: personalizados por tier, progreso calculado en tiempo real.
- **Metricas header**: ritmo de mejora (%), objetivos completados (X/Y), racha.
- **Contenido recomendado**: cursos sugeridos segun nivel del jugador.

### Excluido (V2)

| Feature | Motivo |
|---------|--------|
| Recomendaciones generadas por IA real | MVP usa textos predeterminados. V2 usa `player_ai_profiles` (ver componente 08) |
| Progreso historico mensual del indice de ritmo de mejora | Necesita datos acumulados de varios meses |
| Objetivos configurables por el usuario | Complejidad adicional innecesaria en MVP |

---

## 3. Tablas de base de datos

Se ejecutan manualmente en el SQL Editor de Supabase (patron del proyecto).

### 3.1 `coach_objectives` — Catalogo de objetivos disponibles

```sql
create table if not exists public.coach_objectives (
  id text primary key,
  period text not null check (period in ('weekly', 'monthly')),
  description_template text not null,
  data_source text not null,
  min_tier text not null check (min_tier in ('iniciacion', 'intermedio', 'avanzado', 'experto')),
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
```

**Datos iniciales (seed):**

```sql
-- Objetivos semanales
insert into public.coach_objectives (id, period, description_template, data_source, min_tier, display_order) values
  ('daily_lessons', 'weekly', 'Completar {target} lecciones diarias', 'learning_sessions', 'iniciacion', 1),
  ('lesson_score', 'weekly', 'Sacar >=80% en {target} lecciones', 'learning_sessions', 'iniciacion', 2),
  ('matches_played', 'weekly', 'Jugar {target} partidos', 'matches', 'iniciacion', 3),
  ('classes_attended', 'weekly', 'Asistir a {target} clases', 'club_school_course_enrollments', 'iniciacion', 4),
  ('matches_won', 'weekly', 'Ganar {target} partido', 'matches', 'intermedio', 5);

-- Objetivos mensuales
insert into public.coach_objectives (id, period, description_template, data_source, min_tier, display_order) values
  ('streak_days', 'monthly', 'Mantener racha de {target} dias', 'learning_streaks', 'iniciacion', 1),
  ('courses_completed', 'monthly', 'Completar {target} curso', 'learning_course_progress', 'iniciacion', 2),
  ('matches_played_monthly', 'monthly', 'Jugar {target} partidos este mes', 'matches', 'iniciacion', 3),
  ('matches_won_monthly', 'monthly', 'Ganar {target} partidos este mes', 'matches', 'intermedio', 4),
  ('tournaments_played', 'monthly', 'Disputar {target} torneo', 'tournaments', 'intermedio', 5);
```

### 3.2 `coach_objective_targets` — Metas por tier

```sql
create table if not exists public.coach_objective_targets (
  objective_id text not null references public.coach_objectives(id) on delete cascade,
  tier text not null check (tier in ('iniciacion', 'intermedio', 'avanzado', 'experto')),
  target int not null,
  primary key (objective_id, tier)
);
```

**Datos iniciales:**

```sql
-- SEMANALES
insert into public.coach_objective_targets (objective_id, tier, target) values
  ('daily_lessons', 'iniciacion', 3),
  ('daily_lessons', 'intermedio', 4),
  ('daily_lessons', 'avanzado', 5),
  ('daily_lessons', 'experto', 6),
  ('lesson_score', 'iniciacion', 1),
  ('lesson_score', 'intermedio', 2),
  ('lesson_score', 'avanzado', 3),
  ('lesson_score', 'experto', 4),
  ('matches_played', 'iniciacion', 1),
  ('matches_played', 'intermedio', 2),
  ('matches_played', 'avanzado', 3),
  ('matches_played', 'experto', 3),
  ('classes_attended', 'iniciacion', 1),
  ('classes_attended', 'intermedio', 1),
  ('classes_attended', 'avanzado', 2),
  ('classes_attended', 'experto', 2),
  ('matches_won', 'intermedio', 1),
  ('matches_won', 'avanzado', 2),
  ('matches_won', 'experto', 2);

-- MENSUALES
insert into public.coach_objective_targets (objective_id, tier, target) values
  ('streak_days', 'iniciacion', 7),
  ('streak_days', 'intermedio', 14),
  ('streak_days', 'avanzado', 21),
  ('streak_days', 'experto', 28),
  ('courses_completed', 'iniciacion', 1),
  ('courses_completed', 'intermedio', 1),
  ('courses_completed', 'avanzado', 2),
  ('courses_completed', 'experto', 2),
  ('matches_played_monthly', 'iniciacion', 3),
  ('matches_played_monthly', 'intermedio', 5),
  ('matches_played_monthly', 'avanzado', 8),
  ('matches_played_monthly', 'experto', 10),
  ('matches_won_monthly', 'intermedio', 2),
  ('matches_won_monthly', 'avanzado', 4),
  ('matches_won_monthly', 'experto', 6),
  ('tournaments_played', 'intermedio', 1),
  ('tournaments_played', 'avanzado', 1),
  ('tournaments_played', 'experto', 2);
```

### 3.3 Sin tabla de progreso de objetivos

**Decision: no se crea tabla de progreso.** Todo se calcula en tiempo real desde las tablas fuente (`learning_sessions`, `matches`, `learning_streaks`, etc.) filtrando por el periodo actual (semana/mes).

### 3.4 Nota sobre `classes_attended`

La tabla `club_school_course_enrollments` registra inscripciones (`status = 'active'`), no asistencia real. En el MVP, el objetivo `classes_attended` cuenta inscripciones activas en cursos vigentes. Si en el futuro se anade tracking de asistencia real, se actualizara.

---

## 4. Personalizacion por tier

### Tiers de elo

| Tier | Rango elo_rating |
|------|-----------------|
| Iniciacion | 0 - 1.5 |
| Intermedio | 1.5 - 3.5 |
| Avanzado | 3.5 - 5.5 |
| Experto | 5.5 - 7.0 |

### Funcion de calculo de tier

```typescript
type Tier = 'iniciacion' | 'intermedio' | 'avanzado' | 'experto';

function getTierFromElo(eloRating: number): Tier {
  if (eloRating < 1.5) return 'iniciacion';
  if (eloRating < 3.5) return 'intermedio';
  if (eloRating < 5.5) return 'avanzado';
  return 'experto';
}

const TIER_ORDER: Record<Tier, number> = {
  iniciacion: 0,
  intermedio: 1,
  avanzado: 2,
  experto: 3,
};
```

Un objetivo con `min_tier = 'intermedio'` aparece para jugadores de tier intermedio, avanzado y experto. Nunca para iniciacion.

---

## 5. Rutas del backend

Archivo: `backend/src/routes/learningCoachIA.ts`
Se registra en `learning.ts` como subrouter adicional.

### Endpoints

| Metodo | Ruta | Guard | Descripcion |
|--------|------|-------|-------------|
| `GET` | `/learning/coach/summary` | requireAuth | Tab Resumen: radar + fortalezas + a mejorar + recomendacion |
| `GET` | `/learning/coach/plan` | requireAuth | Tab Plan: metricas header + objetivos semanales + mensuales + cursos recomendados |

---

## 6. Logica de negocio detallada

### 6.1 `GET /learning/coach/summary`

**Flujo:**

```
1. Obtener player via getPlayerFromAuth (incluye elo_rating, area_technique, area_tactics, area_physical, area_mental).
2. Si las areas son null (jugador no inicializado), devolver { ok: true, data: null }.
3. Calcular tier del jugador con getTierFromElo(elo_rating).
4. Construir radar con los 4 valores de area.
5. Ordenar areas por valor. Las 2 mayores son fortalezas, las 2 menores son "a mejorar".
6. Buscar textos predeterminados en AREA_TEXTS[area][tier] para fortalezas, a mejorar y recomendacion.
7. La recomendacion principal se basa en el area con valor mas bajo.
8. Responder.
```

**Response:**

```json
{
  "ok": true,
  "data": {
    "tier": "intermedio",
    "radar": {
      "technique": 3.2,
      "tactics": 2.8,
      "physical": 3.5,
      "mental": 3.0
    },
    "strengths": [
      {
        "area": "physical",
        "value": 3.5,
        "text": "Tu condicion fisica es solida para tu nivel. Sigues manteniendo buen ritmo en pista."
      },
      {
        "area": "technique",
        "value": 3.2,
        "text": "Tu tecnica es consistente. Los golpes basicos los dominas bien."
      }
    ],
    "to_improve": [
      {
        "area": "tactics",
        "value": 2.8,
        "text": "La lectura del juego es tu area con mas margen de mejora. Trabaja el posicionamiento."
      },
      {
        "area": "mental",
        "value": 3.0,
        "text": "La concentracion y gestion emocional durante el partido puede mejorar."
      }
    ],
    "recommendation": "Enfocate en mejorar tu posicionamiento en pista y lectura de jugadas. Combina esto con ejercicios de concentracion para subir de nivel."
  }
}
```

### 6.2 Mapa de textos predeterminados

Estructura del mapa (hardcodeado en el backend):

```typescript
type Area = 'technique' | 'tactics' | 'physical' | 'mental';

const AREA_TEXTS: Record<Area, Record<Tier, {
  strength: string;
  improve: string;
  recommendation: string;
}>> = {
  technique: {
    iniciacion: {
      strength: "Estas desarrollando una buena base tecnica para tu nivel. Sigue practicando los golpes fundamentales.",
      improve: "La tecnica es clave en tus primeros pasos. Enfocate en la posicion de la pala y el punto de impacto.",
      recommendation: "Dedica tiempo a practicar los golpes basicos: derecha, reves y volea. La repeticion es tu mejor aliada."
    },
    intermedio: {
      strength: "Tu tecnica es consistente. Los golpes basicos los dominas bien.",
      improve: "Tu tecnica tiene margen de mejora. Trabaja la volea y el remate para dar el salto.",
      recommendation: "Enfocate en perfeccionar tu volea y comenzar a trabajar golpes mas avanzados como el bandeja."
    },
    avanzado: {
      strength: "Tu tecnica es tu punto fuerte. Tienes un repertorio de golpes amplio y consistente.",
      improve: "A tu nivel, la tecnica necesita ser impecable. Pule los detalles en los golpes de presion.",
      recommendation: "Trabaja la precision en tus golpes ganadores y las variaciones de efecto para sorprender al rival."
    },
    experto: {
      strength: "Tu tecnica es de alto nivel. Dominas una amplia variedad de golpes con precision.",
      improve: "Incluso a nivel experto, la tecnica siempre se puede refinar. Busca la perfeccion en los detalles.",
      recommendation: "Enfocate en situaciones de alta presion donde la tecnica marca la diferencia. Golpes ganadores bajo presion."
    }
  },
  tactics: {
    iniciacion: {
      strength: "Para tu nivel, muestras buena intuicion tactica. Entiendes lo basico del juego por parejas.",
      improve: "La tactica es nueva para ti. Aprende a leer las posiciones y a jugar con tu companero.",
      recommendation: "Empieza por entender las posiciones basicas en pista y cuando subir a la red."
    },
    intermedio: {
      strength: "Tu lectura del juego es buena. Sabes posicionarte y buscar los huecos.",
      improve: "La lectura del juego es tu area con mas margen de mejora. Trabaja el posicionamiento.",
      recommendation: "Practica la lectura de jugadas: anticipa donde va la bola y coordina movimientos con tu companero."
    },
    avanzado: {
      strength: "Tu inteligencia tactica es destacable. Lees bien el juego y tomas buenas decisiones.",
      improve: "A nivel avanzado, la tactica es lo que diferencia. Mejora la construccion de puntos.",
      recommendation: "Trabaja patrones de juego avanzados y la comunicacion tactica con tu pareja en tiempo real."
    },
    experto: {
      strength: "Tu vision tactica es excepcional. Dominas la estrategia y la adaptacion en partido.",
      improve: "A nivel experto, la tactica requiere innovacion constante. No te acomodes en patrones conocidos.",
      recommendation: "Estudia partidos de alto nivel y desarrolla nuevas estrategias para sorprender a rivales que te conocen."
    }
  },
  physical: {
    iniciacion: {
      strength: "Tu condicion fisica te permite mantener buen ritmo durante los partidos para tu nivel.",
      improve: "La condicion fisica es fundamental. Trabaja la resistencia para poder disfrutar mas en pista.",
      recommendation: "Empieza con ejercicios de movilidad y resistencia basica. Un buen fondo fisico mejora todo tu juego."
    },
    intermedio: {
      strength: "Tu condicion fisica es solida para tu nivel. Mantienes buen ritmo en pista.",
      improve: "Tu condicion fisica puede mejorar. Trabaja la resistencia y la velocidad de desplazamiento.",
      recommendation: "Incorpora ejercicios de velocidad y cambios de direccion a tu rutina. Marca la diferencia en puntos largos."
    },
    avanzado: {
      strength: "Tu fisico es un pilar de tu juego. Aguantas bien los partidos largos y exigentes.",
      improve: "A nivel avanzado, el fisico marca grandes diferencias. Mejora la explosividad y recuperacion.",
      recommendation: "Enfocate en la potencia explosiva y la recuperacion entre puntos. El fisico avanzado es una ventaja competitiva."
    },
    experto: {
      strength: "Tu condicion fisica es de elite. Eres capaz de mantener la intensidad durante todo el partido.",
      improve: "A nivel experto, el fisico debe ser impecable. Trabaja la prevencion de lesiones y la recuperacion.",
      recommendation: "Optimiza tu preparacion fisica con un plan periodizado. La diferencia esta en los detalles de recuperacion y prevencion."
    }
  },
  mental: {
    iniciacion: {
      strength: "Muestras buena actitud y concentracion para alguien que esta empezando.",
      improve: "El aspecto mental es importante desde el principio. Aprende a mantener la calma y disfrutar.",
      recommendation: "No te frustres con los errores, son parte del aprendizaje. Enfocate en disfrutar y mejorar poco a poco."
    },
    intermedio: {
      strength: "Tu fortaleza mental es notable. Mantienes la concentracion y gestionas bien la presion.",
      improve: "La concentracion y gestion emocional durante el partido puede mejorar.",
      recommendation: "Trabaja tecnicas de concentracion y gestion emocional. No dejes que un mal punto afecte al siguiente."
    },
    avanzado: {
      strength: "Tu solidez mental es un gran activo. Mantienes el nivel bajo presion y en momentos clave.",
      improve: "A nivel avanzado, lo mental separa a los buenos de los muy buenos. Trabaja la resiliencia.",
      recommendation: "Desarrolla rutinas mentales pre-punto y practica la visualizacion. En momentos clave, lo mental lo decide todo."
    },
    experto: {
      strength: "Tu fortaleza mental es excepcional. Eres capaz de rendir al maximo en situaciones de maxima presion.",
      improve: "Incluso a nivel experto, el aspecto mental se puede perfeccionar. Busca la excelencia en el autocontrol.",
      recommendation: "Trabaja con un profesional de psicologia deportiva si es posible. A tu nivel, cada detalle mental cuenta."
    }
  }
};
```

### 6.3 `GET /learning/coach/plan`

**Flujo:**

```
1. Obtener player_id y elo_rating via getPlayerFromAuth.
2. Obtener timezone del request (query param ?timezone=Asia/Shanghai, default UTC).
3. Calcular tier del jugador.
4. Calcular rango de la semana actual (lunes 00:00 -> domingo 23:59 en timezone del jugador).
5. Calcular rango del mes actual (dia 1 00:00 -> ultimo dia 23:59 en timezone del jugador).
6. Obtener objetivos aplicables al tier del jugador (coach_objectives + coach_objective_targets).
7. Para cada objetivo, calcular el progreso actual (ver seccion 6.4).
8. Calcular metricas del header (ver seccion 6.5).
9. Obtener cursos recomendados (ver seccion 6.6).
10. Responder con todo.
```

**Response:**

```json
{
  "ok": true,
  "data": {
    "tier": "intermedio",
    "header": {
      "improvement_rate": 42,
      "objectives_completed": 3,
      "objectives_total": 8,
      "current_streak": 5
    },
    "weekly_objectives": [
      {
        "id": "daily_lessons",
        "description": "Completar 4 lecciones diarias",
        "current": 2,
        "target": 4,
        "completed": false
      }
    ],
    "monthly_objectives": [
      {
        "id": "streak_days",
        "description": "Mantener racha de 14 dias",
        "current": 5,
        "target": 14,
        "completed": false
      }
    ],
    "recommended_courses": [
      {
        "id": "uuid",
        "title": "Fundamentos del reves",
        "club_name": "Club Padel Shanghai",
        "total_lessons": 6,
        "completed_lessons": 2
      }
    ]
  }
}
```

### 6.4 Calculo de progreso por objetivo

Cada objetivo calcula su `current` de una fuente de datos diferente. Todos los conteos se filtran por el periodo correspondiente (semana o mes actual).

#### `daily_lessons` (semanal)

```sql
SELECT COUNT(*) FROM learning_sessions
WHERE player_id = $1
  AND completed_at >= $week_start
  AND completed_at < $week_end
```

#### `lesson_score` (semanal)

```sql
SELECT COUNT(*) FROM learning_sessions
WHERE player_id = $1
  AND completed_at >= $week_start
  AND completed_at < $week_end
  AND (correct_count::float / NULLIF(total_count, 0)) >= 0.8
```

#### `matches_played` (semanal)

```sql
SELECT COUNT(DISTINCT m.id) FROM matches m
JOIN match_players mp ON mp.match_id = m.id
WHERE mp.player_id = $1
  AND m.status = 'finished'
  AND m.date >= $week_start::date
  AND m.date <= $week_end::date
```

> Nota: verificar el campo exacto de fecha en `matches` antes de implementar.

#### `matches_won` (semanal)

```
Para cada match donde el jugador participo y status = 'finished' y score_status = 'confirmed':
  - team_jugador = match_players.team donde player_id = $1
  - sets = match.sets (array de {a, b})
  - sets_equipo_a = COUNT de sets donde a > b
  - sets_equipo_b = COUNT de sets donde b > a
  - gano = (team_jugador == 'a' AND sets_equipo_a > sets_equipo_b)
         OR (team_jugador == 'b' AND sets_equipo_b > sets_equipo_a)
```

#### `classes_attended` (semanal)

```sql
SELECT COUNT(*) FROM club_school_course_enrollments e
JOIN club_school_courses c ON c.id = e.course_id
WHERE e.player_id = $1
  AND e.status = 'active'
  AND c.starts_on <= $week_end::date
  AND (c.ends_on IS NULL OR c.ends_on >= $week_start::date)
```

#### `streak_days` (mensual)

```sql
SELECT current_streak FROM learning_streaks WHERE player_id = $1
```

Se compara `current_streak` con el target. Completado cuando `current_streak >= target`.

#### `courses_completed` (mensual)

Curso completado = todas sus lecciones en `learning_course_progress`. Contar cursos donde la ultima leccion se completo en el mes actual.

#### `matches_played_monthly` / `matches_won_monthly` (mensual)

Igual que las versiones semanales pero con rango del mes.

#### `tournaments_played` (mensual)

```sql
SELECT COUNT(DISTINCT ti.tournament_id) FROM tournament_inscriptions ti
JOIN tournaments t ON t.id = ti.tournament_id
WHERE ti.player_id = $1
  AND t.start_at >= $month_start
  AND t.start_at < $month_end
  AND t.status != 'cancelled'
```

> Nota: verificar estructura de `tournament_inscriptions` antes de implementar.

### 6.5 Metricas del header

#### Ritmo de mejora (%)

```
ritmo_mejora = (
  0.35 * (objetivos_semanales_completados / objetivos_semanales_totales) +
  0.25 * (objetivos_mensuales_completados / objetivos_mensuales_totales) +
  0.25 * min(current_streak / 30, 1) +
  0.15 * (media_score_ultimas_2_semanas / 500)
) * 100
```

Resultado redondeado a entero (0-100).

Casos borde:
- Sin objetivos semanales: componente 0.35 = 0.
- Sin sesiones en ultimas 2 semanas: `media_score` = 0.
- Sin racha: `current_streak` = 0.

#### Objetivos X/Y

Suma de todos los objetivos completados (semanales + mensuales) sobre el total.

#### Racha

`learning_streaks.current_streak`. Si no hay registro, 0.

### 6.6 Cursos recomendados

```sql
SELECT c.id, c.title, cl.name as club_name,
  (SELECT COUNT(*) FROM learning_course_lessons WHERE course_id = c.id) as total_lessons,
  (SELECT COUNT(*) FROM learning_course_progress cp
   JOIN learning_course_lessons cl2 ON cl2.id = cp.lesson_id
   WHERE cl2.course_id = c.id AND cp.player_id = $1) as completed_lessons
FROM learning_courses c
JOIN clubs cl ON cl.id = c.club_id
WHERE c.status = 'active'
  AND c.elo_min <= $elo_rating
  AND (c.elo_max IS NULL OR c.elo_max >= $elo_rating)
  AND NOT (
    (SELECT COUNT(*) FROM learning_course_lessons WHERE course_id = c.id) > 0
    AND (SELECT COUNT(*) FROM learning_course_lessons WHERE course_id = c.id) =
        (SELECT COUNT(*) FROM learning_course_progress cp
         JOIN learning_course_lessons cl3 ON cl3.id = cp.lesson_id
         WHERE cl3.course_id = c.id AND cp.player_id = $1)
  )
ORDER BY ABS(c.elo_min - $elo_rating) ASC
LIMIT 3
```

Si devuelve 0 resultados, la seccion se oculta en el frontend.

---

## 7. Frontend

### 7.1 Archivos a crear (mobile-app)

| Archivo | Proposito |
|---------|-----------|
| `api/learning.ts` | Anadir funciones `fetchCoachSummary` y `fetchCoachPlan` |
| `hooks/useCoachSummary.ts` | Hook para tab Resumen |
| `hooks/useCoachPlan.ts` | Hook para tab Plan |
| `screens/CoachIAScreen.tsx` | Pantalla principal con 2 tabs |
| `components/learning/RadarChart.tsx` | Grafico spider de 4 ejes |
| `components/learning/StrengthsCard.tsx` | Card de fortalezas (2 areas) |
| `components/learning/ImprovementCard.tsx` | Card de areas a mejorar (2 areas) |
| `components/learning/CoachRecommendation.tsx` | Texto de recomendacion del coach |
| `components/learning/CoachHeader.tsx` | 3 metricas en cards horizontales |
| `components/learning/ObjectiveCard.tsx` | Card individual de objetivo con barra de progreso |
| `components/learning/ObjectivesList.tsx` | Lista de objetivos (semanal o mensual) |
| `components/learning/RecommendedCourses.tsx` | Seccion de cursos recomendados |

### 7.2 Pantalla CoachIAScreen

**Layout:**

```
ScreenLayout + BackHeader ("Coach IA")
+-- TabSelector ["Resumen", "Plan"]
|
+-- Si tab = "Resumen":
|   +-- ScrollView
|       +-- RadarChart (4 ejes: tecnico, fisico, mental, tactico)
|       +-- StrengthsCard (2 fortalezas)
|       +-- ImprovementCard (2 areas a mejorar)
|       +-- CoachRecommendation (texto)
|
+-- Si tab = "Plan":
    +-- ScrollView
        +-- CoachHeader (3 metricas)
        +-- ObjectivesList title="Plan de esta semana" objectives={weekly}
        +-- ObjectivesList title="Plan mensual" objectives={monthly}
        +-- RecommendedCourses courses={recommended} (condicional)
```

**Skeleton:** Usar `Skeleton.tsx` mientras `loading = true`.

### 7.3 Componentes

#### RadarChart
- Grafico spider con 4 ejes. Cada eje va de 0 a 7 (la escala de elo_rating).
- Valor de cada eje: `area_technique`, `area_tactics`, `area_physical`, `area_mental`.
- Libreria: implementar con SVG nativo o `react-native-svg`. Evaluar la opcion mas ligera.
- Debajo del radar: 4 barras horizontales con los mismos valores, una por area, con su color distintivo.

Colores por area:
| Area | Color |
|------|-------|
| Tecnica | `#E31E24` (primario) |
| Tactica | `#2196F3` (azul) |
| Fisico | `#4CAF50` (verde) |
| Mental | `#FF9800` (naranja) |

#### StrengthsCard / ImprovementCard
- Titulo de seccion ("Fortalezas" / "A Mejorar").
- 2 items, cada uno con icono de area + nombre del area + texto predeterminado.
- Fondo verde claro para fortalezas, fondo naranja claro para a mejorar.

#### CoachRecommendation
- Card con icono de coach/robot + texto de recomendacion.
- Fondo gris claro. Texto del mapa AREA_TEXTS segun area mas baja + tier.

#### CoachHeader
- 3 cards en `flexDirection: 'row'`.
- Card 1: porcentaje grande + label "Ritmo de mejora".
- Card 2: "3/8" + label "Objetivos".
- Card 3: numero + fuego + label "Racha".

#### ObjectiveCard
- Icono a la izquierda (Ionicons), texto del objetivo, "2/4" a la derecha.
- Barra de progreso debajo.
- Completado: barra verde, check icon. En progreso: barra #E31E24. No iniciado: barra gris.

#### Iconos por objetivo

| Objetivo | Icono Ionicons |
|----------|---------------|
| `daily_lessons` | `book-outline` |
| `lesson_score` | `star-outline` |
| `matches_played` | `tennisball-outline` |
| `classes_attended` | `school-outline` |
| `matches_won` | `trophy-outline` |
| `streak_days` | `flame-outline` |
| `courses_completed` | `checkmark-done-outline` |
| `matches_played_monthly` | `tennisball-outline` |
| `matches_won_monthly` | `trophy-outline` |
| `tournaments_played` | `medal-outline` |

### 7.4 Navegacion

Anadir estado en `MainApp.tsx`:

```typescript
type Screen = ... | 'CoachIA';
```

Punto de entrada: boton/card en el perfil del jugador que navega a `CoachIA`.

### 7.5 Estilos

- `StyleSheet.create()`.
- Colores hardcodeados. Primario: `#E31E24`.
- Spacing y fontSize de `theme.ts`.
- Cards con `borderRadius: 12`, `backgroundColor: '#FFFFFF'`, sombra sutil.
- Barras de progreso: altura 6px, borderRadius 3, fondo `#E5E7EB`, fill con color segun estado.

---

## 8. Orden de implementacion

### Fase 1 — Base de datos

| # | Tarea | Estado |
|---|-------|--------|
| 1.1 | Crear tablas `coach_objectives` + `coach_objective_targets` + seeds | Pendiente |

### Fase 2 — Backend

| # | Tarea | Estado |
|---|-------|--------|
| 2.1 | Crear `learningCoachIA.ts` con helper `getTierFromElo`, constantes de tier y mapa AREA_TEXTS | Pendiente |
| 2.2 | Implementar `GET /learning/coach/summary` (lee areas de players, calcula fortalezas/a mejorar) | Pendiente |
| 2.3 | Implementar funcion de calculo de periodo (semana/mes actual en timezone) | Pendiente |
| 2.4 | Implementar calculadores de progreso por objetivo (10 funciones) | Pendiente |
| 2.5 | Implementar calculo de metricas del header (ritmo de mejora, totales) | Pendiente |
| 2.6 | Implementar query de cursos recomendados | Pendiente |
| 2.7 | Ensamblar `GET /learning/coach/plan` | Pendiente |
| 2.8 | Registrar subrouter en `learning.ts` | Pendiente |
| 2.9 | Documentar rutas en `backend/API.md` | Pendiente |
| 2.10 | Testing manual con curl | Pendiente |

### Fase 3 — Frontend mobile

| # | Tarea | Estado |
|---|-------|--------|
| 3.1 | Anadir funciones fetch en `api/learning.ts` | Pendiente |
| 3.2 | Crear hooks: `useCoachSummary`, `useCoachPlan` | Pendiente |
| 3.3 | Crear `RadarChart.tsx` | Pendiente |
| 3.4 | Crear componentes tab Resumen: `StrengthsCard`, `ImprovementCard`, `CoachRecommendation` | Pendiente |
| 3.5 | Crear componentes tab Plan: `CoachHeader`, `ObjectiveCard`, `ObjectivesList`, `RecommendedCourses` | Pendiente |
| 3.6 | Crear `screens/CoachIAScreen.tsx` con 2 tabs | Pendiente |
| 3.7 | Integrar navegacion en `MainApp.tsx` | Pendiente |

---

## 9. Conexion con otros componentes

| Componente | Relacion |
|-----------|----------|
| **01 (Modelo jugador)** | El radar chart lee `area_technique`, `area_tactics`, `area_physical`, `area_mental` de players. Las reglas de actualizacion de estas areas estan en el componente 01. |
| **03 (Algoritmo actualizacion)** | Al actualizar elo_rating tras un partido, las areas se arrastran proporcionalmente (DRAG_FACTOR). |
| **08 (Feedback post-partido)** | El feedback alimenta las areas del jugador valorado (pregunta de area) y los textos escritos construyen `player_ai_profiles` para personalizar recomendaciones en V2. |
| **Modulo de aprendizaje** | Las lecciones diarias actualizan las areas segun las preguntas acertadas/falladas por area. La racha y sesiones alimentan las metricas del tab Plan. |

---

*Fin del documento. Verificar estructura de `tournament_inscriptions` y campos de fecha de `matches` antes de implementar la Fase 2.*
