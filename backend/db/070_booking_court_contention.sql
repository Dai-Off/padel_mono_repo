-- Court contention: multiple match groups can compete for the same court/time until one reaches 3 paid players.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS court_contention_status text
    CHECK (court_contention_status IN ('competing', 'won', 'lost')),
  ADD COLUMN IF NOT EXISTS contention_third_paid_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_bookings_contention_slot
  ON bookings (court_id, start_at, end_at)
  WHERE court_contention_status IS NOT NULL AND status != 'cancelled';

UPDATE bookings b
SET court_contention_status = 'competing'
WHERE b.court_contention_status IS NULL
  AND b.status = 'pending_payment'
  AND b.reservation_type IN ('open_match', 'standard')
  AND EXISTS (SELECT 1 FROM matches m WHERE m.booking_id = b.id AND m.type != 'matchmaking');
