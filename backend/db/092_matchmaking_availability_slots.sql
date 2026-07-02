-- Franjas de disponibilidad disjuntas por jugador en cola (varios días × varios tramos).
-- Sustituye al modelo de ventana única available_from/available_until, que se conservan como
-- derivados (min/max de las franjas) por compatibilidad, índices y TTL.
-- Formato: [{ "start_at": "<iso>", "end_at": "<iso>" }, ...]  (bordes en :00/:30, cada franja >= 90 min).
alter table public.matchmaking_pool
  add column if not exists availability_slots jsonb not null default '[]'::jsonb;

comment on column public.matchmaking_pool.availability_slots is
  'Franjas de disponibilidad del jugador (una o varias por día). Fuente de verdad del horario; el motor busca un hueco de 90 min cubierto por alguna franja de cada jugador. available_from/until son min/max derivados.';

-- Backfill de filas vivas: la ventana única actual pasa a ser una franja.
update public.matchmaking_pool
set availability_slots = jsonb_build_array(
  jsonb_build_object('start_at', available_from, 'end_at', available_until)
)
where jsonb_array_length(availability_slots) = 0
  and available_from is not null
  and available_until is not null;
