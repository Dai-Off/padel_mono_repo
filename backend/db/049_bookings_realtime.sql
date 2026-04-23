-- Enable FULL replica identity on bookings so that DELETE events include
-- the full old row (court_id, etc.) in the Realtime payload.
ALTER TABLE bookings REPLICA IDENTITY FULL;

-- Add bookings to the Supabase Realtime publication if not already present.
-- This is idempotent: running it when the table is already in the publication is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
  END IF;
END $$;
