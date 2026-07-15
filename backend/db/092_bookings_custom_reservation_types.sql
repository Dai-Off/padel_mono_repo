-- ============================================================
-- Migration 092: Custom reservation types on bookings
-- Permite guardar tipos personalizados del club (custom_*)
-- como reservation_type en bookings, para la reserva en lote
-- "Personalizado" (escuela, cumpleaños, fiestas...).
-- ============================================================

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_booking_type_check;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_reservation_type_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_reservation_type_check
    CHECK (
      reservation_type IN (
        'standard',
        'open_match',
        'pozo',
        'fixed_recurring',
        'school_group',
        'school_individual',
        'flat_rate',
        'tournament',
        'blocked'
      )
      OR reservation_type LIKE 'custom\_%'
    );
