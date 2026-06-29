-- Pedidos de la tienda de plataforma (mobile-app). Pago vía Stripe.
-- Independiente de bookings/payment_transactions (que están atados a reservas/torneos).

create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  player_id uuid not null references public.players(id) on delete restrict,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'cancelled', 'failed')),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  currency char(3) not null default 'EUR',
  stripe_payment_intent_id text unique
);

create index if not exists idx_store_orders_player on public.store_orders (player_id, created_at desc);
create index if not exists idx_store_orders_status on public.store_orders (status);

comment on table public.store_orders is 'Pedidos de la tienda de plataforma (WeMatch) realizados desde mobile-app.';

create table if not exists public.store_order_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null references public.store_orders(id) on delete cascade,
  product_id uuid references public.store_products(id) on delete set null,
  -- Snapshot del producto en el momento de la compra (precio/nombre pueden cambiar después).
  product_name text not null,
  product_brand text,
  image_url text,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity > 0),
  line_total_cents integer not null check (line_total_cents >= 0)
);

create index if not exists idx_store_order_items_order on public.store_order_items (order_id);
create index if not exists idx_store_order_items_product on public.store_order_items (product_id);

comment on table public.store_order_items is 'Líneas de pedido de la tienda de plataforma con snapshot de producto.';
