import { Router, Request, Response } from 'express';
import { getPlayerIdFromBearer } from '../lib/authPlayer';
import {
  localizeCoachAssessmentText,
  parseCoachAssessmentLocale,
} from '../lib/coachAssessmentLanguage';
import {
  calculateAssessment,
  saveAssessment,
  getPlayerAssessment,
  recomputeAndGetAssessment,
  CoachAnswer,
} from '../services/coachAssessmentService';

const router = Router();

function resolveLocale(req: Request): string {
  return parseCoachAssessmentLocale(
    req.query.lang as string | string[] | undefined,
    req.headers['accept-language'] as string | undefined
  );
}

/**
 * @openapi
 * /coach-assessment/me:
 *   get:
 *     tags: [CoachAssessment]
 *     summary: Obtener la evaluación del Coach IA del jugador actual
 *     description: |
 *       Idioma opcional: query `lang` (ej. `es`, `en`, `zh-HK`) o cabecera `Accept-Language`; por defecto `es`.
 *       Los textos (`level_name`, fortalezas, mejoras, recomendación) se devuelven traducidos; los datos numéricos no cambian.
 *     parameters:
 *       - in: query
 *         name: lang
 *         schema:
 *           type: string
 *         description: Locale BCP-47 para la tarjeta (default `es`)
 *     security: [{ bearerAuth: [] }]
 */
router.get('/me', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });

  const locale = resolveLocale(req);

  try {
    // Recalcula el radar desde señales reales (ELO + learning) y lo persiste,
    // de modo que se mantiene fresco y se crea si no existía; luego se localiza.
    const assessment = await recomputeAndGetAssessment(playerId!);
    if (!assessment) return res.json({ ok: true, assessment: null, locale });
    return res.json({
      ok: true,
      assessment: localizeCoachAssessmentText(assessment, locale),
      locale,
    });
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
 *     description: |
 *       Idioma opcional: query `lang` (ej. `es`, `en`, `zh-HK`) o cabecera `Accept-Language`; por defecto `es`.
 *     parameters:
 *       - in: query
 *         name: lang
 *         schema:
 *           type: string
 *         description: Locale BCP-47 para la respuesta (default `es`)
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

  const locale = resolveLocale(req);

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

    return res.json({
      ok: true,
      assessment: localizeCoachAssessmentText(saved, locale),
      locale,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

export default router;
