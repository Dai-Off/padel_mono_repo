import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';

const router = Router();

const SELECT_FIELDS =
  'id, created_at, match_id, player_id, team, invite_status, result, rating_change, pre_match_win_prob';

router.get('/', async (req: Request, res: Response) => {
  const match_id = req.query.match_id as string | undefined;
  const player_id = req.query.player_id as string | undefined;
  try {
    const supabase = getSupabaseServiceRoleClient();
    let q = supabase
      .from('match_players')
      .select(SELECT_FIELDS)
      .order('created_at', { ascending: false })
      .limit(100);
    if (match_id) q = q.eq('match_id', match_id);
    if (player_id) q = q.eq('player_id', player_id);
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, match_players: data ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('match_players')
      .select(SELECT_FIELDS)
      .eq('id', id)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Match player not found' });
    return res.json({ ok: true, match_player: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { match_id, player_id, team, slot_index, invite_status } = req.body ?? {};
  if (!match_id || !player_id || !team) {
    return res.status(400).json({
      ok: false,
      error: 'match_id, player_id y team son obligatorios',
    });
  }
  if (team !== 'A' && team !== 'B') {
    return res.status(400).json({ ok: false, error: 'team debe ser A o B' });
  }
  const slotIdx =
    slot_index != null && typeof slot_index === 'number' && slot_index >= 0 && slot_index <= 3
      ? slot_index
      : null;
  const inv =
    invite_status === 'invited' || invite_status === 'accepted' || invite_status === 'rejected'
      ? invite_status
      : 'accepted';
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('match_players')
      .insert([
        {
          match_id,
          player_id,
          team,
          slot_index: slotIdx,
          invite_status: inv,
        },
      ])
      .select(SELECT_FIELDS)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(201).json({ ok: true, match_player: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /match-players/{id}:
 *   put:
 *     tags: [Match players]
 *     summary: Actualizar plaza en partido
 *     description: No permite modificar `result` ni `rating_change` (solo pipeline de nivelación).
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: OK }
 *       400: { description: Campos prohibidos o sin cambios }
 */
router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { team, invite_status } = req.body ?? {};
  const update: Record<string, unknown> = {};
  if (team !== undefined) update.team = team;
  if (invite_status !== undefined) update.invite_status = invite_status;
  if (req.body && ('result' in req.body || 'rating_change' in req.body)) {
    return res.status(400).json({
      ok: false,
      error: 'result y rating_change solo los actualiza el sistema de nivelación',
    });
  }
  if (Object.keys(update).length === 0) {
    return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('match_players')
      .update(update)
      .eq('id', id)
      .select(SELECT_FIELDS)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Match player not found' });
    return res.json({ ok: true, match_player: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { error } = await supabase.from('match_players').delete().eq('id', id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, deleted: id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
