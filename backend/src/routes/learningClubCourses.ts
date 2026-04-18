import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { requireClubOwnerOrAdmin } from '../middleware/requireClubOwnerOrAdmin';
import { canAccessClub } from './learningHelpers';

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getCourseForClubEdit(
  req: Request,
  courseId: string,
  requireDraft: boolean,
): Promise<{ course: any } | { error: string; status: number }> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: course, error } = await supabase
    .from('learning_courses')
    .select('id, club_id, title, description, banner_url, elo_min, elo_max, pedagogical_goal, status, created_at, updated_at')
    .eq('id', courseId)
    .maybeSingle();

  if (error) return { error: error.message, status: 500 };
  if (!course) return { error: 'Curso no encontrado', status: 404 };
  if (!canAccessClub(req, course.club_id)) {
    return { error: 'No tienes acceso a este club', status: 403 };
  }
  if (requireDraft && course.status !== 'draft') {
    return { error: 'Solo se puede modificar un curso en estado draft', status: 400 };
  }
  return { course };
}

// ---------------------------------------------------------------------------
// Course endpoints
// ---------------------------------------------------------------------------

// GET /club-courses?club_id=...
router.get('/club-courses', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    const club_id = req.query.club_id as string | undefined;
    if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
    if (!canAccessClub(req, club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

    const supabase = getSupabaseServiceRoleClient();

    const { data: courses, error } = await supabase
      .from('learning_courses')
      .select('id, club_id, title, description, banner_url, elo_min, elo_max, pedagogical_goal, status, created_at, updated_at')
      .eq('club_id', club_id)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!courses || courses.length === 0) return res.json({ ok: true, data: [] });

    // Obtener count de lecciones por curso
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
      ...c,
      lesson_count: lessonCountMap[c.id] || 0,
    }));

    return res.json({ ok: true, data: result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// GET /club-courses/:id — detalle de curso con lecciones
router.get('/club-courses/:id', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    const result = await getCourseForClubEdit(req, req.params.id, false);
    if ('error' in result) return res.status(result.status).json({ ok: false, error: result.error });

    const supabase = getSupabaseServiceRoleClient();
    const { data: lessons, error: lessonsErr } = await supabase
      .from('learning_course_lessons')
      .select('id, course_id, order, title, description, video_url, duration_seconds')
      .eq('course_id', req.params.id)
      .order('order', { ascending: true });

    if (lessonsErr) return res.status(500).json({ ok: false, error: lessonsErr.message });

    return res.json({ ok: true, data: { ...result.course, lessons: lessons || [] } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// POST /courses
router.post('/courses', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    const { club_id, title, description, banner_url, elo_min, elo_max, pedagogical_goal } = req.body ?? {};

    if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
    if (!canAccessClub(req, club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ ok: false, error: 'title es obligatorio' });
    }
    if (elo_min != null && elo_max != null && Number(elo_min) > Number(elo_max)) {
      return res.status(400).json({ ok: false, error: 'elo_min no puede ser mayor que elo_max' });
    }

    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('learning_courses')
      .insert({
        club_id,
        title: title.trim(),
        description: description || null,
        banner_url: banner_url || null,
        elo_min: elo_min ?? 0,
        elo_max: elo_max ?? 7,
        pedagogical_goal: pedagogical_goal || null,
        status: 'draft',
      })
      .select('*')
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(201).json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// PUT /courses/:id
router.put('/courses/:id', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    const result = await getCourseForClubEdit(req, req.params.id, true);
    if ('error' in result) return res.status(result.status).json({ ok: false, error: result.error });

    const { title, description, banner_url, elo_min, elo_max, pedagogical_goal } = req.body ?? {};
    const updates: Record<string, unknown> = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ ok: false, error: 'title no puede estar vacío' });
      }
      updates.title = title.trim();
    }
    if (description !== undefined) updates.description = description || null;
    if (banner_url !== undefined) updates.banner_url = banner_url || null;
    if (elo_min !== undefined) updates.elo_min = elo_min;
    if (elo_max !== undefined) updates.elo_max = elo_max;
    if (pedagogical_goal !== undefined) updates.pedagogical_goal = pedagogical_goal || null;

    const finalMin = updates.elo_min ?? result.course.elo_min;
    const finalMax = updates.elo_max ?? result.course.elo_max;
    if (Number(finalMin) > Number(finalMax)) {
      return res.status(400).json({ ok: false, error: 'elo_min no puede ser mayor que elo_max' });
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ ok: false, error: 'No se enviaron campos para actualizar' });
    }

    updates.updated_at = new Date().toISOString();

    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('learning_courses')
      .update(updates)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Lesson endpoints
// ---------------------------------------------------------------------------

// POST /courses/:id/lessons
router.post('/courses/:id/lessons', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    const result = await getCourseForClubEdit(req, req.params.id, true);
    if ('error' in result) return res.status(result.status).json({ ok: false, error: result.error });

    const { title, description, video_url, duration_seconds } = req.body ?? {};
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ ok: false, error: 'title es obligatorio' });
    }

    const supabase = getSupabaseServiceRoleClient();

    const { data: maxRow } = await supabase
      .from('learning_course_lessons')
      .select('order')
      .eq('course_id', req.params.id)
      .order('order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextOrder = (maxRow?.order ?? 0) + 1;

    const { data, error } = await supabase
      .from('learning_course_lessons')
      .insert({
        course_id: req.params.id,
        order: nextOrder,
        title: title.trim(),
        description: description || null,
        video_url: video_url || null,
        duration_seconds: duration_seconds ?? null,
      })
      .select('*')
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(201).json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// PUT /courses/:id/lessons/:lessonId
router.put('/courses/:id/lessons/:lessonId', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    const result = await getCourseForClubEdit(req, req.params.id, true);
    if ('error' in result) return res.status(result.status).json({ ok: false, error: result.error });

    const supabase = getSupabaseServiceRoleClient();
    const { lessonId } = req.params;

    const { data: lesson, error: lessonErr } = await supabase
      .from('learning_course_lessons')
      .select('id')
      .eq('id', lessonId)
      .eq('course_id', req.params.id)
      .maybeSingle();

    if (lessonErr) return res.status(500).json({ ok: false, error: lessonErr.message });
    if (!lesson) return res.status(404).json({ ok: false, error: 'Lección no encontrada en este curso' });

    const { title, description, video_url, duration_seconds } = req.body ?? {};
    const updates: Record<string, unknown> = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ ok: false, error: 'title no puede estar vacío' });
      }
      updates.title = title.trim();
    }
    if (description !== undefined) updates.description = description || null;
    if (video_url !== undefined) updates.video_url = video_url || null;
    if (duration_seconds !== undefined) updates.duration_seconds = duration_seconds;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ ok: false, error: 'No se enviaron campos para actualizar' });
    }

    const { data, error } = await supabase
      .from('learning_course_lessons')
      .update(updates)
      .eq('id', lessonId)
      .select('*')
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// DELETE /courses/:id/lessons/:lessonId
router.delete('/courses/:id/lessons/:lessonId', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    const result = await getCourseForClubEdit(req, req.params.id, true);
    if ('error' in result) return res.status(result.status).json({ ok: false, error: result.error });

    const supabase = getSupabaseServiceRoleClient();
    const { lessonId } = req.params;

    const { data: lesson, error: lessonErr } = await supabase
      .from('learning_course_lessons')
      .select('id')
      .eq('id', lessonId)
      .eq('course_id', req.params.id)
      .maybeSingle();

    if (lessonErr) return res.status(500).json({ ok: false, error: lessonErr.message });
    if (!lesson) return res.status(404).json({ ok: false, error: 'Lección no encontrada en este curso' });

    const { error: deleteErr } = await supabase
      .from('learning_course_lessons')
      .delete()
      .eq('id', lessonId);

    if (deleteErr) return res.status(500).json({ ok: false, error: deleteErr.message });

    // Re-ordenar lecciones restantes
    const { data: remaining } = await supabase
      .from('learning_course_lessons')
      .select('id')
      .eq('course_id', req.params.id)
      .order('order', { ascending: true });

    for (let i = 0; i < (remaining || []).length; i++) {
      await supabase
        .from('learning_course_lessons')
        .update({ order: i + 1 })
        .eq('id', remaining![i].id);
    }

    return res.json({ ok: true, data: { id: lessonId, deleted: true } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// POST /courses/:id/submit
router.post('/courses/:id/submit', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    const result = await getCourseForClubEdit(req, req.params.id, true);
    if ('error' in result) return res.status(result.status).json({ ok: false, error: result.error });

    const supabase = getSupabaseServiceRoleClient();

    const { count, error: countErr } = await supabase
      .from('learning_course_lessons')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', req.params.id);

    if (countErr) return res.status(500).json({ ok: false, error: countErr.message });

    if ((count ?? 0) < 2) {
      return res.status(400).json({ ok: false, error: 'El curso debe tener al menos 2 lecciones para enviarse a revisión' });
    }

    const { data, error } = await supabase
      .from('learning_courses')
      .update({ status: 'pending_review', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('id, status, updated_at')
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
