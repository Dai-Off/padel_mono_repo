-- ============================================================================
-- 045_onboarding_config.sql
-- Tabla de configuración global del cuestionario de nivelación.
--
-- Contiene los parámetros del algoritmo que NO están ligados a una pregunta
-- concreta: factores del multiselect P6, rangos de pool de Fase 2, tabla de
-- ajustes de Fase 2, y floor/ceiling del ELO final.
--
-- Lo que SÍ está ligado a una pregunta (techos de P1, matriz de P9) vive en
-- el campo options de cada pregunta en onboarding_questions (ver 046).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS onboarding_config (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Trigger para mantener updated_at al día
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

-- ----------------------------------------------------------------------------
-- Seeds
-- ----------------------------------------------------------------------------

-- p6_factors: factor de descuento del multiselect P6 según valor de P1.
-- Fórmula: elo = max(seleccionados) + sum(resto) * factor[p1Val]
INSERT INTO onboarding_config (key, value, description) VALUES
('p6_factors',
 '{"3":0.3,"4":0.2}'::jsonb,
 'Factor aplicado a las opciones no-máximas en el multiselect P6 según P1')
ON CONFLICT (key) DO UPDATE SET
  value       = EXCLUDED.value,
  description = EXCLUDED.description;

-- phase2_pools: rangos de ELO Fase 1 -> pool de Fase 2.
-- Se evalúa en orden: el primer pool cuyo "max" sea mayor que eloPhase1 gana.
-- El último debe ser catch-all (max alto). "min" es inclusivo, "max" exclusivo.
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
-- Se evalúa en orden descendente: primer rango cuyo "min_score" sea <= score gana.
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
 'Ajuste al ELO Fase 1 según puntuación de Fase 2. Evaluado de mayor a menor min_score')
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

COMMIT;

-- ============================================================================
-- Verificación recomendada:
--
-- SELECT key, jsonb_pretty(value) FROM onboarding_config ORDER BY key;
-- ============================================================================
