import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { getPlayerIdFromBearer } from '../lib/authPlayer';
import { applyFriendlyPlayCounts, runLevelingPipeline, type ScoreSet } from '../services/levelingService';
import { runFraudCheck } from '../services/fraudService';
import { FEEDBACK_WINDOW_HOURS, MAX_DISPUTE_ROUNDS } from '../lib/levelingConstants';

const router = Router();

export { MAX_DISPUTE_ROUNDS, FEEDBACK_WINDOW_HOURS };

function parseSets(body: unknown): ScoreSet[] | null {
  if (!body || typeof body !== 'object') return null;
  const sets = (body as { sets?: unknown }).sets;
  if (!Array.isArray(sets) || sets.length === 0 || sets.length > 3) return null;
  const out: ScoreSet[] = [];
  for (const s of sets) {
    if (!s || typeof s !== 'object') return null;
    const o = s as Record<string, unknown>;
    const a = Number(o.a);
    const b = Number(o.b);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) return null;
    out.push({ a, b });
  }
  return out;
}

async function countSubmissions(matchId: string): Promise<number> {
  const supabase = getSupabaseServiceRoleClient();
  const { count, error } = await supabase
    .from('score_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('match_id', matchId);
  if (error) return 0;
  return count ?? 0;
}

async function firstSubmission(matchId: string) {
  const supabase = getSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('score_submissions')
    .select('team, sets')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data as { team: string; sets: unknown } | null;
}

/**
 * @openapi
 * /matches/{id}/score:
 *   post:
 *     tags: [Matches — marcador]
 *     summary: Proponer marcador (primera vez)
 *     description: |
 *       Solo con `score_status=pending`. Primera escritura gana; actualiza el partido a `pending_confirmation`.
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
 *             required: [sets]
 *             properties:
 *               sets:
 *                 type: array
 *                 maxItems: 3
 *                 items:
 *                   type: object
 *                   required: [a, b]
 *                   properties:
 *                     a: { type: number }
 *                     b: { type: number }
 *               match_end_reason:
 *                 type: string
 *                 enum: [completed, retired, timeout]
 *               retired_team:
 *                 type: string
 *                 enum: [A, B]
 *           examples:
 *             sample:
 *               value:
 *                 sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }]
 *                 match_end_reason: completed
 *     responses:
 *       200:
 *         description: Propuesta registrada
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value: { ok: true }
 *       401: { description: No autorizado }
 *       409:
 *         description: Ya hay propuesta activa o estado incorrecto
 *         content:
 *           application/json:
 *             examples:
 *               conflict:
 *                 value: { ok: false, error: "Ya hay una propuesta de marcador activa. Espera confirmación del rival o propón un contra-marcador." }
 *       400: { description: Body inválido }
 */
router.post('/:id/score', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });

  const matchId = req.params.id;
  const sets = parseSets(req.body);
  if (!sets) return res.status(400).json({ ok: false, error: 'sets inválido (máx. 3 sets {a,b})' });

  const matchEndReason = req.body?.match_end_reason as string | undefined;
  const retiredTeam = req.body?.retired_team as string | undefined;
  const mer =
    matchEndReason && ['completed', 'retired', 'timeout'].includes(matchEndReason)
      ? matchEndReason
      : 'completed';
  const rt =
    mer === 'retired' && retiredTeam && ['A', 'B'].includes(retiredTeam) ? retiredTeam : null;

  const supabase = getSupabaseServiceRoleClient();

  const { data: mp, error: e1 } = await supabase
    .from('match_players')
    .select('team')
    .eq('match_id', matchId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (e1) return res.status(500).json({ ok: false, error: e1.message });
  if (!mp) return res.status(403).json({ ok: false, error: 'No participas en este partido' });
  const team = mp.team as string;

  const now = new Date().toISOString();
  const { data: updated, error: e2 } = await supabase
    .from('matches')
    .update({
      sets,
      match_end_reason: mer,
      retired_team: rt,
      score_status: 'pending_confirmation',
      score_first_proposer_team: team,
      score_confirmed_at: null,
      updated_at: now,
    })
    .eq('id', matchId)
    .eq('score_status', 'pending')
    .select('id')
    .maybeSingle();

  if (e2) return res.status(500).json({ ok: false, error: e2.message });
  if (!updated) {
    return res.status(409).json({
      ok: false,
      error:
        'Ya hay una propuesta de marcador activa. Espera confirmación del rival o propón un contra-marcador.',
    });
  }

  const { error: e3 } = await supabase.from('score_submissions').insert({
    match_id: matchId,
    player_id: playerId,
    team,
    sets,
  });
  if (e3) {
    await supabase
      .from('matches')
      .update({ score_status: 'pending', updated_at: now })
      .eq('id', matchId);
    return res.status(500).json({ ok: false, error: e3.message });
  }

  return res.json({ ok: true });
});

/**
 * @openapi
 * /matches/{id}/score/confirm:
 *   post:
 *     tags: [Matches — marcador]
 *     summary: Confirmar marcador (equipo rival)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value: { ok: true, score_status: confirmed, request_feedback: true }
 *       401: { description: No autorizado }
 *       409: { description: Estado no válido para confirmar }
 */
router.post('/:id/score/confirm', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });

  const matchId = req.params.id;
  const supabase = getSupabaseServiceRoleClient();

  const { data: mp, error: e1 } = await supabase
    .from('match_players')
    .select('team')
    .eq('match_id', matchId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (e1) return res.status(500).json({ ok: false, error: e1.message });
  if (!mp) return res.status(403).json({ ok: false, error: 'No participas en este partido' });

  const first = await firstSubmission(matchId);
  if (!first) return res.status(409).json({ ok: false, error: 'No hay propuesta de marcador' });
  if (first.team === mp.team) {
    return res.status(403).json({ ok: false, error: 'Debe confirmar un jugador del equipo rival' });
  }

  const now = new Date().toISOString();
  const { data: upd, error: e2 } = await supabase
    .from('matches')
    .update({ score_status: 'confirmed', score_confirmed_at: now, updated_at: now })
    .eq('id', matchId)
    .eq('score_status', 'pending_confirmation')
    .select('id, competitive')
    .maybeSingle();

  if (e2) return res.status(500).json({ ok: false, error: e2.message });
  if (!upd) return res.status(409).json({ ok: false, error: 'No se puede confirmar en este estado' });

  const competitive = !!(upd as { competitive?: boolean }).competitive;

  try {
    if (competitive) {
      await runLevelingPipeline(matchId);
      runFraudCheck(matchId).catch((e) => console.error('[fraud]', e));
    } else {
      await applyFriendlyPlayCounts(matchId);
    }
  } catch (err) {
    console.error('[score/confirm pipeline]', err);
    await supabase
      .from('matches')
      .update({
        score_status: 'pending_confirmation',
        score_confirmed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchId);
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }

  return res.json({ ok: true, score_status: 'confirmed', request_feedback: true });
});

/**
 * @openapi
 * /matches/{id}/score/dispute:
 *   post:
 *     tags: [Matches — marcador]
 *     summary: Contra-marcador (equipo rival)
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
 *             required: [sets]
 *             properties:
 *               sets:
 *                 type: array
 *                 items: { type: object, properties: { a: { type: number }, b: { type: number } } }
 *     responses:
 *       200: { description: OK }
 *       409: { description: Estado incorrecto }
 */
router.post('/:id/score/dispute', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });

  const matchId = req.params.id;
  const sets = parseSets(req.body);
  if (!sets) return res.status(400).json({ ok: false, error: 'sets inválido' });

  const supabase = getSupabaseServiceRoleClient();
  const { data: mp } = await supabase
    .from('match_players')
    .select('team')
    .eq('match_id', matchId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (!mp) return res.status(403).json({ ok: false, error: 'No participas en este partido' });

  const first = await firstSubmission(matchId);
  if (!first || first.team === mp.team) {
    return res.status(403).json({ ok: false, error: 'Solo el equipo rival puede disputar' });
  }

  const now = new Date().toISOString();
  const { data: upd, error: e2 } = await supabase
    .from('matches')
    .update({ sets, score_status: 'disputed_pending', updated_at: now })
    .eq('id', matchId)
    .eq('score_status', 'pending_confirmation')
    .select('id')
    .maybeSingle();
  if (e2) return res.status(500).json({ ok: false, error: e2.message });
  if (!upd) return res.status(409).json({ ok: false, error: 'No se puede disputar en este estado' });

  const { error: e3 } = await supabase.from('score_submissions').insert({
    match_id: matchId,
    player_id: playerId,
    team: mp.team as string,
    sets,
  });
  if (e3) return res.status(500).json({ ok: false, error: e3.message });

  return res.json({ ok: true });
});

/**
 * @openapi
 * /matches/{id}/score/resolve:
 *   post:
 *     tags: [Matches — marcador]
 *     summary: Resolver disputa (equipo que propuso primero)
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
 *             required: [accept]
 *             properties:
 *               accept: { type: boolean }
 *           examples:
 *             accept:
 *               value: { accept: true }
 *     responses:
 *       200: { description: OK }
 *       409: { description: Estado incorrecto }
 */
router.post('/:id/score/resolve', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });

  const accept = req.body?.accept;
  if (typeof accept !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'accept boolean requerido' });
  }

  const matchId = req.params.id;
  const supabase = getSupabaseServiceRoleClient();

  const { data: match } = await supabase
    .from('matches')
    .select('score_first_proposer_team, score_status')
    .eq('id', matchId)
    .maybeSingle();
  if (!match || match.score_status !== 'disputed_pending') {
    return res.status(409).json({ ok: false, error: 'No hay disputa pendiente' });
  }

  const { data: mp } = await supabase
    .from('match_players')
    .select('team')
    .eq('match_id', matchId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (!mp || mp.team !== match.score_first_proposer_team) {
    return res.status(403).json({ ok: false, error: 'Solo el equipo que propuso primero puede resolver' });
  }

  const now = new Date().toISOString();

  if (accept) {
    const { data: upd, error: e2 } = await supabase
      .from('matches')
      .update({ score_status: 'confirmed', score_confirmed_at: now, updated_at: now })
      .eq('id', matchId)
      .eq('score_status', 'disputed_pending')
      .select('id, competitive')
      .maybeSingle();
    if (e2) return res.status(500).json({ ok: false, error: e2.message });
    if (!upd) return res.status(409).json({ ok: false, error: 'No se pudo confirmar' });

    const competitive = !!(upd as { competitive?: boolean }).competitive;
    try {
      if (competitive) {
        await runLevelingPipeline(matchId);
        runFraudCheck(matchId).catch((e) => console.error('[fraud]', e));
      } else {
        await applyFriendlyPlayCounts(matchId);
      }
    } catch (err) {
      await supabase
        .from('matches')
        .update({
          score_status: 'disputed_pending',
          score_confirmed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', matchId);
      return res.status(500).json({ ok: false, error: (err as Error).message });
    }
    return res.json({ ok: true, score_status: 'confirmed', request_feedback: true });
  }

  const subs = await countSubmissions(matchId);
  const intercambios = Math.max(0, subs - 1);
  if (intercambios >= MAX_DISPUTE_ROUNDS) {
    await supabase
      .from('matches')
      .update({ score_status: 'no_result', updated_at: now })
      .eq('id', matchId)
      .eq('score_status', 'disputed_pending');
    return res.json({ ok: true, score_status: 'no_result' });
  }

  const sub1 = await firstSubmission(matchId);
  const restoreSets = sub1?.sets ?? [];
  await supabase
    .from('matches')
    .update({
      sets: restoreSets,
      score_status: 'pending_confirmation',
      updated_at: now,
    })
    .eq('id', matchId)
    .eq('score_status', 'disputed_pending');

  return res.json({ ok: true, score_status: 'pending_confirmation' });
});

export default router;
