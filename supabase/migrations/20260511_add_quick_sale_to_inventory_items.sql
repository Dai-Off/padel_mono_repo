create table if not exists public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, name)
);

alter table if exists public.inventory_categories enable row level security;

alter table if exists public.inventory_items
  add column if not exists category_id uuid references public.inventory_categories(id) on delete set null;

alter table if exists public.inventory_items
  add column if not exists quick_sale_enabled boolean not null default false;

create index if not exists idx_inventory_categories_club_id
  on public.inventory_categories (club_id);

create index if not exists idx_inventory_items_category_id
  on public.inventory_items (category_id);
