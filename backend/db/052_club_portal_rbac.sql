-- Portal staff: roles configurables por club, permisos por funcionalidad, invitaciones e-mail y miembros (Supabase Auth).

create table if not exists public.club_portal_roles (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null,
  slug text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, slug)
);

create table if not exists public.club_portal_role_permissions (
  role_id uuid not null references public.club_portal_roles (id) on delete cascade,
  permission_key text not null,
  primary key (role_id, permission_key)
);

create table if not exists public.club_portal_invites (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  email text not null,
  club_portal_role_id uuid not null references public.club_portal_roles (id) on delete restrict,
  token_hash text not null,
  expires_at timestamptz not null,
  invited_by_auth_user_id uuid,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_club_portal_invites_token_hash on public.club_portal_invites (token_hash);
create unique index if not exists uq_club_portal_invites_pending_email
  on public.club_portal_invites (club_id, lower(email))
  where accepted_at is null and revoked_at is null;

create table if not exists public.club_portal_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  auth_user_id uuid not null,
  club_portal_role_id uuid not null references public.club_portal_roles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, auth_user_id)
);

create index if not exists idx_club_portal_members_auth on public.club_portal_members (auth_user_id);
create index if not exists idx_club_portal_members_club on public.club_portal_members (club_id);

comment on table public.club_portal_roles is 'Roles de personal del portal web del club (configurables salvo is_system).';
comment on table public.club_portal_role_permissions is 'Permisos por rol (keys estables acordadas con el frontend/backend).';
comment on table public.club_portal_invites is 'Invitación por e-mail al portal del club; token en claro solo en el enlace, token_hash en BD.';
comment on table public.club_portal_members is 'Usuario Supabase vinculado a un club con un rol de portal.';
