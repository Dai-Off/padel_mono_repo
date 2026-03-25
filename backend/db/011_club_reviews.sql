-- Reseñas de jugadores por club (una por jugador y club).

create table if not exists public.club_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  club_id uuid not null references public.clubs(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,

  rating smallint not null
    check (rating >= 1 and rating <= 5),
  comment text
);

create unique index if not exists uq_club_reviews_club_player
  on public.club_reviews (club_id, player_id);

create index if not exists idx_club_reviews_club_id
  on public.club_reviews (club_id);

create index if not exists idx_club_reviews_created_at
  on public.club_reviews (club_id, created_at desc);

comment on table public.club_reviews is 'Valoración y comentario de un jugador sobre un club; máximo una reseña por par (club, jugador).';
