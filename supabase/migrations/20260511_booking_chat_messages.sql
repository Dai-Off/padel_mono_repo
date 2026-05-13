-- Chats por turno (reserva) en lugar de por cancha.
-- Cada booking representa un chat distinto (Pista X · YYYY-MM-DD HH:mm).

create table if not exists public.booking_chat_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  author_user_id uuid not null,
  author_name text not null,
  message text not null
);

create index if not exists idx_booking_chat_messages_booking_created
  on public.booking_chat_messages (booking_id, created_at);

-- Permite que una mención @club provenga del chat de un turno.
alter table public.club_chat_mentions
  add column if not exists booking_id uuid references public.bookings(id) on delete set null;

alter table public.club_chat_mentions
  drop constraint if exists club_chat_mentions_source_type_ck;
alter table public.club_chat_mentions
  add constraint club_chat_mentions_source_type_ck
    check (source_type in ('booking', 'court', 'tournament'));

alter table public.club_chat_mentions
  drop constraint if exists club_chat_mentions_source_fk_ck;
alter table public.club_chat_mentions
  add constraint club_chat_mentions_source_fk_ck
    check (
      (source_type = 'booking' and booking_id is not null and court_id is null and tournament_id is null)
      or (source_type = 'court' and court_id is not null and booking_id is null and tournament_id is null)
      or (source_type = 'tournament' and tournament_id is not null and booking_id is null and court_id is null)
    );

create index if not exists idx_club_chat_mentions_booking
  on public.club_chat_mentions (booking_id, created_at desc);
