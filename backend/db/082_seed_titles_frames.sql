-- Seed de TÍTULOS y MARCOS en el catálogo unificado `unlockables` (Fase 3).
-- Idempotente (ON CONFLICT actualiza). Color de marco: `colors` (override) si
-- existe, si no el de la rareza (en código). Reglas no medibles aún
-- (tournament/social/achievement) y recompensas → 'manual' (bloqueadas).

-- ─── TÍTULOS (kind 'title') ───
insert into public.unlockables (id, kind, title, rarity, icon, unlock_type, unlock_value, sort_order) values
  ('novato',        'title', 'Novato',                'common',    'star',   'default',             null,  100),
  ('jugador',       'title', 'Jugador',               'common',    'shield', 'matches',             '5',   101),
  ('guerrero',      'title', 'Guerrero de Pista',     'common',    'sword',  'wins',                '10',  102),
  ('estudioso',     'title', 'Estudioso',             'common',    'school', 'daily_lesson_streak', '3',   103),
  ('francotirador', 'title', 'Francotirador',         'rare',      'target', 'manual',              null,  110),
  ('matador',       'title', 'El Matador de la Red',  'rare',      'target', 'wins',                '25',  111),
  ('smash',         'title', 'Rey del Smash',         'rare',      'crown',  'win_streak',          '5',   112),
  ('muro',          'title', 'El Muro',               'rare',      'shield', 'matches',             '50',  113),
  ('social',        'title', 'Alma del Club',         'rare',      'star',   'manual',              null,  114),
  ('rey_red',       'title', 'Rey de la Red',         'epic',      'target', 'manual',              null,  120),
  ('cristal',       'title', 'Maestro del Cristal',   'epic',      'medal',  'level',               '3.0', 121),
  ('pared',         'title', 'La Pared Humana',       'epic',      'shield', 'win_streak',          '10',  122),
  ('bandeja',       'title', 'Bandeja Letal',         'epic',      'target', 'wins',                '50',  123),
  ('campeon',       'title', 'Campeón Local',         'epic',      'trophy', 'manual',              null,  124),
  ('leyenda',       'title', 'Leyenda del Club',      'legendary', 'crown',  'matches',             '200', 130),
  ('maquina',       'title', 'La Máquina',            'legendary', 'flame',  'win_streak',          '15',  131),
  ('estratega',     'title', 'Estratega Supremo',     'legendary', 'crown',  'level',               '4.0', 132),
  ('dominador',     'title', 'Dominador Absoluto',    'legendary', 'trophy', 'manual',              null,  133)
on conflict (id) do update set
  kind = excluded.kind, title = excluded.title, rarity = excluded.rarity, icon = excluded.icon,
  unlock_type = excluded.unlock_type, unlock_value = excluded.unlock_value, sort_order = excluded.sort_order,
  updated_at = now();

-- ─── MARCOS (kind 'frame') ───
insert into public.unlockables (id, kind, title, rarity, animation_type, style, colors, unlock_type, unlock_value, sort_order) values
  ('none',         'frame', 'Sin marco',            'common',    null,       'none',   null,                                                  'default',    null,  200),
  ('orange-solid', 'frame', 'Naranja Clásico',      'common',    null,       'solid',  '["#F18F34","#E95F32"]'::jsonb,                          'default',    null,  201),
  ('plata',        'frame', 'Plata',                'common',    null,       'thin',   '["#9CA3AF","#D1D5DB"]'::jsonb,                          'default',    null,  202),
  ('silver',       'frame', 'Plata Antiguo',        'common',    null,       'double', '["#9CA3AF","#D1D5DB"]'::jsonb,                          'matches',    '10',  203),
  ('golden',       'frame', 'Dorado',               'rare',      null,       'solid',  '["#F59E0B","#FBBF24","#D97706"]'::jsonb,                'wins',       '25',  210),
  ('emerald',      'frame', 'Esmeralda',            'rare',      null,       'glow',   '["#10B981","#34D399","#059669"]'::jsonb,                'win_streak', '5',   211),
  ('ocean',        'frame', 'Océano',               'rare',      null,       'solid',  '["#3B82F6","#60A5FA","#2563EB"]'::jsonb,                'matches',    '50',  212),
  ('aurora',       'frame', 'Aurora Boreal',        'rare',      'orbit',    'glow',   '["#06B6D4","#8B5CF6","#EC4899"]'::jsonb,                'matches',    '40',  213),
  ('platino',      'frame', 'Escudo de Platino',    'epic',      'breathe',  'double', '["#E2E8F0","#9CA3AF","#F1F5F9","#D1D5DB"]'::jsonb,      'manual',     null,  220),
  ('amethyst',     'frame', 'Amatista',             'epic',      'rotate',   'solid',  '["#8B5CF6","#A78BFA","#7C3AED"]'::jsonb,                'matches',    '75',  221),
  ('fire',         'frame', 'Fuego',                'epic',      'pulse',    'glow',   '["#EF4444","#F97316","#FBBF24"]'::jsonb,                'win_streak', '10',  222),
  ('neon',         'frame', 'Neón',                 'epic',      'flicker',  'glow',   '["#06B6D4","#22D3EE","#67E8F9"]'::jsonb,                'manual',     null,  223),
  ('toxic',        'frame', 'Tóxico',               'epic',      'breathe',  'solid',  '["#22C55E","#86EFAC","#16A34A","#4ADE80"]'::jsonb,      'matches',    '100', 224),
  ('plasma',       'frame', 'Plasma',               'epic',      'shake',    'solid',  '["#E879F9","#F0ABFC","#C026D3","#D946EF"]'::jsonb,      'wins',       '40',  225),
  ('champion',     'frame', 'Campeón',              'legendary', 'warp',     'bevel',  '["#F18F34","#FBBF24","#F59E0B","#E95F32"]'::jsonb,      'wins',       '100', 230),
  ('diamond',      'frame', 'Diamante',             'legendary', 'glitch',   'double', '["#67E8F9","#A5F3FC","#CFFAFE","#06B6D4"]'::jsonb,      'matches',    '200', 231),
  ('inferno',      'frame', 'Infierno',             'legendary', 'ripple',   'glow',   '["#DC2626","#F97316","#FBBF24","#EF4444"]'::jsonb,      'win_streak', '15',  232),
  ('supernova',    'frame', 'Supernova',            'legendary', 'morph',    'bevel',  '["#FBBF24","#FFFFFF","#F59E0B","#FDE68A"]'::jsonb,      'wins',       '150', 233),
  ('void',         'frame', 'Vacío',                'legendary', 'rotate',   'solid',  '["#6366F1","#1E1B4B","#818CF8","#4338CA"]'::jsonb,      'matches',    '300', 234),
  ('dragon',       'frame', 'Dragón',               'legendary', 'pulse',    'glow',   '["#DC2626","#991B1B","#FBBF24","#B91C1C"]'::jsonb,      'win_streak', '20',  235)
on conflict (id) do update set
  kind = excluded.kind, title = excluded.title, rarity = excluded.rarity,
  animation_type = excluded.animation_type, style = excluded.style, colors = excluded.colors,
  unlock_type = excluded.unlock_type, unlock_value = excluded.unlock_value, sort_order = excluded.sort_order,
  updated_at = now();
