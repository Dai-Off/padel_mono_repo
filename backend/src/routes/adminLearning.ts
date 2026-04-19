import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { requireAdmin } from '../middleware/requireAdmin';

const router = Router();

// ---------------------------------------------------------------------------
// Cola de revisión
// ---------------------------------------------------------------------------

// GET /pending-courses — cursos pendientes de revisión
router.get('/pending-courses', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data: courses, error } = await supabase
      .from('learning_courses')
      .select('id, club_id, title, description, elo_min, elo_max, staff_id, status, created_at, updated_at, clubs(name)')
      .eq('status', 'pending_review')
      .order('updated_at', { ascending: true });

    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!courses || courses.length === 0) return res.json({ ok: true, data: [] });

    const courseIds = courses.map((c: any) => c.id);
    const { data: lessons, error: lessonsErr } = await supabase
      .from('learning_course_lessons')
      .select('id, course_id')
      .in('course_id', courseIds);

    if (lessonsErr) return res.status(500).json({ ok: false, error: lessonsErr.message });

    const lessonCountMap: Record<string, number> = {};
    for (const l of lessons || []) {
      lessonCountMap[l.course_id] = (lessonCountMap[l.course_id] || 0) + 1;
    }

    const result = courses.map((c: any) => ({
      id: c.id,
      club_id: c.club_id,
      club_name: (c.clubs as any)?.name ?? null,
      title: c.title,
      description: c.description,
      elo_min: c.elo_min,
      elo_max: c.elo_max,
      staff_id: c.staff_id,
      status: c.status,
      lesson_count: lessonCountMap[c.id] || 0,
      created_at: c.created_at,
      updated_at: c.updated_at,
    }));

    return res.json({ ok: true, data: result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// GET /courses/:id — detalle de curso con lecciones (admin, sin verificar club)
router.get('/courses/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data: course, error } = await supabase
      .from('learning_courses')
      .select('id, club_id, title, description, banner_url, elo_min, elo_max, pedagogical_goal, staff_id, status, review_notes, created_at, updated_at, clubs(name)')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!course) return res.status(404).json({ ok: false, error: 'Curso no encontrado' });

    const { data: lessons, error: lessonsErr } = await supabase
      .from('learning_course_lessons')
      .select('id, course_id, order, title, description, video_url, duration_seconds')
      .eq('course_id', req.params.id)
      .order('order', { ascending: true });

    if (lessonsErr) return res.status(500).json({ ok: false, error: lessonsErr.message });

    return res.json({
      ok: true,
      data: {
        ...course,
        club_name: (course.clubs as any)?.name ?? null,
        clubs: undefined,
        lesson_count: (lessons || []).length,
        lessons: lessons || [],
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// POST /courses/:id/approve — aprobar curso (pending_review → active)
router.post('/courses/:id/approve', requireAdmin, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data: course, error: fetchErr } = await supabase
      .from('learning_courses')
      .select('id, status')
      .eq('id', req.params.id)
      .maybeSingle();

    if (fetchErr) return res.status(500).json({ ok: false, error: fetchErr.message });
    if (!course) return res.status(404).json({ ok: false, error: 'Curso no encontrado' });
    if (course.status !== 'pending_review') {
      return res.status(400).json({ ok: false, error: 'Solo se pueden aprobar cursos en estado pending_review' });
    }

    const { error } = await supabase
      .from('learning_courses')
      .update({ status: 'active', review_notes: null, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, data: { id: req.params.id, status: 'active' } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// POST /courses/:id/reject — rechazar curso (pending_review → draft)
router.post('/courses/:id/reject', requireAdmin, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data: course, error: fetchErr } = await supabase
      .from('learning_courses')
      .select('id, status')
      .eq('id', req.params.id)
      .maybeSingle();

    if (fetchErr) return res.status(500).json({ ok: false, error: fetchErr.message });
    if (!course) return res.status(404).json({ ok: false, error: 'Curso no encontrado' });
    if (course.status !== 'pending_review') {
      return res.status(400).json({ ok: false, error: 'Solo se pueden rechazar cursos en estado pending_review' });
    }

    const { reason } = req.body ?? {};

    const { error } = await supabase
      .from('learning_courses')
      .update({
        status: 'draft',
        review_notes: reason?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, data: { id: req.params.id, status: 'draft' } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Moderación global
// ---------------------------------------------------------------------------

// GET /courses — todos los cursos (filtros opcionales: status, club_id)
router.get('/courses', requireAdmin, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { status, club_id } = req.query;

    let query = supabase
      .from('learning_courses')
      .select('id, club_id, title, description, elo_min, elo_max, staff_id, status, created_at, updated_at, clubs(name)')
      .order('created_at', { ascending: false });

    if (status && status !== 'all') query = query.eq('status', status as string);
    if (club_id) query = query.eq('club_id', club_id as string);

    const { data: courses, error } = await query;

    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!courses || courses.length === 0) return res.json({ ok: true, data: [] });

    // Lesson counts
    const courseIds = courses.map((c: any) => c.id);
    const { data: lessons } = await supabase
      .from('learning_course_lessons')
      .select('id, course_id')
      .in('course_id', courseIds);

    const lessonCountMap: Record<string, number> = {};
    for (const l of lessons || []) {
      lessonCountMap[l.course_id] = (lessonCountMap[l.course_id] || 0) + 1;
    }

    const result = courses.map((c: any) => ({
      id: c.id,
      club_id: c.club_id,
      club_name: (c.clubs as any)?.name ?? null,
      title: c.title,
      description: c.description,
      elo_min: c.elo_min,
      elo_max: c.elo_max,
      staff_id: c.staff_id,
      status: c.status,
      lesson_count: lessonCountMap[c.id] || 0,
      created_at: c.created_at,
      updated_at: c.updated_at,
    }));

    return res.json({ ok: true, data: result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// GET /questions — todas las preguntas (filtros opcionales: club_id, type, area, is_active)
router.get('/questions', requireAdmin, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { club_id, type, area, is_active } = req.query;

    let query = supabase
      .from('learning_questions')
      .select('id, created_by_club, type, level, area, has_video, video_url, content, is_active, created_at, clubs:created_by_club(name)')
      .order('created_at', { ascending: false });

    if (club_id) query = query.eq('created_by_club', club_id as string);
    if (type) query = query.eq('type', type as string);
    if (area) query = query.eq('area', area as string);
    if (is_active === 'true') query = query.eq('is_active', true);
    else if (is_active === 'false') query = query.eq('is_active', false);

    const { data: questions, error } = await query;

    if (error) return res.status(500).json({ ok: false, error: error.message });

    const result = (questions || []).map((q: any) => ({
      ...q,
      club_id: q.created_by_club,
      club_name: (q.clubs as any)?.name ?? null,
      clubs: undefined,
    }));

    return res.json({ ok: true, data: result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// PATCH /questions/:id/activate — activar pregunta (admin, sin verificar club)
router.patch('/questions/:id/activate', requireAdmin, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data: existing } = await supabase
      .from('learning_questions')
      .select('id')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!existing) return res.status(404).json({ ok: false, error: 'Pregunta no encontrada' });

    const { error } = await supabase
      .from('learning_questions')
      .update({ is_active: true })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, data: { id: req.params.id, is_active: true } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// PATCH /questions/:id/deactivate — desactivar pregunta (admin, sin verificar club)
router.patch('/questions/:id/deactivate', requireAdmin, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data: existing } = await supabase
      .from('learning_questions')
      .select('id')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!existing) return res.status(404).json({ ok: false, error: 'Pregunta no encontrada' });

    const { error } = await supabase
      .from('learning_questions')
      .update({ is_active: false })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, data: { id: req.params.id, is_active: false } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Estadísticas
// ---------------------------------------------------------------------------

// GET /stats — estadísticas globales de aprendizaje
router.get('/stats', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();

    // Preguntas
    const { count: totalQuestions } = await supabase
      .from('learning_questions')
      .select('id', { count: 'exact', head: true });

    const { count: activeQuestions } = await supabase
      .from('learning_questions')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);

    // Cursos
    const { count: totalCourses } = await supabase
      .from('learning_courses')
      .select('id', { count: 'exact', head: true });

    const { count: activeCourses } = await supabase
      .from('learning_courses')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');

    const { count: pendingCourses } = await supabase
      .from('learning_courses')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_review');

    // Top clubes por preguntas
    const { data: questionsByClub } = await supabase
      .from('learning_questions')
      .select('created_by_club, clubs:created_by_club(name)')
      .eq('is_active', true);

    const qByClub: Record<string, { club_name: string; count: number }> = {};
    for (const q of questionsByClub || []) {
      const cid = (q as any).created_by_club;
      if (!qByClub[cid]) {
        qByClub[cid] = { club_name: ((q as any).clubs as any)?.name ?? 'Desconocido', count: 0 };
      }
      qByClub[cid].count++;
    }

    // Top clubes por cursos
    const { data: coursesByClub } = await supabase
      .from('learning_courses')
      .select('club_id, clubs(name)')
      .eq('status', 'active');

    const cByClub: Record<string, { club_name: string; count: number }> = {};
    for (const c of coursesByClub || []) {
      const cid = (c as any).club_id;
      if (!cByClub[cid]) {
        cByClub[cid] = { club_name: ((c as any).clubs as any)?.name ?? 'Desconocido', count: 0 };
      }
      cByClub[cid].count++;
    }

    return res.json({
      ok: true,
      data: {
        total_questions: totalQuestions ?? 0,
        active_questions: activeQuestions ?? 0,
        total_courses: totalCourses ?? 0,
        active_courses: activeCourses ?? 0,
        pending_courses: pendingCourses ?? 0,
        questions_by_club: Object.entries(qByClub)
          .map(([club_id, v]) => ({ club_id, club_name: v.club_name, count: v.count }))
          .sort((a, b) => b.count - a.count),
        courses_by_club: Object.entries(cByClub)
          .map(([club_id, v]) => ({ club_id, club_name: v.club_name, count: v.count }))
          .sort((a, b) => b.count - a.count),
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
