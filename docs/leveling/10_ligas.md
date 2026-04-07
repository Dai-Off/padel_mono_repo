# 10 — Ligas

## Estado de este componente

La vision general y la relacion con otros componentes estan definidas. La mayoria de valores concretos (rangos de LP, numero de ligas, mecanica de reset) estan pendientes de definir.
**NO implementar hasta que las decisiones pendientes esten resueltas.**

---

## 1. Vision objetivo

Las ligas son el sistema de progresion competitiva de WeMatch. Cada jugador pertenece a una liga en cada temporada, y su posicion dentro de ella se determina por los LP (League Points) acumulados jugando partidos de matchmaking.

Las ligas tienen una jerarquia (por ejemplo Bronce → Plata → Oro → Elite) y estan vinculadas al `elo_rating` del jugador — las ligas superiores corresponden a rangos de elo mas altos. Subir de liga requiere acumular suficientes LP. Perder partidos resta LP y puede provocar descenso.

### Que son los LP y que no

- Los LP **solo se ganan y pierden** en partidos de matchmaking competitivos.
- Los partidos abiertos (competitivos o amistosos) **no afectan LP**.
- Los LP son independientes del SP (Season Points). El season pass mide actividad general, las ligas miden progresion competitiva.

### Relacion con temporadas

- Al inicio de cada temporada los LP se resetean (mecanismo exacto pendiente de definir).
- El historial de ligas anteriores se conserva.
- Las ligas y el season pass comparten el concepto de temporada (tabla `seasons` del componente 09) pero son sistemas paralelos.

---

## 2. Relacion con otros componentes

| Componente | Relacion |
|------------|----------|
| 01 — Modelo del jugador | `liga` y `lps` son campos del jugador. El `elo_rating` determina la liga inicial |
| 03 — Algoritmo de actualizacion | Tras un partido de matchmaking, ademas de actualizar `mu`/`elo_rating`, se actualizan los LP |
| 06 — Matchmaking | Filtro preferente por liga con ampliacion automatica a adyacentes (ya documentado alli) |
| 06 — Matchmaking | Penalizacion de LP al rechazar un partido propuesto (ya documentado alli) |
| 06 — Matchmaking | Ajuste de LP en partidos cross-liga (valores pendientes de definir aqui) |
| 09 — Season Pass | Comparten tabla `seasons`. SP y LP son sistemas independientes |

---

## 3. Lo que esta definido

### 3.1 Jerarquia de ligas

Las ligas forman una jerarquia lineal de menor a mayor nivel competitivo. Nombres provisionales:

```
Bronce → Plata → Oro → Elite
```

El numero exacto de ligas y sus nombres estan pendientes de definir. Podrian anadirse subdivisiones (Bronce I, Bronce II, etc.).

### 3.2 Vinculacion liga ↔ elo_rating

Cada liga corresponde a un rango de `elo_rating`. Esto implica:

- La liga inicial de un jugador se determina por su `elo_rating` al completar el cuestionario de nivelacion (componente 04).
- Si el `elo_rating` de un jugador cambia significativamente (por partidos), su liga puede no coincidir con su rango de elo. El mecanismo de reconciliacion esta pendiente (ver decisiones pendientes).

### 3.3 Ganancia y perdida de LP

- **Ganar un partido de matchmaking:** suma LP.
- **Perder un partido de matchmaking:** resta LP.
- **Rechazar un partido propuesto de matchmaking:** resta LP como penalizacion (ya definido en componente 06).

### 3.4 Ascenso y descenso

- Al acumular suficientes LP se asciende a la liga superior.
- Al perder suficientes LP se desciende a la liga inferior.
- Debe existir proteccion contra descenso inmediato tras ascender (pendiente de definir).

### 3.5 Matchmaking cross-liga

Ya definido en componente 06 (seccion 4, filtro de liga):

- Busca primero en la misma liga.
- Amplia automaticamente a ligas adyacentes si no hay suficientes jugadores (sin confirmacion del jugador).
- Nunca se salta mas de una liga de distancia.
- En partidos cross-liga, los LP se ajustan (valores pendientes de definir aqui).

---

## 4. Lo que NO esta definido (decisiones pendientes)

1. **Numero exacto de ligas y nombres definitivos**
2. **Rangos de `elo_rating` para cada liga** — que rango de elo corresponde a Bronce, Plata, etc.
3. **Subdivisiones** — si cada liga tiene divisiones internas (Bronce I, II, III)
4. **LP base por victoria y derrota** — cuantos LP se ganan/pierden por partido
5. **Formula de LP** — si los LP son fijos o varian segun factores (diferencia de elo entre equipos, resultado del partido, etc.)
6. **Ajuste de LP en partidos cross-liga** — cuanto extra gana el jugador de liga inferior al ganar, cuanto extra pierde el de liga superior al perder
7. **Umbrales de ascenso/descenso** — cuantos LP hacen falta para subir, y a cuantos se baja
8. **Proteccion contra descenso** — periodo de gracia tras ascender, LP minimo en la liga mas baja, etc.
9. **Mecanismo de reset al inicio de temporada** — reset total, reset parcial (ej. todos bajan una liga), conservar liga pero resetear LP a 0, etc.
10. **Asignacion de liga inicial** — se determina solo por `elo_rating` del cuestionario, o hay una liga por defecto para jugadores nuevos
11. **Reconciliacion liga vs elo_rating** — que pasa si el elo de un jugador diverge mucho de su liga (ej. jugador con elo de Oro atrapado en Bronce por no jugar matchmaking)
12. **Visibilidad en el perfil** — que ve el jugador sobre su liga (liga actual, LP actuales, LP para ascender, historial)
13. **Recompensas por liga** — si subir de liga da algo (SP, insignia, acceso a algo)
14. **LP minimo** — si los LP pueden ser negativos o tienen suelo en 0

---

## 5. Estructura de datos provisional (sujeta a cambios)

Solo lo minimo para no bloquear otros componentes que ya referencian ligas y LP.

### Campos en `players`

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `liga` | text | Liga actual del jugador (ej. `'bronce'`, `'plata'`, `'oro'`, `'elite'`) |
| `lps` | integer | League Points acumulados en la temporada actual. Default 0 |

### Tabla `player_league_history`

```
player_league_history
├── id          uuid PRIMARY KEY default gen_random_uuid()
├── player_id   uuid NOT NULL references players(id)
├── season_id   uuid NOT NULL references seasons(id)
├── liga        text NOT NULL
├── final_lps   integer NOT NULL
├── highest_liga text NOT NULL
├── created_at  timestamptz default now()
```

Restriccion UNIQUE: `(player_id, season_id)`.

Se crea una fila al finalizar cada temporada para conservar el historial.

### Tabla `leagues` (opcional — si se quieren definir las ligas en DB)

```
leagues
├── id          uuid PRIMARY KEY default gen_random_uuid()
├── name        text NOT NULL UNIQUE
├── "order"     integer NOT NULL
├── elo_min     numeric NOT NULL
├── elo_max     numeric NOT NULL
├── lps_to_promote  integer     ← LP necesarios para ascender
├── lps_to_demote   integer     ← LP por debajo de los cuales se desciende
```

Esta tabla permite configurar ligas sin tocar codigo. Si se decide que las ligas son fijas y pocas, puede ser una constante en el backend en lugar de tabla.
