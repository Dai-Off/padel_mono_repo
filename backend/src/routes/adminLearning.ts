import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { requireAdmin } from '../middleware/requireAdmin';
import { buildPuzzleRow } from '../lib/puzzleValidator';
import {
  VALID_QUESTION_TYPES,
  VALID_AREAS,
  VALID_STATUS,
  validateQuestionContent,
  aggregateFeedback,
  type QuestionStatusValue,
} from './learningClubQuestions';

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

// GET /pending-courses/count — contador ligero para mostrar burbuja sin
// traer toda la lista. Usado por AdminHeader (home admin).
router.get('/pending-courses/count', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { count, error } = await supabase
      .from('learning_courses')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_review');

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, count: count ?? 0 });
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

// GET /questions — todas las preguntas (filtros opcionales: club_id, type, area, status)
router.get('/questions', requireAdmin, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { club_id, type, area, status } = req.query;

    let query = supabase
      .from('learning_questions')
      .select('id, created_by_club, type, level, area, has_video, video_url, content, status, moderation_notes, last_admin_edit_at, created_at, clubs:created_by_club(name)')
      .order('created_at', { ascending: false });

    if (club_id) query = query.eq('created_by_club', club_id as string);
    if (type) query = query.eq('type', type as string);
    if (area) query = query.eq('area', area as string);
    if (status === 'draft' || status === 'published' || status === 'inactive') {
      query = query.eq('status', status);
    }

    const { data: questions, error } = await query;

    if (error) return res.status(500).json({ ok: false, error: error.message });

    // JOIN con learning_puzzles para preguntas type='puzzle'.
    const puzzleIds = (questions || []).filter((q: any) => q.type === 'puzzle').map((q: any) => q.id);
    const puzzleByQuestion = new Map<string, any>();
    if (puzzleIds.length > 0) {
      const { data: puzzles, error: puzzleErr } = await supabase
        .from('learning_puzzles')
        .select('*')
        .in('question_id', puzzleIds);
      if (puzzleErr) return res.status(500).json({ ok: false, error: puzzleErr.message });
      for (const p of puzzles ?? []) puzzleByQuestion.set(p.question_id, p);
    }

    // Agregados de feedback (like / dislike) por pregunta — último voto por
    // (player, question), evita sobre-pesar usuarios recurrentes.
    const allIds = (questions || []).map((q: any) => q.id as string);
    const feedbackAgg = await aggregateFeedback(supabase, allIds);

    const result = (questions || []).map((q: any) => {
      const fb = feedbackAgg.get(q.id) ?? { up: 0, down: 0 };
      const base = {
        ...q,
        club_id: q.created_by_club,
        club_name: (q.clubs as any)?.name ?? null,
        clubs: undefined,
        feedback_up: fb.up,
        feedback_down: fb.down,
      };
      if (q.type === 'puzzle') {
        const p = puzzleByQuestion.get(q.id);
        return {
          ...base,
          content: p
            ? {
                schema_version: p.schema_version,
                statement: p.statement,
                intro_frame: p.intro_frame,
                initial_frame: p.initial_frame,
                options: p.options,
              }
            : q.content,
          puzzle: p ?? null,
        };
      }
      return base;
    });

    return res.json({ ok: true, data: result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// PATCH /questions/:id/activate — activar pregunta (admin, sin verificar club).
// Si la pregunta está en 'draft', valida el content antes de publicar (mismo
// criterio que el flujo del club al pulsar "Publicar"). Para puzzles validamos
// el árbol completo desde learning_puzzles. Acepta moderation_notes opcional.
router.patch('/questions/:id/activate', requireAdmin, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data: existing } = await supabase
      .from('learning_questions')
      .select('id, type, content, status')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!existing) return res.status(404).json({ ok: false, error: 'Pregunta no encontrada' });

    // Si la pregunta está en draft, validamos contenido antes de publicar.
    // Para puzzles, el árbol vive en learning_puzzles; lo mergeamos al validar.
    if (existing.status === 'draft') {
      let contentToValidate: unknown = existing.content;
      if (existing.type === 'puzzle') {
        const { data: puzzle } = await supabase
          .from('learning_puzzles')
          .select('schema_version, statement, intro_frame, initial_frame, options')
          .eq('question_id', req.params.id)
          .maybeSingle();
        contentToValidate = puzzle ?? {};
      }
      const contentError = validateQuestionContent(existing.type, contentToValidate);
      if (contentError) {
        return res.status(400).json({
          ok: false,
          error: `No se puede publicar un borrador con contenido incompleto: ${contentError}`,
        });
      }
    }

    const updates: Record<string, unknown> = {
      status: 'published',
      last_admin_edit_at: new Date().toISOString(),
    };
    if (req.body && typeof req.body === 'object' && 'moderation_notes' in req.body) {
      const notes = req.body.moderation_notes;
      updates.moderation_notes = typeof notes === 'string' && notes.trim() ? notes.trim() : null;
    }

    const { error } = await supabase
      .from('learning_questions')
      .update(updates)
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, data: { id: req.params.id, status: 'published' } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// PATCH /questions/:id/deactivate — desactivar pregunta (admin, sin verificar club).
// Acepta `moderation_notes` opcional en el body para dejar aviso al club.
router.patch('/questions/:id/deactivate', requireAdmin, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data: existing } = await supabase
      .from('learning_questions')
      .select('id')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!existing) return res.status(404).json({ ok: false, error: 'Pregunta no encontrada' });

    const updates: Record<string, unknown> = {
      status: 'inactive',
      last_admin_edit_at: new Date().toISOString(),
    };
    if (req.body && typeof req.body === 'object' && 'moderation_notes' in req.body) {
      const notes = req.body.moderation_notes;
      updates.moderation_notes = typeof notes === 'string' && notes.trim() ? notes.trim() : null;
    }

    const { error } = await supabase
      .from('learning_questions')
      .update(updates)
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, data: { id: req.params.id, status: 'inactive' } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// PUT /questions/:id — editar cualquier pregunta como admin (sin verificación de club).
// Acepta los mismos campos que el PUT del club + `moderation_notes` opcional.
// `last_admin_edit_at` se actualiza siempre desde server-side.
router.put('/questions/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const questionId = req.params.id;

    const { data: existing, error: fetchErr } = await supabase
      .from('learning_questions')
      .select('id, type, status')
      .eq('id', questionId)
      .maybeSingle();

    if (fetchErr) return res.status(500).json({ ok: false, error: fetchErr.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Pregunta no encontrada' });

    const { type, level, area, video_url, content, moderation_notes } = req.body ?? {};
    const updates: Record<string, unknown> = {};

    const effectiveType = type ?? existing.type;
    const incomingStatus =
      typeof req.body?.status === 'string' && (VALID_STATUS as readonly string[]).includes(req.body.status)
        ? (req.body.status as QuestionStatusValue)
        : null;
    const effectiveStatus: QuestionStatusValue = incomingStatus ?? (existing.status as QuestionStatusValue);
    if (incomingStatus !== null) updates.status = incomingStatus;
    const effectiveIsDraft = effectiveStatus === 'draft';

    if (type !== undefined) {
      if (!(VALID_QUESTION_TYPES as readonly string[]).includes(type)) {
        return res.status(400).json({ ok: false, error: `type debe ser uno de: ${VALID_QUESTION_TYPES.join(', ')}` });
      }
      updates.type = type;
    }
    if (area !== undefined) {
      if (!(VALID_AREAS as readonly string[]).includes(area)) {
        return res.status(400).json({ ok: false, error: `area debe ser uno de: ${VALID_AREAS.join(', ')}` });
      }
      updates.area = area;
    }
    // Puzzle siempre es 'tactics' por definición.
    if (effectiveType === 'puzzle') updates.area = 'tactics';
    if (level !== undefined) {
      if (typeof level !== 'number' || level < 0.5 || level > 6.5) {
        return res.status(400).json({ ok: false, error: 'level debe ser un número entre 0.5 y 6.5' });
      }
      updates.level = level;
    }
    if (video_url !== undefined) {
      updates.video_url = video_url || null;
      updates.has_video = !!video_url;
    }

    const isPuzzle = effectiveType === 'puzzle';
    let puzzleContent: Record<string, unknown> | null = null;

    if (content !== undefined) {
      if (!effectiveIsDraft) {
        const contentError = validateQuestionContent(effectiveType, content);
        if (contentError) return res.status(400).json({ ok: false, error: contentError });
      }
      if (isPuzzle) {
        puzzleContent =
          content && typeof content === 'object' && !Array.isArray(content)
            ? (content as Record<string, unknown>)
            : {};
        updates.content = {};
      } else {
        updates.content = content ?? {};
      }
    }

    // moderation_notes: aceptamos string, null o ausente.
    //   - string no vacío → se guarda
    //   - null o string vacío → se limpia la nota
    //   - undefined → no se toca
    if (moderation_notes !== undefined) {
      updates.moderation_notes =
        typeof moderation_notes === 'string' && moderation_notes.trim()
          ? moderation_notes.trim()
          : null;
    }

    // Server-side: siempre marcamos que un admin editó la pregunta.
    updates.last_admin_edit_at = new Date().toISOString();

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ ok: false, error: 'No se enviaron campos para actualizar' });
    }

    const { data, error } = await supabase
      .from('learning_questions')
      .update(updates)
      .eq('id', questionId)
      .select('*')
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });

    if (isPuzzle && puzzleContent) {
      const puzzleRow = buildPuzzleRow(puzzleContent, String(questionId));
      const { data: puzzle, error: puzzleErr } = await supabase
        .from('learning_puzzles')
        .upsert(puzzleRow, { onConflict: 'question_id' })
        .select('*')
        .single();
      if (puzzleErr) return res.status(500).json({ ok: false, error: `Fallo al actualizar puzzle: ${puzzleErr.message}` });
      return res.json({ ok: true, data: { ...data, puzzle } });
    }

    // Cambio de puzzle → otro tipo: limpiar la fila huérfana.
    if (existing.type === 'puzzle' && effectiveType !== 'puzzle') {
      await supabase.from('learning_puzzles').delete().eq('question_id', questionId);
    }

    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// PATCH /questions/:id/draft — pasa una pregunta published|inactive a draft.
// Útil cuando el admin detecta que algo necesita arreglo. Acepta `moderation_notes`
// opcional para indicar al club qué se debe revisar.
router.patch('/questions/:id/draft', requireAdmin, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const questionId = req.params.id;

    const { data: existing, error: fetchErr } = await supabase
      .from('learning_questions')
      .select('id, status')
      .eq('id', questionId)
      .maybeSingle();

    if (fetchErr) return res.status(500).json({ ok: false, error: fetchErr.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Pregunta no encontrada' });
    if (existing.status === 'draft') {
      return res.status(409).json({ ok: false, error: 'La pregunta ya es un borrador' });
    }

    const updates: Record<string, unknown> = {
      status: 'draft',
      last_admin_edit_at: new Date().toISOString(),
    };
    if (req.body && typeof req.body === 'object' && 'moderation_notes' in req.body) {
      const notes = req.body.moderation_notes;
      updates.moderation_notes = typeof notes === 'string' && notes.trim() ? notes.trim() : null;
    }

    const { error } = await supabase
      .from('learning_questions')
      .update(updates)
      .eq('id', questionId);

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, data: { id: questionId, status: 'draft' } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// PATCH /questions/:id/notes — actualiza moderation_notes sin tocar el estado.
// Body: { moderation_notes: string | null }. String vacío equivale a null.
router.patch('/questions/:id/notes', requireAdmin, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const questionId = req.params.id;

    const { data: existing } = await supabase
      .from('learning_questions')
      .select('id')
      .eq('id', questionId)
      .maybeSingle();
    if (!existing) return res.status(404).json({ ok: false, error: 'Pregunta no encontrada' });

    const raw = req.body?.moderation_notes;
    const notes = typeof raw === 'string' && raw.trim() ? raw.trim() : null;

    const { error } = await supabase
      .from('learning_questions')
      .update({
        moderation_notes: notes,
        last_admin_edit_at: new Date().toISOString(),
      })
      .eq('id', questionId);

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, data: { id: questionId, moderation_notes: notes } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// DELETE /questions/:id — borrado forzado (admin). A diferencia del DELETE del
// club, no requiere que la pregunta esté en draft/inactive. El cascade del FK
// a learning_puzzles elimina la fila puzzle asociada automáticamente.
router.delete('/questions/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const questionId = req.params.id;

    const { data: existing } = await supabase
      .from('learning_questions')
      .select('id')
      .eq('id', questionId)
      .maybeSingle();
    if (!existing) return res.status(404).json({ ok: false, error: 'Pregunta no encontrada' });

    const { error } = await supabase
      .from('learning_questions')
      .delete()
      .eq('id', questionId);

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, data: { id: questionId, deleted: true } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Estadísticas
// ---------------------------------------------------------------------------

// Función auxiliar para extraer un preview legible del content de una pregunta.
// Usada para `top_answered` en stats.
function extractContentPreview(type: string, content: unknown, puzzleStatement?: string): string {
  if (type === 'puzzle' && puzzleStatement) return puzzleStatement;
  if (!content || typeof content !== 'object') return '—';
  const c = content as Record<string, unknown>;
  if (typeof c.question === 'string') return c.question;
  if (typeof c.statement === 'string') return c.statement;
  if (Array.isArray(c.pairs)) return `${c.pairs.length} pares`;
  if (Array.isArray(c.steps)) return `${c.steps.length} pasos`;
  return '—';
}

// GET /stats — estadísticas globales de aprendizaje (shape ampliado).
// Devuelve totales, distribución por tipo / área / nivel, top respondidas,
// volumen 7d/30d y top clubs.
router.get('/stats', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const now = new Date();
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Ejecutamos en paralelo todas las queries que no dependen unas de otras.
    const [
      totalsQ,
      activeQ,
      totalsC,
      activeC,
      pendingC,
      questionsByClubRes,
      coursesByClubRes,
      allQuestionsRes,
      logsAllRes,
      logs7dRes,
      logs30dRes,
    ] = await Promise.all([
      supabase.from('learning_questions').select('id', { count: 'exact', head: true }),
      supabase.from('learning_questions').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      supabase.from('learning_courses').select('id', { count: 'exact', head: true }),
      supabase.from('learning_courses').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('learning_courses').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
      supabase.from('learning_questions').select('created_by_club, clubs:created_by_club(name)').eq('status', 'published'),
      supabase.from('learning_courses').select('club_id, clubs(name)').eq('status', 'active'),
      // Para breakdowns por tipo/área/nivel necesitamos todas las publicadas con metadatos.
      supabase.from('learning_questions').select('id, type, area, level, content').eq('status', 'published'),
      // Logs totales para tasa de acierto agregada por pregunta.
      supabase.from('learning_question_log').select('question_id, answered_correctly'),
      // Volumen últimos 7 días.
      supabase.from('learning_question_log').select('id', { count: 'exact', head: true }).gte('answered_at', since7d),
      // Volumen últimos 30 días.
      supabase.from('learning_question_log').select('id', { count: 'exact', head: true }).gte('answered_at', since30d),
    ]);

    // Agregados por question_id desde los logs (attempts / correct).
    const attemptsByQ = new Map<string, { attempts: number; correct: number }>();
    for (const l of logsAllRes.data ?? []) {
      const qid = (l as any).question_id as string;
      const acc = attemptsByQ.get(qid) ?? { attempts: 0, correct: 0 };
      acc.attempts++;
      if ((l as any).answered_correctly) acc.correct++;
      attemptsByQ.set(qid, acc);
    }

    // Breakdowns por tipo / área / nivel: count + attempts + correct.
    type Bucket = { count: number; attempts: number; correct: number };
    const byType: Record<string, Bucket> = {};
    const byArea: Record<string, Bucket> = {};
    const byLevel: Record<string, Bucket> = {};

    const allPublished = (allQuestionsRes.data ?? []) as Array<{ id: string; type: string; area: string; level: number; content: unknown }>;
    for (const q of allPublished) {
      const agg = attemptsByQ.get(q.id) ?? { attempts: 0, correct: 0 };
      const levelKey = String(Math.floor(q.level));
      for (const [bucket, key] of [[byType, q.type], [byArea, q.area], [byLevel, levelKey]] as const) {
        if (!bucket[key]) bucket[key] = { count: 0, attempts: 0, correct: 0 };
        bucket[key].count++;
        bucket[key].attempts += agg.attempts;
        bucket[key].correct += agg.correct;
      }
    }

    // Top 10 más respondidas (de las publicadas).
    const topAnswered = allPublished
      .map((q) => {
        const agg = attemptsByQ.get(q.id) ?? { attempts: 0, correct: 0 };
        return {
          question_id: q.id,
          attempts: agg.attempts,
          success_rate: agg.attempts > 0 ? agg.correct / agg.attempts : 0,
          preview: extractContentPreview(q.type, q.content),
        };
      })
      .filter((x) => x.attempts > 0)
      .sort((a, b) => b.attempts - a.attempts)
      .slice(0, 10);

    // Para puzzles cuyo preview vino vacío ('—'), traemos statement de learning_puzzles.
    const puzzleIdsForTop = topAnswered.filter((x) => x.preview === '—').map((x) => x.question_id);
    if (puzzleIdsForTop.length > 0) {
      const { data: puzzles } = await supabase
        .from('learning_puzzles')
        .select('question_id, statement')
        .in('question_id', puzzleIdsForTop);
      const byQ = new Map((puzzles ?? []).map((p: any) => [String(p.question_id), p.statement as string]));
      for (const row of topAnswered) {
        if (row.preview === '—') {
          const s = byQ.get(row.question_id);
          if (s) row.preview = s;
        }
      }
    }

    // Agrupaciones por club (mantenidas).
    const qByClub: Record<string, { club_name: string; count: number }> = {};
    for (const q of questionsByClubRes.data || []) {
      const cid = (q as any).created_by_club;
      if (!qByClub[cid]) qByClub[cid] = { club_name: ((q as any).clubs as any)?.name ?? 'Desconocido', count: 0 };
      qByClub[cid].count++;
    }
    const cByClub: Record<string, { club_name: string; count: number }> = {};
    for (const c of coursesByClubRes.data || []) {
      const cid = (c as any).club_id;
      if (!cByClub[cid]) cByClub[cid] = { club_name: ((c as any).clubs as any)?.name ?? 'Desconocido', count: 0 };
      cByClub[cid].count++;
    }

    return res.json({
      ok: true,
      data: {
        total_questions: totalsQ.count ?? 0,
        active_questions: activeQ.count ?? 0,
        total_courses: totalsC.count ?? 0,
        active_courses: activeC.count ?? 0,
        pending_courses: pendingC.count ?? 0,
        by_type: byType,
        by_area: byArea,
        by_level: byLevel,
        top_answered: topAnswered,
        volume_last_7d: logs7dRes.count ?? 0,
        volume_last_30d: logs30dRes.count ?? 0,
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
