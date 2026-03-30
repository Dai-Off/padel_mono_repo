# 04 — Cuestionario inicial

## 1. Visión objetivo

Cuando un jugador se registra por primera vez, completa un cuestionario de nivelación que asigna un `mu` inicial. Sin este paso, el sistema asume `mu = 25` para todos, lo que provoca partidos muy desequilibrados al principio.

El cuestionario es condicional: las preguntas cambian según las respuestas anteriores. Combina dos tipos:
- **Preguntas estimadas** (años jugando, deportes previos) — el usuario puede mentir, se acepta
- **Preguntas específicas de pádel** (reglas, situaciones de juego) — no se pueden falsear sin conocimiento real

Salida: un `mu` inicial en escala OpenSkill (rango ~20–35) que se escribe en `players.mu`.

### Qué está bloqueado hasta completar el cuestionario

Si el jugador no completa el cuestionario, no se le asigna nivel. En ese estado puede:

✅ **Permitido sin completar el cuestionario:**
- Reservar pistas
- Usar el marketplace
- Ver el contenido general de la app

❌ **Bloqueado hasta completar el cuestionario:**
- Unirse a partidos abiertos (competitivos o amistosos)
- Entrar al matchmaking
- Acceder al módulo de aprendizaje (lecciones diarias y cursos)

La app redirige al cuestionario cuando el jugador intenta acceder a cualquier funcionalidad bloqueada.

---

## 2. Estado actual

**Archivo:** `backend/src/routes/players.ts`

No existe ningún endpoint de cuestionario de nivelación.

El campo `mu` no existe en la tabla `players` todavía (ver componente 01). Tampoco existe el boolean `initial_rating_completed` (ver componente 01).

Cuando se crea un jugador via `POST /players` (línea 186), el único campo de nivel es `elo_rating` con valor por defecto `1200` (línea 208). No hay ningún flujo de inicialización de nivel.

---

## 3. Qué hay que cambiar

Ningún endpoint existente se modifica. El cuestionario es un flujo nuevo y aditivo.

El boolean `initial_rating_completed` se añade a la tabla `players` según lo definido en el componente 01. La lógica de bloqueo de funcionalidades lo lee para decidir si el jugador puede acceder.

---

## 4. Qué hay que crear nuevo

### 4.1 Lógica del cuestionario en backend

**Archivo nuevo:** `backend/src/services/onboardingService.ts`

Responsabilidades:
- `getNextQuestion(answers: Answer[])` → pregunta siguiente o `null` si el cuestionario ha terminado
- `calcInitialMu(answers: Answer[])` → float (mu inicial)

### 4.2 Árbol de preguntas (provisional — contenido pendiente de definir)

Las preguntas concretas, el flujo condicional completo y el mapeo exacto de respuestas a `mu` inicial se definen en una fase posterior. Los anclajes a continuación son **provisionales** y deben calibrarse con jugadores reales.

```
P1: ¿Has jugado alguna vez al pádel?
  → NO: P2a (experiencia en otros deportes de raqueta)
  → SÍ: P2b (frecuencia y años)

P2a: ¿Juegas o has jugado a tenis, squash o bádminton?
  → NO: cuestionario termina → mu ≈ 20
  → SÍ: P3a (nivel en ese deporte)

P3a: ¿Durante cuántos años has jugado a ese deporte?
  → < 2 años: mu ≈ 22
  → 2–5 años: mu ≈ 24
  → > 5 años: mu ≈ 26

P2b: ¿Con qué frecuencia juegas al pádel?
  → Menos de 1 vez/semana: P3b
  → 1 o más veces/semana: P3c

P3b: ¿Cuánto tiempo llevas jugando?
  → < 1 año: mu ≈ 24
  → 1–3 años: mu ≈ 26
  → > 3 años: P4 (preguntas específicas)

P3c: ¿Juegas en competiciones (ligas, torneos)?
  → NO: P4 (preguntas específicas)
  → SÍ: P4 + bonus (mu base más alta)

P4: Preguntas específicas de pádel (2–3 preguntas — PENDIENTE DE DEFINIR)
  → Ajuste final de mu según aciertos (±1–2)
```

### 4.3 Anclajes de mu (provisionales — calibrar con datos reales)

| Perfil | mu inicial |
|---|---|
| Sin experiencia en deportes de raqueta | ~20 |
| Experiencia en tenis/squash, sin pádel | ~24 |
| Pádel ocasional (< 2 años, < 1 vez/semana) | ~26 |
| Pádel frecuente sin competición | ~28 |
| Pádel frecuente + competiciones + conocimiento técnico | ~32 |

Los valores se ajustan ±1–2 según aciertos en las preguntas específicas de pádel (P4).

### 4.4 Nueva ruta en backend

**Archivo:** `backend/src/routes/players.ts` (o nuevo `backend/src/routes/onboarding.ts`)

```
POST /players/onboarding
```

**Requiere:** Bearer token (sesión activa)

**Body:**
```json
{
  "answers": [
    { "question_id": "P1", "value": "yes" },
    { "question_id": "P2b", "value": "weekly" },
    ...
  ]
}
```

**Lógica:**
1. Verificar que el jugador existe y que `initial_rating_completed = false`
2. Llamar a `calcInitialMu(answers)`
3. Calcular `elo_rating` inicial con `calcEloRating(mu, sigma_default)`
4. Actualizar `players`: `mu`, `elo_rating`, `initial_rating_completed = true`, `sp` += (SP por completar cuestionario, ver componente 01)
5. Responder con el `elo_rating` visible resultante

**Respuesta:**
```json
{
  "ok": true,
  "elo_rating": 3.2,
  "message": "Nivel inicial asignado"
}
```

**Condiciones:**
- Si `initial_rating_completed` ya es `true`: responder 409 (ya completado)
- Desde la mobile app se llama tras el registro, cuando el jugador intenta acceder a una funcionalidad bloqueada

### 4.5 Registro de respuestas (opcional para calibración)

```
onboarding_answers
├── id          uuid PRIMARY KEY default gen_random_uuid()
├── player_id   uuid NOT NULL references players(id)
├── answers     jsonb NOT NULL
├── mu_assigned float8 NOT NULL
└── created_at  timestamptz default now()
```

Esta tabla es opcional para la funcionalidad core. Útil para calibrar los anclajes con datos reales una vez haya suficientes registros.

---

## 5. Decisiones pendientes

1. **Preguntas concretas de P4 (conocimiento específico de pádel):**
   Hay que definir 2–3 preguntas sobre reglas o situaciones de juego que no se puedan responder correctamente sin haber jugado. Candidatos de ejemplo:
   - ¿Qué pasa si la bola toca el cristal antes de botar en el suelo?
   - ¿Cuántos sets se juegan en un partido estándar?
   - ¿Desde qué posición se saca en pádel?
   _Sin estas preguntas no se puede implementar el flujo completo. Bloquea la implementación de P4._

2. **Mapeo exacto de respuestas → mu:**
   Los anclajes de este documento son provisionales. Deben validarse con jugadores reales. Si los primeros N jugadores muestran distribuciones anómalas, recalibrar antes de activar en producción.
