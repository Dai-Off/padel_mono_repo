-- Vincula jugadores al CRM de un club (altas manuales desde el panel).
-- Los jugadores con reservas en pistas del club siguen apareciendo aunque no estén aquí.

create table if not exists public.club_player_contacts (
  club_id uuid not null references public.clubs(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (club_id, player_id)
);

create index if not exists idx_club_player_contacts_club on public.club_player_contacts (club_id);
