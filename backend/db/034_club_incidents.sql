-- Incidencias registradas por el club (no-show, cancelación tardía, daños, quejas).

create table if not exists public.club_incidents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  club_id uuid not null references public.clubs(id) on delete cascade,
  subject_player_id uuid not null references public.players(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,

  incident_type text not null
    check (incident_type in ('late_cancel', 'no_show', 'damage', 'complaint')),
  severity text not null
    check (severity in ('low', 'medium', 'high')),

  description text not null,
  cost_cents integer
    check (cost_cents is null or cost_cents >= 0),
  resolution text,

  created_by_auth_user_id text
);

create index if not exists idx_club_incidents_club_created
  on public.club_incidents (club_id, created_at desc);

create index if not exists idx_club_incidents_subject
  on public.club_incidents (subject_player_id);

create index if not exists idx_club_incidents_booking
  on public.club_incidents (booking_id)
  where booking_id is not null;

comment on table public.club_incidents is 'Registro de incidencias de jugadores en el contexto del club (reservas / comportamiento).';
