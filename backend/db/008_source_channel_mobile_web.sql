-- ============================================================
-- Migration 008: Source Channel – Mobile vs Web
-- Creates the source_channel column on bookings (if it doesn't
-- exist yet) with values: mobile, web, manual, system.
--
-- Values:
--   mobile  – Booking created by a player from the mobile app (React Native)
--   web     – Booking created from the web panel (receptionist / admin)
--   manual  – Booking entered manually by staff without a specific channel
--   system  – Auto-generated booking (flat_rate, fixed_recurring, etc.)
-- ============================================================

-- Step 1: Add column if it doesn't exist yet (idempotent)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS source_channel text NOT NULL DEFAULT 'manual'
    CHECK (source_channel IN ('mobile', 'web', 'manual', 'system'));

-- Step 2: Create index for analytics/filtering
CREATE INDEX IF NOT EXISTS idx_bookings_source_channel
  ON public.bookings (source_channel);
