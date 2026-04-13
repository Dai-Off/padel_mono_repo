ALTER TABLE public.players
ADD COLUMN gender text NOT NULL DEFAULT 'male'
CHECK (gender IN ('male', 'female', 'other'));
