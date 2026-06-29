-- Políticas de reserva a nivel club: ventana de reserva y cancelación única.

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS booking_window_days integer
    CHECK (booking_window_days IS NULL OR (booking_window_days >= 1 AND booking_window_days <= 365));

COMMENT ON COLUMN public.clubs.booking_window_days IS
  'Días de antelación máxima para reservar online (ventana de reserva).';

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS cancellation_notice_hours integer
    CHECK (cancellation_notice_hours IS NULL OR cancellation_notice_hours >= 0);

COMMENT ON COLUMN public.clubs.cancellation_notice_hours IS
  'Horas antes del inicio para permitir reembolso al cancelar. NULL = default 24h. 0 = siempre reembolsable.';
