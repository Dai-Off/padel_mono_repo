-- Tienda de plataforma (webapp-wechat / mobile-app). Independiente del inventario de clubes.

create table if not exists public.store_products (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  brand text,
  description text,
  category text not null
    check (category in ('palas', 'pelotas', 'calzado', 'ropa', 'accesorios')),
  sku text unique,
  price_cents integer not null check (price_cents >= 0),
  compare_at_price_cents integer check (compare_at_price_cents is null or compare_at_price_cents >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  image_url text,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  is_flash_deal boolean not null default false,
  sort_order integer not null default 0
);

create index if not exists idx_store_products_category on public.store_products (category);
create index if not exists idx_store_products_active on public.store_products (is_active) where is_active = true;
create index if not exists idx_store_products_sort on public.store_products (sort_order, created_at desc);

comment on table public.store_products is 'Catálogo de la tienda de plataforma (WeMatch). No relacionado con inventario de clubes.';

-- Historial de movimientos de stock
create table if not exists public.store_stock_movements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  product_id uuid not null references public.store_products(id) on delete cascade,
  quantity_delta integer not null,
  quantity_after integer not null check (quantity_after >= 0),
  reason text not null
    check (reason in ('initial', 'restock', 'sale', 'adjustment', 'return')),
  note text,
  mobile_admin_id uuid references public.mobile_admins(id) on delete set null
);

create index if not exists idx_store_stock_movements_product on public.store_stock_movements (product_id, created_at desc);

comment on table public.store_stock_movements is 'Auditoría de cambios de stock en la tienda de plataforma.';

-- Bucket público para imágenes de productos (subida vía backend con service role)
insert into storage.buckets (id, name, public)
values ('store-products', 'store-products', true)
on conflict (id) do nothing;

drop policy if exists "store_products_public_read" on storage.objects;
create policy "store_products_public_read"
on storage.objects for select
using (bucket_id = 'store-products');
