-- 091_materialize_course_unlockables.sql
-- Materializa los cursos completados como unlockables (kind='course'), para dejar
-- de DERIVARLOS on-read: hoy `getCompletedCourses` hace 3 queries (progress +
-- lessons + courses) en CADA apertura del perfil / vitrina. Un curso completado
-- es monótono (no se descompleta), así que debe ser un desbloqueable otorgado una
-- vez y leído desde `player_unlockables`, como trofeos/insignias.
--
-- Tras esta migración: se otorgan por evento (al completar el curso) y las
-- lecturas leen `player_unlockables` (kind='course'), sin derivar nada.

-- 1) Catálogo: un unlockable por curso existente. id = 'course_'||courseId (mismo
--    id que ya usaba la vista derivada, para no romper el cliente).
insert into public.unlockables (id, kind, title, description, rarity, icon, unlock_type, unlock_value, sort_order, is_active)
select
  'course_' || c.id::text,
  'course',
  c.title,
  c.description,
  'common',
  'book-outline',
  'course',
  c.id::text,
  1000,
  (c.status = 'active')
from public.learning_courses c
on conflict (id) do nothing;

-- 2) Backfill: otorgar a quienes YA completaron el curso (todas sus lecciones).
--    notified_at = now() para NO disparar el modal por completados antiguos.
insert into public.player_unlockables (player_id, unlockable_id, unlocked_at, is_public, notified_at)
select
  comp.player_id,
  'course_' || comp.course_id::text,
  coalesce(comp.last_at, now()),
  true,
  now()
from (
  select
    prog.player_id,
    les.course_id,
    count(distinct prog.lesson_id) as done,
    max(prog.completed_at) as last_at,
    (select count(*) from public.learning_course_lessons l2 where l2.course_id = les.course_id) as total
  from public.learning_course_progress prog
  join public.learning_course_lessons les on les.id = prog.lesson_id
  group by prog.player_id, les.course_id
) comp
where comp.total > 0 and comp.done >= comp.total
on conflict (player_id, unlockable_id) do nothing;
