-- Admins: usuarios que pueden listar, ver, aprobar y rechazar solicitudes de club.
-- auth_user_id = id del usuario en Supabase Auth (auth.users).

create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_admins_auth_user_id on public.admins (auth_user_id);

comment on table public.admins is 'Usuarios con rol admin; pueden gestionar solicitudes de club (listar, aprobar, rechazar).';
