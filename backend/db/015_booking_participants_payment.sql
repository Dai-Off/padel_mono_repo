-- ──────────────────────────────────────────────────────────────────────────────
-- 015_booking_participants_payment.sql
-- Añade método de pago y montos por participante en una reserva.
-- paid_amount_cents   → cobrado en efectivo o tarjeta
-- wallet_amount_cents → cobrado desde el monedero del jugador
-- payment_method      → 'cash' | 'card' (el monedero se registra en wallet_transactions)
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.booking_participants
  ADD COLUMN IF NOT EXISTS payment_method      text    CHECK (payment_method IN ('cash','card')) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS paid_amount_cents   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wallet_amount_cents integer NOT NULL DEFAULT 0;
