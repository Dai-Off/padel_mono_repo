-- 089_coach_assessment_needs_recompute.sql
-- A2 (perf perfil): cachear el radar del Coach IA y recomputar solo por eventos.
--
-- Hoy GET /coach-assessment/me recomputa el radar (ELO + learning) y escribe en
-- CADA lectura (~17 queries + upsert). Con este flag, la lectura sirve la fila
-- cacheada (1 query) y solo se recomputa cuando algo cambió de verdad:
--   * cierre de partido de matchmaking (mueve el ELO)  -> levelingService.ts
--   * fin de lección diaria (mueve el shape por área)  -> learningDailyLesson.ts
-- Esos eventos marcan needs_recompute = true; la siguiente lectura recomputa y
-- lo vuelve a poner en false.
--
-- Default true: las filas existentes se recomputan UNA vez en su próxima lectura
-- (recogen cualquier cambio de ELO/learning previo) y luego quedan cacheadas.

alter table public.coach_assessments
  add column if not exists needs_recompute boolean not null default true;

comment on column public.coach_assessments.needs_recompute is
  'A2 perf: si true, GET /coach-assessment/me recomputa el radar y lo persiste; si false, sirve la fila cacheada. Lo marcan a true el cierre de partido y el fin de lección.';
