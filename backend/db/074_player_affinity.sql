-- Visibilidad del jugador en las búsquedas de la IA de afinidad.
-- Desactivada por defecto: el jugador solo aparece en los resultados de otros
-- cuando la activa (se auto-activa al primer uso de la IA de afinidad).
-- El flag se propaga a players_vector.metadata vía la edge function
-- sync-player-vector (que el PATCH /players/me ya dispara), y n8n filtra por él.

alter table public.players
  add column if not exists affinity_visible boolean not null default false;
