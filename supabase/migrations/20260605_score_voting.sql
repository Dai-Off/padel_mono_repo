-- Alter score_status constraint
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_score_status_chk;
ALTER TABLE public.matches ADD CONSTRAINT matches_score_status_chk CHECK (score_status = ANY (ARRAY['pending'::text, 'pending_confirmation'::text, 'disputed_pending'::text, 'confirmed'::text, 'disputed'::text, 'no_result'::text, 'pending_votes'::text]));

-- Add columns to matches
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS score_proposed_at timestamptz;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS score_proposer_id uuid REFERENCES public.players(id);

-- Create score_votes table
CREATE TABLE IF NOT EXISTS public.score_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  vote text NOT NULL CHECK (vote IN ('confirm', 'reject')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(match_id, player_id)
);

-- Comments
COMMENT ON COLUMN public.matches.score_proposed_at IS 'Fecha y hora en que se propuso el marcador para votación.';
COMMENT ON COLUMN public.matches.score_proposer_id IS 'ID del jugador que propuso el marcador.';
COMMENT ON TABLE public.score_votes IS 'Votos individuales de los jugadores para confirmar o rechazar el marcador propuesto.';
