-- Configuración de ofertas flash y colecciones de la tienda (mobile-app).

create table if not exists public.store_tienda_settings (
  id smallint primary key default 1 check (id = 1),
  flash_enabled boolean not null default false,
  flash_ends_at timestamptz,
  flash_title text,
  updated_at timestamptz not null default now()
);

insert into public.store_tienda_settings (id, flash_enabled)
values (1, false)
on conflict (id) do nothing;

comment on table public.store_tienda_settings is 'Config global de la tienda mobile (ofertas flash).';

create table if not exists public.store_collections (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  title text not null,
  subtitle text,
  cta_text text,
  image_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0)
);

create index if not exists idx_store_collections_active_sort
  on public.store_collections (is_active, sort_order, created_at desc);

comment on table public.store_collections is 'Colecciones / banners promocionales de la tienda mobile.';

create table if not exists public.store_collection_products (
  collection_id uuid not null references public.store_collections(id) on delete cascade,
  product_id uuid not null references public.store_products(id) on delete cascade,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  primary key (collection_id, product_id)
);

create index if not exists idx_store_collection_products_product
  on public.store_collection_products (product_id);

comment on table public.store_collection_products is 'Productos incluidos en cada colección de la tienda.';
