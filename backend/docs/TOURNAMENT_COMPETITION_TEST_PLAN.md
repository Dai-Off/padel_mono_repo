# Tournament Competition Test Plan (V1)

## Setup and generation

1. Crear torneo con `registration_mode=pair`.
2. Confirmar al menos 4 inscripciones completas (2 jugadores por pareja).
3. Ejecutar `POST /competition/setup` con cada formato:
   - `single_elim`
   - `group_playoff`
   - `round_robin`
4. Ejecutar `POST /competition/generate`.
5. Verificar `teams_count` y `matches_count > 0`.

## Match result validation

1. Enviar resultado válido `best_of_sets=3`:
   - `6-4, 4-6, 6-2` -> debe guardar.
2. Enviar resultado inválido sin ganador final:
   - `6-4, 4-6` -> debe devolver 400.
3. Repetir carga en partido finalizado:
   - sin `override` -> 400.
   - con `override=true` -> debe permitir corrección.

## Standings

1. En formatos `round_robin` y `group_playoff`, cargar múltiples resultados.
2. Confirmar que `standings` cambia tras cada resultado.
3. Verificar desempate básico:
   - puntos,
   - diferencia de sets,
   - diferencia de games.

## Podio manual

1. Guardar podio válido posiciones 1/2/3.
2. Intentar repetir equipo en dos posiciones -> 400.
3. Intentar usar equipo de otro torneo -> 400.

## Player read-only

1. Torneo público:
   - jugador autenticado consulta `/competition/public-view` -> 200.
2. Torneo privado:
   - jugador no inscrito -> 403.
   - jugador inscrito -> 200.
