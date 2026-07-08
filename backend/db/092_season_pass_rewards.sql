-- 092_season_pass_rewards.sql — Level rewards for the season pass (phase 2).
--
-- ORDER: requires 050 (seasons) and 077/081/082 (unlockables catalog).
-- Re-seed idempotente: borra las rewards unlockable/sp de s1 y las re-siembra.
-- Los boosters (reward_type 'sp_boost') los gestiona 093 y NO se tocan aquí.
--
-- Reward semantics:
--   unlockable → grants a row in player_unlockables (existing UnlockModalHost
--                shows it; display derives from the catalog at read time)
--   sp         → direct SP, re-enters via the grant path WITHOUT boosts
--   sp_boost   → consumable booster (player_sp_boosts, sembrado en 093)
--
-- Cosméticos: emoji en insignias (Ionicons no va en la miniapp) y marcos
-- procedurales (animation_type + style + colors). Todo unlock_type 'manual'
-- (los otorga el pase; el motor de señales nunca).

create table if not exists public.season_pass_rewards (
  id uuid primary key default gen_random_uuid(),
  season_slug text not null references public.season_pass_seasons (slug) on delete cascade,
  level int not null check (level between 1 and 1000),
  tier text not null check (tier in ('free', 'elite')),
  reward_type text not null check (reward_type in ('unlockable', 'sp_boost', 'sp')),
  unlockable_id text references public.unlockables (id),
  boost_config jsonb,
  sp_amount int check (sp_amount > 0),
  display jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  unique nulls not distinct (season_slug, level, tier, reward_type, unlockable_id),
  check (reward_type <> 'unlockable' or unlockable_id is not null),
  check (reward_type <> 'sp' or sp_amount is not null),
  check (reward_type <> 'sp_boost' or boost_config is not null)
);

create index if not exists idx_sp_rewards_season_level
  on public.season_pass_rewards (season_slug, level, tier);

create table if not exists public.player_season_pass_reward_grants (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  reward_id uuid not null references public.season_pass_rewards (id) on delete cascade,
  granted_at timestamptz not null default now(),
  notified_at timestamptz,
  unique (player_id, reward_id)
);

create index if not exists idx_sp_reward_grants_player
  on public.player_season_pass_reward_grants (player_id);

alter table public.season_pass_rewards enable row level security;
alter table public.player_season_pass_reward_grants enable row level security;

-- ════════════════════════════════════════════════════════════
-- BANCO DE COSMÉTICOS S1 (unlock_type 'manual')
-- ════════════════════════════════════════════════════════════

-- ── Títulos (kind 'title', solo texto) ──
insert into public.unlockables (id, kind, title, description, rarity, icon, unlock_type, sort_order) values
  ('sp_t_novato',      'title', 'Novato',              'Recompensa del Pase S1.', 'common',    'star', 'manual', 400),
  ('sp_t_debutante',   'title', 'Debutante',           'Recompensa del Pase S1.', 'common',    'star', 'manual', 401),
  ('sp_t_peloteo',     'title', 'Peloteo',             'Recompensa del Pase S1.', 'common',    'star', 'manual', 402),
  ('sp_t_aprendiz',    'title', 'Aprendiz',            'Recompensa del Pase S1.', 'common',    'star', 'manual', 403),
  ('sp_t_aficionado',  'title', 'Aficionado',          'Recompensa del Pase S1.', 'common',    'star', 'manual', 404),
  ('sp_t_habitual',    'title', 'Habitual',            'Recompensa del Pase S1.', 'common',    'star', 'manual', 405),
  ('sp_t_competidor',  'title', 'Competidor',          'Recompensa del Pase S1.', 'rare',      'star', 'manual', 410),
  ('sp_t_retador',     'title', 'Retador',             'Recompensa del Pase S1.', 'rare',      'star', 'manual', 411),
  ('sp_t_dedicado',    'title', 'Dedicado',            'Recompensa del Pase S1.', 'rare',      'star', 'manual', 412),
  ('sp_t_tactico',     'title', 'Táctico',             'Recompensa del Pase S1.', 'rare',      'star', 'manual', 413),
  ('sp_t_guerrero',    'title', 'Guerrero de Pista',   'Recompensa del Pase S1.', 'rare',      'star', 'manual', 414),
  ('sp_t_companero',   'title', 'Compañero Fiel',      'Recompensa Elite del Pase S1.', 'rare',      'star', 'manual', 415),
  ('sp_t_en_racha',    'title', 'En Racha',            'Recompensa Elite del Pase S1.', 'rare',      'star', 'manual', 416),
  ('sp_t_calculador',  'title', 'Calculador',          'Recompensa Elite del Pase S1.', 'epic',      'star', 'manual', 420),
  ('sp_t_sangre_fria', 'title', 'Sangre Fría',         'Recompensa Elite del Pase S1.', 'epic',      'star', 'manual', 421),
  ('sp_t_muro',        'title', 'Muro de Vidrio',      'Recompensa Elite del Pase S1.', 'epic',      'star', 'manual', 422),
  ('sp_t_metralla',    'title', 'Metralla',            'Recompensa Elite del Pase S1.', 'epic',      'star', 'manual', 423),
  ('sp_t_estrella',    'title', 'Estrella Real',       'Recompensa Elite del Pase S1.', 'epic',      'star', 'manual', 424),
  ('sp_t_virtuoso',    'title', 'Virtuoso',            'Recompensa Elite del Pase S1.', 'epic',      'star', 'manual', 425),
  ('sp_t_implacable',  'title', 'Implacable',          'Recompensa Elite del Pase S1.', 'epic',      'star', 'manual', 426),
  ('sp_t_resiliente',  'title', 'Resiliente',          'Recompensa Elite del Pase S1.', 'epic',      'star', 'manual', 427),
  ('sp_t_mente',       'title', 'Mente Maestra',       'Recompensa Elite del Pase S1.', 'legendary', 'star', 'manual', 430),
  ('sp_t_senor',       'title', 'Señor de la Pista',   'Recompensa Elite del Pase S1.', 'legendary', 'star', 'manual', 431),
  ('sp_t_depredador',  'title', 'Depredador',          'Recompensa Elite del Pase S1.', 'legendary', 'star', 'manual', 432),
  ('sp_t_cazagigantes','title', 'Cazagigantes',        'Recompensa Elite del Pase S1.', 'legendary', 'star', 'manual', 433),
  ('sp_t_alma',        'title', 'Alma de WeMatch',     'Recompensa del Pase S1 (nivel 99).', 'legendary', 'star', 'manual', 434),
  ('sp_t_rey',         'title', 'Rey de la Pista',     'Recompensa Elite del Pase S1 (nivel 100).', 'legendary', 'star', 'manual', 435)
on conflict (id) do update set
  kind = excluded.kind, title = excluded.title, description = excluded.description,
  rarity = excluded.rarity, icon = excluded.icon, unlock_type = excluded.unlock_type,
  sort_order = excluded.sort_order, updated_at = now();

-- ── Insignias (kind 'badge'/'trophy', glyph Ionicons en `icon`) ──
insert into public.unlockables (id, kind, title, description, rarity, icon, unlock_type, sort_order) values
  ('sp_b_iniciado', 'badge',  'Iniciado',            'Recompensa del Pase S1.', 'common',    'flame',      'manual', 440),
  ('sp_b_saque',    'badge',  'Primer Saque',        'Recompensa del Pase S1.', 'common',    'tennisball', 'manual', 441),
  ('sp_b_pionero',  'badge',  'Pionero',             'Recompensa del Pase S1.', 'rare',      'star',       'manual', 442),
  ('sp_b_constante','badge',  'Constante',           'Recompensa del Pase S1.', 'rare',      'medal',      'manual', 443),
  ('sp_b_veterano', 'trophy', 'Veterano S1',         'Recompensa Elite del Pase S1.', 'rare',      'ribbon',     'manual', 444),
  ('sp_b_elite',    'badge',  'Elite S1',            'Recompensa Elite del Pase S1.', 'epic',      'shield',     'manual', 445),
  ('sp_b_imparable','badge',  'Imparable',           'Recompensa Elite del Pase S1.', 'epic',      'flame',      'manual', 446),
  ('sp_b_mitad',    'trophy', 'Mitad de Temporada',  'Recompensa Elite del Pase S1.', 'epic',      'medal',      'manual', 447),
  ('sp_b_semifinal','trophy', 'Semifinalista',       'Recompensa Elite del Pase S1.', 'epic',      'ribbon',     'manual', 448),
  ('sp_b_campeon',  'trophy', 'Campeón S1',          'Recompensa Elite del Pase S1.', 'legendary', 'trophy',     'manual', 449)
on conflict (id) do update set
  kind = excluded.kind, title = excluded.title, description = excluded.description,
  rarity = excluded.rarity, icon = excluded.icon, unlock_type = excluded.unlock_type,
  sort_order = excluded.sort_order, updated_at = now();

-- ── Marcos (kind 'frame', procedurales) ──
insert into public.unlockables (id, kind, title, description, rarity, animation_type, style, colors, unlock_type, sort_order) values
  ('sp_f_ceniza', 'frame', 'Ceniza',      'Recompensa del Pase S1.', 'rare',      null,      'thin', '["#9CA3AF","#D1D5DB"]'::jsonb,                     'manual', 460),
  ('sp_f_ascua',  'frame', 'Ascua',       'Recompensa del Pase S1.', 'rare',      null,      'solid','["#EF4444","#F97316","#FBBF24"]'::jsonb,          'manual', 461),
  ('sp_f_brasa',  'frame', 'Brasa',       'Recompensa del Pase S1.', 'rare',      null,      'glow', '["#F97316","#FBBF24"]'::jsonb,                     'manual', 462),
  ('sp_f_chispa', 'frame', 'Chispa Viva', 'Recompensa Elite del Pase S1.', 'epic',      'pulse',   'glow', '["#F97316","#FBBF24","#EF4444"]'::jsonb,           'manual', 463),
  ('sp_f_fatuo',  'frame', 'Fuego Fatuo', 'Recompensa Elite del Pase S1.', 'epic',      'flicker', 'glow', '["#22D3EE","#67E8F9"]'::jsonb,                     'manual', 464),
  ('sp_f_azul',   'frame', 'Llama Azul',  'Recompensa Elite del Pase S1.', 'epic',      'breathe', 'glow', '["#3B82F6","#60A5FA","#93C5FD"]'::jsonb,           'manual', 465),
  ('sp_f_fenix',  'frame', 'Fénix',       'Recompensa Elite del Pase S1.', 'legendary', 'warp',    'glow', '["#F59E0B","#EF4444","#FDE68A","#DC2626"]'::jsonb, 'manual', 466),
  ('s1_ember',          'frame', 'Brasas',           'Recompensa Elite del Pase S1.', 'epic',      'pulse',  'glow',  '["#F97316","#FBBF24","#EF4444"]'::jsonb,           'manual', 467),
  ('s1_llamas_eternas', 'frame', 'Llamas Eternas',   'Recompensa del Pase S1.',       'legendary', 'ripple', 'glow',  '["#DC2626","#F97316","#FBBF24"]'::jsonb,           'manual', 468),
  ('s1_corona_llamas',  'frame', 'Corona de Llamas', 'Recompensa Elite del Pase S1.', 'legendary', 'morph',  'bevel', '["#FBBF24","#F97316","#DC2626","#FDE68A"]'::jsonb, 'manual', 469)
on conflict (id) do update set
  kind = excluded.kind, title = excluded.title, description = excluded.description,
  rarity = excluded.rarity, animation_type = excluded.animation_type, style = excluded.style,
  colors = excluded.colors, unlock_type = excluded.unlock_type, sort_order = excluded.sort_order,
  updated_at = now();

-- ════════════════════════════════════════════════════════════
-- TRACK S1 — recompensa en cada nivel (free) + mayoría (elite).
-- Re-seed idempotente de unlockable/sp (los boosters van en 093).
-- ════════════════════════════════════════════════════════════

delete from public.season_pass_rewards
  where season_slug = 's1' and reward_type in ('unlockable', 'sp');

-- ── FREE (100 niveles) ──
insert into public.season_pass_rewards (season_slug, level, tier, reward_type, unlockable_id, sp_amount, display) values
  ('s1',   1, 'free', 'unlockable', 'sp_b_iniciado', null, '{}'),
  ('s1',   2, 'free', 'sp', null, 150, '{"icon":"⚡","label":"+150 SP"}'),
  ('s1',   3, 'free', 'unlockable', 'sp_t_novato', null, '{}'),
  ('s1',   4, 'free', 'sp', null, 150, '{"icon":"⚡","label":"+150 SP"}'),
  ('s1',   5, 'free', 'sp', null, 150, '{"icon":"⚡","label":"+150 SP"}'),
  ('s1',   6, 'free', 'unlockable', 'sp_t_debutante', null, '{}'),
  ('s1',   7, 'free', 'sp', null, 150, '{"icon":"⚡","label":"+150 SP"}'),
  ('s1',   8, 'free', 'sp', null, 150, '{"icon":"⚡","label":"+150 SP"}'),
  ('s1',   9, 'free', 'unlockable', 'sp_b_saque', null, '{}'),
  ('s1',  10, 'free', 'sp', null, 200, '{"icon":"⚡","label":"+200 SP"}'),
  ('s1',  11, 'free', 'sp', null, 150, '{"icon":"⚡","label":"+150 SP"}'),
  ('s1',  12, 'free', 'unlockable', 'sp_t_peloteo', null, '{}'),
  ('s1',  13, 'free', 'sp', null, 150, '{"icon":"⚡","label":"+150 SP"}'),
  ('s1',  14, 'free', 'sp', null, 150, '{"icon":"⚡","label":"+150 SP"}'),
  ('s1',  15, 'free', 'unlockable', 'sp_t_aprendiz', null, '{}'),
  ('s1',  16, 'free', 'sp', null, 200, '{"icon":"⚡","label":"+200 SP"}'),
  ('s1',  17, 'free', 'sp', null, 150, '{"icon":"⚡","label":"+150 SP"}'),
  ('s1',  18, 'free', 'unlockable', 'sp_t_aficionado', null, '{}'),
  ('s1',  19, 'free', 'sp', null, 150, '{"icon":"⚡","label":"+150 SP"}'),
  ('s1',  20, 'free', 'sp', null, 200, '{"icon":"⚡","label":"+200 SP"}'),
  ('s1',  21, 'free', 'unlockable', 'sp_t_habitual', null, '{}'),
  ('s1',  22, 'free', 'sp', null, 200, '{"icon":"⚡","label":"+200 SP"}'),
  ('s1',  23, 'free', 'sp', null, 200, '{"icon":"⚡","label":"+200 SP"}'),
  ('s1',  24, 'free', 'unlockable', 'sp_f_ceniza', null, '{}'),
  ('s1',  25, 'free', 'sp', null, 250, '{"icon":"⚡","label":"+250 SP"}'),
  ('s1',  26, 'free', 'sp', null, 250, '{"icon":"⚡","label":"+250 SP"}'),
  ('s1',  27, 'free', 'sp', null, 250, '{"icon":"⚡","label":"+250 SP"}'),
  ('s1',  28, 'free', 'unlockable', 'sp_b_pionero', null, '{}'),
  ('s1',  29, 'free', 'sp', null, 250, '{"icon":"⚡","label":"+250 SP"}'),
  ('s1',  30, 'free', 'sp', null, 300, '{"icon":"⚡","label":"+300 SP"}'),
  ('s1',  31, 'free', 'sp', null, 250, '{"icon":"⚡","label":"+250 SP"}'),
  ('s1',  32, 'free', 'unlockable', 'sp_f_ascua', null, '{}'),
  ('s1',  33, 'free', 'sp', null, 250, '{"icon":"⚡","label":"+250 SP"}'),
  ('s1',  34, 'free', 'sp', null, 250, '{"icon":"⚡","label":"+250 SP"}'),
  ('s1',  35, 'free', 'sp', null, 250, '{"icon":"⚡","label":"+250 SP"}'),
  ('s1',  36, 'free', 'unlockable', 'sp_t_competidor', null, '{}'),
  ('s1',  37, 'free', 'sp', null, 300, '{"icon":"⚡","label":"+300 SP"}'),
  ('s1',  38, 'free', 'sp', null, 250, '{"icon":"⚡","label":"+250 SP"}'),
  ('s1',  39, 'free', 'sp', null, 250, '{"icon":"⚡","label":"+250 SP"}'),
  ('s1',  40, 'free', 'unlockable', 'sp_f_brasa', null, '{}'),
  ('s1',  41, 'free', 'sp', null, 300, '{"icon":"⚡","label":"+300 SP"}'),
  ('s1',  42, 'free', 'sp', null, 300, '{"icon":"⚡","label":"+300 SP"}'),
  ('s1',  43, 'free', 'sp', null, 300, '{"icon":"⚡","label":"+300 SP"}'),
  ('s1',  44, 'free', 'unlockable', 'sp_t_retador', null, '{}'),
  ('s1',  45, 'free', 'sp', null, 300, '{"icon":"⚡","label":"+300 SP"}'),
  ('s1',  46, 'free', 'sp', null, 300, '{"icon":"⚡","label":"+300 SP"}'),
  ('s1',  47, 'free', 'sp', null, 300, '{"icon":"⚡","label":"+300 SP"}'),
  ('s1',  48, 'free', 'unlockable', 'sp_b_constante', null, '{}'),
  ('s1',  49, 'free', 'sp', null, 300, '{"icon":"⚡","label":"+300 SP"}'),
  ('s1',  50, 'free', 'sp', null, 400, '{"icon":"⚡","label":"+400 SP"}'),
  ('s1',  51, 'free', 'sp', null, 350, '{"icon":"⚡","label":"+350 SP"}'),
  ('s1',  52, 'free', 'unlockable', 'sp_t_dedicado', null, '{}'),
  ('s1',  53, 'free', 'sp', null, 350, '{"icon":"⚡","label":"+350 SP"}'),
  ('s1',  54, 'free', 'sp', null, 350, '{"icon":"⚡","label":"+350 SP"}'),
  ('s1',  55, 'free', 'sp', null, 400, '{"icon":"⚡","label":"+400 SP"}'),
  ('s1',  56, 'free', 'sp', null, 350, '{"icon":"⚡","label":"+350 SP"}'),
  ('s1',  57, 'free', 'sp', null, 350, '{"icon":"⚡","label":"+350 SP"}'),
  ('s1',  58, 'free', 'sp', null, 350, '{"icon":"⚡","label":"+350 SP"}'),
  ('s1',  59, 'free', 'sp', null, 350, '{"icon":"⚡","label":"+350 SP"}'),
  ('s1',  60, 'free', 'unlockable', 'sp_t_tactico', null, '{}'),
  ('s1',  61, 'free', 'sp', null, 400, '{"icon":"⚡","label":"+400 SP"}'),
  ('s1',  62, 'free', 'sp', null, 400, '{"icon":"⚡","label":"+400 SP"}'),
  ('s1',  63, 'free', 'sp', null, 400, '{"icon":"⚡","label":"+400 SP"}'),
  ('s1',  64, 'free', 'sp', null, 400, '{"icon":"⚡","label":"+400 SP"}'),
  ('s1',  65, 'free', 'sp', null, 450, '{"icon":"⚡","label":"+450 SP"}'),
  ('s1',  66, 'free', 'sp', null, 400, '{"icon":"⚡","label":"+400 SP"}'),
  ('s1',  67, 'free', 'sp', null, 400, '{"icon":"⚡","label":"+400 SP"}'),
  ('s1',  68, 'free', 'sp', null, 400, '{"icon":"⚡","label":"+400 SP"}'),
  ('s1',  69, 'free', 'sp', null, 400, '{"icon":"⚡","label":"+400 SP"}'),
  ('s1',  70, 'free', 'unlockable', 'sp_t_guerrero', null, '{}'),
  ('s1',  71, 'free', 'sp', null, 450, '{"icon":"⚡","label":"+450 SP"}'),
  ('s1',  72, 'free', 'sp', null, 450, '{"icon":"⚡","label":"+450 SP"}'),
  ('s1',  73, 'free', 'sp', null, 450, '{"icon":"⚡","label":"+450 SP"}'),
  ('s1',  74, 'free', 'sp', null, 450, '{"icon":"⚡","label":"+450 SP"}'),
  ('s1',  75, 'free', 'sp', null, 500, '{"icon":"⚡","label":"+500 SP"}'),
  ('s1',  76, 'free', 'sp', null, 500, '{"icon":"⚡","label":"+500 SP"}'),
  ('s1',  77, 'free', 'sp', null, 500, '{"icon":"⚡","label":"+500 SP"}'),
  ('s1',  78, 'free', 'sp', null, 500, '{"icon":"⚡","label":"+500 SP"}'),
  ('s1',  79, 'free', 'sp', null, 500, '{"icon":"⚡","label":"+500 SP"}'),
  ('s1',  80, 'free', 'sp', null, 550, '{"icon":"⚡","label":"+550 SP"}'),
  ('s1',  81, 'free', 'sp', null, 500, '{"icon":"⚡","label":"+500 SP"}'),
  ('s1',  82, 'free', 'sp', null, 500, '{"icon":"⚡","label":"+500 SP"}'),
  ('s1',  83, 'free', 'sp', null, 500, '{"icon":"⚡","label":"+500 SP"}'),
  ('s1',  84, 'free', 'sp', null, 500, '{"icon":"⚡","label":"+500 SP"}'),
  ('s1',  85, 'free', 'sp', null, 550, '{"icon":"⚡","label":"+550 SP"}'),
  ('s1',  86, 'free', 'sp', null, 550, '{"icon":"⚡","label":"+550 SP"}'),
  ('s1',  87, 'free', 'sp', null, 550, '{"icon":"⚡","label":"+550 SP"}'),
  ('s1',  88, 'free', 'sp', null, 550, '{"icon":"⚡","label":"+550 SP"}'),
  ('s1',  89, 'free', 'sp', null, 550, '{"icon":"⚡","label":"+550 SP"}'),
  ('s1',  90, 'free', 'sp', null, 600, '{"icon":"⚡","label":"+600 SP"}'),
  ('s1',  91, 'free', 'sp', null, 600, '{"icon":"⚡","label":"+600 SP"}'),
  ('s1',  92, 'free', 'sp', null, 600, '{"icon":"⚡","label":"+600 SP"}'),
  ('s1',  93, 'free', 'sp', null, 600, '{"icon":"⚡","label":"+600 SP"}'),
  ('s1',  94, 'free', 'sp', null, 600, '{"icon":"⚡","label":"+600 SP"}'),
  ('s1',  95, 'free', 'sp', null, 700, '{"icon":"⚡","label":"+700 SP"}'),
  ('s1',  96, 'free', 'sp', null, 700, '{"icon":"⚡","label":"+700 SP"}'),
  ('s1',  97, 'free', 'sp', null, 700, '{"icon":"⚡","label":"+700 SP"}'),
  ('s1',  98, 'free', 'sp', null, 700, '{"icon":"⚡","label":"+700 SP"}'),
  ('s1',  99, 'free', 'unlockable', 'sp_t_alma', null, '{}'),
  ('s1', 100, 'free', 'unlockable', 'sp_b_campeon', null, '{}');

-- ── ELITE ──
insert into public.season_pass_rewards (season_slug, level, tier, reward_type, unlockable_id, sp_amount, display) values
  ('s1',   1, 'elite', 'unlockable', 'sp_b_elite', null, '{}'),
  ('s1',   3, 'elite', 'sp', null, 300, '{"icon":"⚡","label":"+300 SP"}'),
  ('s1',   5, 'elite', 'unlockable', 'sp_t_companero', null, '{}'),
  ('s1',   8, 'elite', 'sp', null, 300, '{"icon":"⚡","label":"+300 SP"}'),
  ('s1',  10, 'elite', 'unlockable', 'sp_f_azul', null, '{}'),
  ('s1',  13, 'elite', 'sp', null, 350, '{"icon":"⚡","label":"+350 SP"}'),
  ('s1',  15, 'elite', 'unlockable', 'sp_t_en_racha', null, '{}'),
  ('s1',  17, 'elite', 'sp', null, 350, '{"icon":"⚡","label":"+350 SP"}'),
  ('s1',  20, 'elite', 'unlockable', 'sp_b_veterano', null, '{}'),
  ('s1',  23, 'elite', 'sp', null, 400, '{"icon":"⚡","label":"+400 SP"}'),
  ('s1',  25, 'elite', 'unlockable', 'sp_t_calculador', null, '{}'),
  ('s1',  28, 'elite', 'unlockable', 's1_ember', null, '{}'),
  ('s1',  30, 'elite', 'unlockable', 'sp_t_sangre_fria', null, '{}'),
  ('s1',  33, 'elite', 'sp', null, 450, '{"icon":"⚡","label":"+450 SP"}'),
  ('s1',  34, 'elite', 'unlockable', 'sp_b_imparable', null, '{}'),
  ('s1',  38, 'elite', 'unlockable', 'sp_f_chispa', null, '{}'),
  ('s1',  40, 'elite', 'unlockable', 'sp_t_muro', null, '{}'),
  ('s1',  43, 'elite', 'sp', null, 500, '{"icon":"⚡","label":"+500 SP"}'),
  ('s1',  44, 'elite', 'unlockable', 'sp_f_fatuo', null, '{}'),
  ('s1',  48, 'elite', 'unlockable', 'sp_t_metralla', null, '{}'),
  ('s1',  50, 'elite', 'unlockable', 'sp_t_estrella', null, '{}'),
  ('s1',  54, 'elite', 'unlockable', 's1_llamas_eternas', null, '{}'),
  ('s1',  58, 'elite', 'unlockable', 'sp_t_virtuoso', null, '{}'),
  ('s1',  63, 'elite', 'unlockable', 'sp_b_mitad', null, '{}'),
  ('s1',  68, 'elite', 'unlockable', 'sp_t_implacable', null, '{}'),
  ('s1',  70, 'elite', 'unlockable', 'sp_t_resiliente', null, '{}'),
  ('s1',  73, 'elite', 'sp', null, 650, '{"icon":"⚡","label":"+650 SP"}'),
  ('s1',  75, 'elite', 'unlockable', 'sp_f_fenix', null, '{}'),
  ('s1',  76, 'elite', 'unlockable', 'sp_t_mente', null, '{}'),
  ('s1',  78, 'elite', 'unlockable', 'sp_t_cazagigantes', null, '{}'),
  ('s1',  80, 'elite', 'unlockable', 'sp_t_senor', null, '{}'),
  ('s1',  83, 'elite', 'sp', null, 800, '{"icon":"⚡","label":"+800 SP"}'),
  ('s1',  85, 'elite', 'unlockable', 'sp_b_semifinal', null, '{}'),
  ('s1',  88, 'elite', 'unlockable', 's1_corona_llamas', null, '{}'),
  ('s1',  90, 'elite', 'unlockable', 'sp_t_depredador', null, '{}'),
  ('s1',  93, 'elite', 'sp', null, 900, '{"icon":"⚡","label":"+900 SP"}'),
  ('s1',  96, 'elite', 'sp', null, 1000, '{"icon":"⚡","label":"+1000 SP"}'),
  ('s1', 100, 'elite', 'unlockable', 'sp_t_rey', null, '{}');
