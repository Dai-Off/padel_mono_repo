-- Estado del jugador para CUALQUIER desbloqueable (las 5 clases).
-- `notified_at` NULL = recién desbloqueado y pendiente de mostrar en el modal
-- global (se marca al mostrarlo). `is_public` controla la visibilidad a otros.

create table if not exists public.player_unlockables (
  player_id     uuid not null references public.players(id) on delete cascade,
  unlockable_id text not null references public.unlockables(id) on delete cascade,
  unlocked_at   timestamptz not null default now(),
  is_public     boolean not null default true,
  notified_at   timestamptz,           -- NULL = pendiente de modal
  progress      numeric,               -- 0-100 si está en progreso (<100)
  primary key (player_id, unlockable_id)
);

create index if not exists idx_player_unlockables_player
  on public.player_unlockables (player_id);

-- Para buscar rápido lo pendiente de notificar de un jugador.
create index if not exists idx_player_unlockables_pending
  on public.player_unlockables (player_id) where notified_at is null;

comment on table public.player_unlockables is
  'Desbloqueables conseguidos por jugador (logros/títulos/marcos/cursos). notified_at NULL = pendiente de modal.';
