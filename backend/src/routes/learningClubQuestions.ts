import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { requireClubOwnerOrAdminOrPortalStaff } from '../middleware/requireClubOwnerOrAdminOrPortalStaff';
import { canAccessClub } from '../lib/clubAccess';
import { validatePuzzleContent, buildPuzzleRow } from '../lib/puzzleValidator';

const router = Router();

// ---------------------------------------------------------------------------
// Constants and validation
// ---------------------------------------------------------------------------

export const VALID_QUESTION_TYPES = ['test_classic', 'true_false', 'multi_select', 'match_columns', 'order_sequence', 'puzzle'] as const;
export const VALID_AREAS = ['technique', 'tactics', 'physical', 'mental', 'rules'] as const;
export const VALID_STATUS = ['draft', 'published', 'inactive'] as const;
export type QuestionStatusValue = (typeof VALID_STATUS)[number];

export function validateQuestionContent(type: string, content: unknown): string | null {
  if (!content || typeof content !== 'object') return 'content es obligatorio y debe ser un objeto';
  const c = content as Record<string, unknown>;

  switch (type) {
    case 'test_classic': {
      if (!c.question || typeof c.question !== 'string') return 'content.question debe ser un string no vacío';
      if (!Array.isArray(c.options) || c.options.length !== 4 || !c.options.every((o: unknown) => typeof o === 'string' && o.length > 0))
        return 'content.options debe ser un array de 4 strings no vacíos';
      if (typeof c.correct_index !== 'number' || !Number.isInteger(c.correct_index) || c.correct_index < 0 || c.correct_index > 3)
        return 'content.correct_index debe ser un entero entre 0 y 3';
      return null;
    }
    case 'true_false': {
      if (!c.statement || typeof c.statement !== 'string') return 'content.statement debe ser un string no vacío';
      if (typeof c.correct_answer !== 'boolean') return 'content.correct_answer debe ser un booleano';
      return null;
    }
    case 'multi_select': {
      if (!c.question || typeof c.question !== 'string') return 'content.question debe ser un string no vacío';
      if (!Array.isArray(c.options) || c.options.length !== 4 || !c.options.every((o: unknown) => typeof o === 'string' && o.length > 0))
        return 'content.options debe ser un array de 4 strings no vacíos';
      if (!Array.isArray(c.correct_indices) || c.correct_indices.length < 2 || c.correct_indices.length > 3)
        return 'content.correct_indices debe ser un array de 2 a 3 enteros';
      const indices = c.correct_indices as number[];
      if (!indices.every((i: number) => Number.isInteger(i) && i >= 0 && i <= 3))
        return 'Cada valor en correct_indices debe ser un entero entre 0 y 3';
      if (new Set(indices).size !== indices.length)
        return 'correct_indices no puede tener valores duplicados';
      return null;
    }
    case 'match_columns': {
      if (!c.question || typeof c.question !== 'string') return 'content.question debe ser un string no vacío';
      if (!Array.isArray(c.pairs) || c.pairs.length < 3 || c.pairs.length > 5)
        return 'content.pairs debe ser un array de 3 a 5 objetos';
      for (const pair of c.pairs as Record<string, unknown>[]) {
        if (!pair || typeof pair.left !== 'string' || !pair.left || typeof pair.right !== 'string' || !pair.right)
          return 'Cada par debe tener left y right como strings no vacíos';
      }
      return null;
    }
    case 'order_sequence': {
      if (!c.question || typeof c.question !== 'string') return 'content.question debe ser un string no vacío';
      if (!Array.isArray(c.steps) || c.steps.length < 3 || c.steps.length > 6)
        return 'content.steps debe ser un array de 3 a 6 strings';
      if (!c.steps.every((s: unknown) => typeof s === 'string' && (s as string).length > 0))
        return 'Cada step debe ser un string no vacío';
      return null;
    }
    case 'puzzle': {
      // Para puzzles, el `content` recibido es el árbol completo (statement + initial_frame
      // + options + meta). Lo valida el helper dedicado. El árbol se persiste en la tabla
      // learning_puzzles vía JOIN 1:1, no en learning_questions.content.
      return validatePuzzleContent(content);
    }
    default:
      return `Tipo de pregunta desconocido: ${type}`;
  }
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

// POST /questions
type QuestionStatus = QuestionStatusValue;

router.post('/questions', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  try {
    const { club_id, type, level, video_url, content } = req.body ?? {};
    let { area } = req.body ?? {};
    // status: 'draft' (sin validar content) o 'published' (validación full).
    // Default 'published' para no romper a callers viejos. 'inactive' al crear
    // no tiene sentido (se llega vía toggle posterior).
    const status: QuestionStatus =
      VALID_STATUS.includes(req.body?.status) && req.body.status !== 'inactive'
        ? req.body.status
        : 'published';
    const isDraft = status === 'draft';

    if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
    if (!canAccessClub(req, club_id, 'escuela')) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

    if (!VALID_QUESTION_TYPES.includes(type)) {
      return res.status(400).json({ ok: false, error: `type debe ser uno de: ${VALID_QUESTION_TYPES.join(', ')}` });
    }
    // Los puzzles son siempre tácticos por definición — forzar el área.
    if (type === 'puzzle') area = 'tactics';
    if (!VALID_AREAS.includes(area)) {
      return res.status(400).json({ ok: false, error: `area debe ser uno de: ${VALID_AREAS.join(', ')}` });
    }
    if (level == null || typeof level !== 'number' || level < 0.5 || level > 6.5) {
      return res.status(400).json({ ok: false, error: 'level debe ser un número entre 0.5 y 6.5' });
    }

    // Validación de content solo si NO es borrador. Los borradores pueden
    // guardarse con content vacío o parcial (es el sentido de la feature).
    if (!isDraft) {
      const contentError = validateQuestionContent(type, content);
      if (contentError) return res.status(400).json({ ok: false, error: contentError });
    }

    const isPuzzle = type === 'puzzle';
    // Vídeo opcional para todos los tipos, incluido puzzle (intro previa al
    // puzzle reproducida por el mobile antes del intro_frame).
    const hasVideo = !!video_url && typeof video_url === 'string';
    const supabase = getSupabaseServiceRoleClient();

    // 1. Insert en learning_questions. Para puzzles, content queda vacío; el árbol va en learning_puzzles.
    const { data: question, error } = await supabase
      .from('learning_questions')
      .insert({
        type,
        level,
        area,
        has_video: hasVideo,
        video_url: hasVideo ? video_url : null,
        content: isPuzzle ? {} : (content ?? {}),
        created_by_club: club_id,
        status,
      })
      .select('*')
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });

    // 2. Si es puzzle, insert en learning_puzzles con el árbol del content recibido.
    // Para borradores con content vacío/null, buildPuzzleRow tolera campos faltantes
    // y crea una fila con defaults vacíos (el editor la rellenará al editar).
    if (isPuzzle && question) {
      const puzzleSource =
        content && typeof content === 'object' && !Array.isArray(content)
          ? (content as Record<string, unknown>)
          : {};
      const puzzleRow = buildPuzzleRow(puzzleSource, question.id);
      const { data: puzzle, error: puzzleErr } = await supabase
        .from('learning_puzzles')
        .insert(puzzleRow)
        .select('*')
        .single();

      if (puzzleErr) {
        // Rollback manual: borramos la pregunta para no dejar registros huérfanos.
        await supabase.from('learning_questions').delete().eq('id', question.id);
        return res.status(500).json({ ok: false, error: `Fallo al guardar puzzle: ${puzzleErr.message}` });
      }
      return res.status(201).json({ ok: true, data: { ...question, puzzle } });
    }

    return res.status(201).json({ ok: true, data: question });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// PUT /questions/:id
router.put('/questions/:id', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const questionId = req.params.id;

    const { data: existing, error: fetchErr } = await supabase
      .from('learning_questions')
      .select('id, created_by_club, type, status')
      .eq('id', questionId)
      .maybeSingle();

    if (fetchErr) return res.status(500).json({ ok: false, error: fetchErr.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Pregunta no encontrada' });
    if (!canAccessClub(req, existing.created_by_club, 'escuela')) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }

    const { type, level, area, video_url, content } = req.body ?? {};
    const updates: Record<string, unknown> = {};

    const effectiveType = type ?? existing.type;
    // status post-update: si el body lo trae y es válido lo aplicamos.
    // Si no, conservamos el actual. Determina si validamos content o no.
    const incomingStatus =
      typeof req.body?.status === 'string' && VALID_STATUS.includes(req.body.status as QuestionStatus)
        ? (req.body.status as QuestionStatus)
        : null;
    const effectiveStatus: QuestionStatus = incomingStatus ?? (existing.status as QuestionStatus);
    if (incomingStatus !== null) {
      updates.status = incomingStatus;
    }
    const effectiveIsDraft = effectiveStatus === 'draft';

    if (type !== undefined) {
      if (!VALID_QUESTION_TYPES.includes(type)) {
        return res.status(400).json({ ok: false, error: `type debe ser uno de: ${VALID_QUESTION_TYPES.join(', ')}` });
      }
      updates.type = type;
    }
    if (area !== undefined) {
      if (!VALID_AREAS.includes(area)) {
        return res.status(400).json({ ok: false, error: `area debe ser uno de: ${VALID_AREAS.join(', ')}` });
      }
      updates.area = area;
    }
    // Si la pregunta resultante es de tipo puzzle, forzar area='tactics' (independientemente de lo enviado).
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
      // Solo validamos content cuando se publica (no draft). En modo borrador
      // se acepta content parcial / vacío.
      if (!effectiveIsDraft) {
        const contentError = validateQuestionContent(effectiveType, content);
        if (contentError) return res.status(400).json({ ok: false, error: contentError });
      }
      if (isPuzzle) {
        puzzleContent =
          content && typeof content === 'object' && !Array.isArray(content)
            ? (content as Record<string, unknown>)
            : {};
        updates.content = {}; // árbol va a learning_puzzles
      } else {
        updates.content = content ?? {};
      }
      // Marcamos cambio de contenido. Las stats por pregunta filtran logs
      // anteriores a esta fecha para que la distribución refleje la versión
      // actual y no opciones que ya no existen.
      updates.content_updated_at = new Date().toISOString();
    }

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

    // Si era puzzle y se mandó content, upsert en learning_puzzles.
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

    // Si la pregunta cambió de puzzle a otro tipo, borrar la fila huérfana en learning_puzzles.
    if (existing.type === 'puzzle' && effectiveType !== 'puzzle') {
      await supabase.from('learning_puzzles').delete().eq('question_id', questionId);
    }

    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// DELETE /questions/:id
// Borrado permanente. Solo se permite si la pregunta está en estado 'draft'
// o 'inactive'. Las 'published' hay que desactivar/despublicar primero. El
// cascade del FK a learning_puzzles elimina la fila asociada automáticamente.
router.delete('/questions/:id', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const questionId = req.params.id;

    const { data: existing, error: fetchErr } = await supabase
      .from('learning_questions')
      .select('id, created_by_club, status')
      .eq('id', questionId)
      .maybeSingle();

    if (fetchErr) return res.status(500).json({ ok: false, error: fetchErr.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Pregunta no encontrada' });
    if (!canAccessClub(req, existing.created_by_club, 'escuela')) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }
    if (existing.status === 'published') {
      return res.status(409).json({
        ok: false,
        error: 'Para borrar definitivamente, primero hay que despublicar (pasar a inactiva) o que sea borrador',
      });
    }

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

// PATCH /questions/:id/deactivate
// Despublica una pregunta: status='published' → 'inactive'. Si ya está
// inactive o es draft, no aplica.
router.patch('/questions/:id/deactivate', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const questionId = req.params.id;

    const { data: existing, error: fetchErr } = await supabase
      .from('learning_questions')
      .select('id, created_by_club, status')
      .eq('id', questionId)
      .maybeSingle();

    if (fetchErr) return res.status(500).json({ ok: false, error: fetchErr.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Pregunta no encontrada' });
    if (!canAccessClub(req, existing.created_by_club, 'escuela')) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }
    if (existing.status !== 'published') {
      return res.status(409).json({
        ok: false,
        error: `Solo se puede despublicar una pregunta 'published' (estado actual: ${existing.status})`,
      });
    }

    const { error } = await supabase
      .from('learning_questions')
      .update({ status: 'inactive' })
      .eq('id', questionId);

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, data: { id: questionId, status: 'inactive' } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// PATCH /questions/:id/activate
// Reactiva una pregunta: status='inactive' → 'published'. Si está en draft,
// no aplica (usar PUT con status='published' que valida el content primero).
router.patch('/questions/:id/activate', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const questionId = req.params.id;

    const { data: existing, error: fetchErr } = await supabase
      .from('learning_questions')
      .select('id, created_by_club, status')
      .eq('id', questionId)
      .maybeSingle();

    if (fetchErr) return res.status(500).json({ ok: false, error: fetchErr.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Pregunta no encontrada' });
    if (!canAccessClub(req, existing.created_by_club, 'escuela')) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }
    if (existing.status !== 'inactive') {
      return res.status(409).json({
        ok: false,
        error: `Solo se puede reactivar una pregunta 'inactive' (estado actual: ${existing.status})`,
      });
    }

    const { error } = await supabase
      .from('learning_questions')
      .update({ status: 'published' })
      .eq('id', questionId);

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, data: { id: questionId, status: 'published' } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// GET /questions
router.get('/questions', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  try {
    const clubId = req.query.club_id as string;
    if (!clubId) return res.status(400).json({ ok: false, error: 'club_id es obligatorio como query param' });
    if (!canAccessClub(req, clubId, 'escuela')) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

    // Paginación + búsqueda + ordenación. Default 30 por página; máximo 100.
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const requestedSize = parseInt(String(req.query.page_size ?? '20'), 10) || 20;
    const pageSize = Math.min(100, Math.max(1, requestedSize));
    const offset = (page - 1) * pageSize;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const orderBy = String(req.query.order_by ?? 'created_desc');
    const ascending = orderBy === 'created_asc';

    const supabase = getSupabaseServiceRoleClient();
    let query = supabase
      .from('learning_questions')
      .select('*', { count: 'exact' })
      .eq('created_by_club', clubId)
      .order('created_at', { ascending });

    const { type, area, status } = req.query;
    if (type) query = query.eq('type', type as string);
    if (area) query = query.eq('area', area as string);
    // Filtro de estado. Default: solo 'published' (lo que el listado muestra
    // por defecto). 'all' devuelve todos; 'draft'/'published'/'inactive' filtran.
    if (status === 'all') {
      // No filtrar
    } else if (status === 'draft' || status === 'published' || status === 'inactive') {
      query = query.eq('status', status);
    } else {
      query = query.eq('status', 'published');
    }

    // Búsqueda libre dentro del JSON content. Usamos la columna generada
    // `content_search` (text) que se materializa automáticamente (ver
    // migración 065). Permite ILIKE directo y se puede indexar si crece.
    if (search) {
      const escaped = search.replace(/[%_]/g, '\\$&');
      query = query.ilike('content_search', `%${escaped}%`);
    }
    // Filtro por rango de nivel.
    const eloMin = req.query.elo_min ? Number(req.query.elo_min) : undefined;
    const eloMax = req.query.elo_max ? Number(req.query.elo_max) : undefined;
    if (typeof eloMin === 'number' && !Number.isNaN(eloMin)) query = query.gte('level', eloMin);
    if (typeof eloMax === 'number' && !Number.isNaN(eloMax)) query = query.lte('level', eloMax);

    // Paginación: range usa índices inclusivos [from, to].
    query = query.range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const rows = data ?? [];
    const totalCount = count ?? 0;
    const puzzleQuestionIds = rows.filter((r) => r.type === 'puzzle').map((r) => r.id);

    if (puzzleQuestionIds.length > 0) {
      const { data: puzzles, error: puzzleErr } = await supabase
        .from('learning_puzzles')
        .select('*')
        .in('question_id', puzzleQuestionIds);
      if (puzzleErr) return res.status(500).json({ ok: false, error: puzzleErr.message });
      const byQuestion = new Map((puzzles ?? []).map((p) => [p.question_id, p]));
      for (const row of rows) {
        if (row.type === 'puzzle') {
          const p = byQuestion.get(row.id);
          if (p) {
            // Mergear árbol en content para uniformidad con el resto de tipos.
            (row as Record<string, unknown>).content = {
              schema_version: p.schema_version,
              statement: p.statement,
              intro_frame: p.intro_frame,
              initial_frame: p.initial_frame,
              options: p.options,
            };
            // Exponer metadata extra (id propio, thumbnail_url) por si el editor lo necesita.
            (row as Record<string, unknown>).puzzle = p;
          } else {
            (row as Record<string, unknown>).puzzle = null;
          }
        }
      }
    }

    // Agregados por pregunta: feedback (like/dislike) y attempts (respuestas).
    const allIds = rows.map((r: any) => r.id as string);
    const [feedbackAgg, attemptsAgg] = await Promise.all([
      aggregateFeedback(supabase, allIds),
      aggregateAttempts(supabase, allIds),
    ]);
    for (const row of rows) {
      const fb = feedbackAgg.get((row as any).id) ?? { up: 0, down: 0 };
      const at = attemptsAgg.get((row as any).id) ?? { attempts: 0, correct: 0 };
      (row as any).feedback_up = fb.up;
      (row as any).feedback_down = fb.down;
      (row as any).attempts_count = at.attempts;
      (row as any).correct_count = at.correct;
    }

    // Ordenamos primero las preguntas con nota de moderación no vista para
    // que el club las encuentre rápido. El resto mantiene el orden por
    // created_at desc que vino de la query.
    rows.sort((a: any, b: any) => {
      const aUnread = !!a.moderation_notes && (!a.notes_seen_at || (a.last_admin_edit_at && a.notes_seen_at < a.last_admin_edit_at));
      const bUnread = !!b.moderation_notes && (!b.notes_seen_at || (b.last_admin_edit_at && b.notes_seen_at < b.last_admin_edit_at));
      if (aUnread !== bUnread) return aUnread ? -1 : 1;
      return 0;
    });

    // Meta: contador total de preguntas del club con nota de moderación no
    // vista, INDEPENDIENTE de los filtros aplicados al listing. Se calcula
    // aquí mismo para que el cliente pueda pintar el badge correctamente
    // aunque esté filtrando por estado/tipo/área/vídeo. Una sola query extra.
    const unreadCount = await countUnreadNotes(supabase, clubId);

    return res.json({
      ok: true,
      data: rows,
      meta: {
        unread_count: unreadCount,
        total: totalCount,
        page,
        page_size: pageSize,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// Helper: agrega contadores de respuestas (attempts / correct) para un set de
// question_ids. Cada fila de learning_question_log cuenta una vez (todos los
// intentos importan — si un jugador ve la pregunta varias veces, todas sus
// respuestas se promedian, que es lo que queremos para "tasa de acierto").
export async function aggregateAttempts(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  questionIds: string[],
): Promise<Map<string, { attempts: number; correct: number }>> {
  const empty = new Map<string, { attempts: number; correct: number }>();
  if (questionIds.length === 0) return empty;

  const { data, error } = await supabase
    .from('learning_question_log')
    .select('question_id, answered_correctly')
    .in('question_id', questionIds);
  if (error || !data) return empty;

  const out = new Map<string, { attempts: number; correct: number }>();
  for (const row of data as Array<{ question_id: string; answered_correctly: boolean }>) {
    const cur = out.get(row.question_id) ?? { attempts: 0, correct: 0 };
    cur.attempts++;
    if (row.answered_correctly) cur.correct++;
    out.set(row.question_id, cur);
  }
  return out;
}

// Helper: agrega votos like / dislike para un set de question_ids. Devuelve
// un Map<question_id, { up, down }> donde cada par (player, question) cuenta
// su voto MÁS RECIENTE — un jugador con varios logs de la misma pregunta
// influye una sola vez en la métrica.
//
// Implementación en JS porque Supabase no soporta DISTINCT ON trivialmente.
// Si el volumen crece mucho, considerar materializar como vista.
export async function aggregateFeedback(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  questionIds: string[],
): Promise<Map<string, { up: number; down: number }>> {
  const empty = new Map<string, { up: number; down: number }>();
  if (questionIds.length === 0) return empty;

  const { data, error } = await supabase
    .from('learning_question_log')
    .select('question_id, player_id, vote, answered_at')
    .in('question_id', questionIds)
    .not('vote', 'is', null);
  if (error || !data) return empty;

  // Quedarnos con el voto más reciente por (question_id, player_id).
  const latest = new Map<string, { vote: 'up' | 'down'; at: number }>();
  for (const row of data as Array<{ question_id: string; player_id: string; vote: 'up' | 'down'; answered_at: string }>) {
    const key = `${row.question_id}::${row.player_id}`;
    const at = new Date(row.answered_at).getTime();
    const cur = latest.get(key);
    if (!cur || at > cur.at) latest.set(key, { vote: row.vote, at });
  }

  // Reducir a contadores por question_id.
  const out = new Map<string, { up: number; down: number }>();
  for (const [key, { vote }] of latest) {
    const qid = key.split('::')[0];
    const cur = out.get(qid) ?? { up: 0, down: 0 };
    if (vote === 'up') cur.up++;
    else cur.down++;
    out.set(qid, cur);
  }
  return out;
}

// Tipos de aviso que un panel admin/club puede detectar sobre una pregunta.
// Decisión: NO incluimos "sin tracción" — depende del algoritmo de scheduling
// y el creador no puede actuar sobre ello.
//   - too_easy:    respuestas suficientes y casi todos aciertan (poca señal de aprendizaje)
//   - too_hard:    respuestas suficientes y casi todos fallan (mal redactada o demasiado difícil)
//   - low_quality: votos suficientes y proporción alta de dislike (señal subjetiva)
export type WarningKind = 'too_easy' | 'too_hard' | 'low_quality';

// Umbrales centralizados. Si cambian, se ajustan aquí y en el cliente.
export const WARNING_THRESHOLDS = {
  MIN_ATTEMPTS_FOR_RATE: 20,
  TOO_EASY_RATE: 0.95,
  TOO_HARD_RATE: 0.20,
  MIN_VOTES_FOR_QUALITY: 10,
  LOW_QUALITY_DOWN_RATE: 0.20,
};

// Determina qué avisos aplican a una pregunta dada sus agregados. Devuelve
// array vacío si todo está bien. Centralizado para que cliente y backend
// usen los mismos criterios.
export function detectWarnings(input: {
  attempts: number;
  correct: number;
  votes_up: number;
  votes_down: number;
}): WarningKind[] {
  const out: WarningKind[] = [];
  const T = WARNING_THRESHOLDS;
  const attempts = input.attempts ?? 0;
  const correct = input.correct ?? 0;
  const successRate = attempts > 0 ? correct / attempts : 0;

  if (attempts >= T.MIN_ATTEMPTS_FOR_RATE && successRate >= T.TOO_EASY_RATE) out.push('too_easy');
  if (attempts >= T.MIN_ATTEMPTS_FOR_RATE && successRate <= T.TOO_HARD_RATE) out.push('too_hard');

  const totalVotes = (input.votes_up ?? 0) + (input.votes_down ?? 0);
  if (totalVotes >= T.MIN_VOTES_FOR_QUALITY) {
    const downRate = (input.votes_down ?? 0) / totalVotes;
    if (downRate >= T.LOW_QUALITY_DOWN_RATE) out.push('low_quality');
  }

  return out;
}

// Helper: cuenta preguntas del club con `moderation_notes` no NULL cuya
// `notes_seen_at` sea NULL o anterior a `last_admin_edit_at`. Se usa tanto en
// el GET del listing (meta) como en el PATCH de acknowledge (respuesta).
async function countUnreadNotes(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  clubId: string,
): Promise<number> {
  // Supabase no soporta OR entre columnas en `or()` con comparación cruzada
  // de forma trivial, así que pedimos las filas candidatas y filtramos en JS.
  // El conjunto candidato son las que tienen moderation_notes IS NOT NULL,
  // que es siempre un volumen pequeño.
  const { data, error } = await supabase
    .from('learning_questions')
    .select('moderation_notes, notes_seen_at, last_admin_edit_at')
    .eq('created_by_club', clubId)
    .not('moderation_notes', 'is', null);
  if (error) return 0;
  return (data ?? []).filter((r: any) => {
    if (!r.notes_seen_at) return true;
    if (!r.last_admin_edit_at) return false;
    return new Date(r.notes_seen_at).getTime() < new Date(r.last_admin_edit_at).getTime();
  }).length;
}

// PATCH /questions/:id/acknowledge-notes
// El club confirma que ha visto la nota de moderación. Setea notes_seen_at = NOW().
// La lógica de "no vista" se calcula client-side comparando notes_seen_at con
// last_admin_edit_at (si admin vuelve a editar, last_admin_edit_at > notes_seen_at
// y la pregunta vuelve a aparecer como no vista).
router.patch('/questions/:id/acknowledge-notes', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const questionId = req.params.id;

    const { data: existing, error: fetchErr } = await supabase
      .from('learning_questions')
      .select('id, created_by_club')
      .eq('id', questionId)
      .maybeSingle();

    if (fetchErr) return res.status(500).json({ ok: false, error: fetchErr.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Pregunta no encontrada' });
    if (!canAccessClub(req, existing.created_by_club, 'escuela')) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }

    const { error } = await supabase
      .from('learning_questions')
      .update({ notes_seen_at: new Date().toISOString() })
      .eq('id', questionId);

    if (error) return res.status(500).json({ ok: false, error: error.message });

    // Devolvemos el contador actualizado para que el cliente pinte el badge
    // sin tener que hacer otra llamada al listing.
    const unreadCount = await countUnreadNotes(supabase, existing.created_by_club);
    return res.json({ ok: true, data: { id: questionId }, unread_count: unreadCount });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// GET /questions/:id/stats — stats detalladas de una pregunta (club).
// Verifica que la pregunta sea del club del usuario.
router.get('/questions/:id/stats', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: q } = await supabase
      .from('learning_questions')
      .select('id, created_by_club')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!q) return res.status(404).json({ ok: false, error: 'Pregunta no encontrada' });
    if (!canAccessClub(req, (q as any).created_by_club, 'escuela')) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }
    const stats = await computeQuestionDetailStats(supabase, req.params.id);
    if (!stats) return res.status(404).json({ ok: false, error: 'Pregunta no encontrada' });
    return res.json({ ok: true, data: stats });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// GET /club-courses/:id/stats — stats detalladas de un curso del club.
router.get('/club-courses/:id/stats', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: c } = await supabase
      .from('learning_courses')
      .select('id, club_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!c) return res.status(404).json({ ok: false, error: 'Curso no encontrado' });
    if (!canAccessClub(req, (c as any).club_id, 'escuela')) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }
    const stats = await computeCourseDetailStats(supabase, req.params.id);
    return res.json({ ok: true, data: stats });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// GET /clubs/:clubId/stats
// Estadísticas filtradas a un club concreto + benchmark con la media global
// para que el club pueda comparar su contenido contra el resto. Protegido
// con canAccessClub (el club no puede pedir stats de otros).
router.get('/clubs/:clubId/stats', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  try {
    const clubId = req.params.clubId;
    if (!canAccessClub(req, clubId, 'escuela')) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }

    const supabase = getSupabaseServiceRoleClient();
    const data = await computeClubStats(supabase, clubId);
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// GET /clubs/:clubId/warnings
// Devuelve las preguntas del club que tienen al menos un aviso según
// detectWarnings (muy fáciles, muy difíciles, sin tracción, calidad
// cuestionable). No se pagina porque los warnings deberían ser pocos —
// si crecen mucho, ese es justamente el síntoma a atender.
router.get('/clubs/:clubId/warnings', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  try {
    const clubId = req.params.clubId;
    if (!canAccessClub(req, clubId, 'escuela')) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }

    const supabase = getSupabaseServiceRoleClient();
    const result = await collectWarnings(supabase, { clubId });
    return res.json({ ok: true, data: result, meta: { count: result.length } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// Calcula stats accionables del club + benchmark con la media global. Devuelve
// el mismo shape que stats admin para que el frontend reuse los componentes.
export async function computeClubStats(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  clubId: string,
): Promise<Record<string, unknown>> {
  const now = new Date();
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Preguntas del club + cursos del club.
  const [clubQRes, clubCRes, allLogsRes, clubLessonsRes, allLessonsRes, allProgressRes] = await Promise.all([
    supabase.from('learning_questions').select('id, type, area, level, status').eq('created_by_club', clubId),
    supabase.from('learning_courses').select('id, status, elo_min, elo_max').eq('club_id', clubId),
    supabase.from('learning_question_log').select('question_id, player_id, answered_correctly, vote, answered_at'),
    // Lecciones de cursos del club (para finalización local).
    supabase.from('learning_course_lessons').select('id, course_id, learning_courses!inner(club_id)').eq('learning_courses.club_id', clubId),
    supabase.from('learning_course_lessons').select('id, course_id'),
    supabase.from('learning_course_progress').select('player_id, lesson_id, completed_at'),
  ]);

  const clubQs = clubQRes.data ?? [];
  const clubCs = clubCRes.data ?? [];
  const clubQuestionIds = new Set(clubQs.map((q: any) => q.id as string));
  const clubPublished = clubQs.filter((q: any) => q.status === 'published');

  const activeQuestions = clubPublished.length;
  const activeCourses = clubCs.filter((c: any) => c.status === 'active').length;
  const pendingCourses = clubCs.filter((c: any) => c.status === 'pending_review').length;

  // Filtro de logs a los del club.
  const allLogs = (allLogsRes.data ?? []) as Array<{ question_id: string; player_id: string; answered_correctly: boolean; vote: 'up' | 'down' | null; answered_at: string }>;
  const clubLogs = allLogs.filter((l) => clubQuestionIds.has(l.question_id));

  // Volumen y daily series del club (últimos 30d).
  const clubLogs7d = clubLogs.filter((l) => l.answered_at >= since7d);
  const clubLogs30d = clubLogs.filter((l) => l.answered_at >= since30d);
  const dailyMap = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    dailyMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const l of clubLogs30d) {
    const day = l.answered_at.slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
  }
  const dailyResponses30d = Array.from(dailyMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const clubActivePlayers7d = new Set(clubLogs7d.map((l) => l.player_id));

  // attempts/correct y feedback agregados por pregunta del club.
  const attemptsByQ = new Map<string, { attempts: number; correct: number }>();
  const latestVote = new Map<string, { vote: 'up' | 'down'; at: number }>();
  for (const l of clubLogs) {
    const acc = attemptsByQ.get(l.question_id) ?? { attempts: 0, correct: 0 };
    acc.attempts++;
    if (l.answered_correctly) acc.correct++;
    attemptsByQ.set(l.question_id, acc);
    if (l.vote === 'up' || l.vote === 'down') {
      const key = `${l.question_id}::${l.player_id}`;
      const at = new Date(l.answered_at).getTime();
      const cur = latestVote.get(key);
      if (!cur || at > cur.at) latestVote.set(key, { vote: l.vote, at });
    }
  }

  // Breakdowns por tipo/área/nivel sobre published del club.
  type Bucket = { count: number; attempts: number; correct: number };
  const byType: Record<string, Bucket> = {};
  const byArea: Record<string, Bucket> = {};
  const byLevel: Record<string, Bucket> = {};
  for (const q of clubPublished) {
    const agg = attemptsByQ.get((q as any).id) ?? { attempts: 0, correct: 0 };
    const lvl = String(Math.floor((q as any).level));
    for (const [bucket, key] of [[byType, (q as any).type], [byArea, (q as any).area], [byLevel, lvl]] as const) {
      if (!bucket[key]) bucket[key] = { count: 0, attempts: 0, correct: 0 };
      bucket[key].count++;
      bucket[key].attempts += agg.attempts;
      bucket[key].correct += agg.correct;
    }
  }

  // Feedback total del club.
  let feedbackUp = 0;
  let feedbackDown = 0;
  const upDownByQ = new Map<string, { up: number; down: number }>();
  for (const [key, { vote }] of latestVote) {
    const qid = key.split('::')[0];
    const cur = upDownByQ.get(qid) ?? { up: 0, down: 0 };
    if (vote === 'up') { cur.up++; feedbackUp++; } else { cur.down++; feedbackDown++; }
    upDownByQ.set(qid, cur);
  }

  // Avisos del club aplicando mismos criterios.
  const warningsByKind = { too_easy: 0, too_hard: 0, low_quality: 0 };
  for (const q of clubPublished) {
    const id = (q as any).id as string;
    const at = attemptsByQ.get(id) ?? { attempts: 0, correct: 0 };
    const fb = upDownByQ.get(id) ?? { up: 0, down: 0 };
    const kinds = detectWarnings({
      attempts: at.attempts,
      correct: at.correct,
      votes_up: fb.up,
      votes_down: fb.down,
    });
    for (const k of kinds) warningsByKind[k]++;
  }

  // Cursos del club: distribución por nivel + tasa de finalización local.
  const COURSE_LEVEL_PRESETS = [
    { label: 'Principiante', min: 0, max: 2 },
    { label: 'Intermedio', min: 2, max: 3.5 },
    { label: 'Avanzado', min: 3.5, max: 4.5 },
    { label: 'Competición', min: 4.5, max: 6 },
    { label: 'Profesional', min: 6, max: 7 },
  ];
  const courseLevels: Record<string, number> = {};
  for (const p of COURSE_LEVEL_PRESETS) courseLevels[p.label] = 0;
  const clubActiveCourses = clubCs.filter((c: any) => c.status === 'active');
  for (const c of clubActiveCourses) {
    const eMin = (c as any).elo_min as number;
    const eMax = (c as any).elo_max as number;
    for (const p of COURSE_LEVEL_PRESETS) {
      if (eMin <= p.max && eMax >= p.min) courseLevels[p.label]++;
    }
  }

  const clubLessonIds = new Set((clubLessonsRes.data ?? []).map((l: any) => l.id as string));
  const lessonsByCourseClub = new Map<string, Set<string>>();
  for (const l of clubLessonsRes.data ?? []) {
    const cid = (l as any).course_id as string;
    const lid = (l as any).id as string;
    if (!lessonsByCourseClub.has(cid)) lessonsByCourseClub.set(cid, new Set());
    lessonsByCourseClub.get(cid)!.add(lid);
  }
  const lessonToCourseClub = new Map<string, string>();
  for (const [cid, lessons] of lessonsByCourseClub) {
    for (const lid of lessons) lessonToCourseClub.set(lid, cid);
  }
  let coursesStartedClub = 0;
  let coursesCompletedClub = 0;
  const progressByPairClub = new Map<string, Set<string>>();
  let lessonsCompleted7dClub = 0;
  const coursePlayers30dClub = new Set<string>();
  for (const r of allProgressRes.data ?? []) {
    const playerId = (r as any).player_id as string;
    const lessonId = (r as any).lesson_id as string;
    const completedAt = (r as any).completed_at as string;
    if (!clubLessonIds.has(lessonId)) continue;
    if (completedAt >= since7d) lessonsCompleted7dClub++;
    if (completedAt >= since30d) coursePlayers30dClub.add(playerId);
    const cid = lessonToCourseClub.get(lessonId)!;
    const key = `${playerId}::${cid}`;
    if (!progressByPairClub.has(key)) progressByPairClub.set(key, new Set());
    progressByPairClub.get(key)!.add(lessonId);
  }
  for (const [key, set] of progressByPairClub) {
    const cid = key.split('::')[1];
    const totalLessons = lessonsByCourseClub.get(cid)?.size ?? 0;
    if (totalLessons === 0) continue;
    coursesStartedClub++;
    if (set.size >= totalLessons) coursesCompletedClub++;
  }
  const courseCompletionRate = coursesStartedClub > 0 ? coursesCompletedClub / coursesStartedClub : null;

  // Métricas numéricas adicionales para los cursos activos del club.
  const activeClubCourseIds = new Set(clubActiveCourses.map((c: any) => c.id as string));
  const activeClubLessons = (clubLessonsRes.data ?? []).filter((l: any) => activeClubCourseIds.has(l.course_id));
  const totalLessonsPublished = activeClubLessons.length;
  const avgLessonsPerCourse = activeClubCourseIds.size > 0
    ? totalLessonsPublished / activeClubCourseIds.size
    : null;

  let avgDurationSeconds: number | null = null;
  let coursesWithFullVideoRate: number | null = null;
  let avgDepthCompleted: number | null = null;
  if (activeClubCourseIds.size > 0) {
    const { data: detailedLessons } = await supabase
      .from('learning_course_lessons')
      .select('course_id, duration_seconds, video_url')
      .in('course_id', Array.from(activeClubCourseIds));
    const ds = detailedLessons ?? [];
    const withDuration = ds.filter((l: any) => typeof l.duration_seconds === 'number');
    avgDurationSeconds = withDuration.length > 0
      ? withDuration.reduce((s: number, l: any) => s + l.duration_seconds, 0) / withDuration.length
      : null;
    const lessonsByCourse = new Map<string, Array<{ video_url: string | null }>>();
    for (const l of ds) {
      const cid = (l as any).course_id as string;
      if (!lessonsByCourse.has(cid)) lessonsByCourse.set(cid, []);
      lessonsByCourse.get(cid)!.push({ video_url: (l as any).video_url });
    }
    let coursesAllVideos = 0;
    for (const lessons of lessonsByCourse.values()) {
      if (lessons.length > 0 && lessons.every((x) => !!x.video_url)) coursesAllVideos++;
    }
    coursesWithFullVideoRate = coursesAllVideos / activeClubCourseIds.size;
  }
  if (progressByPairClub.size > 0) {
    let totalLessonsByPair = 0;
    for (const set of progressByPairClub.values()) totalLessonsByPair += set.size;
    avgDepthCompleted = totalLessonsByPair / progressByPairClub.size;
  }

  // Benchmarks globales (sobre TODOS los clubes). Permite comparar.
  const allLessons = (allLessonsRes.data ?? []) as Array<{ id: string; course_id: string }>;
  const allLessonsByCourse = new Map<string, Set<string>>();
  for (const l of allLessons) {
    if (!allLessonsByCourse.has(l.course_id)) allLessonsByCourse.set(l.course_id, new Set());
    allLessonsByCourse.get(l.course_id)!.add(l.id);
  }
  const allLessonToCourse = new Map<string, string>();
  for (const [cid, ls] of allLessonsByCourse) {
    for (const lid of ls) allLessonToCourse.set(lid, cid);
  }
  const allCompletedByPair = new Map<string, Set<string>>();
  for (const r of allProgressRes.data ?? []) {
    const playerId = (r as any).player_id as string;
    const lessonId = (r as any).lesson_id as string;
    const cid = allLessonToCourse.get(lessonId);
    if (!cid) continue;
    const key = `${playerId}::${cid}`;
    if (!allCompletedByPair.has(key)) allCompletedByPair.set(key, new Set());
    allCompletedByPair.get(key)!.add(lessonId);
  }
  let allStarted = 0;
  let allCompleted = 0;
  for (const [key, set] of allCompletedByPair) {
    const cid = key.split('::')[1];
    const totalLessons = allLessonsByCourse.get(cid)?.size ?? 0;
    if (totalLessons === 0) continue;
    allStarted++;
    if (set.size >= totalLessons) allCompleted++;
  }
  const globalCompletionRate = allStarted > 0 ? allCompleted / allStarted : null;

  // Benchmark: tasa de acierto media global y % positivo medio global.
  let allAttempts = 0;
  let allCorrect = 0;
  const allLatestVote = new Map<string, 'up' | 'down'>();
  for (const l of allLogs) {
    allAttempts++;
    if (l.answered_correctly) allCorrect++;
    if (l.vote === 'up' || l.vote === 'down') {
      const key = `${l.question_id}::${l.player_id}`;
      // (sin tiebreak por timestamp para ahorrar; aproximación buena)
      allLatestVote.set(key, l.vote);
    }
  }
  const globalSuccessRate = allAttempts > 0 ? allCorrect / allAttempts : null;
  let globalUp = 0;
  let globalDown = 0;
  for (const v of allLatestVote.values()) v === 'up' ? globalUp++ : globalDown++;
  const globalPositiveRate = (globalUp + globalDown) > 0 ? globalUp / (globalUp + globalDown) : null;

  // Tasa local de acierto y positividad.
  let clubAttempts = 0;
  let clubCorrect = 0;
  for (const l of clubLogs) { clubAttempts++; if (l.answered_correctly) clubCorrect++; }
  const clubSuccessRate = clubAttempts > 0 ? clubCorrect / clubAttempts : null;
  const clubPositiveRate = (feedbackUp + feedbackDown) > 0 ? feedbackUp / (feedbackUp + feedbackDown) : null;

  return {
    active_questions: activeQuestions,
    active_courses: activeCourses,
    pending_courses: pendingCourses,
    active_players_7d: clubActivePlayers7d.size,
    by_type: byType,
    by_area: byArea,
    by_level: byLevel,
    volume_last_7d: clubLogs7d.length,
    volume_last_30d: clubLogs30d.length,
    daily_responses_30d: dailyResponses30d,
    warnings_by_kind: warningsByKind,
    feedback_up_total: feedbackUp,
    feedback_down_total: feedbackDown,
    lessons_completed_7d: lessonsCompleted7dClub,
    course_players_30d: coursePlayers30dClub.size,
    course_levels: courseLevels,
    course_completion_rate: courseCompletionRate,
    courses_started: coursesStartedClub,
    courses_completed: coursesCompletedClub,
    total_lessons_published: totalLessonsPublished,
    avg_lessons_per_course: avgLessonsPerCourse,
    avg_lesson_duration_seconds: avgDurationSeconds,
    courses_with_full_video_rate: coursesWithFullVideoRate,
    avg_depth_completed: avgDepthCompleted,
    // Benchmark con la media global. null si no hay muestra.
    benchmark: {
      success_rate: globalSuccessRate,
      positive_rate: globalPositiveRate,
      completion_rate: globalCompletionRate,
    },
  };
}

// ===========================================================================
// Stats detalladas por pregunta
// ===========================================================================

/**
 * Calcula estadísticas detalladas de UNA pregunta. Solo cuenta logs cuya
 * `answered_at >= question.content_updated_at` para que la distribución
 * de respuestas no incluya versiones antiguas del contenido.
 */
export async function computeQuestionDetailStats(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  questionId: string,
): Promise<Record<string, unknown> | null> {
  // Datos base de la pregunta.
  const { data: q } = await supabase
    .from('learning_questions')
    .select('id, type, level, area, content, content_updated_at, created_at')
    .eq('id', questionId)
    .maybeSingle();
  if (!q) return null;

  const contentUpdatedAt = (q as any).content_updated_at as string;

  // Logs frescos (de la versión actual del contenido) y todos los logs
  // (para mostrar nota informativa si hay anteriores).
  const { data: freshLogs } = await supabase
    .from('learning_question_log')
    .select('player_id, answered_correctly, response_time_ms, vote, selected_answer, answered_at')
    .eq('question_id', questionId)
    .gte('answered_at', contentUpdatedAt);
  const { count: totalLogs } = await supabase
    .from('learning_question_log')
    .select('id', { count: 'exact', head: true })
    .eq('question_id', questionId);

  const logs = freshLogs ?? [];
  const totalAttempts = logs.length;
  const totalCorrect = logs.filter((l: any) => l.answered_correctly).length;
  const avgResponseMs = totalAttempts > 0
    ? logs.reduce((s: number, l: any) => s + (l.response_time_ms ?? 0), 0) / totalAttempts
    : null;

  // Tendencia 30d (sobre fresh logs).
  const now = new Date();
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const dailyMap = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    dailyMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const l of logs) {
    if (l.answered_at >= since30d) {
      const day = l.answered_at.slice(0, 10);
      if (dailyMap.has(day)) dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
    }
  }
  const dailyResponses30d = Array.from(dailyMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Feedback: último voto por jugador.
  const latestVote = new Map<string, 'up' | 'down'>();
  for (const l of logs) {
    if (l.vote === 'up' || l.vote === 'down') {
      // No re-resolvemos timestamps porque dentro de freshLogs el último
      // suele ser el más reciente. Aproximación buena.
      latestVote.set(l.player_id, l.vote);
    }
  }
  let votesUp = 0;
  let votesDown = 0;
  for (const v of latestVote.values()) v === 'up' ? votesUp++ : votesDown++;

  // Distribución de respuestas. Solo para tipos con opciones discretas.
  // Para los demás (match_columns, order_sequence) no es agrupable de forma
  // sencilla y devolvemos null.
  const type = (q as any).type as string;
  let answerDistribution: Array<{ key: string; label: string; count: number; is_correct: boolean }> | null = null;
  if (type === 'test_classic') {
    const c = (q as any).content as { options?: string[]; correct_index?: number };
    const options = c.options ?? [];
    const correctIdx = c.correct_index;
    const counts = new Array(options.length).fill(0);
    for (const l of logs) {
      const sel = (l as any).selected_answer;
      if (typeof sel === 'number' && sel >= 0 && sel < options.length) counts[sel]++;
    }
    answerDistribution = options.map((opt, i) => ({
      key: String(i),
      label: opt,
      count: counts[i],
      is_correct: i === correctIdx,
    }));
  } else if (type === 'true_false') {
    const c = (q as any).content as { correct_answer?: boolean };
    let trueCount = 0;
    let falseCount = 0;
    for (const l of logs) {
      const sel = (l as any).selected_answer;
      if (sel === true) trueCount++;
      else if (sel === false) falseCount++;
    }
    answerDistribution = [
      { key: 'true', label: 'Verdadero', count: trueCount, is_correct: c.correct_answer === true },
      { key: 'false', label: 'Falso', count: falseCount, is_correct: c.correct_answer === false },
    ];
  } else if (type === 'multi_select') {
    const c = (q as any).content as { options?: string[]; correct_indices?: number[] };
    const options = c.options ?? [];
    const correctSet = new Set(c.correct_indices ?? []);
    const counts = new Array(options.length).fill(0);
    for (const l of logs) {
      const sel = (l as any).selected_answer;
      if (Array.isArray(sel)) {
        for (const idx of sel) {
          if (typeof idx === 'number' && idx >= 0 && idx < options.length) counts[idx]++;
        }
      }
    }
    answerDistribution = options.map((opt, i) => ({
      key: String(i),
      label: opt,
      count: counts[i],
      is_correct: correctSet.has(i),
    }));
  } else if (type === 'puzzle') {
    // Para puzzles, las opciones viven en learning_puzzles.options. selected_answer
    // es el id de la opción elegida.
    const { data: puzzle } = await supabase
      .from('learning_puzzles')
      .select('options')
      .eq('question_id', questionId)
      .maybeSingle();
    if (puzzle?.options && Array.isArray(puzzle.options)) {
      const opts = puzzle.options as Array<{ id: number; text: string; is_correct: boolean }>;
      const counts = new Map<string, number>();
      for (const l of logs) {
        const sel = (l as any).selected_answer;
        const id = sel != null ? String(sel) : null;
        if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      answerDistribution = opts.map((o) => ({
        key: String(o.id),
        label: o.text,
        count: counts.get(String(o.id)) ?? 0,
        is_correct: !!o.is_correct,
      }));
    }
  }

  // Acierto por nivel ELO del jugador. Trae el elo_rating actual de cada
  // jugador con respuesta a esta pregunta. (No tenemos histórico de elo; usamos
  // el actual como aproximación — info útil aunque no perfecta.)
  const playerIds = Array.from(new Set(logs.map((l: any) => l.player_id as string)));
  const eloByPlayer = new Map<string, number>();
  if (playerIds.length > 0) {
    const { data: players } = await supabase
      .from('players')
      .select('id, elo_rating')
      .in('id', playerIds);
    for (const p of players ?? []) {
      const elo = (p as any).elo_rating as number | null;
      if (typeof elo === 'number') eloByPlayer.set((p as any).id as string, elo);
    }
  }
  // Buckets por rangos predefinidos (los mismos del LevelFilter).
  const ELO_BUCKETS = [
    { label: 'Principiante', min: 0, max: 2 },
    { label: 'Intermedio', min: 2, max: 3.5 },
    { label: 'Avanzado', min: 3.5, max: 4.5 },
    { label: 'Competición', min: 4.5, max: 6 },
    { label: 'Profesional', min: 6, max: 7 },
  ];
  const eloDistribution = ELO_BUCKETS.map((b) => ({ label: b.label, attempts: 0, correct: 0 }));
  for (const l of logs) {
    const elo = eloByPlayer.get((l as any).player_id);
    if (typeof elo !== 'number') continue;
    const bucket = eloDistribution.find((_, i) => {
      const b = ELO_BUCKETS[i];
      return elo >= b.min && elo < b.max;
    });
    if (bucket) {
      bucket.attempts++;
      if ((l as any).answered_correctly) bucket.correct++;
    }
  }

  return {
    question_id: questionId,
    content_updated_at: contentUpdatedAt,
    has_pre_edit_logs: (totalLogs ?? 0) > logs.length,
    total_attempts: totalAttempts,
    total_correct: totalCorrect,
    success_rate: totalAttempts > 0 ? totalCorrect / totalAttempts : null,
    avg_response_ms: avgResponseMs,
    votes_up: votesUp,
    votes_down: votesDown,
    daily_responses_30d: dailyResponses30d,
    answer_distribution: answerDistribution,
    elo_distribution: eloDistribution,
  };
}

// ===========================================================================
// Stats detalladas por curso
// ===========================================================================

/**
 * Estadísticas detalladas de un curso: iniciados, completados, funnel de
 * progreso por lección, tendencia 30d. NO filtra por content_updated_at
 * porque el "contenido" de un curso son sus lecciones, y cambiarlas
 * requiere acciones explícitas (añadir/eliminar lección) que ya se reflejan
 * en learning_course_progress vía FK.
 */
export async function computeCourseDetailStats(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  courseId: string,
): Promise<Record<string, unknown> | null> {
  const { data: course } = await supabase
    .from('learning_courses')
    .select('id, title, status')
    .eq('id', courseId)
    .maybeSingle();
  if (!course) return null;

  const { data: lessons } = await supabase
    .from('learning_course_lessons')
    .select('id, "order", title, duration_seconds, video_url')
    .eq('course_id', courseId)
    .order('order', { ascending: true });
  const lessonsList = (lessons ?? []) as Array<{ id: string; order: number; title: string; duration_seconds: number | null; video_url: string | null }>;
  const lessonIds = lessonsList.map((l) => l.id);
  const totalLessons = lessonsList.length;

  if (lessonIds.length === 0) {
    return {
      course_id: courseId,
      total_lessons: 0,
      players_started: 0,
      players_completed: 0,
      completion_rate: null,
      lessons_completed_30d: 0,
      lesson_funnel: [],
      daily_progress_30d: [],
    };
  }

  const { data: progress } = await supabase
    .from('learning_course_progress')
    .select('player_id, lesson_id, completed_at')
    .in('lesson_id', lessonIds);
  const allProgress = (progress ?? []) as Array<{ player_id: string; lesson_id: string; completed_at: string }>;

  // Jugadores iniciados y completados.
  const completedByPlayer = new Map<string, Set<string>>();
  for (const p of allProgress) {
    if (!completedByPlayer.has(p.player_id)) completedByPlayer.set(p.player_id, new Set());
    completedByPlayer.get(p.player_id)!.add(p.lesson_id);
  }
  const playersStarted = completedByPlayer.size;
  let playersCompleted = 0;
  for (const set of completedByPlayer.values()) {
    if (set.size >= totalLessons) playersCompleted++;
  }
  const completionRate = playersStarted > 0 ? playersCompleted / playersStarted : null;

  // Funnel por lección: cuántos jugadores únicos completaron cada una.
  const lessonFunnel = lessonsList.map((l) => {
    const count = allProgress.filter((p) => p.lesson_id === l.id)
      .reduce((set, p) => set.add(p.player_id), new Set<string>())
      .size;
    return {
      lesson_id: l.id,
      order: l.order,
      title: l.title,
      duration_seconds: l.duration_seconds,
      has_video: !!l.video_url,
      completions: count,
    };
  });

  // Tendencia 30d.
  const now = new Date();
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const dailyMap = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    dailyMap.set(d.toISOString().slice(0, 10), 0);
  }
  let lessonsCompleted30d = 0;
  for (const p of allProgress) {
    if (p.completed_at >= since30d) {
      lessonsCompleted30d++;
      const day = p.completed_at.slice(0, 10);
      if (dailyMap.has(day)) dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
    }
  }
  const dailyProgress30d = Array.from(dailyMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    course_id: courseId,
    total_lessons: totalLessons,
    players_started: playersStarted,
    players_completed: playersCompleted,
    completion_rate: completionRate,
    lessons_completed_30d: lessonsCompleted30d,
    lesson_funnel: lessonFunnel,
    daily_progress_30d: dailyProgress30d,
  };
}

// Helper compartido para collectar avisos por club (o todos, para admin).
// Devuelve cada pregunta con su array de warnings ya calculado.
export async function collectWarnings(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  opts: { clubId?: string },
): Promise<Array<Record<string, unknown> & { warnings: WarningKind[] }>> {
  let query = supabase
    .from('learning_questions')
    .select('*');
  if (opts.clubId) query = query.eq('created_by_club', opts.clubId);

  const { data, error } = await query;
  if (error || !data) return [];

  const ids = data.map((q: any) => q.id as string);
  const [feedbackAgg, attemptsAgg] = await Promise.all([
    aggregateFeedback(supabase, ids),
    aggregateAttempts(supabase, ids),
  ]);

  // Para puzzles, mergear content desde learning_puzzles igual que el listing.
  const puzzleIds = data.filter((q: any) => q.type === 'puzzle').map((q: any) => q.id);
  const puzzleByQ = new Map<string, any>();
  if (puzzleIds.length > 0) {
    const { data: puzzles } = await supabase
      .from('learning_puzzles')
      .select('*')
      .in('question_id', puzzleIds);
    for (const p of puzzles ?? []) puzzleByQ.set((p as any).question_id, p);
  }

  const out: Array<Record<string, unknown> & { warnings: WarningKind[] }> = [];
  for (const q of data as Array<Record<string, unknown>>) {
    const id = q.id as string;
    const fb = feedbackAgg.get(id) ?? { up: 0, down: 0 };
    const at = attemptsAgg.get(id) ?? { attempts: 0, correct: 0 };
    const warnings = detectWarnings({
      attempts: at.attempts,
      correct: at.correct,
      votes_up: fb.up,
      votes_down: fb.down,
    });
    if (warnings.length === 0) continue;

    const enriched: any = {
      ...q,
      feedback_up: fb.up,
      feedback_down: fb.down,
      attempts_count: at.attempts,
      correct_count: at.correct,
      warnings,
    };
    if (q.type === 'puzzle') {
      const p = puzzleByQ.get(id);
      if (p) {
        enriched.content = {
          schema_version: p.schema_version,
          statement: p.statement,
          intro_frame: p.intro_frame,
          initial_frame: p.initial_frame,
          options: p.options,
        };
        enriched.puzzle = p;
      } else {
        enriched.puzzle = null;
      }
    }
    out.push(enriched);
  }
  return out;
}

export default router;
