-- Si ya aplicaste 055 antes de incluir quick_sale_enabled, asegurá la columna.
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS quick_sale_enabled boolean NOT NULL DEFAULT false;
