-- Chats por cancha (portal) + registro de menciones @club (cancha o torneo)

create table if not exists public.court_chat_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  court_id uuid not null references public.courts(id) on delete cascade,
  author_user_id uuid not null,
  author_name text not null,
  message text not null
);

create index if not exists idx_court_chat_messages_court_created
  on public.court_chat_messages (court_id, created_at);

create table if not exists public.club_chat_mentions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  source_type text not null,
  court_id uuid references public.courts(id) on delete set null,
  tournament_id uuid references public.tournaments(id) on delete set null,
  source_message_id uuid not null,
  author_user_id uuid not null,
  author_name text not null,
  message text not null,
  constraint club_chat_mentions_source_type_ck check (source_type in ('court', 'tournament')),
  constraint club_chat_mentions_source_fk_ck check (
    (source_type = 'court' and court_id is not null and tournament_id is null)
    or (source_type = 'tournament' and tournament_id is not null and court_id is null)
  )
);

create index if not exists idx_club_chat_mentions_club_created
  on public.club_chat_mentions (club_id, created_at desc);
