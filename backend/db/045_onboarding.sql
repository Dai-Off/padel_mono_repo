-- ============================================================================
-- 045_onboarding.sql
-- Setup completo del módulo de onboarding (cuestionario de nivelación inicial).
-- Unifica en un solo script: configuración global del algoritmo, ajustes de
-- preguntas de Fase 1 (P1, P2, P6a/b, P9) y carga de 60 preguntas de Fase 2
-- (12 por pool: beginner, intermediate, advanced, competition, professional).
--
-- Idempotente: se puede re-ejecutar sin efectos colaterales.
--
-- Convenciones de options:
--   - Fase 1 P1/P2/P3/P4/P5/P7/P9: array de {value, text, ...campos específicos}.
--   - Fase 1 P6a/P6b (multi):      array de {value, text, elo}.
--   - Fase 2 single: {"options":[...], "correct_index":N, "has_image":bool}
--   - Fase 2 multi:  {"options":[...], "correct_indices":[...], "has_image":bool}
--   - Fase 2 order:  {"steps":[...correctos en orden...], "has_image":bool}
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Tabla onboarding_config: parámetros globales del algoritmo
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS onboarding_config (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION onboarding_config_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS onboarding_config_touch ON onboarding_config;
CREATE TRIGGER onboarding_config_touch
BEFORE UPDATE ON onboarding_config
FOR EACH ROW EXECUTE FUNCTION onboarding_config_touch_updated_at();

-- RLS desactivada: onboarding_config es config global (no contiene datos de
-- usuarios). Si se deja activa sin policies, las queries del backend pueden
-- devolver 0 filas cuando el cliente Supabase ha sido contaminado con un JWT
-- de usuario al autenticar, y el servicio revienta con "falta la clave X".
ALTER TABLE onboarding_config DISABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. Seeds de onboarding_config
-- ----------------------------------------------------------------------------

-- p6_factors: factor de agregación del multiselect P6.
-- Fórmula: elo = max(seleccionados) + sum(resto) * factor[question_key]
INSERT INTO onboarding_config (key, value, description) VALUES
('p6_factors',
 '{"p6a":0.3,"p6b":0.2}'::jsonb,
 'Factor aplicado a las opciones no-máximas en el multiselect P6 (p6a para P1=3, p6b para P1=4)')
ON CONFLICT (key) DO UPDATE SET
  value       = EXCLUDED.value,
  description = EXCLUDED.description;

-- phase2_pools: rangos de ELO Fase 1 -> pool de Fase 2.
-- Se evalúa en orden: el primer pool cuyo "max" sea mayor que eloPhase1 gana.
-- "min" es inclusivo, "max" exclusivo.
INSERT INTO onboarding_config (key, value, description) VALUES
('phase2_pools',
 '[
    {"min":0.0,"max":2.0,"pool":"beginner"},
    {"min":2.0,"max":3.5,"pool":"intermediate"},
    {"min":3.5,"max":4.5,"pool":"advanced"},
    {"min":4.5,"max":5.5,"pool":"competition"},
    {"min":5.5,"max":999,"pool":"professional"}
  ]'::jsonb,
 'Mapeo de rangos de ELO Fase 1 al pool de preguntas de Fase 2')
ON CONFLICT (key) DO UPDATE SET
  value       = EXCLUDED.value,
  description = EXCLUDED.description;

-- phase2_adjustments: ajuste al ELO según score de Fase 2 (0-5).
-- Se evalúa de mayor a menor min_score; primer match gana.
INSERT INTO onboarding_config (key, value, description) VALUES
('phase2_adjustments',
 '[
    {"min_score":5.0,"adjustment":0.7},
    {"min_score":4.0,"adjustment":0.4},
    {"min_score":3.0,"adjustment":0.2},
    {"min_score":2.5,"adjustment":0.0},
    {"min_score":2.0,"adjustment":-0.3},
    {"min_score":1.0,"adjustment":-0.7},
    {"min_score":0.0,"adjustment":-1.0}
  ]'::jsonb,
 'Ajuste al ELO Fase 1 según puntuación de Fase 2')
ON CONFLICT (key) DO UPDATE SET
  value       = EXCLUDED.value,
  description = EXCLUDED.description;

-- final_bounds: floor y ceiling del ELO final tras sumar Fase 1 + Fase 2.
INSERT INTO onboarding_config (key, value, description) VALUES
('final_bounds',
 '{"floor":0.5,"ceiling":6.25}'::jsonb,
 'Floor y ceiling aplicados al ELO final (post Fase 2)')
ON CONFLICT (key) DO UPDATE SET
  value       = EXCLUDED.value,
  description = EXCLUDED.description;

-- ----------------------------------------------------------------------------
-- 3. Ajustes puntuales en preguntas de Fase 1 (P1, P2, P9)
-- ----------------------------------------------------------------------------

-- P2 opción D: ceiling 6.25 -> 5.5
UPDATE onboarding_questions
SET options = jsonb_set(options, '{3,ceiling}', '5.5'::jsonb)
WHERE question_key = 'p2';

-- P1 opción 0: eliminar base_elo=2 huérfano (P1 no usa base_elo)
UPDATE onboarding_questions
SET options = options #- '{0,base_elo}'
WHERE question_key = 'p1';

-- P1: añadir techos de Fase 1 por opción (idx 0 y 1 sin techo -> null).
-- El servicio lee opt.ceiling para aplicar el techo de P1.
UPDATE onboarding_questions
SET options = (
  SELECT jsonb_agg(
    CASE (ord - 1)
      WHEN 0 THEN opt || '{"ceiling":null}'::jsonb
      WHEN 1 THEN opt || '{"ceiling":null}'::jsonb
      WHEN 2 THEN opt || '{"ceiling":2.9}'::jsonb
      WHEN 3 THEN opt || '{"ceiling":4.4}'::jsonb
      WHEN 4 THEN opt || '{"ceiling":6.0}'::jsonb
      ELSE opt
    END
    ORDER BY ord
  )
  FROM jsonb_array_elements(options) WITH ORDINALITY AS t(opt, ord)
)
WHERE question_key = 'p1';

-- P9: inyectar matriz de correctores por opción.
-- Matriz:
--   P9 \ P2 | sin_p2 | A   | B   | C   | D
--   0 Cas.  | 0.5    | 0.1 | 0.1 | 0.0 | 0.0
--   1 Reg.  | 0.7    | 0.2 | 0.1 | 0.0 | 0.0
--   2 Entr. | 1.0    | 0.3 | 0.2 | 0.1 | 0.0
--   3 Comp. | 1.8    | 1.3 | 0.9 | 0.4 | 0.0
UPDATE onboarding_questions
SET options = (
  SELECT jsonb_agg(
    CASE (ord - 1)
      WHEN 0 THEN opt || '{"correctors":{"sin_p2":0.5,"A":0.1,"B":0.1,"C":0.0,"D":0.0}}'::jsonb
      WHEN 1 THEN opt || '{"correctors":{"sin_p2":0.7,"A":0.2,"B":0.1,"C":0.0,"D":0.0}}'::jsonb
      WHEN 2 THEN opt || '{"correctors":{"sin_p2":1.0,"A":0.3,"B":0.2,"C":0.1,"D":0.0}}'::jsonb
      WHEN 3 THEN opt || '{"correctors":{"sin_p2":1.8,"A":1.3,"B":0.9,"C":0.4,"D":0.0}}'::jsonb
      ELSE opt
    END
    ORDER BY ord
  )
  FROM jsonb_array_elements(options) WITH ORDINALITY AS t(opt, ord)
)
WHERE question_key = 'p9';

-- ----------------------------------------------------------------------------
-- 4. Desactivar preguntas antiguas que ya no se sirven
-- ----------------------------------------------------------------------------

-- Fase 2 antigua (claves phase2_*)
UPDATE onboarding_questions
SET is_active = false
WHERE phase = 2 AND question_key LIKE 'phase2_%';

-- P6 antigua (ahora dividida en p6a y p6b según P1)
UPDATE onboarding_questions
SET is_active = false
WHERE question_key = 'p6';

-- ----------------------------------------------------------------------------
-- 5. UPSERT de p6a (P1=3) y p6b (P1=4)
-- ----------------------------------------------------------------------------

INSERT INTO onboarding_questions (question_key, phase, pool, text, type, options, display_order, is_active) VALUES

('p6a', 1, NULL,
 '¿Cómo y dónde juegas o compites?',
 'multi',
 '[
    {"value":"amigos","text":"Con amigos o conocidos","elo":0.1},
    {"value":"torneos_sociales","text":"Torneos sociales o amistosos","elo":0.2},
    {"value":"torneos_competitivos","text":"Torneos competitivos de club o ranking","elo":0.5},
    {"value":"ligas_amateur","text":"Ligas amateur organizadas","elo":0.8}
  ]'::jsonb,
 60, true),

('p6b', 1, NULL,
 '¿Cómo y dónde juegas o compites?',
 'multi',
 '[
    {"value":"torneos_competitivos","text":"Torneos competitivos de club o ranking","elo":0.3},
    {"value":"ligas_amateur","text":"Ligas amateur organizadas","elo":0.3},
    {"value":"liga_federados","text":"Liga/torneos federados","elo":0.8},
    {"value":"circuitos","text":"Circuitos nacionales o internacionales","elo":1.2}
  ]'::jsonb,
 61, true)

ON CONFLICT (question_key) DO UPDATE SET
  phase         = EXCLUDED.phase,
  pool          = EXCLUDED.pool,
  text          = EXCLUDED.text,
  type          = EXCLUDED.type,
  options       = EXCLUDED.options,
  display_order = EXCLUDED.display_order,
  is_active     = EXCLUDED.is_active;

-- ----------------------------------------------------------------------------
-- 6. UPSERT de las 60 preguntas de Fase 2 (12 por pool)
-- ----------------------------------------------------------------------------

INSERT INTO onboarding_questions (question_key, phase, pool, text, type, options, display_order, is_active) VALUES

-- ===================== POOL BEGINNER =====================
('B-TEC-01', 2, 'beginner',
 '¿Dónde debe producirse el impacto ideal con la pelota en la mayoría de golpes?',
 'single',
 '{"options":["Muy pegado al cuerpo","Delante del cuerpo","Detrás del cuerpo","A cualquier altura","No lo sé"],"correct_index":1,"has_image":false}'::jsonb,
 1, true),

('B-TEC-02', 2, 'beginner',
 'En un golpe de derecha básico, ¿cómo debe estar la cara de la pala en el impacto?',
 'single',
 '{"options":["Totalmente abierta","Totalmente cerrada","Girada hacia atrás","Ligeramente abierta o neutra"],"correct_index":3,"has_image":false}'::jsonb,
 2, true),

('B-TEC-03', 2, 'beginner',
 '¿Qué parte del cuerpo genera principalmente la aceleración en un golpe?',
 'single',
 '{"options":["Codo","Espalda","Hombro","Muñeca"],"correct_index":0,"has_image":false}'::jsonb,
 3, true),

('B-TEC-04', 2, 'beginner',
 '¿Qué ocurre si golpeas siempre con el brazo rígido sin acompañar el golpe?',
 'single',
 '{"options":["Más potencia","Menos control y peor ejecución","Más control","No cambia nada"],"correct_index":1,"has_image":false}'::jsonb,
 4, true),

('B-TAC-01', 2, 'beginner',
 'Tus rivales están en la red y tú en el fondo, ¿cuál es la mejor opción?',
 'single',
 '{"options":["Golpear fuerte","No lo sé","Globo para pasarles","Golpear suave"],"correct_index":2,"has_image":false}'::jsonb,
 5, true),

('B-TAC-02', 2, 'beginner',
 'Si juego en la derecha y mi compañero en el revés, estamos los dos en la red y la bola viene por el centro pero la ha golpeado el jugador de derecha, ¿quién debería volearla?',
 'single',
 '{"options":["Yo porque estoy en cruzado","Mi compañero porque va de derecha","Depende de la velocidad de la bola","Mi compañero porque está en paralelo"],"correct_index":0,"has_image":true}'::jsonb,
 6, true),

('B-TAC-03', 2, 'beginner',
 'Si estás en la red y la bola viene baja, ¿qué deberías hacer?',
 'single',
 '{"options":["Dejarla pasar","Controlar la bola","Intentar rematar","Golpear fuerte"],"correct_index":1,"has_image":true}'::jsonb,
 7, true),

('B-TAC-04', 2, 'beginner',
 'En un peloteo básico, ¿qué es más importante al inicio?',
 'single',
 '{"options":["No lo sé","Golpear fuerte","Ganar el punto rápido","Mantener la bola en juego con control"],"correct_index":3,"has_image":false}'::jsonb,
 8, true),

('B-REG-01', 2, 'beginner',
 '¿Puede la pelota tocar la red durante un punto (no saque) y seguir siendo válida?',
 'single',
 '{"options":["Sí, si pasa al otro lado","Solo en defensa","No, se repite el punto","Solo en ataque"],"correct_index":0,"has_image":false}'::jsonb,
 9, true),

('B-REG-02', 2, 'beginner',
 '¿Puedes golpear la pelota si aún no ha pasado completamente la red hacia tu campo?',
 'single',
 '{"options":["Sí","No, debes esperar a que pase a tu lado","Solo en remates","Sí, pero solo si ganas el punto"],"correct_index":1,"has_image":false}'::jsonb,
 10, true),

('B-REG-03', 2, 'beginner',
 'Si la pelota toca tu cuerpo antes de botar…',
 'single',
 '{"options":["El punto sigue","Es punto para el rival","Se repite","Es buena mía porque no se puede tirar a dar"],"correct_index":1,"has_image":false}'::jsonb,
 11, true),

('B-REG-04', 2, 'beginner',
 '¿Puede la pelota tocar el poste de la red durante el punto y ser válida?',
 'single',
 '{"options":["Solo en saque","Sí, siempre","No","Sí, si pasa al campo contrario correctamente"],"correct_index":3,"has_image":false}'::jsonb,
 12, true),

-- ===================== POOL INTERMEDIATE =====================
('I-TEC-01', 2, 'intermediate',
 '¿Cuál es la principal diferencia entre una bandeja y una víbora?',
 'single',
 '{"options":["La altura del impacto","La fuerza del golpe","La intención del golpe","El control del golpe","No lo sé"],"correct_index":2,"has_image":false}'::jsonb,
 1, true),

('I-TEC-02', 2, 'intermediate',
 'En una salida de pared de derecha, ¿cuándo debes golpear la pelota?',
 'single',
 '{"options":["Justo antes de la pared","En el hombro trasero","A la altura del pecho","En el hombro delantero"],"correct_index":3,"has_image":true}'::jsonb,
 2, true),

('I-TEC-03', 2, 'intermediate',
 '¿Qué ocurre si armas el golpe muy largo de forma general?',
 'single',
 '{"options":["Golpeas con más potencia","Golpeas más preciso","Pierdes tiempo y calidad de golpeo","No afecta"],"correct_index":2,"has_image":false}'::jsonb,
 3, true),

('I-TEC-04', 2, 'intermediate',
 '¿Cuál es la función principal de la terminación del golpe?',
 'single',
 '{"options":["Dar potencia","Dar control y peso al golpe","Evitar errores de ajuste","No lo sé"],"correct_index":1,"has_image":false}'::jsonb,
 4, true),

('I-TAC-01', 2, 'intermediate',
 'Estás en la red y recibes una bola incómoda (baja y rápida):',
 'single',
 '{"options":["Bloquear","Golpear fuerte","Jugar cortado","Jugar hacia las rejas"],"correct_index":0,"has_image":false}'::jsonb,
 5, true),

('I-TAC-02', 2, 'intermediate',
 'En un punto equilibrado, ¿cuál es la mejor decisión?',
 'single',
 '{"options":["Mantener el punto hasta generar ventaja","Jugar siempre al mismo jugador","Jugar al jugador en paralelo","Arriesgar para tomar ventaja"],"correct_index":0,"has_image":false}'::jsonb,
 6, true),

('I-TAC-03', 2, 'intermediate',
 'Estás en la red y tu compañero en el fondo defendiendo, ¿qué deberías hacer?',
 'single',
 '{"options":["Mantenerte en la red pase lo que pase","Bajar hasta media pista","Retroceder para ayudar en defensa","Depende de la velocidad a la que venga la bola"],"correct_index":2,"has_image":false}'::jsonb,
 7, true),

('I-TAC-04', 2, 'intermediate',
 '¿Cuál es la mejor zona para posicionarte mientras voleas?',
 'single',
 '{"options":["Zona 1 (primer poste / cerca de la red)","Zona 2 (segundo poste)","Zona 3 (entre el segundo poste y pico)","Zona 4 (pico)"],"correct_index":1,"has_image":true}'::jsonb,
 8, true),

('I-REG-01', 2, 'intermediate',
 '¿Puede la pelota botar en el cuadro de saque y luego tocar la pared antes de que el rival la golpee?',
 'single',
 '{"options":["Se repite","No lo sé","Punto perdido","Sí, es válida y el punto sigue"],"correct_index":3,"has_image":false}'::jsonb,
 9, true),

('I-REG-02', 2, 'intermediate',
 'Si la pelota toca la línea en cualquier jugada…',
 'single',
 '{"options":["No es válida","Solo en el saque","Es buena (válida)","Depende de si toca o no la pared después del bote"],"correct_index":2,"has_image":false}'::jsonb,
 10, true),

('I-REG-03', 2, 'intermediate',
 'En un punto, si la pelota toca la red y luego bota en el campo rival:',
 'single',
 '{"options":["Punto para el rival","El punto se detiene","Es válido y el punto continúa","Se repite"],"correct_index":2,"has_image":false}'::jsonb,
 11, true),

('I-REG-04', 2, 'intermediate',
 'Durante un punto, si tu pala se rompe y la pelota sigue en juego:',
 'single',
 '{"options":["Puedes seguir jugando el punto si puedes devolver la bola","Se repite el punto","El punto se detiene automáticamente","Pierdes el punto automáticamente"],"correct_index":0,"has_image":false}'::jsonb,
 12, true),

-- ===================== POOL ADVANCED =====================
('A-TEC-01', 2, 'advanced',
 '¿Qué elementos son clave en un buen remate? (selecciona 3)',
 'multi',
 '{"options":["Uso de piernas","Solo brazo","Coordinación corporal","Busca un impacto de muñeca","Golpear sin saltar o impulso","Empuñadura este de derecha","Empuñadura este de revés"],"correct_indices":[0,2,6],"has_image":false}'::jsonb,
 1, true),

('A-TEC-02', 2, 'advanced',
 '"En la bandeja, el punto de impacto debe estar a la altura de los ojos"',
 'single',
 '{"options":["Verdadero","Falso"],"correct_index":0,"has_image":false}'::jsonb,
 2, true),

('A-TEC-03', 2, 'advanced',
 'Si en la bajada de pared la bola se te va al cristal de forma habitual, ¿cuál es el error más probable?',
 'single',
 '{"options":["Poco girado antes del impacto","Impacto demasiado tarde","Empuñadura incorrecta","Impacto demasiado pronto"],"correct_index":3,"has_image":false}'::jsonb,
 3, true),

('A-TEC-04', 2, 'advanced',
 'Ordena las partes de una volea para que sea lo más correcta posible:',
 'order',
 '{"steps":["Split step","Rotación de cadera y hombros","Armado corto y adelantado","Impacto delante del cuerpo + paso con el pie contrario","Terminación","Recuperar la posición"],"has_image":false}'::jsonb,
 4, true),

('A-TAC-01', 2, 'advanced',
 'Ordena de más importante a menos importante en ataque:',
 'order',
 '{"steps":["Mantener la red","Generar presión","Buscar el golpe ganador"],"has_image":false}'::jsonb,
 5, true),

('A-TAC-02', 2, 'advanced',
 'Estás en la red, juegas una bola que deja a un rival mal posicionado e incómodo, selecciona las opciones correctas:',
 'multi',
 '{"options":["Seguir jugando al jugador mal posicionado e incómodo","Cambiar al otro jugador para que no se lo esperen","Jugar al centro para generar duda y error","Presionar los espacios generados"],"correct_indices":[0,3],"has_image":false}'::jsonb,
 6, true),

('A-TAC-03', 2, 'advanced',
 'Estás en la red y quieres que la bola te llegue más veces, ¿qué debería hacer tu compañero?',
 'single',
 '{"options":["Jugar más al paralelo","Jugar más al centro","Jugar más al cruzado","Variar las direcciones para generar duda"],"correct_index":0,"has_image":false}'::jsonb,
 7, true),

('A-TAC-04', 2, 'advanced',
 'Si he jugado una chiquita de buena calidad y me he metido hacia media pista para seguir presionando, pero ambos jugadores se pegan a la red, ¿qué debería hacer?',
 'single',
 '{"options":["Hacer otra chiquita","Jugar firme al cuerpo","Tirar globo rápido","Buscar un ángulo","A y C son correctas","B y C son correctas"],"correct_index":5,"has_image":false}'::jsonb,
 8, true),

('A-REG-01', 2, 'advanced',
 '¿Es válido golpear la bola fuera de la pista si vuelve correctamente al campo rival?',
 'single',
 '{"options":["No es válida","Solo en competición","No lo sé","Sí, si la instalación lo permite y el golpe es correcto"],"correct_index":3,"has_image":false}'::jsonb,
 9, true),

('A-REG-02', 2, 'advanced',
 '"Puedes tocar la red después de terminar el punto"',
 'single',
 '{"options":["Falso","Verdadero"],"correct_index":1,"has_image":false}'::jsonb,
 10, true),

('A-REG-03', 2, 'advanced',
 'Durante un punto, si un jugador toca la red con la pala después de golpear la bola:',
 'single',
 '{"options":["Punto perdido automáticamente aunque ya haya golpeado la bola","Punto para ese jugador","Se repite","El punto sigue"],"correct_index":0,"has_image":false}'::jsonb,
 11, true),

('A-REG-04', 2, 'advanced',
 'Si haces una contrapared y la pelota golpea en la unión entre la pared y la reja:',
 'single',
 '{"options":["Siempre es mala","Siempre es buena","Siempre se repite","Depende del sonido"],"correct_index":0,"has_image":false}'::jsonb,
 12, true),

-- ===================== POOL COMPETITION =====================
('C-TEC-01', 2, 'competition',
 'En una derecha desde el fondo bajo presión, ¿qué combinación técnica es más eficiente para mantener control?',
 'single',
 '{"options":["Impacto a la altura del cuerpo + golpe plano","Impacto delante del cuerpo + golpeo cortado","Impacto detrás del cuerpo + impacto liftado","No lo sé","Impacto delante del cuerpo + golpeo plano"],"correct_index":4,"has_image":false}'::jsonb,
 1, true),

('C-TEC-02', 2, 'competition',
 'En una víbora ofensiva bien ejecutada, ¿qué elementos son clave?',
 'multi',
 '{"options":["Terminación larga","Golpe plano sin efecto","Golpear lo más fuerte posible","Uso de efecto cortado lateral","Impacto a la altura de los ojos y delante del cuerpo"],"correct_indices":[3,4],"has_image":false}'::jsonb,
 2, true),

('C-TEC-03', 2, 'competition',
 'Recibes una bola alta pero con poco peso en transición, ¿qué golpe es el más correcto?',
 'single',
 '{"options":["Jugar agresivo porque la pelota está alta","Jugar suave","Jugar a las rejas laterales","Jugar seguro y con profundidad","Jugar al centro"],"correct_index":3,"has_image":false}'::jsonb,
 3, true),

('C-TEC-04', 2, 'competition',
 '¿Qué elementos determinan más que mi volea toque cristal y caiga rápidamente?',
 'multi',
 '{"options":["Velocidad","Efecto","Giro de hombros","Peso","Armado","Terminación","Desgiro de hombros","Fuerza"],"correct_indices":[1,3,6],"has_image":false}'::jsonb,
 4, true),

('C-TAC-01', 2, 'competition',
 'Si juegas al centro, ¿cómo debe ir tu bola?',
 'single',
 '{"options":["Da igual","Ir suave o rápida","Ir a media velocidad","Ir cortada","Ir rápida"],"correct_index":1,"has_image":false}'::jsonb,
 5, true),

('C-TAC-02', 2, 'competition',
 '¿Qué es bascular con tu compañero?',
 'single',
 '{"options":["Subir y bajar juntos","Desplazarte con tu compañero ajustándoos el uno con el otro para no dejar espacios libres","Tapa el medio para evitar que os pasen","Cubrir los espacios que él no cubre"],"correct_index":1,"has_image":false}'::jsonb,
 6, true),

('C-TAC-03', 2, 'competition',
 'En un punto largo, tus rivales empiezan a defender mejor y te devuelven todo, ¿qué harías?',
 'single',
 '{"options":["Introducir variaciones (altura, ritmo, dirección) para romper dinámica","Buscar el golpe ganador","Mantener la presión y las direcciones hasta que fallen o se equivoquen","Aumentar la velocidad del juego","Todas son correctas"],"correct_index":0,"has_image":false}'::jsonb,
 7, true),

('C-TAC-04', 2, 'competition',
 'Te juegan rápido al cuerpo mientras estás en la red, ¿cuál es la mejor opción?',
 'single',
 '{"options":["Bloquear profundo","Bloquear buscando que bote en la línea","No lo sé","Bloquear corto"],"correct_index":1,"has_image":false}'::jsonb,
 8, true),

('C-REG-01', 2, 'competition',
 'Golpeas la bola pero parece que la has tocado 2 veces, selecciona las correctas:',
 'multi',
 '{"options":["Es buena si la bola no se despegó de la pala","Es buena aunque la toques 2 veces","Ninguna es correcta","Si dio 2 o más toques es mala"],"correct_indices":[0,3],"has_image":false}'::jsonb,
 9, true),

('C-REG-02', 2, 'competition',
 'La bola bota en campo rival y toca justo la unión entre suelo y pared:',
 'single',
 '{"options":["Depende del sonido","Siempre es mala","Siempre es buena","Se repite en caso de duda"],"correct_index":3,"has_image":false}'::jsonb,
 10, true),

('C-REG-03', 2, 'competition',
 'Si durante un punto se te cae la bola del bolsillo:',
 'single',
 '{"options":["Pierdes el punto","Se repite el punto pero solo la primera vez","Depende de quién estuviera atacando en ese momento","Ganas el punto","Nunca se repite"],"correct_index":1,"has_image":false}'::jsonb,
 11, true),

('C-REG-04', 2, 'competition',
 'Si un jugador golpea la bola y se le escapa la pala de la mano:',
 'single',
 '{"options":["Es buena","Depende de la opinión de un árbitro","Depende de si cuando golpeó la bola la pala la tenía agarrada","Es mala porque no se puede soltar la pala"],"correct_index":2,"has_image":false}'::jsonb,
 12, true),

-- ===================== POOL PROFESSIONAL =====================
('P-TEC-01', 2, 'professional',
 '¿Qué elemento diferencia a un jugador profesional en golpes de fondo?',
 'single',
 '{"options":["Consistencia","No lo sé","Direcciones","Efecto","Potencia"],"correct_index":0,"has_image":false}'::jsonb,
 1, true),

('P-TEC-02', 2, 'professional',
 '¿Qué factor técnico influye más en la profundidad de la bola?',
 'single',
 '{"options":["La fuerza aplicada","La altura de impacto","El ángulo de la cara de la pala en el impacto","La velocidad de la bola del rival","La preparación del golpe"],"correct_index":2,"has_image":false}'::jsonb,
 2, true),

('P-TEC-03', 2, 'professional',
 'Si quieres predecir la dirección de una bola de tu rival, ¿en qué te fijarías?',
 'single',
 '{"options":["Posición del cuerpo","Punto de impacto","Todas son correctas","Armado","Orientación de la cara de la pala"],"correct_index":2,"has_image":false}'::jsonb,
 3, true),

('P-TEC-04', 2, 'professional',
 'Selecciona las opciones correctas para hacer correctamente un rulo (jugador diestro):',
 'multi',
 '{"options":["Empuñadura continental","Impacto encima de la cabeza","Impacto ligeramente en la zona izquierda del cuerpo","Orientación de los hombros hacia la reja","Orientación de los hombros hacia la pared lateral","Empuñadura este de revés"],"correct_indices":[2,3,5],"has_image":true}'::jsonb,
 4, true),

('P-TAC-01', 2, 'professional',
 '¿Cómo generas errores en un rival sólido desde el fondo?',
 'single',
 '{"options":["Golpeando fuerte y preciso","Jugando siempre al mismo sitio","Haciendo transiciones para generar dudas","Variando altura, ritmo y dirección"],"correct_index":3,"has_image":false}'::jsonb,
 5, true),

('P-TAC-02', 2, 'professional',
 'Detectas que un rival cambia su patrón de juego durante el partido, ¿qué harías?',
 'single',
 '{"options":["Aumentar ritmo","Cambiar la estrategia de forma radical","Adaptar tu estrategia","Mantener tu estrategia","Todas son incorrectas"],"correct_index":2,"has_image":false}'::jsonb,
 6, true),

('P-TAC-03', 2, 'professional',
 'En un choque de voleas en la red, ¿quién tiene más opciones de ganar el punto?',
 'single',
 '{"options":["No lo sé","El que tiene más reflejos","El primero en buscar ángulo","El primero en presionar"],"correct_index":3,"has_image":false}'::jsonb,
 7, true),

('P-TAC-04', 2, 'professional',
 'Estás en la red y el jugador de derecha defiende de pared de revés hacia el medio, ¿quién debe volear esa bola?',
 'single',
 '{"options":["El jugador de derecha, porque está en cruzado y es el que cubre el medio","Depende de la calidad del defensor","El jugador de revés, porque el paralelo es el tiro más difícil para el defensor","Ambos deben ir a por esa bola"],"correct_index":2,"has_image":true}'::jsonb,
 8, true),

('P-REG-01', 2, 'professional',
 'Si un jugador rival realiza un gesto o movimiento para intentar distraer intencionadamente durante el punto:',
 'single',
 '{"options":["Punto para el jugador afectado por interferencia","El punto sigue","Depende de la decisión de un árbitro","Se repite","A y C son correctas"],"correct_index":0,"has_image":false}'::jsonb,
 9, true),

('P-REG-02', 2, 'professional',
 'Si una pelota se rompe durante el punto:',
 'single',
 '{"options":["Punto para el jugador que rompió la bola","Punto para la pareja rival","Se repite el punto (let)","El punto sigue"],"correct_index":2,"has_image":false}'::jsonb,
 10, true),

('P-REG-03', 2, 'professional',
 'Una bola bota en tu campo y, justo después, roza ligeramente el suelo por segunda vez casi imperceptible antes de que la golpees:',
 'single',
 '{"options":["Punto perdido automáticamente (doble bote)","Se repite","Punto válido si golpeas rápido","El punto sigue"],"correct_index":0,"has_image":false}'::jsonb,
 11, true),

('P-REG-04', 2, 'professional',
 'Después de un remate del rival, tocas la bola y consigues apoyar la pala para no desequilibrarte en el campo del rival sin tocar la red:',
 'single',
 '{"options":["Es válida porque no tocaste la red","Pierdes el punto porque interfieres en el siguiente golpe de tu rival","Se sigue el punto porque no soltaste la pala","Pierdes el punto porque no puedes tocar ninguna parte del campo de tu rival"],"correct_index":3,"has_image":false}'::jsonb,
 12, true)

ON CONFLICT (question_key) DO UPDATE SET
  phase         = EXCLUDED.phase,
  pool          = EXCLUDED.pool,
  text          = EXCLUDED.text,
  type          = EXCLUDED.type,
  options       = EXCLUDED.options,
  display_order = EXCLUDED.display_order,
  is_active     = EXCLUDED.is_active;

COMMIT;

-- ============================================================================
-- Verificación recomendada tras ejecutar:
--
-- SELECT key, jsonb_pretty(value) FROM onboarding_config ORDER BY key;
--   -> 4 filas: final_bounds, p6_factors, phase2_adjustments, phase2_pools.
--
-- SELECT question_key, is_active, jsonb_array_length(options) AS n_opts
-- FROM onboarding_questions
-- WHERE question_key IN ('p6','p6a','p6b') ORDER BY question_key;
--   -> p6 inactive, p6a active 4 opts, p6b active 4 opts.
--
-- SELECT pool, COUNT(*) FROM onboarding_questions
-- WHERE phase = 2 AND is_active = true
-- GROUP BY pool ORDER BY pool;
--   -> 12 por pool.
-- ============================================================================
