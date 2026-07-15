-- 092_player_follows.sql
-- Sistema de seguidores y seguidos entre jugadores (tipo Instagram)

CREATE TABLE IF NOT EXISTS public.player_follows (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_follows_no_self CHECK (follower_id != following_id),
  CONSTRAINT player_follows_unique UNIQUE (follower_id, following_id)
);

-- Índices para optimizar las consultas de la red social
CREATE INDEX IF NOT EXISTS idx_player_follows_follower ON public.player_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_player_follows_following ON public.player_follows(following_id);

-- Agregar columnas de contadores desnormalizados en la tabla de jugadores
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS followers_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS following_count int NOT NULL DEFAULT 0;

-- Función y Trigger para mantener actualizados los contadores de seguidores/siguiendo
CREATE OR REPLACE FUNCTION public.fn_update_player_follow_counts()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Incrementar el contador de seguidos del seguidor
    UPDATE public.players 
    SET following_count = following_count + 1 
    WHERE id = NEW.follower_id;

    -- Incrementar el contador de seguidores del seguido
    UPDATE public.players 
    SET followers_count = followers_count + 1 
    WHERE id = NEW.following_id;
  ELSIF TG_OP = 'DELETE' THEN
    -- Decrementar el contador de seguidos del seguidor
    UPDATE public.players 
    SET following_count = GREATEST(0, following_count - 1) 
    WHERE id = OLD.follower_id;

    -- Decrementar el contador de seguidores del seguido
    UPDATE public.players 
    SET followers_count = GREATEST(0, followers_count - 1) 
    WHERE id = OLD.following_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_player_follow_counts ON public.player_follows;
CREATE TRIGGER trg_update_player_follow_counts
  AFTER INSERT OR DELETE ON public.player_follows
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_player_follow_counts();
