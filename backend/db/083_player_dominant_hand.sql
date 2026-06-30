-- Mano preferida (hábil) del jugador, para la card de preferencias del perfil.
-- left | right; null = sin definir (no se fuerza un valor por defecto).
alter table public.players
  add column if not exists dominant_hand text
    check (dominant_hand is null or dominant_hand in ('left', 'right'));

comment on column public.players.dominant_hand is
  'Mano preferida/hábil del jugador (left|right). null = sin definir. Se muestra en el perfil.';
