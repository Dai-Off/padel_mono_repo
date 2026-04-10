# 09 — Season Pass

## ⚠ Estado de este componente

Este componente está pendiente de definir en casi su totalidad.
Solo se conocen las decisiones básicas de arquitectura.
**NO implementar hasta que las decisiones pendientes estén resueltas.**

## 1. Visión objetivo (lo poco que está definido)

Existe un sistema de temporadas. Cada temporada tiene fecha de inicio y fin. Los jugadores acumulan SP (Season Points) durante la temporada. El SP acumulado desbloquea recompensas a lo largo del pase. Al acabar la temporada, el SP se resetea para la siguiente.

El SP se obtiene por cualquier actividad en la app (ver componente 01 para la lista de acciones y sus valores — actualmente pendientes de definir). El `streak_bonus` del módulo de aprendizaje multiplica el SP ganado en todas las acciones mientras la racha esté activa.

## 2. Lo que NO está definido (decisiones pendientes)

1. Duración de cada temporada
2. Número de niveles del pase
3. Qué recompensas hay en cada nivel
4. Si existe distinción entre pase gratuito y pase premium
5. Si existe pase premium: cómo se adquiere y qué desbloquea
6. Si un jugador sin pase activo acumula SP igualmente o no
7. Qué pasa con el SP acumulado al final de la temporada (¿se pierde? ¿se guarda como historial? ¿se convierte en algo?)
8. Si el historial de temporadas anteriores es visible en el perfil
9. Cómo se comunica al jugador cuánto SP tiene y cuánto le falta para el siguiente nivel del pase
10. Si hay eventos especiales dentro de una temporada que den más SP
11. Qué son exactamente las recompensas (descuentos, items, acceso a funcionalidades, cosmético, etc.)
12. Si el SP tiene alguna relación con el elo_rating o son completamente independientes (propuesta: completamente independientes)

## 3. Estructura de datos provisional (sujeta a cambios)

Solo lo mínimo necesario para no bloquear el componente 01 (que ya referencia SP y streak_bonus).

### Tabla `seasons`

```
seasons
├── id          uuid PRIMARY KEY default gen_random_uuid()
├── name        text NOT NULL
├── starts_at   timestamptz NOT NULL
├── ends_at     timestamptz NOT NULL
├── status      text NOT NULL default 'upcoming'   ← 'active' | 'ended' | 'upcoming'
├── created_at  timestamptz default now()
```

### Tabla `player_season_progress`

```
player_season_progress
├── id              uuid PRIMARY KEY default gen_random_uuid()
├── player_id       uuid NOT NULL references players(id)
├── season_id       uuid NOT NULL references seasons(id)
├── sp_accumulated  int4 NOT NULL default 0
├── current_level   int4 NOT NULL default 0
├── updated_at      timestamptz default now()
```

Restricción UNIQUE: `(player_id, season_id)`.

### Relación con `players.sp`

El campo `sp` en la tabla `players` (componente 01) acumula el SP de la temporada activa. Al cambiar de temporada, se archiva en `player_season_progress` y se resetea a 0.

## 4. Dependencias

- **Componente 01:** define qué acciones dan SP y cuánto (valores pendientes)
- **Componente 03:** el pipeline de nivelación puede dar SP (pendiente de definir si los partidos dan SP y cuánto)
- **Módulo de aprendizaje (PRD separado):** define el `streak_bonus` como multiplicador de SP

## 5. Estado actual

No existe nada relacionado con el Season Pass en el repositorio.
