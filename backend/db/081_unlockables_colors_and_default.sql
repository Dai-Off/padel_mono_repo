-- Ampliaciones de `unlockables` para títulos/marcos (Fase 3):
--  - `colors`: override opcional de color/paleta del marco (jsonb array). Si NULL,
--    el marco usa el color de su rareza (RARITY_CONFIG en código). Recupera la
--    variedad de paletas del Figma (golden/emerald/ocean…).
--  - `unlock_type = 'default'`: ítems siempre disponibles (Sin marco, Novato…).

alter table public.unlockables add column if not exists colors jsonb;

comment on column public.unlockables.colors is
  'Override de color/paleta del marco (jsonb array). Si NULL, usa el color de la rareza.';

do $$ begin
  alter table public.unlockables drop constraint if exists unlockables_unlock_type_check;
exception when undefined_object then null; end $$;

alter table public.unlockables add constraint unlockables_unlock_type_check
  check (unlock_type in (
    'manual',               -- otorgado por otros medios (recompensa) o pendiente de señal
    'default',              -- siempre disponible (no se otorga ni notifica; implícito)
    'matches',
    'wins',
    'win_streak',
    'level',
    'courses_completed',
    'daily_lesson_streak',
    'course'
  ));
