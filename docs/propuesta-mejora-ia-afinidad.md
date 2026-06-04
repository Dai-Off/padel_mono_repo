# IA de afinidad — diseño de la búsqueda (estado, cambios y bases)

Fecha: 2026-06-03

Propósito del documento: documentar **cómo funciona** la búsqueda de afinidad,
**qué se ha cambiado** en la iteración actual, y **sentar las bases** de cómo debe
realizarse el matching (parámetros, condiciones y arquitectura), incluyendo el
análisis de si conviene resolverlo con un LLM (n8n) o con un algoritmo
determinista.

Decisión de producto que enmarca todo el diseño: **el objetivo de la búsqueda es
encontrar COMPAÑERO DE PAREJA** (jugar juntos como dueto), no rival ni completar
un grupo de cuatro. Esto condiciona el scoring (prima la complementariedad, no la
mera similitud).

---

## 1. Estado actual del flujo en producción

### 1.1 Flujo
1. El usuario abre el modal de IA de afinidad y, originalmente, rellenaba un
   cuestionario efímero de 4 campos no ligado a su perfil: deporte, cuándo
   (hoy/mañana/semana/finde), hora y estilo.
2. La app construye una frase y la envuelve con un bloque de contexto del jugador
   y la envía al webhook de n8n (`EXPO_PUBLIC_AI_MATCH_WEBHOOK_URL`):
   ```
   CONTEXTO JUGADOR LOGUEADO (ANCLA)
   - player_id / nombre / email / elo_rating / telefono
   SOLICITUD DEL USUARIO
   Quiero buscar un compañero para jugar Pádel. Disponibilidad: ... Estilo
   preferido: ... Dame los mejores jugadores compatibles.
   INSTRUCCION IMPORTANTE
   Usa el jugador logueado como jugador ancla para el matching.
   ```
3. n8n (workflow `agente-tinder-rag.json`, ver `docs/FLUJO-IA-AFINIDAD.md`)
   procesa con un agente GPT-4o + Supabase Vector Store (RAG): genera el embedding
   de la consulta (`text-embedding-3-small`) y llama a la RPC `match_documents`
   (similitud coseno sobre `players_vector`, `topK: 40`, con `filter` opcional por
   `metadata @> filter`); GPT-4o rankea los perfiles recuperados y devuelve el JSON.
4. La app parsea la respuesta a tarjetas: `name`, `matchPercent`, `level`, `stats`
   (partidos, victorias, distancia), `tags`, `reason`. El agente devuelve 2–3
   candidatos. Permite enviar un mensaje directo al candidato.

### 1.2 Limitaciones del estado original
- **No usa los datos reales del jugador**: el cuestionario era efímero e
  independiente de las preferencias ya guardadas en `players`.
- **Datos inventados**: cuando la IA no devuelve cifras, el parser rellena
  `matchPercent`, `distancia` y `stats` con valores por defecto. La "distancia" no
  procede de ninguna geo real: es decorativa.
- **No determinista**: la misma entrada puede producir distinto resultado; el LLM
  propone nombres que después hay que resolver por texto (`searchPlayers`) con
  coincidencia aproximada.
- **Coste y latencia**: cada búsqueda es una llamada a un servicio LLM externo.
- **Sin persistencia ni visibilidad**: el formulario se rellenaba cada vez y no
  existía control de quién entra en las búsquedas de otros.
- **Infrautiliza la información disponible**: ELO/`mu`/`sigma`, preferencias, geo
  de clubes, `match_feedback`, coach IA. Solo enviaba 4 campos + 5 de contexto.

---

## 2. Cambios realizados en esta iteración

Trabajo implementado en la rama `feature/ia-afinidad-mejora` (fases A1–A4):

1. **Los criterios pasan a ser las preferencias del jugador.** Se elimina el
   cuestionario efímero. La búsqueda usa `preferred_days`,
   `preferred_schedule_slots` y `preferred_play_style` (deporte fijo: pádel). Esto
   aporta datos reales y reutilizables y evita repreguntar lo mismo.
2. **Rellenar una vez, luego resultados directos.** Si las preferencias están
   completas, al entrar se autobusca y se muestran resultados; si faltan, un
   mini-formulario las captura y las persiste como preferencias. Reduce fricción y
   queda coherente con el resto de la app.
3. **Visibilidad opt-in.** Nueva columna `players.affinity_visible` (default
   `false`, se activa al primer uso mediante consentimiento de un toque). Un
   jugador solo aparece en las búsquedas de otros si la tiene activa; y no puede
   buscar mientras esté desactivada. Aporta control de privacidad y reciprocidad.
4. **Prompt con la estructura original.** Se mantiene la frase que n8n ya espera;
   solo cambian los valores (días de la semana + franjas en lugar de "hoy/mañana").
   Evita romper n8n mientras se decide la arquitectura definitiva.

Estos cambios **no eliminan** la dependencia del LLM externo para una tarea que,
con datos estructurados, un algoritmo resolvería mejor, más barato y de forma
reproducible. Esa decisión se analiza a continuación.

---

## 3. Análisis: LLM (n8n) frente a algoritmo determinista

### 3.1 Comparativa por criterio

| Criterio | Algoritmo determinista | LLM (n8n) |
|---|---|---|
| Calidad con datos estructurados (nivel, días, franjas, geo, estilo) | Alta y controlable (fórmula explícita) | Variable; no garantiza optimalidad |
| Determinismo / reproducibilidad | Total (mismos criterios → mismos resultados) | Bajo (puede variar; puede inventar) |
| Coste / latencia | Casi nulo (consulta SQL) | Llamada externa por búsqueda |
| Explicación del match | Derivable de los factores (plantilla) | Texto natural rico |
| Datos cualitativos (notas, sensaciones, estilo descrito) | No los interpreta | Sí los interpreta |
| Texto libre del usuario | No | Sí |
| Mantenibilidad / auditoría | Alta (lógica en el repo, testeable) | Lógica fuera del repo, opaca |
| Riesgo de alucinación | Ninguno | Sí (nombres, cifras, distancias) |

### 3.2 Idoneidad del RAG actual para este problema

El workflow actual representa el perfil como texto y rankea por similitud coseno.
Ese enfoque es adecuado para "parecido en general", pero difumina justo lo que
debe ser preciso: "disponible martes por la tarde", "a menos de 5 km" o "ELO
±100" son **umbrales exactos**, no nociones semánticas que un embedding represente
con fiabilidad. Es la causa de que el modelo termine rellenando `distance` y
`matchPercent` de forma aproximada. Un filtro/score determinista trata esas
condiciones como lo que son: aritmética.

### 3.3 Condiciones que justificarían el LLM

Con **solo datos estructurados**, el LLM no aporta nada que un algoritmo no haga
mejor, e introduce coste, variabilidad y datos inventados. El nivel, el solape de
disponibilidad y la cercanía son cálculo puro: un score ponderado los ordena de
forma óptima y explicable.

El LLM solo se justifica si se cumple al menos una de estas condiciones:

- **(a) Datos cualitativos del perfil completo.** Que el matching tenga en cuenta
  lo no numérico: notas de `match_feedback` ("buena compenetración en pista",
  "juega mejor con gente agresiva"), el radar del coach IA (`coach_assessments`:
  técnico/físico/mental/táctico, fortalezas, mejoras) y los comentarios libres
  post-partido. En ese caso, un LLM puede razonar afinidad de estilo y "química"
  más allá del ELO.
- **(b) Búsqueda en lenguaje natural.** Que el usuario pueda escribir libremente
  ("busco a alguien paciente para aprender la volea cerca de casa").

**Estado de esos datos cualitativos:** el pipeline ya existe y está conectado — el
feedback post-partido (`match_feedback`) alimenta al coach IA
(`coach_assessments` / `last-peer-feedback-insight`). Lo que está **aislado es la
propia búsqueda de afinidad**: hoy es un silo independiente (incluso dentro de n8n)
que **no consume** ninguno de esos datos. Por tanto, el trabajo de la Fase 2 no es
construir el pipeline cualitativo (ya está), sino **conectar la afinidad a él**.

La decisión de producto sobre el texto libre es "quizás más adelante"; hoy la
entrada es estructurada.

**Conclusión:** con entrada estructurada y una búsqueda de afinidad que no
aprovecha los datos cualitativos existentes, el algoritmo determinista es la opción
adecuada para el objetivo actual (compañero de pareja). El LLM se reserva para una
segunda fase, cuando la búsqueda de afinidad se conecte a esos datos cualitativos
(feedback post-partido → coach IA), hoy en un silo aparte, y/o se habilite el texto
libre.

---

## 4. Arquitectura recomendada: híbrida por fases

### Fase 1 — Núcleo determinista
El backend calcula el matching con una consulta + scoring. Cubre el objetivo
(compañero de pareja por nivel, disponibilidad, cercanía y estilo) de forma
rápida, barata, reproducible y explicable. n8n deja de ser necesario para esto.

### Fase 2 — Capa IA opcional sobre el shortlist (futuro)
El algoritmo produce un top-N (p. ej. 20). Solo sobre esos N, una capa LLM:
- reordena usando datos cualitativos (notas de feedback, radar del coach,
  compenetración histórica), y/o
- genera la explicación legible de cada match.

Ventajas: coste acotado (LLM solo sobre N), núcleo determinista intacto, y el LLM
se usa solo donde es diferencial. Si la capa IA falla o se desactiva, el algoritmo
sigue dando resultados válidos. En esta arquitectura, n8n/LLM pasa de ser el
"motor de búsqueda" a una "capa de enriquecimiento opcional".

---

## 5. Bases del algoritmo de búsqueda (objetivo: compañero de pareja)

### 5.1 Filtros duros (condiciones absolutas que excluyen candidatos)
- `affinity_visible = true` (opt-in del candidato).
- El candidato no es el propio jugador que busca.
- `status = 'active'`.
- Deporte pádel (cuando exista segmentación de deporte por jugador; hoy implícito).

La disponibilidad **no** es filtro duro: se trata como factor con peso (un solape
nulo penaliza, pero no excluye), para no dejar sin resultados a jugadores con
agendas poco solapadas.

### 5.2 Score ponderado, dependiente del estilo

Cada factor produce un sub-score 0–1; el score final es la suma ponderada. **Los
pesos y la anchura de la banda de nivel dependen del estilo de juego elegido**
(`preferred_play_style`). Siempre se aplica una banda de nivelación; lo que cambia
es cuánto se abre.

| Estilo | Nivel | Disponib. | Cercanía | Estilo/complement. | Banda de nivel |
|---|---|---|---|---|---|
| **competitive** | 45% | 20% | 20% | 15% | **estrecha** (±banda pequeña de ELO; fuera de banda la puntuación cae rápido) |
| **social** | 15% | 30% | 35% | 20% | amplia (el nivel pesa poco) |
| **learning** | 30% | 25% | 25% | 20% | media, con sesgo a igual o superior |
| **balanced** | 35% | 30% | 20% | 15% | media |

(Porcentajes de partida, ajustables tras pruebas.)

Reglas de cada factor:

- **Nivel.** Cercanía de ELO/`mu` evaluada dentro de una banda cuya anchura la fija
  el estilo (estrecha en competitivo, amplia en social). La dirección la modula
  `preferred_partner_level` (`similar` → diferencia ~0; `higher` → premia compañero
  por encima; `lower` → por debajo). La **fiabilidad del nivel** (`sigma`/pocos
  partidos) **ensancha la banda efectiva**: con nivel incierto no se puede exigir
  cercanía estricta, ni siquiera en competitivo.
- **Disponibilidad.** Solape de combinaciones día × franja entre ambos (p. ej.
  Jaccard de `preferred_days` × `preferred_schedule_slots`). Más solape, mejor.
- **Cercanía.** Ver §5.3 (totalmente automática, sin geolocalización del jugador).
- **Estilo y complementariedad.** El estilo del candidato se trata como
  **compatibilidad blanda**, no como filtro: estilos afines suman, estilos opuestos
  restan, pero no excluyen. Para pareja, la **complementariedad de lado**
  (`preferred_side`: drive + revés = bonus; mismo lado = leve penalización; `both`
  neutro) es relevante. También cuenta la coherencia de
  `preferred_match_duration_min`.

Desempate: actividad reciente, fiabilidad del nivel y cercanía.

### 5.3 Cercanía sin geolocalización (automática)

No se añade ningún campo manual de ubicación. La cercanía se deriva por completo de
datos ya existentes o derivables, combinando señales de más a menos fuerte:

1. **Clubes en común** — señal más fuerte: si comparten club, juegan en el mismo
   sitio. Fuente: `favorite_clubs` (y `preferred_club_ids`).
2. **Clubes recientes** — derivados automáticamente del **historial de reservas**
   del jugador (sin intervención del usuario). Reflejan dónde juega realmente y son
   el equivalente a "clubes recientes" de referencias del sector.
3. **Misma zona/ciudad** — derivada de la ciudad/geo (`clubs.lat/lng`) de los
   clubes favoritos y recientes. Permite puntuar proximidad aunque no compartan un
   club exacto.

La cercanía resultante prioriza: club en común > misma zona/ciudad (derivada de
clubes) > sin datos (no puntúa, no bloquea). Un campo estructurado de "dónde juega"
(selección de zona/ciudad o club) queda como **posible semilla futura** para
usuarios sin clubes ni reservas, pero **no se añade ahora**.

### 5.4 Salida
Lista ordenada por score (top-N), cada elemento con: jugador real (id, nombre,
avatar), score normalizado a porcentaje (real, no inventado) y una explicación
derivada de los factores dominantes ("Mismo club y disponibilidad alta los martes y
jueves; nivel muy parecido"). Sin nombres ni cifras alucinadas.

### 5.5 Parámetros y condiciones (resumen)

| Parámetro | Fuente | Uso |
|---|---|---|
| `affinity_visible` | players | Filtro duro |
| `status` | players | Filtro duro |
| `elo_rating` / `mu` / `sigma` | players | Factor nivel + anchura de banda (confianza) |
| `preferred_play_style` | players | Selecciona el perfil de pesos y la banda de nivel |
| `preferred_partner_level` | players | Dirección del factor nivel |
| `preferred_days` / `preferred_schedule_slots` | players | Factor disponibilidad |
| `favorite_clubs` / `preferred_club_ids` | players | Cercanía (clubes en común) |
| Historial de reservas | bookings | Cercanía (clubes recientes, automático) |
| `clubs.lat/lng` / ciudad | clubs | Cercanía (zona derivada) |
| `preferred_side` | players | Complementariedad de pareja |
| `preferred_match_duration_min` | players | Factor estilo (coherencia) |
| `match_feedback` (notas, compenetración) | match_feedback | Fase 2 (LLM) |
| coach IA (radar, fortalezas) | coach_assessments | Fase 2 (LLM) |
| texto libre del usuario | input futuro | Fase 2 (LLM) |

### 5.6 Anti-repetición: ocultar, ya contactado y variedad (PENDIENTE DE DECIDIR)

Con un top-N determinista, las mismas coincidencias aparecerían repetidamente y el
usuario vería siempre a las mismas personas. Para evitarlo se contemplan tres
señales. **No se replica el modelo "ocultar para siempre" de las apps de citas**:
el pool de jugadores es pequeño y los compañeros recurrentes son deseables, por lo
que la exclusión total no encaja.

1. **Ocultar explícito (descarte).** Acción del usuario tipo "Ocultar de mis
   búsquedas" (texto neutro, no "rechazar"). Exclusión fuerte y duradera, pero
   **reversible** desde una lista de "jugadores ocultos" en ajustes.
2. **Ya contactado.** Derivado del historial de mensajes directos. **No excluye**:
   baja la posición en el ranking y muestra una etiqueta ("Ya le escribiste"). Así
   no reaparece siempre arriba, pero sigue disponible para repetir si hubo buena
   compenetración.
3. **Variedad / rotación.** Variar los resultados dentro de una banda de score
   similar (p. ej. no repetir los mostrados en la última sesión) para que la lista
   no sea idéntica en cada apertura, aunque no haya descartes.

Encaje técnico: forma parte del algoritmo (Fase 1). Requiere una tabla nueva
(`affinity_dismissals`: jugador → jugador oculto + fecha) y reutilizar el historial
de mensajes directos. Con el flujo n8n actual habría que pasarle la lista de
exclusión en el prompt, lo que es otra razón para resolverlo en la Fase 1.

---

## 6. Decisiones tomadas y abiertas

Tomadas:
- **Objetivo:** compañero de pareja (prima complementariedad).
- **LLM vs algoritmo:** Fase 1 determinista; el LLM se mantiene conectado por ahora
  y se reserva como capa de enriquecimiento para la Fase 2.
- **Pesos por estilo:** perfiles distintos por `preferred_play_style`, con banda de
  nivel siempre presente y de anchura variable (estrecha en competitivo).
- **Cercanía:** automática (clubes favoritos + recientes de reservas + zona derivada
  de la geo del club). Sin campo manual de ubicación.

Abiertas (a cerrar antes de implementar Fase 1):
1. **Validación de pesos.** Confirmar/ajustar los porcentajes por estilo de la
   tabla §5.2 tras pruebas con datos reales.
2. **Anchura concreta de la banda de nivel** por estilo (valores de ELO) y cómo la
   ensancha `sigma`.
3. **Endpoint.** Confirmar `GET /players/affinity-search` (o `routes/affinity.ts`)
   como ubicación del algoritmo.
4. **Retirada de n8n en Fase 1.** Decidir si se retira del flujo o se deja
   desactivado a la espera de la Fase 2.
5. **Profundidad de la cercanía por reservas.** Ventana temporal de "clubes
   recientes" (p. ej. últimos 90 días) y número de clubes a considerar.
6. **Anti-repetición — "ocultar".** ¿El descarte es indefinido (reversible desde la
   lista de ocultos) o caduca pasado un tiempo?
7. **Anti-repetición — "ya contactado".** Cuánto baja en el ranking y durante cuánto
   tiempo (cooldown), y si la etiqueta "Ya le escribiste" se muestra siempre.
8. **Anti-repetición — variedad.** Estrategia concreta: excluir los mostrados en la
   última sesión, rotar dentro de una banda de score, o una mezcla.

---

## 7. Recomendación

- Implementar el matching de afinidad como **algoritmo determinista en el backend**
  (Fase 1), en su propio módulo. Cubre el objetivo con los factores descritos, es
  barato, rápido, reproducible y explicable, y elimina las alucinaciones.
- **Reservar el LLM para la Fase 2**, cuando la búsqueda de afinidad se conecte a
  los datos cualitativos que **ya existen** (feedback post-partido → coach IA), hoy
  en un silo aparte —incluso en n8n—, y/o se habilite el texto libre. En esa fase el
  LLM actúa como re-ranker/explicador sobre el top-N, no como motor principal.
- Los cambios ya implementados (criterios = preferencias, visibilidad opt-in) son
  la base correcta: el algoritmo de Fase 1 consume exactamente esos mismos campos,
  por lo que no es trabajo desechado.
