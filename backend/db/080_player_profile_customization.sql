-- Personalización equipada por el jugador: título, marco e insignias fijadas.
-- title_id / frame_id NULL = sin título / sin marco (por defecto). Referencian
-- el catálogo unificado `unlockables`. pinned_badge_ids: hasta 4 (validado en API).

create table if not exists public.player_profile_customization (
  player_id        uuid primary key references public.players(id) on delete cascade,
  title_id         text references public.unlockables(id) on delete set null,
  frame_id         text references public.unlockables(id) on delete set null,
  pinned_badge_ids text[] not null default '{}',
  updated_at       timestamptz not null default now()
);

comment on table public.player_profile_customization is
  'Lo que el jugador lleva equipado: título, marco e insignias fijadas (referencian unlockables).';
