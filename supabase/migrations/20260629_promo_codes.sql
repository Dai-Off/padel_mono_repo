-- Códigos promocionales para la tienda de plataforma (mobile-app).
-- Se dan de alta desde el panel (webapp-wechat) y se aplican en el checkout.

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  code text not null unique,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  -- percent: 1..100 (porcentaje). fixed: importe en céntimos.
  discount_value integer not null check (discount_value > 0),
  is_active boolean not null default true
);

comment on table public.promo_codes is 'Códigos promocionales de la tienda (descuento percent/fixed) aplicables en el checkout de mobile-app.';

-- Descuento aplicado al pedido (snapshot). subtotal_cents sigue siendo el bruto (suma de líneas).
alter table public.store_orders
  add column if not exists discount_cents integer not null default 0;
alter table public.store_orders
  add column if not exists promo_code text;

comment on column public.store_orders.discount_cents is 'Descuento aplicado por código promocional, en céntimos. El cobro real = subtotal_cents - discount_cents.';
comment on column public.store_orders.promo_code is 'Código promocional aplicado al pedido (si hubo).';
