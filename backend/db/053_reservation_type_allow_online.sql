-- Precios por tipo: control de reservas online (app/web) vs solo recepción/manual.
ALTER TABLE public.reservation_type_prices
  ADD COLUMN IF NOT EXISTS allow_online boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.reservation_type_prices.allow_online IS
  'Si false, no se pueden crear reservas de este tipo con source mobile/web (solo manual/sistema en club).';

-- Por defecto solo pista privada y partido abierto online; el club puede cambiarlo en /precios.
UPDATE public.reservation_type_prices
SET allow_online = false
WHERE reservation_type NOT IN ('standard', 'open_match');
