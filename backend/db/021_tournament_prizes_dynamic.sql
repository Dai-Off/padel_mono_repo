-- Premios por puesto (campeón, subcampeón, 3.er lugar, etc.) como JSONB; prize_total_cents sigue siendo la suma.

alter table public.tournaments
  add column if not exists prizes jsonb not null default '[]'::jsonb;
