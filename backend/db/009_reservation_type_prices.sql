-- ============================================================
-- Migration 009: Reservation Type Prices
-- Precios por hora configurados por tipo de reserva (por club).
-- Usado al crear reservas manuales en la grilla para mostrar
-- y persistir el precio según tipo + duración.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.reservation_type_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  reservation_type text NOT NULL
    CHECK (reservation_type IN (
      'standard', 'open_match', 'pozo', 'fixed_recurring',
      'school_group', 'school_individual', 'flat_rate',
      'tournament', 'blocked'
    )),
  price_per_hour_cents integer NOT NULL DEFAULT 0 CHECK (price_per_hour_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'EUR',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, reservation_type)
);

CREATE INDEX IF NOT EXISTS idx_reservation_type_prices_club
  ON public.reservation_type_prices (club_id);
