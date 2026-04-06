-- Allow 'wallet' as a payment method for booking participants
ALTER TABLE public.booking_participants
  DROP CONSTRAINT booking_participants_payment_method_check;

ALTER TABLE public.booking_participants
  ADD CONSTRAINT booking_participants_payment_method_check
  CHECK (payment_method IN ('cash', 'card', 'wallet'));
