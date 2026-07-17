-- 107_season_pass_catalog_expansion.sql — Tipo 'theme' + ampliacion de catalogos (bloque A).
-- (renumerada desde 098; aplicada en Supabase con el numero antiguo)
--
-- ORDER: requiere 077 (unlockables), 080 (player_profile_customization),
-- 081 (colors), 106 (kind name_color). NO toca el track (101); solo amplia el
-- catalogo. El track se re-rellena en el bloque B (quitar SP).
--
-- Modelo del tema: fondo animado del perfil (cover). `colors` = paleta base
-- [top, bottom, accent]; `animation_type` = motor de render en el cliente
-- (embers/smoke/court/waves/neon/aurora/phoenix/cosmos/prisma).

-- ────────────────────────────────────────────────────────────
-- 1) Nuevo kind 'theme' + slot equipado theme_id
-- ────────────────────────────────────────────────────────────
alter table public.unlockables
  drop constraint if exists unlockables_kind_check;
alter table public.unlockables
  add constraint unlockables_kind_check
  check (kind in ('trophy', 'badge', 'course', 'title', 'frame', 'name_color', 'theme'));

alter table public.player_profile_customization
  add column if not exists theme_id text references public.unlockables (id) on delete set null;

-- ────────────────────────────────────────────────────────────
-- 2) Temas (kind 'theme'): 3 rare, 3 epic, 3 legendary
-- ────────────────────────────────────────────────────────────
insert into public.unlockables (id, kind, title, description, rarity, colors, animation_type, icon, unlock_type, sort_order) values
  ('th_brasa',  'theme', 'Brasa',           'Tema del Pase S1: brasas ascendentes.',       'rare',      '["#1a0a05","#3a1405","#ff7d2e"]'::jsonb, 'embers',  'color-palette', 'manual', 500),
  ('th_ceniza', 'theme', 'Ceniza',          'Tema del Pase S1: humo a la deriva.',         'rare',      '["#1c1c1f","#0a0a0b","#b4b9c3"]'::jsonb, 'smoke',   'color-palette', 'manual', 501),
  ('th_pista',  'theme', 'Pista Nocturna',  'Tema del Pase S1: pista en fuga.',            'rare',      '["#0c2a20","#050b0a","#78ffcd"]'::jsonb, 'court',   'color-palette', 'manual', 502),
  ('th_oceano', 'theme', 'Océano',          'Tema del Pase S1: olas lentas.',              'epic',      '["#041a34","#0a4f8a","#8ce1ff"]'::jsonb, 'waves',   'color-palette', 'manual', 503),
  ('th_neon',   'theme', 'Neón',            'Tema del Pase S1: retícula synthwave.',       'epic',      '["#16032e","#05010c","#ff50be"]'::jsonb, 'neon',    'color-palette', 'manual', 504),
  ('th_aurora', 'theme', 'Aurora',          'Tema del Pase S1: cortinas de aurora.',       'epic',      '["#020814","#010509","#3cffaa"]'::jsonb, 'aurora',  'color-palette', 'manual', 505),
  ('th_fenix',  'theme', 'Fénix',           'Tema del Pase S1: brasas intensas.',          'legendary', '["#2a0a05","#5a1103","#ff5a1e"]'::jsonb, 'phoenix', 'color-palette', 'manual', 506),
  ('th_cosmos', 'theme', 'Cosmos',          'Tema del Pase S1: estrellas y nebulosa.',     'legendary', '["#241247","#030209","#7850ff"]'::jsonb, 'cosmos',  'color-palette', 'manual', 507),
  ('th_prisma', 'theme', 'Prisma',          'Tema del Pase S1: holograma iridiscente.',    'legendary', '["#07060c","#07060c","#b56cff"]'::jsonb, 'prisma',  'color-palette', 'manual', 508)
on conflict (id) do update set
  kind = excluded.kind, title = excluded.title, description = excluded.description,
  rarity = excluded.rarity, colors = excluded.colors, animation_type = excluded.animation_type,
  icon = excluded.icon, unlock_type = excluded.unlock_type, sort_order = excluded.sort_order, updated_at = now();

-- ────────────────────────────────────────────────────────────
-- 3) Mas colores de nombre (name_color)
-- ────────────────────────────────────────────────────────────
insert into public.unlockables (id, kind, title, description, rarity, colors, icon, unlock_type, sort_order) values
  ('nc_menta',    'name_color', 'Nombre Menta',    'Color de nombre del Pase S1.',     'rare',      '["#6EE7B7"]'::jsonb,                               'color-palette', 'manual', 486),
  ('nc_cielo',    'name_color', 'Nombre Cielo',    'Color de nombre del Pase S1.',     'rare',      '["#7DD3FC"]'::jsonb,                               'color-palette', 'manual', 487),
  ('nc_rosa',     'name_color', 'Nombre Rosa',     'Color de nombre del Pase S1.',     'rare',      '["#FDA4AF"]'::jsonb,                               'color-palette', 'manual', 488),
  ('nc_lava',     'name_color', 'Nombre Lava',     'Gradiente de nombre del Pase S1.', 'epic',      '["#F97316","#DC2626"]'::jsonb,                     'color-palette', 'manual', 489),
  ('nc_iris',     'name_color', 'Nombre Iris',     'Gradiente de nombre del Pase S1.', 'epic',      '["#818CF8","#C084FC"]'::jsonb,                     'color-palette', 'manual', 490),
  ('nc_tropical', 'name_color', 'Nombre Tropical', 'Gradiente de nombre del Pase S1.', 'epic',      '["#34D399","#FDE047"]'::jsonb,                     'color-palette', 'manual', 491),
  ('nc_holo',     'name_color', 'Nombre Holo',     'Gradiente de nombre del Pase S1.', 'legendary', '["#F0ABFC","#818CF8","#22D3EE"]'::jsonb,           'color-palette', 'manual', 492),
  ('nc_dorado',   'name_color', 'Nombre Dorado',   'Gradiente de nombre del Pase S1.', 'legendary', '["#FDE68A","#F59E0B","#B45309"]'::jsonb,           'color-palette', 'manual', 493),
  ('nc_espectro', 'name_color', 'Nombre Espectro', 'Gradiente de nombre del Pase S1.', 'legendary', '["#FB7185","#FBBF24","#34D399","#60A5FA"]'::jsonb, 'color-palette', 'manual', 494)
on conflict (id) do update set
  kind = excluded.kind, title = excluded.title, description = excluded.description,
  rarity = excluded.rarity, colors = excluded.colors, icon = excluded.icon,
  unlock_type = excluded.unlock_type, sort_order = excluded.sort_order, updated_at = now();

-- ────────────────────────────────────────────────────────────
-- 4) Mas marcos (frame, procedurales)
-- ────────────────────────────────────────────────────────────
insert into public.unlockables (id, kind, title, description, rarity, animation_type, style, colors, unlock_type, sort_order) values
  ('sp_f_hielo',   'frame', 'Hielo',      'Recompensa del Pase S1.',       'rare',      'breathe', 'glow',  '["#BFDBFE","#60A5FA"]'::jsonb,                     'manual', 470),
  ('sp_f_bosque',  'frame', 'Bosque',     'Recompensa del Pase S1.',       'rare',      null,      'solid', '["#34D399","#065F46"]'::jsonb,                     'manual', 471),
  ('sp_f_arena',   'frame', 'Arena',      'Recompensa del Pase S1.',       'rare',      null,      'thin',  '["#FCD34D","#B45309"]'::jsonb,                     'manual', 472),
  ('sp_f_neon',    'frame', 'Neón',       'Recompensa Elite del Pase S1.', 'epic',      'pulse',   'glow',  '["#F0ABFC","#A855F7"]'::jsonb,                     'manual', 473),
  ('sp_f_toxico',  'frame', 'Tóxico',     'Recompensa Elite del Pase S1.', 'epic',      'flicker', 'glow',  '["#A3E635","#4D7C0F"]'::jsonb,                     'manual', 474),
  ('sp_f_rubi',    'frame', 'Rubí',       'Recompensa Elite del Pase S1.', 'epic',      'breathe', 'glow',  '["#FB7185","#BE123C"]'::jsonb,                     'manual', 475),
  ('sp_f_zafiro',  'frame', 'Zafiro',     'Recompensa Elite del Pase S1.', 'epic',      'ripple',  'glow',  '["#38BDF8","#1D4ED8"]'::jsonb,                     'manual', 476),
  ('sp_f_prisma',  'frame', 'Prisma',     'Recompensa Elite del Pase S1.', 'legendary', 'morph',   'bevel', '["#FB7185","#FBBF24","#34D399","#60A5FA"]'::jsonb, 'manual', 477),
  ('sp_f_oro',     'frame', 'Oro Fundido','Recompensa Elite del Pase S1.', 'legendary', 'warp',    'glow',  '["#FDE68A","#F59E0B","#B45309"]'::jsonb,           'manual', 478),
  ('sp_f_vortice', 'frame', 'Vórtice',    'Recompensa Elite del Pase S1.', 'legendary', 'orbit',   'glow',  '["#C084FC","#7C3AED","#22D3EE"]'::jsonb,           'manual', 479)
on conflict (id) do update set
  kind = excluded.kind, title = excluded.title, description = excluded.description,
  rarity = excluded.rarity, animation_type = excluded.animation_type, style = excluded.style,
  colors = excluded.colors, unlock_type = excluded.unlock_type, sort_order = excluded.sort_order,
  updated_at = now();

-- ────────────────────────────────────────────────────────────
-- 5) Mas titulos (title)
-- ────────────────────────────────────────────────────────────
insert into public.unlockables (id, kind, title, description, rarity, icon, unlock_type, sort_order) values
  ('sp_t_veloz',          'title', 'Veloz',           'Recompensa del Pase S1.',       'common',    'flash', 'manual', 436),
  ('sp_t_zurdo',          'title', 'Zurdo Letal',     'Recompensa del Pase S1.',       'common',    'flash', 'manual', 437),
  ('sp_t_muralla',        'title', 'La Muralla',      'Recompensa del Pase S1.',       'rare',      'shield-half', 'manual', 438),
  ('sp_t_francotirador',  'title', 'Francotirador',   'Recompensa del Pase S1.',       'rare',      'locate', 'manual', 439),
  ('sp_t_globero',        'title', 'Maestro del Globo','Recompensa del Pase S1.',      'rare',      'star', 'manual', 440),
  ('sp_t_vibora',         'title', 'Víbora',          'Recompensa Elite del Pase S1.', 'epic',      'flash', 'manual', 441),
  ('sp_t_leyenda',        'title', 'Leyenda Viva',    'Recompensa Elite del Pase S1.', 'legendary', 'star', 'manual', 442),
  ('sp_t_intocable',      'title', 'Intocable',       'Recompensa Elite del Pase S1.', 'legendary', 'star', 'manual', 443)
on conflict (id) do update set
  kind = excluded.kind, title = excluded.title, description = excluded.description,
  rarity = excluded.rarity, icon = excluded.icon, unlock_type = excluded.unlock_type,
  sort_order = excluded.sort_order, updated_at = now();

-- ────────────────────────────────────────────────────────────
-- 6) Mas insignias/trofeos (badge/trophy, icono Ionicons)
-- ────────────────────────────────────────────────────────────
insert into public.unlockables (id, kind, title, description, rarity, icon, unlock_type, sort_order) values
  ('sp_b_racha10',    'badge',  'Racha x10',      'Recompensa del Pase S1.',       'rare',      'flame',   'manual', 450),
  ('sp_b_madrugador', 'badge',  'Madrugador',     'Recompensa del Pase S1.',       'rare',      'sunny',   'manual', 451),
  ('sp_b_nocturno',   'badge',  'Búho Nocturno',  'Recompensa Elite del Pase S1.', 'epic',      'moon',    'manual', 452),
  ('sp_b_perfecto',   'trophy', 'Set Perfecto',   'Recompensa Elite del Pase S1.', 'epic',      'medal',   'manual', 453),
  ('sp_b_finalista',  'trophy', 'Finalista',      'Recompensa Elite del Pase S1.', 'legendary', 'trophy',  'manual', 454)
on conflict (id) do update set
  kind = excluded.kind, title = excluded.title, description = excluded.description,
  rarity = excluded.rarity, icon = excluded.icon, unlock_type = excluded.unlock_type,
  sort_order = excluded.sort_order, updated_at = now();
