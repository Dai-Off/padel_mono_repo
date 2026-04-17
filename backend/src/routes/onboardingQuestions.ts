import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireAdmin } from '../middleware/requireAdmin';

const router = Router();
router.use(attachAuthContext);

const FIELDS = 'id, question_key, phase, pool, text, type, options, display_order, is_active, created_at';

/**
 * @openapi
 * /onboarding-questions:
 *   get:
 *     tags: [OnboardingQuestions]
 *     summary: Listar todas las preguntas del cuestionario
 *     description: Permite filtrar por fase, pool, y si están activas.
 */
router.get('/', async (req: Request, res: Response) => {
  const { phase, pool, is_active } = req.query;

  try {
    const supabase = getSupabaseServiceRoleClient();
    let q = supabase
      .from('onboarding_questions')
      .select(FIELDS)
      .order('phase', { ascending: true })
      .order('display_order', { ascending: true });

    if (phase) q = q.eq('phase', Number(phase));
    if (pool) q = q.eq('pool', String(pool));
    // Por defecto mostramos solo activas si no se envía parámetro,
    // a menos que manden explícitamente is_active=all (para el panel admin)
    if (is_active !== 'all') {
      q = q.eq('is_active', is_active === 'false' ? false : true);
    }

    const { data, error } = await q;

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, questions: data || [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /onboarding-questions/{id}:
 *   get:
 *     tags: [OnboardingQuestions]
 *     summary: Obtener una pregunta específica
 */
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('onboarding_questions')
      .select(FIELDS)
      .eq('id', id)
      .maybeSingle();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Pregunta no encontrada' });
    return res.json({ ok: true, question: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /onboarding-questions:
 *   post:
 *     tags: [OnboardingQuestions]
 *     summary: Crear nueva pregunta (Solo Admin)
 *     security: [{ bearerAuth: [] }]
 */
router.post('/', requireAdmin, async (req: Request, res: Response) => {
  const { question_key, phase, pool, text, type, options, display_order, is_active } = req.body ?? {};

  if (!question_key || !phase || !text || !type || !options) {
    return res.status(400).json({ ok: false, error: 'question_key, phase, text, type y options son obligatorios' });
  }

  if (phase === 2 && !pool) {
    return res.status(400).json({ ok: false, error: 'Las preguntas de Fase 2 requieren definir un pool' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    
    // Calcular siguiente order si no se proporciona
    let newOrder = Number(display_order);
    if (isNaN(newOrder)) {
      const { data: lastQ } = await supabase
        .from('onboarding_questions')
        .select('display_order')
        .eq('phase', phase)
        .order('display_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      newOrder = (lastQ?.display_order ?? 0) + 1;
    }

    const { data, error } = await supabase
      .from('onboarding_questions')
      .insert({
        question_key,
        phase,
        pool: phase === 1 ? null : pool,
        text,
        type,
        options,
        display_order: newOrder,
        is_active: is_active !== undefined ? Boolean(is_active) : true
      })
      .select(FIELDS)
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(201).json({ ok: true, question: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /onboarding-questions/{id}:
 *   put:
 *     tags: [OnboardingQuestions]
 *     summary: Actualizar pregunta (Solo Admin)
 *     security: [{ bearerAuth: [] }]
 */
router.put('/:id', requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { question_key, phase, pool, text, type, options, display_order, is_active } = req.body ?? {};

  const updates: Record<string, any> = {};
  if (question_key !== undefined) updates.question_key = question_key;
  if (phase !== undefined) updates.phase = phase;
  if (pool !== undefined) updates.pool = pool;
  if (text !== undefined) updates.text = text;
  if (type !== undefined) updates.type = type;
  if (options !== undefined) updates.options = options;
  if (display_order !== undefined) updates.display_order = display_order;
  if (is_active !== undefined) updates.is_active = Boolean(is_active);

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('onboarding_questions')
      .update(updates)
      .eq('id', id)
      .select(FIELDS)
      .maybeSingle();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Pregunta no encontrada' });
    
    return res.json({ ok: true, question: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /onboarding-questions/{id}:
 *   delete:
 *     tags: [OnboardingQuestions]
 *     summary: Borrado lógico de la pregunta (Soft Delete) (Solo Admin)
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    const supabase = getSupabaseServiceRoleClient();
    
    // Soft Delete: marcamos is_active = false
    const { data, error } = await supabase
      .from('onboarding_questions')
      .update({ is_active: false })
      .eq('id', id)
      .select('id, is_active')
      .maybeSingle();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Pregunta no encontrada' });
    
    return res.json({ ok: true, message: 'Pregunta desactivada', question: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
