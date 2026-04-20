import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { getPlayerIdFromBearer } from '../lib/authPlayer';
import {
  applyExpansionAccept,
  type ExpansionOfferPayload,
} from '../services/matchmakingExpansion';
import {
  applyMatchmakingRejectPenalty,
  getMatchmakingBlockUntil,
  releaseMatchmakingProposal,
  runMatchmakingCycle,
} from '../services/matchmakingService';
import { closeActiveMatchmakingSeason } from '../services/matchmakingSeasonService';
import { getMatchmakingLeagueConfigRows } from '../services/matchmakingLeagueConfigService';

const EXPANSION_KINDS = new Set<string>([
  'side_any',
  'gender_any',
  'dist_plus_5',
  'dist_plus_10',
  'near_group_distance',
  'near_group_gender',
]);

const router = Router();

/**
 * @openapi
 * /matchmaking/league-config:
 *   get:
 *     tags: [Matchmaking]
 *     summary: Definición de ligas MM (rangos de elo y LP)
 *     description: |
 *       Lee `matchmaking_leagues` (doc 10). Público para que la app muestre progreso y textos sin hardcodear.
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 leagues:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       code: { type: string }
 *                       sort_order: { type: integer }
 *                       label: { type: string }
 *                       elo_min: { type: number }
 *                       elo_max: { type: number }
 *                       lps_to_promote: { type: integer, nullable: true }
 */
router.get('/league-config', async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const leagues = await getMatchmakingLeagueConfigRows(supabase);
    return res.json({ ok: true, leagues });
  } catch (e) {
    return res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

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
 *               search_lat: { type: number, description: Obligatorio si max_distance_km }
 *               search_lng: { type: number }
 *     responses:
 *       200: { description: OK }
 *       403: { description: Onboarding incompleto o jugador bloqueado temporalmente }
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
    search_lat,
    search_lng,
  } = req.body ?? {};
  if (!available_from || !available_until) {
    return res.status(400).json({ ok: false, error: 'available_from y available_until son obligatorios' });
  }

  const maxKm = max_distance_km != null ? Number(max_distance_km) : null;
  const lat = search_lat != null ? Number(search_lat) : null;
  const lng = search_lng != null ? Number(search_lng) : null;
  if (maxKm != null && Number.isFinite(maxKm) && maxKm > 0) {
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({
        ok: false,
        error: 'search_lat y search_lng son obligatorios cuando indicás max_distance_km',
      });
    }
  }

  const supabase = getSupabaseServiceRoleClient();
  const blockedUntil = await getMatchmakingBlockUntil(playerId);
  if (blockedUntil) {
    return res.status(403).json({
      ok: false,
      error: 'Tenés matchmaking bloqueado temporalmente por rechazos recientes',
      blocked_until: blockedUntil,
    });
  }
  const { data: pl, error: e1 } = await supabase
    .from('players')
    .select('onboarding_completed')
    .eq('id', playerId)
    .maybeSingle();
  if (e1) return res.status(500).json({ ok: false, error: e1.message });
  if (!(pl as { onboarding_completed?: boolean } | null)?.onboarding_completed) {
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
  const g = typeof gender === 'string' ? gender : 'any';
  if (!['male', 'female', 'mixed', 'any'].includes(g)) {
    return res.status(400).json({ ok: false, error: 'gender debe ser male, female, mixed o any' });
  }
  const { error: insErr } = await supabase.from('matchmaking_pool').insert({
    player_id: playerId,
    paired_with_id: paired_with_id ?? null,
    club_id: club_id ?? null,
    max_distance_km: maxKm,
    preferred_side: side,
    gender: g,
    available_from,
    available_until,
    status: 'searching',
    search_lat: lat,
    search_lng: lng,
    expansion_offer: null,
    expansion_cycle_index: 0,
    last_expansion_prompt_at: null,
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
 *                 value: { ok: true, status: not_in_pool, match_id: null }
 */
router.get('/status', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });
  const blockedUntil = await getMatchmakingBlockUntil(playerId);
  if (blockedUntil) {
    return res.json({ ok: true, status: 'blocked', match_id: null, expansion_offer: null, blocked_until: blockedUntil });
  }
  const supabase = getSupabaseServiceRoleClient();
  const { data: row } = await supabase
    .from('matchmaking_pool')
    .select('status, proposed_match_id, expansion_offer')
    .eq('player_id', playerId)
    .maybeSingle();
  if (!row) return res.json({ ok: true, status: 'not_in_pool', match_id: null, expansion_offer: null });
  return res.json({
    ok: true,
    status: (row as { status: string }).status,
    match_id: (row as { proposed_match_id: string | null }).proposed_match_id,
    expansion_offer: (row as { expansion_offer?: unknown }).expansion_offer ?? null,
  });
});

/**
 * @openapi
 * /matchmaking/expansion-respond:
 *   post:
 *     tags: [Matchmaking]
 *     summary: Aceptar o rechazar ampliación de criterios (§6.1–6.2)
 *     description: |
 *       Incluye ampliación progresiva (lado, género, distancia +5/+10) y ofertas §6.1
 *       (`near_group_distance`, `near_group_gender`) cuando casi hay cuarteto de 3 unidades.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [accept]
 *             properties:
 *               accept: { type: boolean }
 *     responses:
 *       200: { description: OK }
 *       400: { description: Sin oferta pendiente o payload inválido }
 */
router.post('/expansion-respond', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });
  const accept = req.body?.accept === true;
  if (req.body?.accept !== true && req.body?.accept !== false) {
    return res.status(400).json({ ok: false, error: 'accept (boolean) es obligatorio' });
  }

  const supabase = getSupabaseServiceRoleClient();
  const { data: row, error: qErr } = await supabase
    .from('matchmaking_pool')
    .select('expansion_offer, max_distance_km, preferred_side, gender')
    .eq('player_id', playerId)
    .maybeSingle();
  if (qErr) return res.status(500).json({ ok: false, error: qErr.message });
  const offer = row?.expansion_offer as ExpansionOfferPayload | null;
  if (!offer || typeof offer.kind !== 'string' || !EXPANSION_KINDS.has(offer.kind)) {
    return res.status(400).json({ ok: false, error: 'No hay oferta de ampliación pendiente' });
  }

  if (accept && offer.kind === 'near_group_distance') {
    const sm = Number(offer.suggested_max_distance_km);
    if (!Number.isFinite(sm) || sm <= 0) {
      return res.status(400).json({ ok: false, error: 'Oferta de distancia inválida' });
    }
  }

  const nowIso = new Date().toISOString();
  const orderIdx = Number(offer.order_index);
  const patch: Record<string, unknown> = {
    expansion_offer: null,
    updated_at: nowIso,
  };
  if (Number.isFinite(orderIdx) && orderIdx >= 0) {
    patch.expansion_cycle_index = orderIdx + 1;
  }

  if (accept) {
    Object.assign(
      patch,
      applyExpansionAccept(offer.kind, {
        max_distance_km: (row as { max_distance_km?: number | null }).max_distance_km ?? null,
        preferred_side: (row as { preferred_side?: string | null }).preferred_side ?? null,
        gender: String((row as { gender?: string }).gender ?? 'any'),
      },
        offer.kind === 'near_group_distance'
          ? { suggested_max_distance_km: offer.suggested_max_distance_km }
          : undefined,
      ),
    );
  }

  const { error: uErr } = await supabase.from('matchmaking_pool').update(patch).eq('player_id', playerId);
  if (uErr) return res.status(500).json({ ok: false, error: uErr.message });
  return res.json({ ok: true, accepted: accept });
});

/**
 * @openapi
 * /matchmaking/proposal:
 *   get:
 *     tags: [Matchmaking]
 *     summary: Detalle del partido propuesto (reserva, plazo de pago, tu parte)
 *     description: |
 *       Cuando `status` es `matched`, devuelve datos para pagar (`booking_id`, `participant_id`)
 *       y la reserva asociada. Requiere estar en la pool con `proposed_match_id`.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: OK (sin propuesta activa si no aplica)
 *         content:
 *           application/json:
 *             examples:
 *               searching:
 *                 value: { ok: true, has_proposal: false, status: searching }
 *       401: { description: No autenticado }
 */
router.get('/proposal', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });
  const supabase = getSupabaseServiceRoleClient();

  const { data: poolRow } = await supabase
    .from('matchmaking_pool')
    .select('status, proposed_match_id')
    .eq('player_id', playerId)
    .maybeSingle();

  const status = poolRow ? (poolRow as { status: string }).status : 'not_in_pool';
  const matchId = (poolRow as { proposed_match_id?: string | null } | null)?.proposed_match_id ?? null;

  if (!matchId || status !== 'matched') {
    return res.json({ ok: true, has_proposal: false, status, match_id: matchId });
  }

  const { data: match, error: mErr } = await supabase
    .from('matches')
    .select(
      'id, type, status, booking_id, matchmaking_confirm_deadline_at, match_players(pre_match_win_prob, player_id)',
    )
    .eq('id', matchId)
    .maybeSingle();
  if (mErr) return res.status(500).json({ ok: false, error: mErr.message });
  if (!match || (match as { type?: string }).type !== 'matchmaking') {
    return res.json({ ok: true, has_proposal: false, status, match_id: null });
  }

  const mps = (match as { match_players?: unknown }).match_players;
  const mpList = Array.isArray(mps) ? mps : mps ? [mps] : [];
  const mine = mpList.find((x: { player_id?: string }) => x.player_id === playerId) as
    | { pre_match_win_prob?: number }
    | undefined;

  const bookingId = (match as { booking_id?: string }).booking_id;
  if (!bookingId) {
    return res.json({ ok: true, has_proposal: false, status, match_id: matchId });
  }

  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select(
      'id, status, start_at, end_at, total_price_cents, currency, court_id, courts(id, name, club_id, clubs(id, name, city, address))',
    )
    .eq('id', bookingId)
    .maybeSingle();
  if (bErr) return res.status(500).json({ ok: false, error: bErr.message });

  const { data: part } = await supabase
    .from('booking_participants')
    .select('id, share_amount_cents, payment_status')
    .eq('booking_id', bookingId)
    .eq('player_id', playerId)
    .maybeSingle();

  return res.json({
    ok: true,
    has_proposal: true,
    status,
    match_id: matchId,
    confirm_deadline_at: (match as { matchmaking_confirm_deadline_at?: string | null })
      .matchmaking_confirm_deadline_at,
    pre_match_win_prob: mine?.pre_match_win_prob ?? null,
    booking_id: bookingId,
    booking: booking ?? null,
    your_participant_id: (part as { id?: string } | null)?.id ?? null,
    your_share_cents: (part as { share_amount_cents?: number } | null)?.share_amount_cents ?? null,
    your_payment_status: (part as { payment_status?: string } | null)?.payment_status ?? null,
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
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value: { ok: true, penalty_lps: 10, active_faults: 2, blocked_until: null }
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

  await releaseMatchmakingProposal(matchId);

  let penaltyResult: { penalty_lps: number; active_faults: number; blocked_until: string | null } = {
    penalty_lps: 0,
    active_faults: 0,
    blocked_until: null,
  };
  try {
    penaltyResult = await applyMatchmakingRejectPenalty(playerId, matchId);
  } catch (e) {
    console.error('[matchmaking/reject penalty]', e);
  }

  return res.json({ ok: true, ...penaltyResult });
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
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             examples:
 *               ok: { value: { ok: true, formed: 1, expired: 0, expansion_prompts: 0 } }
 */
router.post('/run-cycle', async (req: Request, res: Response) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const h = req.headers['x-cron-secret'];
    if (h !== secret) return res.status(403).json({ ok: false, error: 'No autorizado' });
  }
  try {
    const { formed, expired, expansion_prompts } = await runMatchmakingCycle();
    return res.json({ ok: true, formed, expired, expansion_prompts });
  } catch (e) {
    return res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

/**
 * @openapi
 * /matchmaking/close-season:
 *   post:
 *     tags: [Matchmaking]
 *     summary: Cerrar temporada global de LP (matchmaking) y abrir la siguiente
 *     description: |
 *       Doc 10 §2 y §5: archiva `final_lps`, `liga` y `highest_liga` en `player_league_history`,
 *       pone `lps` en 0, reinicia escudo y pico de temporada, y crea una nueva fila en `matchmaking_seasons`.
 *       Requiere el mismo header `x-cron-secret` que `/matchmaking/run-cycle` si `CRON_SECRET` está definido.
 *     parameters:
 *       - in: header
 *         name: x-cron-secret
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, description: Nombre visible de la nueva temporada }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 closed_season_id: { type: string, format: uuid }
 *                 new_season_id: { type: string, format: uuid }
 *                 players_archived: { type: integer }
 *       403: { description: No autorizado }
 *       500: { description: Error al cerrar }
 */
router.post('/close-season', async (req: Request, res: Response) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const h = req.headers['x-cron-secret'];
    if (h !== secret) return res.status(403).json({ ok: false, error: 'No autorizado' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const name = typeof req.body?.name === 'string' ? req.body.name : undefined;
    const r = await closeActiveMatchmakingSeason(supabase, name);
    return res.json({ ok: true, ...r });
  } catch (e) {
    return res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

export default router;
