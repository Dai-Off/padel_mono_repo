-- Añade slot_index (0-3) a match_players para que el jugador se una en la plaza elegida.
-- Slot 0-1: equipo A, slot 2-3: equipo B.
alter table public.match_players
  add column if not exists slot_index smallint
  check (slot_index is null or (slot_index >= 0 and slot_index <= 3));

create unique index if not exists uq_match_players_match_slot
  on public.match_players (match_id, slot_index)
  where slot_index is not null;
