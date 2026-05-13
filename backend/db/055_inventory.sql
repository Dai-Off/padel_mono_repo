-- Inventario (web /inventario): categorías, artículos, movimientos de stock.
-- Ejecutar en Supabase (SQL editor) o tu pipeline de migraciones si usás backend/db.

CREATE TABLE IF NOT EXISTS public.inventory_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, name)
);

ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.inventory_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  sku text,
  unit text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  unit_price_cents integer NOT NULL DEFAULT 0
    CHECK (unit_price_cents >= 0),
  currency text NOT NULL DEFAULT 'EUR',
  low_stock_threshold integer NOT NULL DEFAULT 0
    CHECK (low_stock_threshold >= 0),
  image_url text,
  quick_sale_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.inventory_categories(id) ON DELETE SET NULL;

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS quick_sale_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (movement_type IN ('in', 'out')),
  quantity integer NOT NULL CHECK (quantity > 0),
  reason text,
  movement_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_categories_club_id
  ON public.inventory_categories (club_id);

CREATE INDEX IF NOT EXISTS idx_inventory_items_club_id
  ON public.inventory_items (club_id);

CREATE INDEX IF NOT EXISTS idx_inventory_items_category_id
  ON public.inventory_items (category_id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_club_id
  ON public.inventory_movements (club_id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_item_id
  ON public.inventory_movements (item_id);
