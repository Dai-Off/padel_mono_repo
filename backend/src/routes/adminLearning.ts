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
  aggregateAttempts,
  collectWarnings,
  detectWarnings,
  computeQuestionDetailStats,
  computeCourseDetailStats,
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

// GET /questions/:id/stats — stats detalladas de una pregunta (admin).
router.get('/questions/:id/stats', requireAdmin, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const stats = await computeQuestionDetailStats(supabase, req.params.id);
    if (!stats) return res.status(404).json({ ok: false, error: 'Pregunta no encontrada' });
    return res.json({ ok: true, data: stats });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// GET /courses/:id/stats — stats detalladas de un curso (admin).
router.get('/courses/:id/stats', requireAdmin, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const stats = await computeCourseDetailStats(supabase, req.params.id);
    if (!stats) return res.status(404).json({ ok: false, error: 'Curso no encontrado' });
    return res.json({ ok: true, data: stats });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// GET /warnings — avisos de calidad para todas las preguntas (o filtrado
// por club). Devuelve cada pregunta enriquecida con su array `warnings`.
// No paginado: si hay muchos avisos, el panel los muestra todos (problema
// que justamente queremos resolver).
router.get('/warnings', requireAdmin, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const clubId = typeof req.query.club_id === 'string' && req.query.club_id ? req.query.club_id : undefined;
    const rows = await collectWarnings(supabase, { clubId });

    // Para admin, enriquecemos cada fila con club_name (vienen ya con
    // created_by_club). Una query agrupada por club.
    const ids = Array.from(new Set(rows.map((r: any) => r.created_by_club).filter(Boolean)));
    const nameByClub = new Map<string, string>();
    if (ids.length > 0) {
      const { data: clubs } = await supabase
        .from('clubs')
        .select('id, name')
        .in('id', ids);
      for (const c of clubs ?? []) nameByClub.set((c as any).id, (c as any).name);
    }
    const enriched = rows.map((r: any) => ({
      ...r,
      club_id: r.created_by_club,
      club_name: nameByClub.get(r.created_by_club) ?? null,
    }));

    return res.json({ ok: true, data: enriched, meta: { count: enriched.length } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// GET /clubs-with-content — lista de clubs únicos que tienen al menos una
// pregunta o curso. Sirve para alimentar el filtro de club en moderación sin
// depender del listing paginado.
router.get('/clubs-with-content', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const [qRes, cRes] = await Promise.all([
      supabase.from('learning_questions').select('created_by_club, clubs:created_by_club(name)'),
      supabase.from('learning_courses').select('club_id, clubs(name)'),
    ]);
    const map = new Map<string, string>();
    for (const r of qRes.data ?? []) {
      const id = (r as any).created_by_club as string | undefined;
      const name = ((r as any).clubs as any)?.name as string | undefined;
      if (id && name) map.set(id, name);
    }
    for (const r of cRes.data ?? []) {
      const id = (r as any).club_id as string | undefined;
      const name = ((r as any).clubs as any)?.name as string | undefined;
      if (id && name) map.set(id, name);
    }
    const data = Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    return res.json({ ok: true, data });
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

// GET /courses — todos los cursos. Filtros: status, club_id, search,
// elo_min, elo_max. Paginación: page, page_size. Orden: created_desc/asc.
// El orden hace que pending_review aparezca SIEMPRE primero (independiente
// del orden secundario por fecha), para que el admin los encuentre rápido.
router.get('/courses', requireAdmin, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { status, club_id } = req.query;

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const requestedSize = parseInt(String(req.query.page_size ?? '20'), 10) || 20;
    const pageSize = Math.min(100, Math.max(1, requestedSize));
    const offset = (page - 1) * pageSize;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const orderBy = String(req.query.order_by ?? 'created_desc');
    const ascending = orderBy === 'created_asc';
    const eloMin = req.query.elo_min ? Number(req.query.elo_min) : undefined;
    const eloMax = req.query.elo_max ? Number(req.query.elo_max) : undefined;

    let query = supabase
      .from('learning_courses')
      .select('id, club_id, title, description, elo_min, elo_max, staff_id, status, created_at, updated_at, clubs(name)', { count: 'exact' })
      // Pending arriba siempre, después por fecha. ascending:false en status
      // ordena alfabéticamente al revés → pending_review > inactive > draft >
      // active, así pending queda primero sin necesidad de RPC.
      .order('status', { ascending: false })
      .order('created_at', { ascending });

    if (status && status !== 'all') query = query.eq('status', status as string);
    if (club_id) query = query.eq('club_id', club_id as string);
    if (search) {
      const escaped = search.replace(/[%_]/g, '\\$&');
      query = query.ilike('title', `%${escaped}%`);
    }
    // Filtro por rango de nivel: el curso "encaja" si su rango se solapa con
    // el pedido (elo_min curso <= eloMax filtro y elo_max curso >= eloMin).
    if (typeof eloMin === 'number' && !Number.isNaN(eloMin)) query = query.gte('elo_max', eloMin);
    if (typeof eloMax === 'number' && !Number.isNaN(eloMax)) query = query.lte('elo_min', eloMax);

    query = query.range(offset, offset + pageSize - 1);

    const { data: courses, error, count } = await query;

    if (error) return res.status(500).json({ ok: false, error: error.message });
    const totalCount = count ?? 0;

    if (!courses || courses.length === 0) {
      return res.json({ ok: true, data: [], meta: { total: totalCount, page, page_size: pageSize } });
    }

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

    return res.json({ ok: true, data: result, meta: { total: totalCount, page, page_size: pageSize } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// GET /questions — todas las preguntas (filtros opcionales: club_id, type, area, status, search)
router.get('/questions', requireAdmin, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { club_id, type, area, status } = req.query;

    // Paginación + búsqueda + ordenación. Default 30 por página; máximo 100.
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const requestedSize = parseInt(String(req.query.page_size ?? '20'), 10) || 20;
    const pageSize = Math.min(100, Math.max(1, requestedSize));
    const offset = (page - 1) * pageSize;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const orderBy = String(req.query.order_by ?? 'created_desc');
    const ascending = orderBy === 'created_asc';

    let query = supabase
      .from('learning_questions')
      .select(
        'id, created_by_club, type, level, area, has_video, video_url, content, status, moderation_notes, last_admin_edit_at, created_at, clubs:created_by_club(name)',
        { count: 'exact' },
      )
      .order('created_at', { ascending });

    if (club_id) query = query.eq('created_by_club', club_id as string);
    if (type) query = query.eq('type', type as string);
    if (area) query = query.eq('area', area as string);
    if (status === 'draft' || status === 'published' || status === 'inactive') {
      query = query.eq('status', status);
    }
    if (search) {
      const escaped = search.replace(/[%_]/g, '\\$&');
      query = query.ilike('content_search', `%${escaped}%`);
    }
    // Filtro por rango de nivel (pregunta tiene level escalar).
    const eloMin = req.query.elo_min ? Number(req.query.elo_min) : undefined;
    const eloMax = req.query.elo_max ? Number(req.query.elo_max) : undefined;
    if (typeof eloMin === 'number' && !Number.isNaN(eloMin)) query = query.gte('level', eloMin);
    if (typeof eloMax === 'number' && !Number.isNaN(eloMax)) query = query.lte('level', eloMax);

    query = query.range(offset, offset + pageSize - 1);

    const { data: questions, error, count } = await query;

    if (error) return res.status(500).json({ ok: false, error: error.message });
    const totalCount = count ?? 0;

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

    // Agregados de feedback (like/dislike) y attempts (respuestas/aciertos).
    const allIds = (questions || []).map((q: any) => q.id as string);
    const [feedbackAgg, attemptsAgg] = await Promise.all([
      aggregateFeedback(supabase, allIds),
      aggregateAttempts(supabase, allIds),
    ]);

    const result = (questions || []).map((q: any) => {
      const fb = feedbackAgg.get(q.id) ?? { up: 0, down: 0 };
      const at = attemptsAgg.get(q.id) ?? { attempts: 0, correct: 0 };
      const base = {
        ...q,
        club_id: q.created_by_club,
        club_name: (q.clubs as any)?.name ?? null,
        clubs: undefined,
        feedback_up: fb.up,
        feedback_down: fb.down,
        attempts_count: at.attempts,
        correct_count: at.correct,
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

    return res.json({
      ok: true,
      data: result,
      meta: { total: totalCount, page, page_size: pageSize },
    });
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
      updates.content_updated_at = new Date().toISOString();
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

// GET /stats — estadísticas accionables de aprendizaje.
// Pensadas para que admin/club detecte de un vistazo: actividad, equilibrio
// del contenido, calidad agregada y avisos abiertos.
router.get('/stats', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const now = new Date();
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Ejecutamos en paralelo todas las queries independientes.
    const [
      activeQ,
      activeC,
      pendingC,
      questionsByClubRes,
      coursesByClubRes,
      allQuestionsRes,
      activeCoursesRes,
      allLessonsRes,
      allProgressRes,
      logsAllRes,
      logs7dRes,
      logs30dRes,
      logs30dDailyRes,
      activePlayersRes,
      lessonsCompleted7dRes,
      coursePlayers30dRes,
      streaksRes,
    ] = await Promise.all([
      supabase.from('learning_questions').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      supabase.from('learning_courses').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('learning_courses').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
      supabase.from('learning_questions').select('created_by_club, clubs:created_by_club(name)').eq('status', 'published'),
      supabase.from('learning_courses').select('club_id, clubs(name)').eq('status', 'active'),
      supabase.from('learning_questions').select('id, type, area, level').eq('status', 'published'),
      // Cursos activos con sus elo_min/elo_max para distribución por nivel y
      // cálculo de tasa de finalización (necesitamos saber sus lecciones).
      supabase.from('learning_courses').select('id, elo_min, elo_max').eq('status', 'active'),
      // Lecciones de cursos activos (para mapear progress → course).
      supabase.from('learning_course_lessons').select('id, course_id'),
      // Progresos (player, lesson) — base para finalización y engagement.
      supabase.from('learning_course_progress').select('player_id, lesson_id, completed_at'),
      // Logs totales — para attempts/correct/feedback por pregunta.
      supabase.from('learning_question_log').select('question_id, player_id, answered_correctly, vote, answered_at'),
      supabase.from('learning_question_log').select('id', { count: 'exact', head: true }).gte('answered_at', since7d),
      supabase.from('learning_question_log').select('id', { count: 'exact', head: true }).gte('answered_at', since30d),
      // Para tendencia diaria, traemos los timestamps de los últimos 30 días.
      supabase.from('learning_question_log').select('answered_at').gte('answered_at', since30d),
      // Jugadores únicos últimos 7 días.
      supabase.from('learning_question_log').select('player_id').gte('answered_at', since7d),
      // Lecciones completadas últimos 7 días (engagement reciente).
      supabase.from('learning_course_progress').select('id', { count: 'exact', head: true }).gte('completed_at', since7d),
      // Jugadores únicos con progreso en cursos últimos 30 días.
      supabase.from('learning_course_progress').select('player_id').gte('completed_at', since30d),
      supabase.from('learning_streaks').select('current_streak, longest_streak, last_lesson_completed_at'),
    ]);

    // Agregados por question_id desde los logs (attempts / correct).
    // También: voto más reciente por (player, question) para feedback.
    const attemptsByQ = new Map<string, { attempts: number; correct: number }>();
    const latestVoteByPair = new Map<string, { vote: 'up' | 'down'; at: number }>();
    for (const l of logsAllRes.data ?? []) {
      const r = l as { question_id: string; player_id: string; answered_correctly: boolean; vote: 'up' | 'down' | null; answered_at: string };
      const acc = attemptsByQ.get(r.question_id) ?? { attempts: 0, correct: 0 };
      acc.attempts++;
      if (r.answered_correctly) acc.correct++;
      attemptsByQ.set(r.question_id, acc);

      if (r.vote === 'up' || r.vote === 'down') {
        const key = `${r.question_id}::${r.player_id}`;
        const at = new Date(r.answered_at).getTime();
        const cur = latestVoteByPair.get(key);
        if (!cur || at > cur.at) latestVoteByPair.set(key, { vote: r.vote, at });
      }
    }

    // Breakdowns por tipo / área / nivel: count + attempts + correct.
    type Bucket = { count: number; attempts: number; correct: number };
    const byType: Record<string, Bucket> = {};
    const byArea: Record<string, Bucket> = {};
    const byLevel: Record<string, Bucket> = {};

    const allPublished = (allQuestionsRes.data ?? []) as Array<{ id: string; type: string; area: string; level: number }>;
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

    // Feedback agregado global (último voto por par).
    let feedbackUp = 0;
    let feedbackDown = 0;
    for (const { vote } of latestVoteByPair.values()) {
      if (vote === 'up') feedbackUp++;
      else feedbackDown++;
    }

    // Avisos: aplicamos el mismo detector que usa el listado de warnings.
    const warningsByKind = { too_easy: 0, too_hard: 0, low_quality: 0 };
    const upDownByQ = new Map<string, { up: number; down: number }>();
    for (const [key, { vote }] of latestVoteByPair) {
      const qid = key.split('::')[0];
      const cur = upDownByQ.get(qid) ?? { up: 0, down: 0 };
      if (vote === 'up') cur.up++; else cur.down++;
      upDownByQ.set(qid, cur);
    }
    for (const q of allPublished) {
      const at = attemptsByQ.get(q.id) ?? { attempts: 0, correct: 0 };
      const fb = upDownByQ.get(q.id) ?? { up: 0, down: 0 };
      const kinds = detectWarnings({
        attempts: at.attempts,
        correct: at.correct,
        votes_up: fb.up,
        votes_down: fb.down,
      });
      for (const k of kinds) warningsByKind[k]++;
    }

    // Tendencia diaria de respuestas: bucketizamos los 30 días.
    const dailyMap = new Map<string, number>();
    // Inicializamos con 0s para todos los días en el rango (incluir días sin actividad).
    for (let i = 0; i < 30; i++) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dailyMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const l of logs30dDailyRes.data ?? []) {
      const day = (l as any).answered_at.slice(0, 10);
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
    }
    const dailyResponses30d = Array.from(dailyMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Jugadores activos últimos 7d (únicos).
    const activePlayers = new Set<string>();
    for (const r of activePlayersRes.data ?? []) activePlayers.add((r as any).player_id);

    // Engagement de cursos: jugadores únicos con progreso 30d.
    const coursePlayers30d = new Set<string>();
    for (const r of coursePlayers30dRes.data ?? []) coursePlayers30d.add((r as any).player_id);

    // Distribución de cursos por rango de nivel. Un curso "encaja" en un rango
    // si su rango [elo_min, elo_max] se solapa con el del preset (usamos
    // mismos criterios que el LevelFilter del frontend).
    const COURSE_LEVEL_PRESETS: { label: string; min: number; max: number }[] = [
      { label: 'Principiante', min: 0, max: 2 },
      { label: 'Intermedio', min: 2, max: 3.5 },
      { label: 'Avanzado', min: 3.5, max: 4.5 },
      { label: 'Competición', min: 4.5, max: 6 },
      { label: 'Profesional', min: 6, max: 7 },
    ];
    const courseLevels: Record<string, number> = {};
    for (const p of COURSE_LEVEL_PRESETS) courseLevels[p.label] = 0;
    for (const c of activeCoursesRes.data ?? []) {
      const eMin = (c as any).elo_min as number;
      const eMax = (c as any).elo_max as number;
      for (const p of COURSE_LEVEL_PRESETS) {
        if (eMin <= p.max && eMax >= p.min) courseLevels[p.label]++;
      }
    }

    // Tasa de finalización: cada par (player, course) que ha tocado al menos
    // una lección cuenta como "iniciado". Si ha completado todas las lecciones
    // del curso, cuenta también como "completado". rate = completados/iniciados.
    const lessonsByCourse = new Map<string, Set<string>>();
    for (const l of allLessonsRes.data ?? []) {
      const cid = (l as any).course_id as string;
      const lid = (l as any).id as string;
      if (!lessonsByCourse.has(cid)) lessonsByCourse.set(cid, new Set());
      lessonsByCourse.get(cid)!.add(lid);
    }
    // Mapa lesson_id → course_id para resolver progresos.
    const lessonToCourse = new Map<string, string>();
    for (const [cid, lessons] of lessonsByCourse) {
      for (const lid of lessons) lessonToCourse.set(lid, cid);
    }
    // Por par (player, course), cuántas lecciones completadas.
    const completedByPair = new Map<string, Set<string>>();
    for (const r of allProgressRes.data ?? []) {
      const playerId = (r as any).player_id as string;
      const lessonId = (r as any).lesson_id as string;
      const cid = lessonToCourse.get(lessonId);
      if (!cid) continue;
      const key = `${playerId}::${cid}`;
      if (!completedByPair.has(key)) completedByPair.set(key, new Set());
      completedByPair.get(key)!.add(lessonId);
    }
    let coursesStarted = 0;
    let coursesCompleted = 0;
    for (const [key, set] of completedByPair) {
      const cid = key.split('::')[1];
      const totalLessons = lessonsByCourse.get(cid)?.size ?? 0;
      if (totalLessons === 0) continue;
      coursesStarted++;
      if (set.size >= totalLessons) coursesCompleted++;
    }
    const courseCompletionRate = coursesStarted > 0 ? coursesCompleted / coursesStarted : null;

    // Métricas numéricas adicionales de cursos. Calculadas sobre cursos activos.
    const activeCourseIds = new Set((activeCoursesRes.data ?? []).map((c: any) => c.id as string));
    const activeLessons = (allLessonsRes.data ?? []).filter((l: any) => activeCourseIds.has(l.course_id));
    const totalLessonsPublished = activeLessons.length;
    const avgLessonsPerCourse = activeCourseIds.size > 0 ? totalLessonsPublished / activeCourseIds.size : null;

    // Para duración y % con vídeo necesitamos los campos extra de lessons.
    // Hacemos una query adicional solo si hay cursos activos.
    let avgDurationSeconds: number | null = null;
    let coursesWithFullVideoRate: number | null = null;
    let avgDepthCompleted: number | null = null;
    if (activeCourseIds.size > 0) {
      const { data: detailedLessons } = await supabase
        .from('learning_course_lessons')
        .select('course_id, duration_seconds, video_url')
        .in('course_id', Array.from(activeCourseIds));
      const ds = detailedLessons ?? [];
      const withDuration = ds.filter((l: any) => typeof l.duration_seconds === 'number');
      avgDurationSeconds = withDuration.length > 0
        ? withDuration.reduce((s: number, l: any) => s + l.duration_seconds, 0) / withDuration.length
        : null;

      // % de cursos donde TODAS sus lecciones tienen video_url no nulo.
      const lessonsByCourseAll = new Map<string, Array<{ video_url: string | null }>>();
      for (const l of ds) {
        const cid = (l as any).course_id as string;
        if (!lessonsByCourseAll.has(cid)) lessonsByCourseAll.set(cid, []);
        lessonsByCourseAll.get(cid)!.push({ video_url: (l as any).video_url });
      }
      let coursesWithAllVideos = 0;
      for (const lessons of lessonsByCourseAll.values()) {
        if (lessons.length > 0 && lessons.every((x) => !!x.video_url)) coursesWithAllVideos++;
      }
      coursesWithFullVideoRate = activeCourseIds.size > 0 ? coursesWithAllVideos / activeCourseIds.size : null;
    }

    // Profundidad media completada por jugador iniciador.
    if (completedByPair.size > 0) {
      let totalLessonsByPair = 0;
      for (const set of completedByPair.values()) totalLessonsByPair += set.size;
      avgDepthCompleted = totalLessonsByPair / completedByPair.size;
    }

    // Estadísticas de rachas. El `current_streak` guardado en BD NO decae
    // automáticamente: solo se actualiza cuando el jugador completa otra
    // lección. Eso significa que un jugador que perdió la racha hace días
    // sigue mostrando su valor viejo. Para que las stats reflejen la
    // realidad, calculamos la racha "efectiva" comparando con
    // last_lesson_completed_at: si fue hoy o ayer (UTC) → racha viva;
    // si fue antes → la racha está rota y cuenta como 0.
    const streaks = (streaksRes.data ?? []) as Array<{ current_streak: number; longest_streak: number; last_lesson_completed_at: string | null }>;
    const todayUTC = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const effective = streaks.map((s) => {
      if (!s.last_lesson_completed_at) return 0;
      const lastDay = new Date(s.last_lesson_completed_at.slice(0, 10) + 'T00:00:00Z').getTime();
      const daysAgo = Math.round((todayUTC - lastDay) / ONE_DAY);
      // Aceptamos hoy (0) o ayer (1) como racha viva. Más viejo → rota.
      return daysAgo <= 1 ? s.current_streak : 0;
    });
    const activeEffective = effective.filter((v) => v > 0);
    const streakStats = {
      players_with_active_streak: activeEffective.length,
      avg_current_streak: activeEffective.length > 0
        ? activeEffective.reduce((s, x) => s + x, 0) / activeEffective.length
        : null,
      longest_ever: streaks.reduce((max, x) => Math.max(max, x.longest_streak), 0),
      // Distribución por buckets de duración (días). El bucket "0" incluye
      // jugadores que alguna vez entraron al módulo pero ahora no tienen
      // racha viva — útil para ver la retención real frente a los activos.
      buckets: {
        '0': effective.filter((v) => v === 0).length,
        '1': activeEffective.filter((v) => v === 1).length,
        '2-3': activeEffective.filter((v) => v >= 2 && v <= 3).length,
        '4-7': activeEffective.filter((v) => v >= 4 && v <= 7).length,
        '8-14': activeEffective.filter((v) => v >= 8 && v <= 14).length,
        '15-30': activeEffective.filter((v) => v >= 15 && v <= 30).length,
        '31+': activeEffective.filter((v) => v > 30).length,
      },
    };

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
        active_questions: activeQ.count ?? 0,
        active_courses: activeC.count ?? 0,
        pending_courses: pendingC.count ?? 0,
        active_players_7d: activePlayers.size,
        by_type: byType,
        by_area: byArea,
        by_level: byLevel,
        volume_last_7d: logs7dRes.count ?? 0,
        volume_last_30d: logs30dRes.count ?? 0,
        daily_responses_30d: dailyResponses30d,
        warnings_by_kind: warningsByKind,
        feedback_up_total: feedbackUp,
        feedback_down_total: feedbackDown,
        lessons_completed_7d: lessonsCompleted7dRes.count ?? 0,
        course_players_30d: coursePlayers30d.size,
        course_levels: courseLevels,
        course_completion_rate: courseCompletionRate,
        courses_started: coursesStarted,
        courses_completed: coursesCompleted,
        total_lessons_published: totalLessonsPublished,
        avg_lessons_per_course: avgLessonsPerCourse,
        avg_lesson_duration_seconds: avgDurationSeconds,
        courses_with_full_video_rate: coursesWithFullVideoRate,
        avg_depth_completed: avgDepthCompleted,
        streaks: streakStats,
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
