-- 092_class_bonos_bonus_id.sql
-- Agregar columna bonus_id a la tabla class_bonos para enlazar con la tabla bonuses

ALTER TABLE public.class_bonos
  ADD COLUMN IF NOT EXISTS bonus_id uuid REFERENCES public.bonuses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_class_bonos_bonus_id ON public.class_bonos(bonus_id);
