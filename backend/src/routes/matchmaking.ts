import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { getPlayerIdFromBearer } from '../lib/authPlayer';
import { applyMatchmakingRejectPenalty, runMatchmakingCycle } from '../services/matchmakingService';

const router = Router();

/**
 * @openapi
 * /matchmaking/join:
 *   post:
 *     tags: [Matchmaking]
 *     summary: Entrar en la cola de búsqueda
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [available_from, available_until]
 *             properties:
 *               club_id: { type: string, format: uuid }
 *               max_distance_km: { type: integer }
 *               preferred_side: { type: string, enum: [drive, backhand, any] }
 *               gender: { type: string, default: any }
 *               available_from: { type: string, format: date-time }
 *               available_until: { type: string, format: date-time }
 *               paired_with_id: { type: string, format: uuid }
 *     responses:
 *       200: { description: OK }
 *       403: { description: Onboarding incompleto }
 *       409: { description: Ya en cola }
 */
router.post('/join', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });

  const {
    club_id,
    max_distance_km,
    preferred_side,
    gender,
    available_from,
    available_until,
    paired_with_id,
  } = req.body ?? {};
  if (!available_from || !available_until) {
    return res.status(400).json({ ok: false, error: 'available_from y available_until son obligatorios' });
  }

  const supabase = getSupabaseServiceRoleClient();
  const { data: pl, error: e1 } = await supabase
    .from('players')
    .select('initial_rating_completed')
    .eq('id', playerId)
    .maybeSingle();
  if (e1) return res.status(500).json({ ok: false, error: e1.message });
  if (!(pl as { initial_rating_completed?: boolean } | null)?.initial_rating_completed) {
    return res.status(403).json({ ok: false, error: 'Complete el cuestionario de nivelación primero' });
  }

  const { data: existing } = await supabase.from('matchmaking_pool').select('id').eq('player_id', playerId).maybeSingle();
  if (existing) return res.status(409).json({ ok: false, error: 'Ya estás en la cola de matchmaking' });

  if (paired_with_id) {
    const { data: buddy } = await supabase.from('players').select('id').eq('id', paired_with_id).maybeSingle();
    if (!buddy) return res.status(400).json({ ok: false, error: 'paired_with_id no existe' });
  }

  const side =
    preferred_side && ['drive', 'backhand', 'any'].includes(preferred_side) ? preferred_side : null;
  const { error: insErr } = await supabase.from('matchmaking_pool').insert({
    player_id: playerId,
    paired_with_id: paired_with_id ?? null,
    club_id: club_id ?? null,
    max_distance_km: max_distance_km != null ? Number(max_distance_km) : null,
    preferred_side: side,
    gender: typeof gender === 'string' ? gender : 'any',
    available_from,
    available_until,
    status: 'searching',
  });
  if (insErr) return res.status(500).json({ ok: false, error: insErr.message });
  return res.json({ ok: true });
});

/**
 * @openapi
 * /matchmaking/leave:
 *   delete:
 *     tags: [Matchmaking]
 *     summary: Salir de la cola
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 */
router.delete('/leave', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });
  const supabase = getSupabaseServiceRoleClient();
  await supabase.from('matchmaking_pool').delete().eq('player_id', playerId);
  return res.json({ ok: true });
});

/**
 * @openapi
 * /matchmaking/status:
 *   get:
 *     tags: [Matchmaking]
 *     summary: Estado en cola / partido propuesto
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value: { ok: true, status: searching, match_id: null }
 */
router.get('/status', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });
  const supabase = getSupabaseServiceRoleClient();
  const { data: row } = await supabase
    .from('matchmaking_pool')
    .select('status, proposed_match_id')
    .eq('player_id', playerId)
    .maybeSingle();
  if (!row) return res.json({ ok: true, status: null, match_id: null });
  return res.json({
    ok: true,
    status: (row as { status: string }).status,
    match_id: (row as { proposed_match_id: string | null }).proposed_match_id,
  });
});

/**
 * @openapi
 * /matchmaking/reject:
 *   post:
 *     tags: [Matchmaking]
 *     summary: Rechazar partido propuesto por el sistema
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [match_id]
 *             properties:
 *               match_id: { type: string, format: uuid }
 *     responses:
 *       200: { description: OK }
 */
router.post('/reject', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });
  const matchId = req.body?.match_id as string | undefined;
  if (!matchId) return res.status(400).json({ ok: false, error: 'match_id requerido' });

  const supabase = getSupabaseServiceRoleClient();
  const { data: mp } = await supabase
    .from('match_players')
    .select('player_id')
    .eq('match_id', matchId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (!mp) return res.status(403).json({ ok: false, error: 'No participas en este partido' });

  const { data: m } = await supabase.from('matches').select('type').eq('id', matchId).maybeSingle();
  if ((m as { type?: string } | null)?.type !== 'matchmaking') {
    return res.status(400).json({ ok: false, error: 'Solo aplica a partidos de matchmaking' });
  }

  const { data: allMp } = await supabase.from('match_players').select('player_id').eq('match_id', matchId);
  const ids = (allMp ?? []).map((x: { player_id: string }) => x.player_id);

  await supabase.from('matches').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', matchId);

  for (const pid of ids) {
    await supabase
      .from('matchmaking_pool')
      .update({
        status: 'searching',
        proposed_match_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('player_id', pid);
  }

  try {
    await applyMatchmakingRejectPenalty(playerId);
  } catch (e) {
    console.error('[matchmaking/reject penalty]', e);
  }

  return res.json({ ok: true });
});

/**
 * @openapi
 * /matchmaking/run-cycle:
 *   post:
 *     tags: [Matchmaking]
 *     summary: Ejecutar un ciclo de emparejamiento (uso operador/cron)
 *     description: Protegido por header `x-cron-secret` igual a env CRON_SECRET (opcional en dev).
 *     parameters:
 *       - in: header
 *         name: x-cron-secret
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
router.post('/run-cycle', async (req: Request, res: Response) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const h = req.headers['x-cron-secret'];
    if (h !== secret) return res.status(403).json({ ok: false, error: 'No autorizado' });
  }
  try {
    const { formed } = await runMatchmakingCycle();
    return res.json({ ok: true, formed });
  } catch (e) {
    return res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

export default router;
