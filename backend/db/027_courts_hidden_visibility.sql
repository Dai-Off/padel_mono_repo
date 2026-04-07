-- Pistas ocultas (no listadas en búsqueda pública) y ventanas opcionales de visibilidad en grilla.

alter table public.courts
  add column if not exists is_hidden boolean not null default false;

comment on column public.courts.is_hidden is 'Si true, excluida de búsqueda pública; el club la ve en panel/grilla con toggle.';

-- Ventanas: [{ "days_of_week": [1,2,3], "start_minutes": 600, "end_minutes": 840 }, ...]
-- ISO día 1=lunes..7=domingo. null o [] = sin restricción extra (solo is_hidden para API pública).
alter table public.courts
  add column if not exists visibility_windows jsonb null;

comment on column public.courts.visibility_windows is 'Opcional: franjas horarias en que la pista se muestra en grilla (minutos desde medianoche).';
