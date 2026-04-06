-- 018: Add soft-delete support for bookings
-- deleted_at is set when a booking is logically deleted from the grilla.
-- This is distinct from "cancelled" which is a business status.

alter table public.bookings
  add column if not exists deleted_at timestamptz default null;

-- Index to speed up the common filter "WHERE deleted_at IS NULL"
create index if not exists idx_bookings_deleted_at
  on public.bookings (deleted_at)
  where deleted_at is null;
