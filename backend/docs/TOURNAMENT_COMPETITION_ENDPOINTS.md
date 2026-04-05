# Tournament Competition Endpoints

## Objetivo

Este documento cubre el flujo competitivo del torneo para administración (setup, fixture, resultados, podio) y lectura de jugador.

## Formatos soportados (V1)

- `single_elim`
- `group_playoff`
- `round_robin`

## Modelo de resultado

- Reglas en `tournaments.match_rules` (`best_of_sets`, `allow_draws`).
- Resultado por partido con `sets`:
  - `[{ games_a: number, games_b: number }, ...]`
- El ganador se calcula desde sets según `best_of_sets`.

## Endpoints admin

### POST `/tournaments/{id}/competition/setup`

- Configura formato y reglas.
- Body ejemplo:

```json
{
  "format": "group_playoff",
  "match_rules": { "best_of_sets": 3, "allow_draws": false },
  "standings_rules": { "group_size": 4, "qualifiers_per_group": 2 }
}
```

### POST `/tournaments/{id}/competition/generate`

- Genera equipos desde inscripciones confirmadas y crea fixture.
- Respuesta ejemplo:

```json
{ "ok": true, "teams_count": 8, "matches_count": 12 }
```

### GET `/tournaments/{id}/competition/admin-view`

- Vista completa:
  - `teams`
  - `stages`
  - `groups`
  - `matches` (con `result`)
  - `standings`
  - `podium`

### POST `/tournaments/{id}/matches/{matchId}/result`

- Carga resultado de partido por sets.
- Body ejemplo:

```json
{
  "sets": [
    { "games_a": 6, "games_b": 4 },
    { "games_a": 4, "games_b": 6 },
    { "games_a": 6, "games_b": 3 }
  ],
  "override": false
}
```

### PUT `/tournaments/{id}/podium`

- Podio manual.
- Body ejemplo:

```json
{
  "podium": [
    { "position": 1, "team_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "note": "Campeón" },
    { "position": 2, "team_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "note": "Subcampeón" },
    { "position": 3, "team_id": "cccccccc-cccc-cccc-cccc-cccccccccccc", "note": "3er puesto" }
  ]
}
```

## Endpoint jugador (solo lectura)

### GET `/tournaments/{id}/competition/public-view`

- Devuelve estructura competitiva read-only con standings y podio.
- Requiere autenticación de jugador.
- En torneos privados, exige inscripción del jugador.

## Reglas clave

- Solo se genera fixture con mínimo 2 parejas.
- No se sobreescribe un resultado finalizado salvo `override=true`.
- Podio manual valida:
  - posiciones únicas,
  - equipos únicos,
  - equipos pertenecientes al torneo.
