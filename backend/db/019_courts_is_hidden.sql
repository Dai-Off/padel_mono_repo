-- Add is_hidden flag to courts for waiting-list / virtual courts
ALTER TABLE public.courts
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.courts.is_hidden
  IS 'Hidden courts appear in the waiting-list tab of the grilla, not in the main grid';
