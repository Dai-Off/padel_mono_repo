ALTER TABLE "public"."bookings" DROP CONSTRAINT IF EXISTS "bookings_status_check";
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_status_check" CHECK ((status = ANY (ARRAY['pending_payment'::text, 'confirmed'::text, 'cancelled'::text, 'completed'::text, 'past'::text])));
