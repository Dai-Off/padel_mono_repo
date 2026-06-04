# IA de afinidad — pasos pendientes en n8n

Acciones en **n8n** necesarias para que los cambios ya implementados en el repo
(rama `feature/ia-afinidad-mejora`) queden completos de punta a punta. El repo no
decide a quién se incluye en una búsqueda ni cómo se interpreta el prompt: eso vive
en n8n.

> **Alcance — interino.** Estas acciones mantienen funcionando el flujo n8n actual
> mientras siga siendo el motor de la búsqueda. El diseño objetivo
> (`docs/propuesta-mejora-ia-afinidad.md`) mueve el matching a un algoritmo
> determinista en el backend (Fase 1); cuando eso exista, varias de estas acciones
> dejan de aplicar. Sirven para el **estado actual**, no como inversión a largo
> plazo en n8n.

El flujo completo de n8n está documentado en **`docs/FLUJO-IA-AFINIDAD.md`**
(workflow `agente-tinder-rag.json`: agente GPT-4o + Supabase Vector Store, RPC
`match_documents` con `filter` por `metadata @> filter`, y edge function
`sync-player-vector` que copia la fila del jugador a `players_vector.metadata`).
Aquí solo se detalla lo imprescindible para cada acción.

---

## 1. Filtro de visibilidad (cambio obligatorio)

Se añadió la columna `players.affinity_visible` (boolean, default `false`). Un
jugador solo debe aparecer en los resultados de afinidad de otros si la tiene en
`true`.

**Qué hacer en n8n:** aprovechar el `filter` de `match_documents` (no hace falta
SQL nuevo; el RPC ya filtra por `metadata @> filter`).

- En el nodo **Supabase Vector Store** del workflow, fijar el **metadata filter** a:
  ```json
  { "affinity_visible": true }
  ```
  Esto se traduce en `where metadata @> '{"affinity_visible": true}'`, que
  **excluye** tanto a los `false` como a los que no tengan el campo.
- **El valor ausente queda excluido automáticamente** por la contención jsonb →
  comportamiento seguro por defecto (no visible).
- El jugador "ancla" (el que busca) no se ve afectado: el filtro aplica a los
  candidatos recuperados, no al que lanza la consulta.

> Requisito: que `affinity_visible` esté en `metadata` como booleano. La edge
> function del mono-repo copia toda la fila del jugador a `metadata`, así que lo
> incluye. **Verificar cuál versión está desplegada** (ver `FLUJO-IA-AFINIDAD.md`
> §3): existe otra copia en `N8N/agente-tinder/...` con `buildContent` selectivo;
> asegurarse de que la desplegada lleva el flag en `metadata`.

**Backfill (una vez):** las filas que ya existen en `players_vector` no tendrán
`affinity_visible` en su `metadata` hasta que ese jugador se vuelva a
sincronizar. Para no depender de que cada usuario edite su perfil, conviene
**re-sincronizar todos los jugadores una vez** (re-ejecutar `sync-player-vector`
por cada `player_id`). Si no se hace, con el filtro `@>` activo **nadie sería
visible** hasta su próxima actualización (coherente con el default `false`, pero
conviene saberlo para no creer que el filtro está roto).

---

## 2. Formato de disponibilidad (supervisar / ajustar)

El `chatInput` mantiene **la misma estructura de frase** que antes; solo cambian
los **valores** de la disponibilidad.

**Antes:**
```
Quiero buscar un compañero para jugar Pádel. Disponibilidad: Hoy por la Tarde. Estilo preferido: Competitivo. Dame los mejores jugadores compatibles.
```

**Ahora:**
```
Quiero buscar un compañero para jugar pádel. Disponibilidad: lunes, miércoles y viernes por la tarde y noche. Estilo preferido: competitivo. Dame los mejores jugadores compatibles.
```

Diferencias:
- La disponibilidad pasa de un valor relativo (**"Hoy" / "Mañana" / "Este fin de
  semana"**) a **días de la semana** (lunes…domingo) + **franjas** (mañana,
  tarde, noche, madrugada).
- El **deporte** ya no varía: siempre **"pádel"**.
- El bloque de contexto `CONTEXTO JUGADOR LOGUEADO (ANCLA)` (player_id, nombre,
  email, elo_rating, telefono) y la `INSTRUCCION IMPORTANTE` **no cambian**.

**Qué supervisar en n8n:**

- Si el flujo es un **agente LLM sobre texto libre**, lo más probable es que no
  haga falta tocar nada: entiende "lunes por la tarde" igual que entendía "hoy".
- **Revisar si hay parsing rígido** de las palabras antiguas: algún nodo que
  convierta "Hoy"/"Mañana" en una fecha, o un *system prompt* que instruya a la
  IA a interpretar esos términos. Si existe, **actualizarlo** para entender días
  de la semana + franjas.

---

## 3. Campos adicionales (opcional, solo si se coordina)

Por ahora el prompt **no** envía más campos que antes (no hay regresión). El de
mayor valor a futuro sería **ubicación / clubes favoritos** (`favorite_clubs`),
para poder calcular la "distancia" y priorizar jugadores cercanos. Esto solo
merece la pena si **a la vez** se actualiza n8n para usarlo; añadirlo al prompt
sin soporte en n8n sería ruido. Si se decide hacerlo, se coordina el cambio en
repo (añadir el campo al prompt) y en n8n (consumirlo) en el mismo momento.

---

## 4. Prueba end-to-end (tras los cambios)

1. Jugador A con `affinity_visible = true` y jugador B con `false`.
2. Buscar como un tercero: **A debe aparecer; B no**.
3. Activar la visibilidad de B (y re-sincronizar su vector) → **B pasa a
   aparecer**.
4. Comprobar que una disponibilidad por días/franjas devuelve candidatos
   coherentes (no se rompe respecto al formato anterior).

---

## Estado en el repo

- **Hecho (rama `feature/ia-afinidad-mejora`, fases A1–A4):** columna
  `affinity_visible` + lectura/escritura en `PATCH/GET /players/me`; modelo y
  helper en mobile; modal de afinidad usando preferencias + auto-búsqueda; prompt
  con la estructura original; interruptor de visibilidad (Preferencias + modal),
  auto-activación al primer uso y bloqueo de búsqueda sin visibilidad.
- **Migración `074_player_affinity.sql`:** aplicada en Supabase.
- **Pendiente:** únicamente las acciones de n8n de este documento (filtro de
  visibilidad + backfill + supervisión del formato de disponibilidad).
