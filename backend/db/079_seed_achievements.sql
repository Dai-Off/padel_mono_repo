-- Seed inicial de LOGROS (kind trophy/badge) con reglas reales de desbloqueo.
-- Idempotente: ON CONFLICT actualiza el contenido (la BD es la fuente de verdad,
-- editable sin tocar la app). Los CURSOS no se siembran aquí: se sincronizan
-- desde learning_courses. Títulos y marcos se siembran en Fase 3 (081).

insert into public.unlockables
  (id, kind, title, description, rarity, icon, unlock_type, unlock_value, sport, sort_order)
values
  -- Partidos jugados
  ('first_match',  'badge',  'Primer partido',  'Juega tu primer partido',            'common',    'tennisball-outline', 'matches', '1',   'Pádel', 10),
  ('matches_10',   'badge',  'Habitual',        'Juega 10 partidos',                  'common',    'calendar-outline',   'matches', '10',  'Pádel', 11),
  ('matches_50',   'trophy', 'Veterano',        'Juega 50 partidos',                  'rare',      'ribbon-outline',     'matches', '50',  'Pádel', 12),
  ('matches_200',  'trophy', 'Leyenda de pista','Juega 200 partidos',                 'legendary', 'trophy-outline',     'matches', '200', 'Pádel', 13),
  -- Victorias
  ('wins_10',      'badge',  'Ganador',         'Gana 10 partidos',                   'common',    'trending-up-outline','wins',    '10',  'Pádel', 20),
  ('wins_50',      'trophy', 'Dominador',       'Gana 50 partidos',                   'epic',      'flash-outline',      'wins',    '50',  'Pádel', 21),
  -- Rachas de victorias
  ('streak_3',     'badge',  'En racha',        'Gana 3 partidos seguidos',           'rare',      'flame-outline',      'win_streak', '3',  'Pádel', 30),
  ('streak_10',    'trophy', 'Imparable',       'Gana 10 partidos seguidos',          'epic',      'flame',              'win_streak', '10', 'Pádel', 31),
  -- Nivel (ELO 0-7)
  ('level_3',      'badge',  'Nivel 3.0',       'Alcanza el nivel 3.0',               'rare',      'speedometer-outline','level',   '3.0', 'Pádel', 40),
  ('level_4',      'trophy', 'Nivel 4.0',       'Alcanza el nivel 4.0',               'legendary', 'medal-outline',      'level',   '4.0', 'Pádel', 41),
  -- Learning
  ('lesson_streak_7','badge','Estudioso',       'Completa la lección diaria 7 días seguidos', 'epic', 'school-outline',   'daily_lesson_streak', '7', null, 50),
  ('first_course', 'badge',  'Aprendiz',        'Completa tu primer curso',           'common',    'book-outline',       'courses_completed', '1', null, 51)
on conflict (id) do update set
  kind         = excluded.kind,
  title        = excluded.title,
  description  = excluded.description,
  rarity       = excluded.rarity,
  icon         = excluded.icon,
  unlock_type  = excluded.unlock_type,
  unlock_value = excluded.unlock_value,
  sport        = excluded.sport,
  sort_order   = excluded.sort_order,
  updated_at   = now();
