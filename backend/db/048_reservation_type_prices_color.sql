-- ============================================================
-- Migration 041: Add color to reservation_type_prices
-- Allows clubs to define a custom hex color per reservation type.
-- Color is displayed on booking cards in the scheduling grid.
-- ============================================================

ALTER TABLE public.reservation_type_prices
  ADD COLUMN IF NOT EXISTS color char(7) DEFAULT NULL
    CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$');
