-- Deporte por pista (filtros / multi-deporte en un mismo club)
ALTER TABLE public.courts
  ADD COLUMN IF NOT EXISTS sport text NOT NULL DEFAULT 'padel';

COMMENT ON COLUMN public.courts.sport IS 'padel | tenis | pickleball | otro — usado en filtros y pricing futuro.';

-- Segmento / tipo de cliente por club (staff, admin, etc.) + descuento % en tarifa calculada
CREATE TABLE IF NOT EXISTS public.club_player_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  segment_slug text NOT NULL DEFAULT 'standard',
  discount_percent integer NOT NULL DEFAULT 0
    CHECK (discount_percent >= 0 AND discount_percent <= 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_club_player_segments_club
  ON public.club_player_segments (club_id);

COMMENT ON TABLE public.club_player_segments IS 'Tipo de cliente en el club (ej. staff, admin) y descuento % sobre precio de slot.';
