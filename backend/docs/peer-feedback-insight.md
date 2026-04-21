# Insight de feedback de compañeros (último partido)

Tarjeta tipo «coach IA»: recomendación, fortalezas y a mejorar según el feedback post-partido del **último** encuentro con valoraciones de compañeros.

## Cómo llamar al endpoint

- **Método y ruta:** `GET /players/{id}/last-peer-feedback-insight`
- **Base URL:** la de tu API (ej. `http://localhost:3000` en local, o la del deploy).
- **Autenticación:** header obligatorio  
  `Authorization: Bearer <access_token>`  
  El token es el de Supabase Auth: mismo que devuelve **`POST /auth/login`** en `session.access_token` (o el que use la app móvil).
- **Parámetro `id`:** UUID del jugador. **Debe ser el del usuario autenticado** (el backend resuelve `player_id` desde el Bearer). Si pedís el insight de otro `id`, responde **403**.

### Obtener tu `player_id`

Si no lo tenés a mano, con el mismo token:

```http
GET /players/me
Authorization: Bearer <access_token>
```

En la respuesta, `player.id` es el valor que va en `{id}` del insight.

### Ejemplo con curl

Sustituí `BASE`, `TOKEN` y `PLAYER_ID` (los dos últimos suelen ser el mismo UUID que `player.id` de `/players/me`).

```bash
curl -sS "${BASE}/players/${PLAYER_ID}/last-peer-feedback-insight" \
  -H "Authorization: Bearer ${TOKEN}"
```

### Códigos HTTP

| Código | Cuerpo | Significado |
|--------|--------|---------------|
| **200** | Objeto insight (ver abajo) | OK |
| **401** | `{ "ok": false, "error": "..." }` | Sin token, token inválido o error de auth |
| **403** | `{ "ok": false, "error": "Solo puedes consultar..." }` | El `id` de la URL no es el del jugador del token |
| **404** | `{ "ok": false, "error": "Player not found" }` | No existe jugador con ese `id` |
| **500** | `{ "ok": false, "error": "..." }` | Error de servidor / Supabase |

### Cuerpo de respuesta (200)

Siempre es un JSON **plano** (el handler hace `res.json(insight)`), sin envoltorio `{ ok: true, data: ... }`. Campos:

| Campo | Tipo | Descripción |
|--------|------|-------------|
| `ok` | `true` | Fijo en respuestas exitosas del servicio |
| `empty` | `boolean` | `true` si no hay feedback de compañeros aplicable |
| `match_id` | `string \| null` | Partido elegido (o `null` si `empty`) |
| `feedback_created_at` | `string \| null` | Último `created_at` de feedback de compañeros en ese partido sobre vos |
| `peer_count` | `number` | Cantidad de compañeros distintos que te valoraron (0–3) |
| `average_perceived` | `number \| null` | Media de `perceived` (-1, 0, 1); `null` si `empty` |
| `distribution` | `{ high, mid, low } \| null` | Conteos de perceived 1 / 0 / -1 en ese partido |
| `last_perceived` | `-1 \| 0 \| 1 \| null` | Resumen por media (orientativo con pocos votos) |
| `recommendation_ia` | `string \| null` | Párrafo principal; `null` si `empty` |
| `fortalezas` | `string[]` | Tres frases (vacío si `empty`) |
| `a_mejorar` | `string[]` | Tres frases (vacío si `empty`) |
| `insight_source` | `'openai' \| 'template' \| null` | Origen del texto; `null` si `empty` |

Ejemplo mínimo con datos:

```json
{
  "ok": true,
  "empty": false,
  "match_id": "b096873a-8b17-4c1e-8ca6-28a1b83a2632",
  "feedback_created_at": "2026-04-17T17:01:27.66635+00:00",
  "peer_count": 1,
  "average_perceived": 1,
  "distribution": { "high": 1, "mid": 0, "low": 0 },
  "last_perceived": 1,
  "recommendation_ia": "…",
  "fortalezas": ["…", "…", "…"],
  "a_mejorar": ["…", "…", "…"],
  "insight_source": "openai"
}
```

Sin feedback aplicable:

```json
{
  "ok": true,
  "empty": true,
  "match_id": null,
  "feedback_created_at": null,
  "peer_count": 0,
  "average_perceived": null,
  "distribution": null,
  "last_perceived": null,
  "recommendation_ia": null,
  "fortalezas": [],
  "a_mejorar": [],
  "insight_source": null
}
```

## Qué es (resumen)

El endpoint arma la tarjeta a partir del **último partido** en el que **otros jugadores** te valoraron en el post-partido (`match_feedback`). Solo el **propio** jugador puede consultar su `id` (si no coincide con el token, **403**).

## De dónde salen los datos

1. Se leen filas de **`match_feedback`** donde **`reviewer_id` ≠ vos** (no cuenta autoevaluación).
2. En cada fila se mira **`level_ratings`**: busca la entrada cuyo **`player_id`** sea el tuyo y lee **`perceived`** (`-1`, `0`, `1`) y **`comment`** opcional (texto recortado en servidor).
3. Se agrupa por **`match_id`**. Se elige el partido cuyo **último** `created_at` de feedback (entre las filas que te incluyen) sea el más reciente.
4. Dentro de ese partido, hay **como máximo una valoración por `reviewer_id`** (si hubiera duplicados, gana la más reciente).
5. Pueden quedar **entre 1 y 3** valoraciones distintas (`peer_count`).

Si no hay ninguna valoración aplicable, la respuesta lleva **`empty: true`** y los campos de texto van vacíos.

## Qué genera la “IA”

El backend rellena:

- **`recommendation_ia`**: párrafo de síntesis y orientación.
- **`fortalezas`**: array de **3** frases.
- **`a_mejorar`**: array de **3** frases.

### Modo OpenAI

Si existe **`OPENAI_API_KEY`** en el entorno del backend, se llama a la API de OpenAI (**Chat Completions**, `response_format: json_object`) con un payload que **no incluye UUIDs de revisores**, solo:

- `match_id` (UUID del partido elegido),
- `valoraciones`: lista de `{ perceived, comment }` por compañero que te valoró en ese partido,
- `distribution`: `{ high, mid, low }` (conteos de `perceived` 1 / 0 / -1),
- `average_perceived`: media redondeada.

Variables útiles:

| Variable            | Obligatoria | Descripción                                      |
|---------------------|------------|--------------------------------------------------|
| `OPENAI_API_KEY`    | Sí (IA)    | Sin ella se usa solo plantilla.                  |
| `OPENAI_MODEL`      | No         | Por defecto `gpt-4o-mini`.                       |

Timeout de la llamada: **45 s**. Errores de red, HTTP no OK o JSON que no cumpla el contrato hacen que se **descarte** la respuesta del modelo.

### Modo plantilla (fallback)

Si **no** hay API key, o la llamada a OpenAI falla, o el JSON no trae `recommendation_ia` y dos listas de **exactamente 3** strings, se usa **`buildPeerFeedbackInsightFromMultiple`**: texto fijo según la distribución de `-1 / 0 / 1` y comentarios unidos.

### Campo `insight_source`

Cuando **`empty` es `false`**:

- **`openai`**: la tarjeta salió del modelo.
- **`template`**: se usó la plantilla (por falta de clave, error o respuesta inválida).

## Código relevante

- Servicio: `src/services/postMatchPeerFeedbackInsightService.ts` (consulta Supabase, agregación, fallback).
- Cliente OpenAI: `src/lib/openaiPeerFeedbackInsight.ts` (prompt, parseo JSON).
- Ruta HTTP: `src/routes/players.ts` → `GET /:id/last-peer-feedback-insight`.

## Relación con el feedback post-partido

Las valoraciones llegan con **`POST /matches/:id/feedback`** (ventana desde marcador confirmado, `level_ratings` con los otros 3 jugadores, etc.). Ese flujo es independiente del insight: el insight **solo lee** lo ya guardado en **`match_feedback`**.
