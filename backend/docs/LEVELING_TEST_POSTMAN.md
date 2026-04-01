# Prueba en Postman: 4 jugadores + partido + marcador + nivelación

**Base URL del API:** `http://localhost:3000` (o tu `PORT` en `.env`)

**Contraseña para todos:** `Prueba123!`

**Emails de prueba:**

| Jugador | Email                 | Rol en el flujo      |
|--------|------------------------|----------------------|
| P1     | `leveltest1@padel.local` | Organizador / equipo A |
| P2     | `leveltest2@padel.local` | Equipo A             |
| P3     | `leveltest3@padel.local` | Equipo B (confirma marcador) |
| P4     | `leveltest4@padel.local` | Equipo B             |

En Postman crea variables de colección: `base_url`, `token_p1`…`token_p4`, `match_id`, `court_id` (UUID de una pista real de tu BD).

---

## 0. Supabase (una vez)

1. Aplica la migración `backend/db/014_leveling_matchmaking.sql` si aún no lo hiciste.
2. Si tras registrar no puedes hacer login por email sin confirmar, ejecuta el **bloque A** de `backend/db/seed_leveling_test_players.sql` en el SQL Editor.

---

## 1. Registrar los 4 jugadores

Misma petición cuatro veces cambiando el email.

```http
POST {{base_url}}/auth/register
Content-Type: application/json

{
  "email": "leveltest1@padel.local",
  "password": "Prueba123!",
  "name": "Level Test Uno"
}
```

Repite con `leveltest2@padel.local` … `leveltest4@padel.local` (nombres distintos si quieres).

---

## 2. Login (guardar `access_token` por jugador)

```http
POST {{base_url}}/auth/login
Content-Type: application/json

{
  "email": "leveltest1@padel.local",
  "password": "Prueba123!"
}
```

Copia `session.access_token` a `token_p1`. Repite para P2–P4 → `token_p2`, `token_p3`, `token_p4`.

---

## 3. Onboarding (obligatorio para partidos competitivos)

**Opción A — API (cuestionario completo, rama “sí juego al pádel”):**

```http
POST {{base_url}}/players/onboarding
Authorization: Bearer {{token_p1}}
Content-Type: application/json

{
  "answers": [
    { "question_id": "played_padel", "value": "yes" },
    { "question_id": "padel_freq", "value": "high" },
    { "question_id": "padel_comp", "value": "no" },
    { "question_id": "padel_skill", "value": "mid" }
  ]
}
```

Repite con `token_p2`, `token_p3`, `token_p4`.

**Opción B — SQL rápido:** bloque B en `backend/db/seed_leveling_test_players.sql`.

---

## 4. Obtener IDs de jugador y pista

```http
GET {{base_url}}/players/me
Authorization: Bearer {{token_p1}}
```

Anota `player.id` como `id_p1`. Igual para P2–P4.

Obtén un `court_id` válido (SQL o tu panel), por ejemplo:

```sql
SELECT id, club_id FROM public.courts LIMIT 1;
```

Guárdalo en Postman como `court_id`.

---

## 5. Crear partido + reserva (organizador P1)

Ajusta fechas a un hueco libre de esa pista (ISO 8601).

```http
POST {{base_url}}/matches/create-with-booking
Content-Type: application/json

{
  "court_id": "{{court_id}}",
  "organizer_player_id": "{{id_p1}}",
  "start_at": "2026-04-15T10:00:00.000Z",
  "end_at": "2026-04-15T11:30:00.000Z",
  "total_price_cents": 4000,
  "timezone": "Europe/Madrid",
  "visibility": "private",
  "competitive": true,
  "type": "open"
}
```

Respuesta: guarda `match.id` en `match_id`. El organizador ya queda en `match_players` (slot 0, equipo A).

---

## 6. Añadir P2, P3, P4 al partido (sin pasarela)

`invite_status` por defecto es `accepted`. Usa `slot_index` 1–3 (el organizador suele ocupar 0).

**P2 — equipo A, plaza 1**

```http
POST {{base_url}}/match-players
Content-Type: application/json

{
  "match_id": "{{match_id}}",
  "player_id": "{{id_p2}}",
  "team": "A",
  "slot_index": 1,
  "invite_status": "accepted"
}
```

**P3 — equipo B, plaza 2**

```http
POST {{base_url}}/match-players
Content-Type: application/json

{
  "match_id": "{{match_id}}",
  "player_id": "{{id_p3}}",
  "team": "B",
  "slot_index": 2,
  "invite_status": "accepted"
}
```

**P4 — equipo B, plaza 3**

```http
POST {{base_url}}/match-players
Content-Type: application/json

{
  "match_id": "{{match_id}}",
  "player_id": "{{id_p4}}",
  "team": "B",
  "slot_index": 3,
  "invite_status": "accepted"
}
```

Si el organizador no tiene `slot_index = 0`, actualízalo en SQL:

```sql
UPDATE public.match_players SET slot_index = 0 WHERE match_id = 'MATCH_UUID' AND player_id = 'P1_UUID';
```

Alternativa: bloque C en `backend/db/seed_leveling_test_players.sql`.

---

## 7. Asegurar estado del partido para jugar

Para probar marcador, el partido debería estar “jugable” según tu negocio (`matches.status`, pago del booking, etc.). Si hace falta:

```sql
UPDATE public.matches SET status = 'in_progress' WHERE id = 'c124c5a5-d8d5-416c-866e-7cdf8b855db4';
UPDATE public.bookings SET status = 'confirmed' WHERE id = (SELECT booking_id FROM matches WHERE id = 'MATCH_UUID');
```

---

## 8. Flujo de marcador (P1 propone, P3 confirma)

**Proponer (P1, equipo A):**

```http
POST {{base_url}}/matches/{{match_id}}/score
Authorization: Bearer {{token_p1}}
Content-Type: application/json

{
  "sets": [{ "a": 6, "b": 4 }, { "a": 6, "b": 3 }],
  "match_end_reason": "completed"
}
```

**Confirmar (P3 o P4, equipo B):**

```http
POST {{base_url}}/matches/{{match_id}}/score/confirm
Authorization: Bearer {{token_p3}}
Content-Type: application/json
```

Si todo va bien y el partido es competitivo, el backend ejecuta el pipeline de nivelación y el antifraude en segundo plano.

---

## 9. Comprobar jugador / stats

```http
GET {{base_url}}/players/me
Authorization: Bearer {{token_p1}}
```

```http
GET {{base_url}}/players/{{id_p1}}/stats
```

---

## 10. Feedback (opcional, ventana 24 h)

Sustituye los UUID por los otros tres jugadores del partido.

```http
POST {{base_url}}/matches/{{match_id}}/feedback
Authorization: Bearer {{token_p3}}
Content-Type: application/json

{
  "level_ratings": [
    { "player_id": "{{id_p1}}", "perceived": 0, "comment": null },
    { "player_id": "{{id_p2}}", "perceived": 0, "comment": null },
    { "player_id": "{{id_p4}}", "perceived": 0, "comment": null }
  ],
  "would_repeat": true
}
```

---

## Disputa (opcional)

- `POST /matches/{{match_id}}/score/dispute` (Bearer jugador equipo B o A según reglas) + body con `sets`.
- `POST /matches/{{match_id}}/score/resolve` (Bearer equipo que propuso primero) + `{ "accept": true|false }`.

---

## Errores frecuentes

| Error | Qué revisar |
|--------|-------------|
| Email no confirmado | Bloque A en `seed_leveling_test_players.sql` |
| 403 onboarding | `POST /players/onboarding` o bloque B SQL |
| 409 marcador | `score_status` debe ser `pending` para la primera propuesta |
| Pipeline / RPC | Función `apply_leveling_pipeline` desplegada y `SUPABASE_SERVICE_ROLE_KEY` en `.env` |
| 4 jugadores / equipos | Exactamente 4 filas en `match_players`, 2×2 equipos A/B |

---

## Job automático (local)

```bash
cd backend && npm run jobs:leveling
```

Requiere las mismas variables de entorno que el servidor.
