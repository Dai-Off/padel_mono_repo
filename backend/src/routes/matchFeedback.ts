import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { getPlayerIdFromBearer } from '../lib/authPlayer';
import { FEEDBACK_WINDOW_HOURS } from '../lib/levelingConstants';

const router = Router();

const REPEAT_REASONS = new Set([
  'rivals_above',
  'rivals_below',
  'partner_mismatch',
  'imbalanced',
  'schedule_or_venue',
  'other',
]);

/**
 * @openapi
 * /matches/{id}/feedback:
 *   post:
 *     tags: [Matches — feedback]
 *     summary: Enviar feedback post-partido
 *     description: |
 *       Ventana de 24h desde la confirmación del marcador.
 *       `level_ratings` debe incluir exactamente a los otros 3 jugadores del partido.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               level_ratings:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [player_id, perceived]
 *                   properties:
 *                     player_id: { type: string, format: uuid }
 *                     perceived: { type: integer, enum: [-1, 0, 1] }
 *                     comment: { type: string, nullable: true }
 *               would_repeat: { type: boolean }
 *               would_not_repeat_reason:
 *                 type: string
 *                 enum: [rivals_above, rivals_below, partner_mismatch, imbalanced, schedule_or_venue, other]
 *               comment: { type: string }
 *           examples:
 *             sample:
 *               value:
 *                 level_ratings:
 *                   - { player_id: "00000000-0000-4000-8000-000000000001", perceived: 0, comment: null }
 *                   - { player_id: "00000000-0000-4000-8000-000000000002", perceived: 1, comment: null }
 *                   - { player_id: "00000000-0000-4000-8000-000000000003", perceived: -1, comment: null }
 *                 would_repeat: true
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             examples:
 *               ok: { value: { ok: true } }
 *       400: { description: Validación fallida }
 *       403: { description: No participante o marcador no confirmado }
 *       410: { description: Fuera de ventana }
 */
router.post('/:id/feedback', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });

  const matchId = req.params.id;
  const supabase = getSupabaseServiceRoleClient();

  const { data: mp } = await supabase
    .from('match_players')
    .select('player_id')
    .eq('match_id', matchId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (!mp) return res.status(403).json({ ok: false, error: 'No participas en este partido' });

  const { data: match } = await supabase
    .from('matches')
    .select('score_status, score_confirmed_at, updated_at')
    .eq('id', matchId)
    .maybeSingle();
  if (!match || match.score_status !== 'confirmed') {
    return res.status(403).json({ ok: false, error: 'El marcador no está confirmado' });
  }

  const confirmedAt = (match.score_confirmed_at as string | null) ?? (match.updated_at as string);
  const deadline = new Date(confirmedAt).getTime() + FEEDBACK_WINDOW_HOURS * 3600 * 1000;
  if (Date.now() > deadline) {
    return res.status(410).json({ ok: false, error: 'Ventana de feedback cerrada' });
  }

  const { data: others } = await supabase
    .from('match_players')
    .select('player_id')
    .eq('match_id', matchId)
    .neq('player_id', playerId);
  const otherIds = new Set((others ?? []).map((o: { player_id: string }) => o.player_id));
  const ratings = req.body?.level_ratings;
  if (!Array.isArray(ratings) || ratings.length !== otherIds.size) {
    return res.status(400).json({ ok: false, error: 'level_ratings debe incluir exactamente a los otros 3 jugadores' });
  }
  const rated = new Set<string>();
  for (const r of ratings) {
    if (!r || typeof r !== 'object') return res.status(400).json({ ok: false, error: 'level_ratings inválido' });
    const o = r as Record<string, unknown>;
    const pid = String(o.player_id ?? '');
    const perceived = Number(o.perceived);
    if (!otherIds.has(pid)) return res.status(400).json({ ok: false, error: `player_id no válido: ${pid}` });
    if (![-1, 0, 1].includes(perceived)) return res.status(400).json({ ok: false, error: 'perceived debe ser -1, 0 o 1' });
    rated.add(pid);
  }
  if (rated.size !== otherIds.size) return res.status(400).json({ ok: false, error: 'Jugadores duplicados o faltantes en level_ratings' });

  const wouldRepeat = req.body?.would_repeat;
  const wnr = req.body?.would_not_repeat_reason as string | undefined;
  if (wouldRepeat === false && wnr && !REPEAT_REASONS.has(wnr)) {
    return res.status(400).json({ ok: false, error: 'would_not_repeat_reason inválido' });
  }

  const { error: upErr } = await supabase.from('match_feedback').upsert(
    {
      match_id: matchId,
      reviewer_id: playerId,
      level_ratings: ratings,
      would_repeat: typeof wouldRepeat === 'boolean' ? wouldRepeat : null,
      would_not_repeat_reason: wouldRepeat === false ? wnr ?? null : null,
      comment: typeof req.body?.comment === 'string' ? req.body.comment : null,
    },
    { onConflict: 'match_id,reviewer_id' }
  );
  if (upErr) return res.status(500).json({ ok: false, error: upErr.message });

  return res.json({ ok: true });
});

export default router;
