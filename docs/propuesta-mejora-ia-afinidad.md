# IA de afinidad — diseño y plan de implementación

Fecha: 2026-06-06

Propósito: documentar **cómo funciona** la búsqueda de afinidad, **qué se ha
cambiado**, y **el plan de implementación** separando claramente el trabajo en
tres frentes: **el repo**, **el workflow de n8n de DEMO** y **el workflow de n8n
de develop (versión final)**.

Decisión de producto que enmarca todo: **el objetivo de la búsqueda es encontrar
COMPAÑERO DE PAREJA** (jugar juntos como dueto), no rival ni completar un grupo de
cuatro. Esto condiciona el scoring (prima la complementariedad, no la mera
similitud).

Estrategia de ramas acordada:
- **DEMO** usa el **workflow de n8n actual** (se mantiene estable).
- **develop** usará un **workflow de n8n mejorado** (muchos mejores matches).
- **El código del flujo final vive solo en develop.** demo no lo necesita, así que
  no lo lleva. demo y develop son ramas distintas y es normal que diverjan
  (develop va por delante); no se fuerza un código idéntico.
- Lo que **sí** conviene mantener sin divergencias gratuitas es la **base común**
  (A1–A4: modal, visibilidad, preferencias), para que los fixes se propaguen.
- El **env** solo lleva la **URL del webhook** (config); no hace falta flag de
  formato.

---

## 1. Estado actual del flujo en producción

1. La app abre el modal de IA de afinidad. Hoy los criterios son las
   **preferencias del jugador** (días, franjas, estilo); ver §2.
2. La app envía un `chatInput` (texto) al webhook de n8n
   (`EXPO_PUBLIC_AI_MATCH_WEBHOOK_URL`): un bloque de contexto del jugador (ANCLA:
   player_id, nombre, email, elo, teléfono) + la solicitud en prosa.
3. n8n (`agente-tinder-rag.json`, ver `docs/FLUJO-IA-AFINIDAD.md`): agente GPT-4o +
   Supabase Vector Store (RAG). Embede la consulta (`text-embedding-3-small`) y
   llama a la RPC `match_documents` (similitud coseno sobre `players_vector`,
   `topK 40`, `filter` por `metadata @> filter`); GPT-4o rankea y devuelve JSON.
4. La app parsea a tarjetas (`name`, `matchPercent`, `level`, `stats`, `tags`,
   `reason`), resuelve el nombre a un jugador real (`searchPlayers`) y permite DM.

### Limitaciones del enfoque RAG actual
- **Datos inventados:** `matchPercent` y `distancia` los rellena el modelo a ojo;
  no hay geo real → la "distancia" es decorativa.
- **No determinista:** misma entrada, distinto resultado; resolución frágil por
  nombre.
- **Coste/latencia:** una llamada LLM externa por búsqueda.
- **Redundancia y mal encaje (importante):** la búsqueda manda los criterios del
  jugador en el prompt **y** esos mismos datos ya están en el vector (el jugador
  también es una fila de `players_vector`). Además, el RAG **embede criterios
  estructurados** (disponibilidad, nivel, distancia) y los compara por similitud
  coseno — un mal encaje para **umbrales exactos** ("martes por la tarde", "ELO
  ±100", "mismo club"), que son aritmética, no semántica.

---

## 2. Cambios ya realizados (rama `feature/ia-afinidad-mejora`)

- **A1–A4 (afinidad):**
  - Criterios = preferencias del jugador (`preferred_days`,
    `preferred_schedule_slots`, `preferred_play_style`; deporte fijo pádel).
  - Rellenar una vez → al entrar, **pantalla previa con botón "Buscar jugadores"**
    (no busca sola: evita gastar tokens por entradas accidentales y permite
    ajustar antes); mini-formulario si faltan preferencias.
  - **Visibilidad opt-in** (`players.affinity_visible`, default `false`): gate de
    activación al primer uso, bloqueo de búsqueda sin visibilidad, y toggle en dos
    sitios — en el modal de resultados (guardado instantáneo) y en Preferencias
    (se guarda con "Guardar", cuenta para el estado *dirty*). Componente de toggle
    compartido con estado optimista (responde al instante visualmente).
  - Prompt manteniendo la estructura original (solo cambian los valores:
    días/franjas en vez de "hoy/mañana").
- **Cableado de perfil:** `play_location`, `gender`, `birth_date`,
  `profile_description` ahora se guardan y devuelven en `PATCH/GET /players/me`
  (antes mobile los enviaba pero el backend los descartaba).
- **Pulido de UX:** padding del botón "Editar preferencias"; el loader aparece de
  inmediato al buscar (sin parpadeo de la pantalla previa); eliminado el botón
  "Cambiar preferencias" del loader (la búsqueda ya es explícita y cancelar no
  recupera los tokens).

Estos cambios son la **base correcta**: la arquitectura final consume exactamente
esos mismos campos, así que no es trabajo desechado.

> Nota de seguridad relacionada (fuera de alcance de afinidad): ver
> `docs/seguridad-pii-endpoints-jugadores.md`.

---

## 3. Análisis: LLM (n8n) frente a algoritmo determinista

### 3.1 Comparativa
| Criterio | Algoritmo determinista | LLM (n8n) |
|---|---|---|
| Calidad con datos estructurados (nivel, días, franjas, geo, estilo) | Alta y controlable | Variable; no garantiza optimalidad |
| Determinismo / reproducibilidad | Total | Bajo (puede variar; puede inventar) |
| Coste / latencia | Casi nulo (consulta SQL) | Llamada externa por búsqueda |
| Explicación del match | Derivable de los factores | Texto natural rico |
| Datos cualitativos (notas, estilo descrito) | No los interpreta | Sí los interpreta |
| Texto libre del usuario | No | Sí |
| Mantenibilidad / auditoría | Alta (en el repo, testeable) | Opaca (fuera del repo) |
| Riesgo de alucinación | Ninguno | Sí |

### 3.2 Conclusión del análisis
Con **datos estructurados**, un algoritmo determinista es superior: el nivel, el
solape de disponibilidad y la cercanía son cálculo puro. El LLM solo aporta valor
cuando hay **(a) datos cualitativos** (notas de `match_feedback`, radar del coach
IA — pipeline que **ya existe y está conectado**; lo que está aislado es la
**búsqueda de afinidad**, que no los consume) o **(b) texto libre** (decisión de
producto: "quizás más adelante").

Por eso la versión final mueve el matching a un **scoring determinista** y reserva
el LLM como **capa de enriquecimiento opcional** (Fase 2).

---

## 4. Arquitectura objetivo (dos workflows + scoring en backend)

```
            DEMO (rama demo)                         develop (versión final)
mobile ──► webhook n8n DEMO                 mobile ──► webhook n8n DEVELOP
            (agente-tinder-rag, RAG)                   │
            └─ match_documents (vector)                ├─► endpoint backend de scoring
            └─ GPT-4o rankea                           │     (determinista; lee players/
            └─ devuelve candidatos                     │      bookings/clubs directamente)
                                                       └─► [Fase 2 opcional] re-rank LLM
                                                            (coach IA / feedback)
```

Claves de la versión final:
- **El scoring determinista vive en un endpoint de backend** (en el repo), no
  dentro de n8n. n8n se mantiene como **orquestador**: llama al endpoint y, en el
  futuro, añade la capa LLM cualitativa **sin que mobile cambie**.
- **Se resuelve la redundancia:** la petición de v2 es **mínima** (basta el
  `player_id`); el backend **lee las preferencias del jugador de la BD** en vez de
  reenviarlas en el prompt. No se vuelven a mandar datos que ya están guardados.
- **Se abandona el embedding para lo estructurado:** el endpoint consulta
  `players`/`bookings`/`clubs` y aplica filtros/score exactos. El vector y los
  embeddings quedan **solo para la Fase 2** (texto libre / similitud cualitativa).
- **Mobile habla con n8n** en ambas ramas; cambia la URL del webhook (env). El
  **código del flujo final** (petición mínima + parseo estructurado) vive **solo en
  develop**; demo conserva su llamada y su parseo actuales.

---

## 5. Reparto del trabajo

### 5.1 Repo

**Base común (ambas ramas; ya en `feature/ia-afinidad-mejora`):**

| Estado | Trabajo | Dónde |
|---|---|---|
| ✅ Hecho | Criterios = preferencias, autobúsqueda, visibilidad opt-in, toggle, cableado de perfil | mobile + backend |

> En la **DEMO**, "Editar preferencias" usa el **mini-formulario de 3 campos**
> (días/franjas/estilo) — coherente con lo único que el flujo de demo consume.
> **No es pendiente para demo.** La edición de *todas* las preferencias desde el
> modal es una mejora de la versión final (ver tabla siguiente), porque solo allí
> el scoring usa el resto de campos.

**Solo develop (código del flujo final; demo no lo lleva):**

| Estado | Trabajo | Dónde | Notas |
|---|---|---|---|
| ⏳ Pendiente | **Endpoint de scoring determinista** (filtros duros + pesos por estilo + cercanía + complementariedad + anti-repetición + visibilidad). Ver §6 | backend | El núcleo de la versión final; lo invoca el workflow develop |
| ⏳ Pendiente | **Petición mínima** (`player_id` [+ texto libre futuro]) + **parseo de respuesta estructurada** (`player_id` + stats reales). Elimina la resolución frágil por nombre | mobile | Resuelve la redundancia |
| ⏳ Pendiente | **Edición de preferencias = fuente única:** "Editar preferencias" abre la **pantalla de Preferencias completa** (todos los campos: lado, nivel de compañero, duración, clubes…); el modal solo **busca**. Sustituye al mini-form de 3 campos de la demo | mobile | El scoring final usa todas las preferencias |
| ⏳ Pendiente | **Anti-repetición:** tabla `affinity_dismissals` + endpoints "ocultar"/listar; "ya contactado" derivado de DMs | backend | Ver §6.6 |
| ⏳ Pendiente | **UI "ocultar"** + lista de ocultos en ajustes | mobile | Acción neutra, reversible |

**Config (ambas ramas):** la URL del webhook por entorno (`EXPO_PUBLIC_AI_MATCH_WEBHOOK_URL`).

**No se toca `sync-player-vector` para la Fase 1.** El scoring determinista lee la
BD directamente, así que **no hace falta enriquecer el vector** con clubes
recientes/zona. Esto, además, mantiene **intacto el embedding que usa el DEMO**
(ver §5.2). El vector queda como está, para la Fase 2.

### 5.2 Workflow de n8n — DEMO (se mantiene estable)

**Objetivo: dejarlo igual.** El repo es retrocompatible: la build de demo apunta a
este webhook (env) y envía el prompt actual; la respuesta se sigue parseando igual.
El mecanismo del workflow está en `docs/FLUJO-IA-AFINIDAD.md`.

**Único cambio recomendado (pequeño, y conviene hacerlo):**
- **Filtro de visibilidad** en el nodo Supabase Vector Store: fijar el *metadata
  filter* a `{"affinity_visible": true}` (se traduce en
  `metadata @> '{"affinity_visible": true}'`, que excluye los `false` y los que no
  tengan el campo) **+ backfill** de `players_vector` (re-sincronizar a todos los
  jugadores una vez para que el flag exista en su `metadata`; con el filtro activo,
  sin backfill **no aparecería nadie**).
- *Por qué:* sin él, el opt-in de visibilidad que ya desplegamos **no oculta a
  nadie** en las búsquedas de demo.
- *Requisito:* que `affinity_visible` esté en `metadata` como booleano. La edge
  function del mono-repo copia toda la fila del jugador a `metadata`, así que lo
  incluye; **verificar qué versión de `sync-player-vector` está desplegada** (hay
  otra copia en `N8N/agente-tinder/...` con `buildContent` selectivo).
- *Si se prefiere congelar el demo al 100% (cero cambios):* es posible, pero la
  visibilidad **no se aplica** en demo (todos visibles). Aceptable para una demo;
  decisión del equipo.

**Supervisar (sin cambiar nada salvo que falle):** el prompt ahora trae días de la
semana + franjas en vez de "hoy/mañana". Al ser un agente LLM, debería entenderlo;
revisar que ningún nodo haga parsing rígido de las palabras antiguas.

**Prueba end-to-end:** jugador A con `affinity_visible = true` y B con `false` →
buscar como un tercero: **A aparece, B no**; activar la visibilidad de B (+ re-sync
de su vector) → **B pasa a aparecer**.

**Importante para no alterar el demo:** **no** enriquecer el `content` (el texto
que se embede) del vector. El flag `affinity_visible` ya viaja en `metadata` (vía
`select('*')`), así que el filtro funciona **sin tocar el embedding** → los
resultados del demo no se desplazan.

### 5.3 Workflow de n8n — develop (versión final)

Flujo objetivo:
1. La build de develop apunta al **webhook develop** (env) y envía una petición
   **mínima** (`player_id` [+ texto libre futuro]).
2. n8n llama al **endpoint de scoring de backend** (§6), que:
   - lee las preferencias del jugador y de los candidatos de la BD,
   - aplica filtros duros (visibilidad, activo, pádel, no-uno-mismo,
     anti-repetición),
   - puntúa por estilo (nivel con banda variable, disponibilidad, cercanía,
     complementariedad),
   - devuelve **candidatos estructurados** (`player_id` real, stats reales, score
     real, `reason` derivada).
3. **(Fase 2, opcional)** n8n re-rankea/explica el top-N con una capa LLM que
   consume los **datos cualitativos** (coach IA / `match_feedback`) — conectando
   por fin la afinidad con ese pipeline.
4. Devuelve a mobile la respuesta estructurada (la parsea el parser tolerante).

Esto elimina la redundancia y el mal encaje del RAG: no se reenvían criterios, no
se usan embeddings para umbrales exactos, y no hay cifras inventadas.

> Decisión abierta: el endpoint de scoring podría llamarlo n8n (recomendado, para
> dejar hueco a la capa LLM de Fase 2) o llamarlo mobile directamente (más simple,
> pero saca a n8n del flujo). Por defecto: lo llama n8n.

---

## 6. Bases del algoritmo de scoring (endpoint de backend, objetivo: pareja)

### 6.1 Filtros duros (excluyen candidatos)
- `affinity_visible = true` (opt-in del candidato).
- No es el propio jugador.
- `status = 'active'`.
- Deporte pádel (cuando exista segmentación por jugador; hoy implícito).
- Exclusiones de anti-repetición (ver §6.6).

La disponibilidad **no** es filtro duro: es un factor con peso (solape nulo
penaliza, no excluye).

### 6.2 Score ponderado, dependiente del estilo
Cada factor da un sub-score 0–1; el total es la suma ponderada. **Los pesos y la
anchura de la banda de nivel dependen de `preferred_play_style`.** Siempre hay
banda de nivelación; cambia cuánto se abre.

| Estilo | Nivel | Disponib. | Cercanía | Estilo/complement. | Banda de nivel |
|---|---|---|---|---|---|
| **competitive** | 45% | 20% | 20% | 15% | **estrecha** (fuera de banda cae rápido) |
| **social** | 15% | 30% | 35% | 20% | amplia |
| **learning** | 30% | 25% | 25% | 20% | media, sesgo a igual o superior |
| **balanced** | 35% | 30% | 20% | 15% | media |

(Porcentajes de partida, ajustables tras pruebas.)

- **Nivel:** cercanía de ELO/`mu` dentro de una banda cuya anchura fija el estilo;
  dirección modulada por `preferred_partner_level`. La **fiabilidad** (`sigma`/pocos
  partidos) **ensancha la banda** (no exigir cercanía estricta con nivel incierto).
- **Disponibilidad:** solape de día × franja (`preferred_days` ×
  `preferred_schedule_slots`).
- **Cercanía:** ver §6.3.
- **Estilo y complementariedad:** estilo afín suma / opuesto resta (no excluye);
  **complementariedad de lado** (`preferred_side`: drive + revés = bonus); coherencia
  de `preferred_match_duration_min`.

Desempate: actividad reciente, fiabilidad, cercanía.

### 6.3 Cercanía sin geolocalización (automática)
Combinando señales de más a menos fuerte:
1. **Clubes en común** (`favorite_clubs` / `preferred_club_ids`).
2. **Clubes recientes** derivados del **historial de reservas** (`bookings`),
   automático.
3. **Misma zona/ciudad** derivada de `clubs.lat/lng`/ciudad de esos clubes.

Sin datos → no puntúa, no bloquea. No se añade campo manual de ubicación (el
`play_location` ya cableado puede servir de semilla futura, no ahora).

### 6.4 Salida
Top-N ordenado, cada uno con jugador real (id, nombre, avatar), score real (no
inventado) y explicación derivada de los factores dominantes.

### 6.5 Parámetros y fuentes
| Parámetro | Fuente | Uso |
|---|---|---|
| `affinity_visible`, `status` | players | Filtros duros |
| `elo_rating`/`mu`/`sigma` | players | Nivel + anchura de banda |
| `preferred_play_style` | players | Perfil de pesos + banda |
| `preferred_partner_level` | players | Dirección del nivel |
| `preferred_days`/`preferred_schedule_slots` | players | Disponibilidad |
| `favorite_clubs`/`preferred_club_ids` | players | Cercanía (clubes comunes) |
| historial de reservas | bookings | Cercanía (clubes recientes) |
| `clubs.lat/lng`/ciudad | clubs | Cercanía (zona) |
| `preferred_side`, `preferred_match_duration_min` | players | Complementariedad |
| `match_feedback`, coach IA, texto libre | match_feedback / coach_assessments / input | **Fase 2 (LLM)** |

### 6.6 Anti-repetición (ocultar, ya contactado, variedad) — PENDIENTE DE DECIDIR
No se replica el "ocultar para siempre" de las apps de citas (pool pequeño;
compañeros recurrentes deseables).
1. **Ocultar explícito:** acción del usuario, exclusión duradera pero **reversible**
   (lista de ocultos en ajustes). Tabla `affinity_dismissals`.
2. **Ya contactado:** derivado de DMs; **no excluye**, baja en ranking + etiqueta.
3. **Variedad:** rotar dentro de una banda de score para que la lista no sea
   idéntica cada vez.

---

## 7. Decisiones tomadas y abiertas

Tomadas:
- Objetivo: compañero de pareja.
- Dos workflows n8n (demo actual / develop mejorado). El **código del flujo final
  vive solo en develop**; demo conserva el actual. El env solo lleva la URL del
  webhook. La base común (A1–A4) se mantiene sin divergencias gratuitas.
- **Edición de preferencias = pantalla de Preferencias** (fuente única) en la
  versión final; el modal solo busca. El mini-form de 3 campos es de la etapa demo.
- **Búsqueda explícita:** la IA de afinidad **no busca al entrar**; muestra una
  pantalla previa con botón "Buscar jugadores" (evita gasto accidental de tokens y
  permite ajustar antes). Aplica a ambas ramas.
- Scoring determinista en **endpoint de backend**; n8n como orquestador; LLM
  reservado para Fase 2 (capa cualitativa sobre el top-N).
- Pesos por estilo con banda de nivel variable; cercanía automática.
- DEMO se mantiene; único cambio recomendado: filtro de visibilidad.

Abiertas:
1. Validación de pesos (§6.2) y anchura concreta de la banda por estilo.
2. ¿El endpoint de scoring lo llama n8n (por defecto) o mobile directo?
3. ¿Se aplica el filtro de visibilidad en el DEMO o se congela al 100%?
4. Ventana temporal de "clubes recientes" (p. ej. 90 días) y nº de clubes.
5. Anti-repetición: caducidad del "ocultar", cooldown del "ya contactado",
   estrategia de variedad.
6. Formato exacto de la petición/respuesta del flujo final (develop).

---

## 8. Próximos pasos sugeridos (orden)

demo (cerrar la demo):
1. **n8n demo:** añadir filtro de visibilidad (o decidir congelarlo al 100%).
2. **Merge** `feature/ia-afinidad-mejora` → `demo` (limpio) + desplegar backend.

develop (flujo final):
3. **backend:** endpoint de scoring determinista (§6) + anti-repetición
   (`affinity_dismissals`).
4. **mobile:** petición mínima (`player_id`) + parseo de respuesta estructurada;
   "Editar preferencias" → pantalla de Preferencias completa; UI "ocultar".
5. **n8n develop:** workflow que llama al endpoint (+ hueco para la Fase 2).

Futuro:
6. **Fase 2:** capa LLM cualitativa (coach IA / feedback) y/o texto libre.
