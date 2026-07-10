# Season Pass — Banco de misiones S1 (Fase 2, para validar)

> Fecha: 2026-07-10 · Propuesta para revisión antes de codificar evaluadores y
> sembrar. Temporada: 50 niveles = **50.000 SP** para completar, 45 días.
> Regla: **acciones físicas ≫ simples**. Objetivo: 30 partidos = MUY de sobra;
> 15–20 partidos + otras misiones = llega.

---

## 1. Calibración de SP por categoría

| Categoría | Coste real | SP diaria | SP semanal | SP temporada |
|---|---|---|---|---|
| **Física alta** — jugar/ganar partido, liga, matchmaking | €€ + tiempo + esfuerzo | **700** | 2.500 | 7.000 |
| **Física media** — reservar pista, asistir a clase, torneo | € + tiempo | **450** | 1.500 | 4.500 |
| **Simple** — lección diaria (ancla) | esfuerzo bajo | **200** | 700 | 2.000 |
| **Muy simple** — login, comentar, valorar, publicar, tienda | trivial | **100** | 450 | 1.200 |

> Base diaria decidida (2026-07-10): 100 / 200 / 450 / 700. Semanal y temporada
> escalados. Comprobación: quien solo hace lección + acciones simples (sin
> partidos) se queda en ~24.000 → no completa; hace falta actividad física.

**Comprobación del objetivo (aprox):** un partido cuenta a la vez para la diaria
de partido + una semanal + una de temporada → ~1.500 SP efectivos/partido.
- 30 partidos ≈ 33.000 (partidos) + lección (150×45 ≈ 6.750) + reservas/clases/
  comunidad/semanales ≈ 15.000 → **~55.000, sobra**.
- 15–20 partidos ≈ 20.000 + lección + otras + boost racha → **~48–50.000, llega**.

---

## 2. Banco por categoría

Leyenda del evaluador: **✅** ya existe · **🆕** hay que crearlo · **🔶** existe
pero necesita ampliar params.

### 2.1 Learning (simple)
| Misión | Período | SP | condition_key | Eval |
|---|---|---|---|---|
| Completa la lección del día (ancla) | diaria | 150 | daily_lesson | ✅ |
| Consigue ≥60% en la lección | diaria | 180 | lesson_score `{min:60}` | 🆕 |
| Consigue ≥80% en la lección | diaria | 220 | lesson_score `{min:80}` | 🆕 |
| Lección perfecta (5/5) | diaria | 260 | lesson_perfect | 🆕 |
| Completa 5 lecciones esta semana | semanal | 500 | daily_lesson | ✅ |
| ≥80% en 3 lecciones esta semana | semanal | 600 | lesson_score `{min:80}` | 🆕 |
| Completa una lección de curso | semanal | 450 | course_lesson | 🆕 |
| 20 lecciones en la temporada | temporada | 1.400 | daily_lesson | ✅ |
| Completa un curso entero | temporada | 1.800 | course_completed | 🆕 |

### 2.2 Partidos (física alta)
| Misión | Período | SP | condition_key | Eval |
|---|---|---|---|---|
| Juega un partido | diaria | 550 | match_completed | ✅ |
| Gana un partido | diaria | 650 | match_victory | ✅ |
| Gana 2-0 (sin ceder set) | diaria | 700 | match_victory `{straight:true}` | 🆕 |
| Juega con un compañero nuevo | diaria | 600 | match_completed `{new_partner:true}` | 🆕 |
| Juega 3 partidos esta semana | semanal | 2.000 | match_completed | ✅ |
| Gana 2 partidos esta semana | semanal | 2.200 | match_victory | ✅ |
| 3 compañeros distintos | semanal | 1.800 | match_completed `{distinct:partner}` | ✅ |
| Juega 12 partidos en la temporada | temporada | 5.000 | match_completed | ✅ |
| Gana 6 partidos en la temporada | temporada | 5.500 | match_victory | ✅ |
| Racha de 3 victorias | temporada | 4.000 | victory_streak | ✅ |
| 4 partidos con el mismo compañero | temporada | 4.000 | match_completed `{same:partner}` | ✅ |

### 2.3 Liga / Matchmaking (física alta)
| Misión | Período | SP | condition_key | Eval |
|---|---|---|---|---|
| Juega un partido de Liga | diaria | 550 | match_completed `{kind:league}` | ✅ |
| Juega un partido de Matchmaking | diaria | 550 | match_completed `{kind:matchmaking}` | ✅ |
| 2 partidos de Liga esta semana | semanal | 1.800 | match_completed `{kind:league}` | ✅ |
| Termina el mes sin penalizaciones | temporada | 3.500 | zero_matchmaking_faults | ✅ |

### 2.4 Pistas / Reservas (física media)
| Misión | Período | SP | condition_key | Eval |
|---|---|---|---|---|
| Reserva una pista | diaria | 350 | booking_created | ✅ |
| Reserva en un club nuevo | semanal | 1.200 | booking_created `{new_club:true}` | 🆕 |
| Partido en finde | semanal | 1.000 | match_completed `{weekend:true}` | ✅ |
| Partido de noche (>20:00) | semanal | 1.000 | match_completed `{start_after:20:00}` | ✅ |
| Partido de mañana (<14:00) | semanal | 1.000 | match_completed `{start_before:14:00}` | ✅ |
| 6 reservas en la temporada | temporada | 3.000 | booking_created | ✅ |
| Juega en 3 clubes distintos | temporada | 3.500 | match_completed `{distinct:club}` | ✅ |

### 2.5 Clases / Academia (física media)
| Misión | Período | SP | condition_key | Eval |
|---|---|---|---|---|
| Reserva una clase | diaria | 400 | class_booking | ✅ |
| 2 clases esta semana | semanal | 1.300 | class_booking | ✅ |
| 4 clases en la temporada | temporada | 3.500 | class_booking | ✅ |

### 2.6 Torneos (física media/alta)
| Misión | Período | SP | condition_key | Eval |
|---|---|---|---|---|
| Inscríbete en un torneo | semanal | 1.000 | tournament_join | 🆕 |
| Gana un partido de torneo | semanal | 1.500 | tournament_match_win | 🆕 |
| Llega a semifinales | temporada | 4.000 | tournament_stage `{stage:semi}` | 🆕 |

### 2.7 Comunidad / Social (muy simple)
| Misión | Período | SP | condition_key | Eval |
|---|---|---|---|---|
| Comenta en la comunidad | diaria | 60 | community_comment | ✅ |
| Publica en el feed | diaria | 70 | community_post | 🆕 |
| Valora un partido | diaria | 60 | rating_submitted | ✅ |
| Abre la app | diaria | 40 | active_day | ✅ |
| Sigue a un jugador (cuando exista) | diaria | 50 | user_follow | ✅ (inactiva) |
| Comparte (cuando exista) | diaria | 60 | share_external | ✅ (inactiva) |
| 15 días activos en la temporada | temporada | 1.200 | active_day | ✅ |

### 2.8 Tienda (muy simple)
| Misión | Período | SP | condition_key | Eval |
|---|---|---|---|---|
| Realiza una compra | semanal | 400 | store_purchase | 🆕 |

### 2.9 Meta (progresión del propio pase)
| Misión | Período | SP | condition_key | Eval |
|---|---|---|---|---|
| Completa 8 misiones semanales | temporada | 1.800 | missions_completed `{period:weekly}` | ✅ |

---

## 3. Evaluadores nuevos a implementar (Fase 2b)

| condition_key | Qué mide | Fuente | Complejidad |
|---|---|---|---|
| `lesson_score {min}` | ≥X% en la lección | `learning_sessions.score`/correct_count | baja |
| `lesson_perfect` | 5/5 correctas | `learning_sessions.correct_count == total_count` | baja |
| `course_lesson` / `course_completed` | lecciones/cursos de academia | tablas de curso (019/091) | media |
| `match_victory {straight}` | ganar 2-0 sin ceder set | `matches.sets` | media |
| `match_completed {new_partner}` | compañero nunca antes jugado | historial completo de `match_players` | **alta** |
| `booking_created {new_club}` | primera reserva en ese club | historial de `bookings` | media |
| `tournament_join` / `_match_win` / `_stage` | torneos | tablas de torneo (015/023/026) | media |
| `community_post` | publicar en el feed | `community_posts` | baja |
| `store_purchase` | compra en tienda | tabla de pedidos (085/086) | media |

> `new_partner` es el más caro (requiere mirar todo el historial de compañeros).
> Se puede dejar para una segunda tanda si complica.

---

## 4. Cómo se asigna (sin cambios de motor)
El motor de asignación sigue igual: **1 fija (lección) + 3 diarias del pool** por
jugador/día, **6 semanales** por calendario, **todas las mensuales** activas. Con
el pool ampliado hay más variedad en el sorteo. Los `sp_reward` nuevos y las
misiones cualitativas se siembran en `094` (re-seed idempotente).

---

## 5. Pendiente de tu validación
1. **La tabla de SP** (§1) y los valores por misión (§2) — ¿cuadran o ajusto?
2. **Alcance de evaluadores** (§3): ¿implementamos todos, o dejamos `new_partner`
   y torneos/tienda para una segunda tanda?
3. ¿Alguna categoría/misión que quieras añadir o quitar?
