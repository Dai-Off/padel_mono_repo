-- 097_season_pass_name_colors.sql — Color/gradiente de nombre (cosmetico, fase 4b).
--
-- ORDER: ejecutar ANTES de re-ejecutar 092 (que ahora referencia name_color ids
-- en el track). Requiere 077 (unlockables), 080 (player_profile_customization),
-- 081 (columna colors).
--
-- Modelo: nuevo kind 'name_color'. La paleta va en `colors` (1 color = solido,
-- 2+ = gradiente por caracter en el cliente); `rarity` da el glow. Se equipa en
-- player_profile_customization.name_color_id.

-- ────────────────────────────────────────────────────────────
-- 1) Nuevo kind 'name_color' en el catalogo
-- ────────────────────────────────────────────────────────────
alter table public.unlockables
  drop constraint if exists unlockables_kind_check;
alter table public.unlockables
  add constraint unlockables_kind_check
  check (kind in ('trophy', 'badge', 'course', 'title', 'frame', 'name_color'));

-- ────────────────────────────────────────────────────────────
-- 2) Slot equipado en la personalizacion del jugador
-- ────────────────────────────────────────────────────────────
alter table public.player_profile_customization
  add column if not exists name_color_id text references public.unlockables (id) on delete set null;

-- ────────────────────────────────────────────────────────────
-- 3) Catalogo de name_color (unlock_type 'manual' — los otorga el pase)
-- ────────────────────────────────────────────────────────────
insert into public.unlockables (id, kind, title, description, rarity, colors, icon, unlock_type, sort_order) values
  ('nc_ceniza', 'name_color', 'Nombre Ceniza',  'Color de nombre del Pase S1.',     'rare',      '["#E5E7EB"]'::jsonb,                     'color-palette', 'manual', 480),
  ('nc_brasa',  'name_color', 'Nombre Brasa',   'Gradiente de nombre del Pase S1.', 'rare',      '["#F97316","#FBBF24"]'::jsonb,           'color-palette', 'manual', 481),
  ('nc_oceano', 'name_color', 'Nombre Océano',  'Gradiente de nombre del Pase S1.', 'epic',      '["#22D3EE","#3B82F6"]'::jsonb,           'color-palette', 'manual', 482),
  ('nc_neon',   'name_color', 'Nombre Neón',    'Gradiente de nombre del Pase S1.', 'epic',      '["#A855F7","#EC4899"]'::jsonb,           'color-palette', 'manual', 483),
  ('nc_aurora', 'name_color', 'Nombre Aurora',  'Gradiente de nombre del Pase S1.', 'legendary', '["#34D399","#22D3EE","#A855F7"]'::jsonb, 'color-palette', 'manual', 484),
  ('nc_fenix',  'name_color', 'Nombre Fénix',   'Gradiente de nombre del Pase S1.', 'legendary', '["#FDE68A","#F97316","#DC2626"]'::jsonb, 'color-palette', 'manual', 485)
on conflict (id) do update set
  kind = excluded.kind, title = excluded.title, description = excluded.description,
  rarity = excluded.rarity, colors = excluded.colors, icon = excluded.icon,
  unlock_type = excluded.unlock_type, sort_order = excluded.sort_order, updated_at = now();
