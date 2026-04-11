import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { requireClubOwnerOrAdmin } from '../middleware/requireClubOwnerOrAdmin';
import { canAccessClub } from './learningHelpers';

const router = Router();

// ---------------------------------------------------------------------------
// Constants and validation
// ---------------------------------------------------------------------------

const VALID_QUESTION_TYPES = ['test_classic', 'true_false', 'multi_select', 'match_columns', 'order_sequence'] as const;
const VALID_AREAS = ['technique', 'tactics', 'physical', 'mental_vocabulary'] as const;

function validateQuestionContent(type: string, content: unknown): string | null {
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
    default:
      return `Tipo de pregunta desconocido: ${type}`;
  }
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

// POST /questions
router.post('/questions', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    const { club_id, type, level, area, has_video, video_url, content } = req.body ?? {};

    if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
    if (!canAccessClub(req, club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

    if (!VALID_QUESTION_TYPES.includes(type)) {
      return res.status(400).json({ ok: false, error: `type debe ser uno de: ${VALID_QUESTION_TYPES.join(', ')}` });
    }
    if (!VALID_AREAS.includes(area)) {
      return res.status(400).json({ ok: false, error: `area debe ser uno de: ${VALID_AREAS.join(', ')}` });
    }
    if (level == null || typeof level !== 'number' || level < 0) {
      return res.status(400).json({ ok: false, error: 'level debe ser un número >= 0' });
    }
    if (has_video && (!video_url || typeof video_url !== 'string')) {
      return res.status(400).json({ ok: false, error: 'video_url es obligatorio cuando has_video es true' });
    }

    const contentError = validateQuestionContent(type, content);
    if (contentError) return res.status(400).json({ ok: false, error: contentError });

    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('learning_questions')
      .insert({
        type,
        level,
        area,
        has_video: !!has_video,
        video_url: has_video ? video_url : null,
        content,
        created_by_club: club_id,
        is_active: true,
      })
      .select('*')
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(201).json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// PUT /questions/:id
router.put('/questions/:id', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const questionId = req.params.id;

    const { data: existing, error: fetchErr } = await supabase
      .from('learning_questions')
      .select('id, created_by_club, type')
      .eq('id', questionId)
      .maybeSingle();

    if (fetchErr) return res.status(500).json({ ok: false, error: fetchErr.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Pregunta no encontrada' });
    if (!canAccessClub(req, existing.created_by_club)) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }

    const { type, level, area, has_video, video_url, content } = req.body ?? {};
    const updates: Record<string, unknown> = {};

    const effectiveType = type ?? existing.type;

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
    if (level !== undefined) {
      if (typeof level !== 'number' || level < 0) {
        return res.status(400).json({ ok: false, error: 'level debe ser un número >= 0' });
      }
      updates.level = level;
    }
    if (has_video !== undefined) {
      updates.has_video = !!has_video;
    }
    if (video_url !== undefined) {
      updates.video_url = video_url;
    }
    if (content !== undefined) {
      const contentError = validateQuestionContent(effectiveType, content);
      if (contentError) return res.status(400).json({ ok: false, error: contentError });
      updates.content = content;
    }

    // Validar has_video + video_url combinados
    const finalHasVideo = updates.has_video !== undefined ? updates.has_video : undefined;
    if (finalHasVideo === true) {
      const finalVideoUrl = updates.video_url;
      if (!finalVideoUrl || typeof finalVideoUrl !== 'string') {
        return res.status(400).json({ ok: false, error: 'video_url es obligatorio cuando has_video es true' });
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
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// PATCH /questions/:id/deactivate
router.patch('/questions/:id/deactivate', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
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
    if (!canAccessClub(req, existing.created_by_club)) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }

    const { error } = await supabase
      .from('learning_questions')
      .update({ is_active: false })
      .eq('id', questionId);

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, data: { id: questionId, is_active: false } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// GET /questions
router.get('/questions', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  try {
    const clubId = req.query.club_id as string;
    if (!clubId) return res.status(400).json({ ok: false, error: 'club_id es obligatorio como query param' });
    if (!canAccessClub(req, clubId)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

    const supabase = getSupabaseServiceRoleClient();
    let query = supabase
      .from('learning_questions')
      .select('*')
      .eq('created_by_club', clubId)
      .order('created_at', { ascending: false });

    const { type, area, is_active } = req.query;
    if (type) query = query.eq('type', type as string);
    if (area) query = query.eq('area', area as string);
    if (is_active === 'false') {
      query = query.eq('is_active', false);
    } else if (is_active === 'all') {
      // No filtrar por is_active
    } else {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, data: data ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
