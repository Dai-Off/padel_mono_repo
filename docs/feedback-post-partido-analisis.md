# Análisis del feedback post-partido (estado actual)

Fecha: 2026-04-19
Alcance: captura de feedback, persistencia, e insight generado por el coach IA a partir de ese feedback.

## 1. Resumen ejecutivo

- **Qué es**: flujo post-partido en el que un jugador valora a sus 3 compañeros de pista (nivel percibido + notas) y deja un comentario final. Datos persistidos en `match_feedback`.
- **Estado de captura**: implementada en mobile (`MatchEvaluationFlow`) + endpoint `POST /matches/:id/feedback`. Ventana de 24 h desde marcador confirmado.
- **Estado de IA**: `GET /players/:id/last-peer-feedback-insight` está implementado (OpenAI con fallback a plantilla) y documentado, pero **ningún cliente (mobile ni web) lo consume**. La IA se genera on-demand, no se muestra.
- **Impacto hoy**: alimenta `match_feedback`, base para nivelación/matchmaking (mig. `014_leveling_matchmaking.sql`). Sin efectos visibles directos para el usuario tras enviar el feedback, más allá de la pantalla de agradecimiento.
- **Gap**: no existe punto de entrada en la app a la tarjeta IA generada. Además la UI captura el marcador pero lo descarta al enviar.

## 2. Qué ve y responde el usuario

Disparador: `PartidoDetailScreen.tsx` abre el modal al apretar "Evaluar partido" (handler en `mobile-app/src/screens/PartidoDetailScreen.tsx:241-280`).

Componente: `mobile-app/src/components/partido/MatchEvaluationFlow.tsx`.

Modal fullscreen con 3 pantallas numeradas (`TOTAL_SECTIONS = 3`, línea 41) más pantalla de éxito.

### Pantalla 1 — Compañeros (líneas 421-514)
Se recorre un sub-paso por cada compañero (hasta 3). Por cada uno:
- Elegir nivel percibido: `Por encima de mi nivel` / `Acertado` / `Por debajo de mi nivel` (`LEVEL_OPTIONS`, líneas 45-54).
- Pregunta rotatoria opcional (`TEAMMATE_EXTRA_QUESTIONS`, líneas 56-59): "¿Qué aspecto destacarías de su juego hoy?" o "¿Cómo ha sido la compenetración en pista?".
- Nota libre opcional (habilitada solo si hay nivel elegido).

Requisito para avanzar: nivel elegido (`canAdvanceTeammate`, línea 227). La nota no es obligatoria.

### Pantalla 2 — Marcador (líneas 516-587)
- Hasta 3 sets, ampliables con +/−.
- Dos inputs numéricos por set (`Nosotros` / `Ellos`), 0-99 (`canAdvanceScore`, líneas 229-237).
- Requisito: al menos un set con ambos valores válidos.

### Pantalla 3 — Comentario final (líneas 589-616)
- TextArea libre con contador de caracteres.
- Pregunta: "¿Cómo ha ido el partido?".
- Botón "Omitir" o "Finalizar" (no es obligatorio escribir).

### Pantalla de éxito (líneas 259-291)
- Mensaje "¡Gracias por evaluar!" + CTA "Volver a inicio".

### Tabla resumen de input del usuario

| Paso | Pantalla | Obligatorio | Tipo input |
|---|---|---|---|
| 1 | Compañero 1-3 | nivel sí, nota no | 3 botones + textarea opcional |
| 2 | Marcador | ≥ 1 set válido | inputs numéricos 0-99 |
| 3 | Comentario | no | textarea libre |
| 4 | Éxito | — | CTA "Volver a inicio" |

Estimación: 60-90 s si el usuario va rápido sin escribir notas. Mínimo estricto: 3 toques (uno por compañero) + 2 dígitos (un set) = ~15-20 s.

## 3. Qué se guarda y en qué afecta

### Endpoint `POST /matches/:id/feedback`
Archivo: `backend/src/routes/matchFeedback.ts` (146 líneas).

Validaciones (líneas 78-127):
- Autenticación por Bearer (`getPlayerIdFromBearer`).
- El jugador debe estar en `match_players` del partido (línea 78-84).
- `matches.score_status` debe ser `'confirmed'` (línea 91).
- Ventana: `Date.now() <= score_confirmed_at + FEEDBACK_WINDOW_HOURS·3600000` (línea 96-99). `FEEDBACK_WINDOW_HOURS = 24` en `lib/levelingConstants`.
- `level_ratings` debe tener exactamente los otros 3 jugadores, `perceived ∈ {-1, 0, 1}`, sin duplicados (líneas 108-121).
- `would_not_repeat_reason` (si `would_repeat === false`) debe ser uno de `REPEAT_REASONS` (línea 125).

Persistencia (líneas 129-139): `upsert` en `match_feedback` con `onConflict: 'match_id,reviewer_id'`.

### Tabla `match_feedback`
Definida en `backend/db/014_leveling_matchmaking.sql:223-234`:

```sql
create table if not exists public.match_feedback (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  reviewer_id uuid not null references public.players(id),
  level_ratings jsonb,
  would_repeat boolean,
  would_not_repeat_reason text,
  comment text,
  created_at timestamptz default now(),
  unique (match_id, reviewer_id)
);
```

Un feedback por jugador por partido (constraint unique).

### Desajustes UI ↔ backend

1. **Marcador descartado**: la pantalla 2 pide sets pero el cliente no los envía. Ver `PartidoDetailScreen.tsx:267-274`, donde solo se mandan `level_ratings` y `comment`. El endpoint tampoco persistiría sets (la tabla no los tiene). El marcador del partido vive aparte en `matches`.
2. **`would_repeat` / `would_not_repeat_reason` no se preguntan**: el backend los acepta y los persiste, pero el UI nunca los solicita. Son columnas que quedarán siempre `null` con el flujo actual.
3. **Notas por compañero sí se envían** como `level_ratings[i].comment`.

### Efectos posteriores

- Migración `014_leveling_matchmaking.sql` indica que `match_feedback` es insumo del sistema de nivelación y matchmaking.
- Alimenta el endpoint de insight IA (§4).
- No dispara notificaciones ni cambios inmediatos visibles al usuario.

## 4. Qué gestiona el coach IA con el feedback

### Endpoint `GET /players/:id/last-peer-feedback-insight`
Archivo: `backend/src/routes/players.ts:665-693`. Documentación completa en `backend/docs/peer-feedback-insight.md` (no se duplica aquí).

Resumen operativo:
- Solo el propio jugador puede consultar su `id` (403 en caso contrario).
- Lee `match_feedback` filtrando `reviewer_id != requester` (excluye autoevaluación), agrupa por `match_id` y elige el partido con el `created_at` más reciente.
- Máximo 1 feedback por reviewer por partido → `peer_count` entre 0 y 3.
- Si no hay datos aplicables → `empty: true` con arrays vacíos.

Campos de respuesta relevantes: `recommendation_ia` (párrafo), `fortalezas` (3 strings), `a_mejorar` (3 strings), `distribution`, `average_perceived`, `last_perceived`, `insight_source`.

### Motor IA
Archivo: `backend/src/lib/openaiPeerFeedbackInsight.ts:53-139`.

- Modelo por defecto: `gpt-4o-mini` (override por `OPENAI_MODEL`).
- `temperature: 0.45`, `response_format: json_object`, timeout 45 s.
- Payload a OpenAI: `{match_id, valoraciones: [{perceived, comment}], distribution, average_perceived}`. **No se envían UUIDs de revisores.**
- Prompt de sistema: coach de pádel amateur/intermedio en España, devuelve exactamente 3 fortalezas y 3 áreas de mejora (~120 caracteres cada una).

### Fallback sin IA
Archivo: `backend/src/services/postMatchPeerFeedbackInsightService.ts:160-251` (`buildPeerFeedbackInsightFromMultiple`).

Se usa cuando no hay `OPENAI_API_KEY`, la llamada falla, hay timeout, o el JSON no cumple el contrato (3+3 strings y recomendación). Texto fijo según distribución:
- Todos +1 → "Consenso positivo".
- Todos -1 → "Por debajo de expectativas".
- Todos 0 → "Línea con lo esperado".
- Mixtos → "Valoraciones distintas".

Campo `insight_source` indica `'openai'` o `'template'`.

### Gap de consumo

```
grep -R "last-peer-feedback" mobile-app web-app → 0 coincidencias
```

El endpoint existe y funciona, pero **no hay UI** que lo pinte. La única sección de "coach IA" visible hoy en la app (`AICoachSection` en perfil) se alimenta de un flujo distinto (§5), no de este insight.

## 5. Lo que NO es feedback post-partido

Para evitar confusión con la sección IA que sí se ve en la app:

- `mobile-app/src/components/profile/AICoachSection.tsx` + `mobile-app/src/screens/ProfileScreen.tsx:35-70`: radar, nivel, fortalezas/mejoras de onboarding.
- Alimentado por `POST /coach-assessment` (`backend/src/routes/coachAssessment.ts`) y servicio `backend/src/services/coachAssessmentService.ts`.
- Cuestionario de 6 preguntas × 4 opciones, se responde **una vez**; se guarda en la tabla `coach_assessments`.
- Sin migración SQL dedicada en `backend/db/` — la tabla solo existe por el código que la usa.

## 6. Flujo real vs. flujo previsto

Flujo real actual:

```
Usuario evalúa partido
    → POST /matches/:id/feedback
        → INSERT match_feedback
            → (fin; el usuario solo ve "Gracias por evaluar")
```

Flujo previsto por la documentación existente:

```
match_feedback
    → GET /players/:id/last-peer-feedback-insight
        → OpenAI o plantilla
            → tarjeta con recomendación + fortalezas + mejoras
                → pintar en perfil / home / post-evaluación   [NO IMPLEMENTADO]
```

## 7. Checklist de verificación end-to-end

1. `cd backend && npx tsc --noEmit` → sin errores.
2. Backend en marcha en local (`cd backend && npm run dev`).
3. Asegurar partido con `score_status = 'confirmed'` y `score_confirmed_at` dentro de las últimas 24 h.
4. Desde el móvil (o `curl`), `POST /matches/:id/feedback` con los 3 `level_ratings`; esperar `{ ok: true }`.
5. Verificar en Supabase:
   ```sql
   select reviewer_id, level_ratings, comment, created_at
   from public.match_feedback
   where match_id = '<MATCH_ID>';
   ```
6. `curl -H "Authorization: Bearer <TOKEN>" http://localhost:3000/players/<PID>/last-peer-feedback-insight`
   - Con `OPENAI_API_KEY` → `insight_source: 'openai'`.
   - Sin ella → `insight_source: 'template'`.
7. Probar que el jugador distinto al `PID` de la URL recibe `403`.
8. En mobile: abrir partido elegible, lanzar `MatchEvaluationFlow`, completar las 3 pantallas, confirmar pantalla de éxito.

## 8. Recomendaciones y preguntas abiertas

No son cambios a ejecutar sin aprobación; son decisiones pendientes que explican el gap actual.

1. **¿Exponer la tarjeta IA al usuario?** Opciones: pantalla post-evaluación inmediata, tarjeta en perfil, tarjeta en home tras partido jugado. Hoy el coste de generar el insight se paga sin que nadie lo vea.
2. **¿Pedir `would_repeat` / `would_not_repeat_reason` en UI?** Backend y tabla ya lo soportan; sería añadir un paso corto o integrarlo en la pantalla 3.
3. **¿Qué hacer con el marcador que la UI captura pero no envía?** O persistirlo (ampliar tabla / otra ruta `matches`) o eliminar la pantalla 2.
4. **Migración SQL para `coach_assessments`** — actualmente la tabla solo "existe" por el código que hace `upsert`. Añadir migración explícita a `backend/db/` para consistencia con el resto del esquema.
5. **Fallback template siempre devuelve el mismo texto** por distribución — si se expone al usuario, considerar variar más las frases o forzar OpenAI.

## 9. Archivos críticos (referencias)

- `backend/src/routes/matchFeedback.ts`
- `backend/db/014_leveling_matchmaking.sql:223-234`
- `backend/src/routes/players.ts:665-693`
- `backend/src/services/postMatchPeerFeedbackInsightService.ts`
- `backend/src/lib/openaiPeerFeedbackInsight.ts`
- `backend/docs/peer-feedback-insight.md` (doc detallada del endpoint IA)
- `backend/src/routes/coachAssessment.ts` (coach IA onboarding, distinto)
- `backend/src/services/coachAssessmentService.ts`
- `mobile-app/src/components/partido/MatchEvaluationFlow.tsx`
- `mobile-app/src/screens/PartidoDetailScreen.tsx:241-280`
- `mobile-app/src/api/matches.ts:263-284` (`submitMatchFeedback`)
- `mobile-app/src/api/coachAssessment.ts`
- `mobile-app/src/components/profile/AICoachSection.tsx`
- `mobile-app/src/screens/ProfileScreen.tsx:35-70`
