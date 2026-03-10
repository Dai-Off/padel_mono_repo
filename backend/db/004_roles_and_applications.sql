alter table public.players
  add column if not exists auth_user_id uuid unique;

comment on column public.players.auth_user_id is 'Usuario Supabase Auth; si está rellenado, este usuario tiene rol jugador';

alter table public.club_owners
  add column if not exists auth_user_id uuid unique;

alter table public.club_owners
  alter column stripe_connect_account_id drop not null;

comment on column public.club_owners.auth_user_id is 'Usuario Supabase Auth; si está rellenado, este usuario tiene rol dueño (puede tener N clubs)';

alter table public.club_applications
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists club_owner_id uuid references public.club_owners(id),
  add column if not exists club_id uuid references public.clubs(id),
  add column if not exists invitation_sent_at timestamptz;

create table if not exists public.club_application_invites (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.club_applications(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_club_application_invites_application_id
  on public.club_application_invites (application_id);

create unique index if not exists idx_club_application_invites_token_hash
  on public.club_application_invites (token_hash);

create index if not exists idx_club_application_invites_expires
  on public.club_application_invites (expires_at);
