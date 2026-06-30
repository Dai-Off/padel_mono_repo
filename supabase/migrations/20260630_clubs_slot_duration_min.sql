-- Duración de turno por club (minutos). Se toma del alta del club y la usan la
-- app y el backend para generar/validar los turnos (no se fuerza 90 fijo).
alter table public.clubs add column if not exists slot_duration_min integer;

-- Backfill desde la solicitud de alta vinculada.
update public.clubs c
set slot_duration_min = a.slot_duration_min
from public.club_applications a
where a.club_id = c.id
  and c.slot_duration_min is null
  and a.slot_duration_min is not null;

-- Clubes sin dato conservan el comportamiento previo (90 min).
update public.clubs set slot_duration_min = 90 where slot_duration_min is null;
