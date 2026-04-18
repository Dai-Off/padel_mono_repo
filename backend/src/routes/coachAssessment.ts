import { Router, Request, Response } from 'express';
import { getPlayerIdFromBearer } from '../lib/authPlayer';
import { 
  calculateAssessment, 
  saveAssessment, 
  getPlayerAssessment,
  CoachAnswer
} from '../services/coachAssessmentService';

const router = Router();

/**
 * @openapi
 * /coach-assessment/me:
 *   get:
 *     tags: [CoachAssessment]
 *     summary: Obtener la evaluación del Coach IA del jugador actual
 *     security: [{ bearerAuth: [] }]
 */
router.get('/me', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });

  try {
    const assessment = await getPlayerAssessment(playerId!);
    return res.json({ ok: true, assessment });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

/**
 * @openapi
 * /coach-assessment:
 *   post:
 *     tags: [CoachAssessment]
 *     summary: Enviar y calcular la evaluación del Coach IA
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [answers]
 *             properties:
 *               answers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [question_index, selected_option]
 */
router.post('/', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });

  const answers = req.body?.answers as CoachAnswer[] | undefined;
  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ ok: false, error: 'answers debe ser un array no vacío' });
  }

  try {
    // Check if assessment already exists
    const existing = await getPlayerAssessment(playerId!);
    if (existing) {
      return res.status(409).json({ ok: false, error: 'La evaluación del Coach IA ya ha sido completada' });
    }

    // Calculate results
    const result = calculateAssessment(answers);

    // Persist
    const saved = await saveAssessment(playerId!, answers, result);

    return res.json({ ok: true, assessment: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

export default router;
