-- Prize total for tournaments + tournament chat

alter table public.tournaments
  add column if not exists prize_total_cents integer not null default 0;

create table if not exists public.tournament_chat_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  author_user_id uuid not null,
  author_name text not null,
  message text not null
);

create index if not exists idx_tournament_chat_messages_tournament_created
  on public.tournament_chat_messages (tournament_id, created_at);
