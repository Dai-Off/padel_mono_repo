-- Mensajes directos entre jugadores (mobile app)

create table if not exists public.player_direct_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sender_player_id uuid not null references public.players (id) on delete cascade,
  recipient_player_id uuid not null references public.players (id) on delete cascade,
  body text not null,
  read_at timestamptz null,
  constraint player_direct_messages_no_self check (sender_player_id <> recipient_player_id),
  constraint player_direct_messages_body_nonempty check (char_length(trim(body)) > 0)
);

create index if not exists idx_player_direct_messages_pair_created
  on public.player_direct_messages (sender_player_id, recipient_player_id, created_at desc);

create index if not exists idx_player_direct_messages_recipient_unread
  on public.player_direct_messages (recipient_player_id)
  where read_at is null;

create index if not exists idx_player_direct_messages_involving_player
  on public.player_direct_messages (sender_player_id, created_at desc);

create index if not exists idx_player_direct_messages_involving_player_recipient
  on public.player_direct_messages (recipient_player_id, created_at desc);
