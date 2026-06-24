-- Admins del panel webapp-wechat (gestión app móvil).
-- Separado de public.admins (panel web-app / solicitudes de club).
-- auth_user_id = id del usuario en Supabase Auth (auth.users).

create table if not exists public.mobile_admins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_mobile_admins_auth_user_id on public.mobile_admins (auth_user_id);

comment on table public.mobile_admins is 'Admins del panel webapp-wechat (app móvil). Independiente de public.admins (web-app).';
