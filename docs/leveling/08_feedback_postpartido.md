# 08 — Feedback post-partido

## 1. Visión objetivo

Al terminar un partido (cuando `score_status` pasa a `confirmed`), se invita a cada jugador a completar un formulario de feedback de **2 pasos**.

**Regla general para v1: el feedback es informativo, no modifica `elo_rating` ni `mu`.** Se almacena para:
- Calibrar los anclajes del cuestionario inicial (componente 04)
- Detectar desajustes de nivel entre lo calculado y lo percibido
- Alimentar el coach IA con contexto cualitativo

La integración directa del feedback con el sistema de nivelación es una decisión de v2.

---

## 2. Estado actual

No existe ningún sistema de feedback post-partido. No hay tablas ni rutas relacionadas.

El punto de integración es la respuesta de `POST /matches/:id/score/confirm` (componente 05), que incluye `request_feedback: true` para indicar a la app que muestre el formulario.

---

## 3. Qué hay que cambiar

Ningún archivo existente se modifica.

---

## 4. Qué hay que crear nuevo

### 4.1 Tabla `match_feedback` en Supabase

```
match_feedback
├── id                        uuid PRIMARY KEY default gen_random_uuid()
├── match_id                  uuid NOT NULL references matches(id)
├── reviewer_id               uuid NOT NULL references players(id)
├── level_ratings             jsonb       ← Paso 1: valoración por jugador
├── would_repeat              boolean     ← Paso 2: ¿volverías a jugar?
├── would_not_repeat_reason   text        ← Paso 2: razón si would_repeat=false
├── comment                   text        ← Paso 2: opinión personal del partido
├── created_at                timestamptz default now()
```

Restricción UNIQUE: `(match_id, reviewer_id)` — cada jugador solo envía un formulario por partido.

> **Nota sobre nivel por áreas (Bloque B):** Este bloque solo tiene sentido si el sistema implementa nivel desglosado por áreas técnica/táctica/físico/mental, que actualmente no está definido. No implementar hasta que el nivel por áreas esté definido.

### 4.2 Estructura del formulario

---

#### Paso 1 — Valoración por jugador (una pantalla por jugador)

El reviewer completa una pantalla por cada uno de los otros 3 jugadores (1 compañero + 2 rivales). Cada pantalla tiene:

- **Pregunta de nivelación:** ¿Su nivel fue...?
  Opciones: **Más bajo de lo esperado** / **Correcto** / **Más alto de lo esperado**
- **Campo de texto abierto:** respuesta extendida sobre el nivel de ese jugador (opcional)

3 pantallas en total, una por jugador.

Se almacena en `level_ratings` como:
```json
[
  {
    "player_id": "uuid-compañero",
    "perceived": 0,
    "comment": "texto opcional sobre este jugador"
  },
  {
    "player_id": "uuid-rival-1",
    "perceived": 1,
    "comment": null
  },
  {
    "player_id": "uuid-rival-2",
    "perceived": -1,
    "comment": "Le costaba mucho la volea"
  }
]
```

Valores de `perceived`: `-1` (más bajo de lo esperado) / `0` (correcto) / `1` (más alto de lo esperado).

---

#### Paso 2 — Valoración del partido (una sola pantalla)

Dos elementos en la misma pantalla:

**1. ¿Volverías a jugar este partido tal cual?** (boolean)

Si la respuesta es **No**, desplegar opciones de seguimiento:
- No, los rivales estaban muy por encima/debajo de mi nivel
- No, mi pareja no estaba a mi nivel
- No, el partido fue muy desequilibrado desde el principio
- No, por el horario o la pista
- Otra razón (texto libre)

Se almacena en `would_repeat` (boolean) y `would_not_repeat_reason` (text, solo si false).

**2. Opinión personal del partido** (campo abierto, siempre visible debajo de la pregunta anterior)

El jugador puede escribir extensamente sobre cómo fue el partido. Campo de texto sin límite definido.

Se almacena en `comment`.

---

### 4.3 Nuevas rutas

**Archivo:** `backend/src/routes/matchFeedback.ts` (nuevo) o integrado en `matches.ts`.

---

#### `POST /matches/:id/feedback`

**Requiere:** Bearer token.

**Body:**
```json
{
  "level_ratings": [
    {
      "player_id": "uuid",
      "perceived": 1,
      "comment": "texto opcional"
    },
    {
      "player_id": "uuid",
      "perceived": 0,
      "comment": null
    },
    {
      "player_id": "uuid",
      "perceived": -1,
      "comment": null
    }
  ],
  "would_repeat": false,
  "would_not_repeat_reason": "rivals_above",
  "comment": "Texto libre sobre el partido"
}
```

**Lógica:**
1. Verificar que el jugador pertenece al partido
2. Verificar que `score_status = 'confirmed'`
3. Si se incluye `level_ratings`: verificar que los `player_id` son los otros 3 jugadores del partido
4. Verificar que el feedback está dentro de la ventana de tiempo permitida (X horas desde `confirmed`)
5. Upsert en `match_feedback` (idempotente — el jugador puede actualizar su feedback dentro de la ventana)
6. Actualizar `sp` del jugador (SP por dar feedback, ver componente 01)
7. Responder 200 OK

---

#### `GET /players/:id/feedback-summary`

Solo lectura. No modifica datos.

**Respuesta:**
```json
{
  "ok": true,
  "average_perceived_level": 0.4,
  "total_ratings": 24,
  "vs_elo_rating": 3.2,
  "perceived_elo_estimate": 3.8,
  "difference": 0.6
}
```

`perceived_elo_estimate` es una estimación de lo que los rivales perciben del nivel del jugador, calculada a partir de los `level_ratings` acumulados. Solo es orientativa — en v1 no afecta al `elo_rating` real.

---

### 4.4 Integración con componente 05

En la respuesta de `POST /matches/:id/score/confirm`:
```json
{
  "ok": true,
  "score_status": "confirmed",
  "request_feedback": true
}
```

La app decide si mostrar el formulario de forma inmediata o como notificación diferida.

---

## 5. Decisiones pendientes

1. **Ventana de tiempo para enviar feedback:**
   - Sugerencia: 24 horas desde `confirmed`.
   - _No bloquea la implementación inicial._

2. **Peso del feedback en v2 (si se integra con el rating):**
   - En v1: puramente informativo.
   - En v2: ajuste suave si el consenso de `level_ratings` persiste en la misma dirección durante N partidos.
   - Peso sugerido: 5–10% del delta de `mu`, solo con consenso entre los 3 valoradores.
   - _No bloquea v1._

3. **Incentivo para completar el feedback:**
   - El SP por dar feedback se define en componente 01 (tabla de acciones SP, pendiente).
   - Voluntario en v1. En el futuro podría dar un badge o acceso a estadísticas adicionales.
