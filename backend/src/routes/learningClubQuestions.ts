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
      if (!Array.isArray(c.pairs) || c.pairs.length < 3 || c.pairs.length > 5)
        return 'content.pairs debe ser un array de 3 a 5 objetos';
      for (const pair of c.pairs as Record<string, unknown>[]) {
        if (!pair || typeof pair.left !== 'string' || !pair.left || typeof pair.right !== 'string' || !pair.right)
          return 'Cada par debe tener left y right como strings no vacíos';
      }
      return null;
    }
    case 'order_sequence': {
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
    const hasVideo = !isPuzzle && !!video_url && typeof video_url === 'string';
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

    const supabase = getSupabaseServiceRoleClient();
    let query = supabase
      .from('learning_questions')
      .select('*')
      .eq('created_by_club', clubId)
      .order('created_at', { ascending: false });

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

    const { data, error } = await query;
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const rows = data ?? [];
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

    return res.json({ ok: true, data: rows, meta: { unread_count: unreadCount } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

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

export default router;
