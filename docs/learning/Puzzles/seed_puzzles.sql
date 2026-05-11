-- ===========================================================================
-- Seed: 5 puzzles de prueba para WeMatch
-- Cada puzzle tiene posiciones iniciales distintas para que sean
-- visualmente distinguibles entre sí.
-- ===========================================================================

-- Limpieza opcional (descomenta si quieres recrear desde cero):
-- delete from public.learning_questions
--  where type = 'puzzle' and created_by_club = 'ec0bc05c-f21b-465b-82b0-6bd75d1f4163';

-- ---------------------------------------------------------------------------
-- Puzzle 1: rival sube a la red, equipo en defensa profunda — sin reveal_frame
-- ---------------------------------------------------------------------------
with q as (
  insert into public.learning_questions (type, level, area, has_video, video_url, content, created_by_club, is_active)
  values ('puzzle', 2, 'tactics', false, null, '{}'::jsonb, 'ec0bc05c-f21b-465b-82b0-6bd75d1f4163', true)
  returning id
)
insert into public.learning_puzzles (question_id, schema_version, statement, court_position, initial_frame, options)
select
  id, 1,
  'Tu rival ha subido a la red y tú estás en el fondo. ¿Cuál es la mejor jugada?',
  'both',
  jsonb_build_object(
    'players', jsonb_build_array(
      jsonb_build_object('id', 1, 'team', 1, 'x', 2.5, 'y', 18.0),
      jsonb_build_object('id', 2, 'team', 1, 'x', 7.5, 'y', 18.0),
      jsonb_build_object('id', 3, 'team', 2, 'x', 3.0, 'y', 8.0),
      jsonb_build_object('id', 4, 'team', 2, 'x', 7.0, 'y', 8.0)
    ),
    'ball', jsonb_build_object('x', 5.0, 'y', 16.0)
  ),
  jsonb_build_array(
    jsonb_build_object('id', 1, 'text', 'Globo', 'explanation', 'Correcto: les fuerza a retroceder', 'points', 2),
    jsonb_build_object('id', 2, 'text', 'Bandeja', 'explanation', 'No es el mejor recurso desde el fondo', 'points', 1),
    jsonb_build_object('id', 3, 'text', 'Smash', 'explanation', 'Demasiado riesgo desde esa distancia', 'points', 0)
  )
from q;

-- ---------------------------------------------------------------------------
-- Puzzle 2: saque cómodo, rivales aún en zona de saque — reveal sin shot_type
-- ---------------------------------------------------------------------------
with q as (
  insert into public.learning_questions (type, level, area, has_video, video_url, content, created_by_club, is_active)
  values ('puzzle', 2, 'tactics', false, null, '{}'::jsonb, 'ec0bc05c-f21b-465b-82b0-6bd75d1f4163', true)
  returning id
)
insert into public.learning_puzzles (question_id, schema_version, statement, court_position, initial_frame, options)
select
  id, 1,
  'Tu rival saca y la pelota viene cómoda. Estás en posición de resto. ¿A dónde devuelves?',
  'both',
  jsonb_build_object(
    'players', jsonb_build_array(
      jsonb_build_object('id', 1, 'team', 1, 'x', 7.5, 'y', 17.0),
      jsonb_build_object('id', 2, 'team', 1, 'x', 2.5, 'y', 14.0),
      jsonb_build_object('id', 3, 'team', 2, 'x', 7.0, 'y', 4.0),
      jsonb_build_object('id', 4, 'team', 2, 'x', 2.5, 'y', 7.0)
    ),
    'ball', jsonb_build_object('x', 7.5, 'y', 14.5)
  ),
  jsonb_build_array(
    jsonb_build_object(
      'id', 1, 'text', 'Cruzada al fondo', 'explanation', 'Correcta: rompes la posición rival y ganas la red',
      'points', 2,
      'reveal_frame', jsonb_build_object(
        'players', jsonb_build_array(
          jsonb_build_object('id', 1, 'team', 1, 'x', 7.0, 'y', 13.0),
          jsonb_build_object('id', 2, 'team', 1, 'x', 3.0, 'y', 12.0),
          jsonb_build_object('id', 3, 'team', 2, 'x', 7.5, 'y', 4.0),
          jsonb_build_object('id', 4, 'team', 2, 'x', 1.5, 'y', 6.0)
        ),
        'ball', jsonb_build_object('x', 1.5, 'y', 2.5),
        'duration_ms', 1500
      )
    ),
    jsonb_build_object('id', 2, 'text', 'Paralela', 'explanation', 'Riesgo alto: demasiado cerca de la línea', 'points', 0),
    jsonb_build_object('id', 3, 'text', 'Cruzada corta', 'explanation', 'Aceptable pero deja al rival con bola', 'points', 1)
  )
from q;

-- ---------------------------------------------------------------------------
-- Puzzle 3: pelota baja cerca de la red — reveal con shot_type=lob
-- ---------------------------------------------------------------------------
with q as (
  insert into public.learning_questions (type, level, area, has_video, video_url, content, created_by_club, is_active)
  values ('puzzle', 3, 'tactics', false, null, '{}'::jsonb, 'ec0bc05c-f21b-465b-82b0-6bd75d1f4163', true)
  returning id
)
insert into public.learning_puzzles (question_id, schema_version, statement, court_position, initial_frame, options)
select
  id, 1,
  'Estás cerca de la red, la pelota viene baja. Tus rivales están adelantados. ¿Qué jugada eliges?',
  'both',
  jsonb_build_object(
    'players', jsonb_build_array(
      jsonb_build_object('id', 1, 'team', 1, 'x', 4.0, 'y', 12.0),
      jsonb_build_object('id', 2, 'team', 1, 'x', 8.0, 'y', 12.5),
      jsonb_build_object('id', 3, 'team', 2, 'x', 3.0, 'y', 7.5),
      jsonb_build_object('id', 4, 'team', 2, 'x', 7.5, 'y', 7.0)
    ),
    'ball', jsonb_build_object('x', 4.0, 'y', 11.0)
  ),
  jsonb_build_array(
    jsonb_build_object(
      'id', 1, 'text', 'Lob defensivo', 'explanation', 'Correcta: ganas tiempo y los echas hacia atrás',
      'points', 2,
      'reveal_frame', jsonb_build_object(
        'players', jsonb_build_array(
          jsonb_build_object('id', 1, 'team', 1, 'x', 4.0, 'y', 14.0),
          jsonb_build_object('id', 2, 'team', 1, 'x', 8.0, 'y', 14.0),
          jsonb_build_object('id', 3, 'team', 2, 'x', 3.0, 'y', 1.5),
          jsonb_build_object('id', 4, 'team', 2, 'x', 7.5, 'y', 1.5)
        ),
        'ball', jsonb_build_object('x', 5.0, 'y', 1.5, 'shot_type', 'lob'),
        'duration_ms', 2000
      )
    ),
    jsonb_build_object('id', 2, 'text', 'Volea agresiva', 'explanation', 'Mal momento: la pelota está demasiado baja', 'points', 0),
    jsonb_build_object('id', 3, 'text', 'Bandeja larga', 'explanation', 'Aceptable pero menos óptima que el lob', 'points', 1)
  )
from q;

-- ---------------------------------------------------------------------------
-- Puzzle 4: chiquita rival peligrosa — reveal con chiquita + spin
-- ---------------------------------------------------------------------------
with q as (
  insert into public.learning_questions (type, level, area, has_video, video_url, content, created_by_club, is_active)
  values ('puzzle', 3, 'tactics', false, null, '{}'::jsonb, 'ec0bc05c-f21b-465b-82b0-6bd75d1f4163', true)
  returning id
)
insert into public.learning_puzzles (question_id, schema_version, statement, court_position, initial_frame, options)
select
  id, 1,
  'El rival ha jugado una chiquita corta. Estás llegando con dificultad. ¿Cómo respondes?',
  'both',
  jsonb_build_object(
    'players', jsonb_build_array(
      jsonb_build_object('id', 1, 'team', 1, 'x', 5.5, 'y', 11.5),
      jsonb_build_object('id', 2, 'team', 1, 'x', 8.5, 'y', 16.0),
      jsonb_build_object('id', 3, 'team', 2, 'x', 2.5, 'y', 6.5),
      jsonb_build_object('id', 4, 'team', 2, 'x', 7.0, 'y', 7.0)
    ),
    'ball', jsonb_build_object('x', 5.5, 'y', 10.5)
  ),
  jsonb_build_array(
    jsonb_build_object(
      'id', 1, 'text', 'Contra-chiquita', 'explanation', 'Correcta: les obligas a salir adelante a destiempo',
      'points', 2,
      'reveal_frame', jsonb_build_object(
        'players', jsonb_build_array(
          jsonb_build_object('id', 1, 'team', 1, 'x', 5.0, 'y', 10.5),
          jsonb_build_object('id', 2, 'team', 1, 'x', 8.5, 'y', 16.0),
          jsonb_build_object('id', 3, 'team', 2, 'x', 4.0, 'y', 6.5),
          jsonb_build_object('id', 4, 'team', 2, 'x', 7.0, 'y', 7.0)
        ),
        'ball', jsonb_build_object('x', 4.0, 'y', 8.5, 'shot_type', 'chiquita', 'spin', 'clockwise'),
        'duration_ms', 1500
      )
    ),
    jsonb_build_object('id', 2, 'text', 'Globo', 'explanation', 'Demasiado lento: te cuelan otra chiquita', 'points', 1),
    jsonb_build_object('id', 3, 'text', 'Volea fuerte', 'explanation', 'No llegas con tiempo a esa pelota', 'points', 0)
  )
from q;

-- ---------------------------------------------------------------------------
-- Puzzle 5: resto con dos rivales en la red — reveal en las 3 opciones
-- ---------------------------------------------------------------------------
with q as (
  insert into public.learning_questions (type, level, area, has_video, video_url, content, created_by_club, is_active)
  values ('puzzle', 4, 'tactics', false, null, '{}'::jsonb, 'ec0bc05c-f21b-465b-82b0-6bd75d1f4163', true)
  returning id
)
insert into public.learning_puzzles (question_id, schema_version, statement, court_position, initial_frame, options)
select
  id, 1,
  'Restas y los dos rivales ya están subidos a la red. ¿Cuál es la mejor opción?',
  'both',
  jsonb_build_object(
    'players', jsonb_build_array(
      jsonb_build_object('id', 1, 'team', 1, 'x', 2.0, 'y', 19.0),
      jsonb_build_object('id', 2, 'team', 1, 'x', 8.0, 'y', 14.5),
      jsonb_build_object('id', 3, 'team', 2, 'x', 3.0, 'y', 4.0),
      jsonb_build_object('id', 4, 'team', 2, 'x', 7.0, 'y', 4.0)
    ),
    'ball', jsonb_build_object('x', 2.0, 'y', 17.0)
  ),
  jsonb_build_array(
    jsonb_build_object(
      'id', 1, 'text', 'Resto cruzado', 'explanation', 'Correcta: máxima distancia y los obligas a moverse',
      'points', 2,
      'reveal_frame', jsonb_build_object(
        'players', jsonb_build_array(
          jsonb_build_object('id', 1, 'team', 1, 'x', 2.0, 'y', 17.0),
          jsonb_build_object('id', 2, 'team', 1, 'x', 8.0, 'y', 14.5),
          jsonb_build_object('id', 3, 'team', 2, 'x', 4.5, 'y', 4.0),
          jsonb_build_object('id', 4, 'team', 2, 'x', 7.0, 'y', 4.0)
        ),
        'ball', jsonb_build_object('x', 8.5, 'y', 4.5),
        'duration_ms', 1500
      )
    ),
    jsonb_build_object(
      'id', 2, 'text', 'Globo de resto', 'explanation', 'Te juegan la siguiente cómoda',
      'points', 1,
      'reveal_frame', jsonb_build_object(
        'players', jsonb_build_array(
          jsonb_build_object('id', 1, 'team', 1, 'x', 2.0, 'y', 17.0),
          jsonb_build_object('id', 2, 'team', 1, 'x', 8.0, 'y', 16.0),
          jsonb_build_object('id', 3, 'team', 2, 'x', 3.0, 'y', 1.5),
          jsonb_build_object('id', 4, 'team', 2, 'x', 7.0, 'y', 1.5)
        ),
        'ball', jsonb_build_object('x', 5.0, 'y', 1.5, 'shot_type', 'lob'),
        'duration_ms', 2000
      )
    ),
    jsonb_build_object(
      'id', 3, 'text', 'Chiquita', 'explanation', 'Mal: les regalas la red en zona ya cómoda',
      'points', 0,
      'reveal_frame', jsonb_build_object(
        'players', jsonb_build_array(
          jsonb_build_object('id', 1, 'team', 1, 'x', 2.0, 'y', 17.0),
          jsonb_build_object('id', 2, 'team', 1, 'x', 8.0, 'y', 14.5),
          jsonb_build_object('id', 3, 'team', 2, 'x', 3.0, 'y', 5.0),
          jsonb_build_object('id', 4, 'team', 2, 'x', 7.0, 'y', 5.0)
        ),
        'ball', jsonb_build_object('x', 5.0, 'y', 9.0, 'shot_type', 'chiquita'),
        'duration_ms', 1500
      )
    )
  )
from q;
