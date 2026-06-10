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
import { clearMatchmakingPoolIfPlayerPaid } from '../services/matchmakingPoolCleanup';

type MmWl = { mm_wins: number; mm_losses: number; mm_draws: number };
const ZERO_MM_WL: MmWl = { mm_wins: 0, mm_losses: 0, mm_draws: 0 };

async function fetchPlayerMatchmakingWl(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  playerId: string,
): Promise<MmWl> {
  try {
    const { data, error } = await supabase.rpc('player_matchmaking_record', { p_player_id: playerId });
    if (error) return ZERO_MM_WL;
    const rows = data as unknown;
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row || typeof row !== 'object') return ZERO_MM_WL;
    const r = row as Record<string, unknown>;
    return {
      mm_wins: Number(r.wins ?? 0),
      mm_losses: Number(r.losses ?? 0),
      mm_draws: Number(r.draws ?? 0),
    };
  } catch {
    return ZERO_MM_WL;
  }
}

async function countActiveSearching(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  clubId: string | null,
): Promise<{ total: number; in_club: number | null }> {
  const nowIso = new Date().toISOString();
  const orExp = `expires_at.is.null,expires_at.gt.${nowIso}`;

  const { count: total, error: e1 } = await supabase
    .from('matchmaking_pool')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'searching')
    .or(orExp);
  if (e1) console.warn('[matchmaking/status] count total:', e1.message);

  let inClub: number | null = null;
  if (clubId) {
    const { count, error: e2 } = await supabase
      .from('matchmaking_pool')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'searching')
      .eq('club_id', clubId)
      .or(orExp);
    if (e2) console.warn('[matchmaking/status] count club:', e2.message);
    else inClub = count ?? 0;
  }

  return { total: total ?? 0, in_club: inClub };
}

const EXPANSION_KINDS = new Set<string>([
  'side_any',
  'gender_any',
  'dist_plus_5',
  'dist_plus_10',
  'near_group_distance',
  'near_group_gender',
]);

let lastStatusTriggeredCycleMs = 0;
const STATUS_MATCHMAKING_CYCLE_THROTTLE_MS = 20_000;

const router = Router();

/** Evita 304/ETag en el cliente: el estado de cola debe verse siempre fresco. */
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  next();
});

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
 * /matchmaking/leaderboard:
 *   get:
 *     tags: [Matchmaking]
 *     summary: Ranking de jugadores en una división MM
 *     description: |
 *       Devuelve jugadores ordenados por LP (desc) y ELO (desc) dentro de la misma liga.
 *       Si no se indica `liga`, usa la liga del jugador autenticado.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: liga
 *         schema: { type: string }
 *         description: Código de liga (`matchmaking_leagues.code`). Por defecto, la del jugador.
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 15 }
 *         description: Máximo de filas por página
 *       - in: query
 *         name: offset
 *         schema: { type: integer, minimum: 0, default: 0 }
 *         description: Desplazamiento para paginación
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 liga: { type: string }
 *                 total: { type: integer, description: Jugadores totales en la división }
 *                 offset: { type: integer }
 *                 limit: { type: integer }
 *                 has_more: { type: boolean }
 *                 rows:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       rank: { type: integer }
 *                       player_id: { type: string, format: uuid }
 *                       first_name: { type: string, nullable: true }
 *                       last_name: { type: string, nullable: true }
 *                       username: { type: string, nullable: true }
 *                       elo_rating: { type: number, nullable: true }
 *                       lps: { type: integer }
 *                       mm_wins: { type: integer }
 *                       mm_losses: { type: integer }
 *             examples:
 *               ok:
 *                 value:
 *                   ok: true
 *                   liga: oro_2
 *                   total: 12
 *                   rows:
 *                     - rank: 1
 *                       player_id: 00000000-0000-4000-8000-000000000001
 *                       first_name: Ana
 *                       last_name: López
 *                       username: ana_lopez
 *                       elo_rating: 4.25
 *                       lps: 85
 *                       mm_wins: 12
 *                       mm_losses: 5
 *       400: { description: Liga no indicada y jugador sin liga asignada }
 *       401: { description: No autenticado }
 */
router.get('/leaderboard', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });

  const supabase = getSupabaseServiceRoleClient();
  let ligaCode = typeof req.query.liga === 'string' ? req.query.liga.trim() : '';
  if (!ligaCode) {
    const { data: me, error: meErr } = await supabase
      .from('players')
      .select('liga')
      .eq('id', playerId)
      .maybeSingle();
    if (meErr) return res.status(500).json({ ok: false, error: meErr.message });
    ligaCode = String((me as { liga?: string | null } | null)?.liga ?? '').trim();
  }
  if (!ligaCode) {
    return res.status(400).json({ ok: false, error: 'No hay liga asignada para mostrar el ranking' });
  }

  const limitRaw = req.query.limit != null ? Number(req.query.limit) : 15;
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.round(limitRaw))) : 15;
  const offsetRaw = req.query.offset != null ? Number(req.query.offset) : 0;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.round(offsetRaw)) : 0;

  const { count: totalCount, error: countErr } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('liga', ligaCode)
    .eq('onboarding_completed', true);
  if (countErr) return res.status(500).json({ ok: false, error: countErr.message });

  const total = totalCount ?? 0;
  if (offset >= total && total > 0) {
    return res.json({
      ok: true,
      liga: ligaCode,
      total,
      offset,
      limit,
      has_more: false,
      rows: [],
    });
  }

  const { data: players, error: qErr } = await supabase
    .from('players')
    .select('id, first_name, last_name, username, elo_rating, lps')
    .eq('liga', ligaCode)
    .eq('onboarding_completed', true)
    .order('lps', { ascending: false })
    .order('elo_rating', { ascending: false })
    .range(offset, offset + limit - 1);
  if (qErr) return res.status(500).json({ ok: false, error: qErr.message });

  const rows = await Promise.all(
    (players ?? []).map(async (p, index) => {
      const row = p as {
        id: string;
        first_name?: string | null;
        last_name?: string | null;
        username?: string | null;
        elo_rating?: number | null;
        lps?: number | null;
      };
      const wl = await fetchPlayerMatchmakingWl(supabase, row.id);
      return {
        rank: offset + index + 1,
        player_id: row.id,
        first_name: row.first_name ?? null,
        last_name: row.last_name ?? null,
        username: row.username ?? null,
        elo_rating: row.elo_rating != null ? Number(row.elo_rating) : null,
        lps: Math.max(0, Math.round(Number(row.lps ?? 0))),
        mm_wins: wl.mm_wins,
        mm_losses: wl.mm_losses,
      };
    }),
  );

  const hasMore = offset + rows.length < total;
  return res.json({ ok: true, liga: ligaCode, total, offset, limit, has_more: hasMore, rows });
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
 *               club_id: { type: string, format: uuid, description: 'Un solo club fijo (legacy; preferir preferred_club_ids) }
 *               preferred_club_ids:
 *                 type: array
 *                 items: { type: string, format: uuid }
 *                 description: Clubes donde el jugador acepta jugar (vacío = sin restricción de sede)
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
    preferred_club_ids: preferredClubIdsRaw,
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

  let preferredClubIds: string[] = [];
  if (preferredClubIdsRaw != null) {
    if (!Array.isArray(preferredClubIdsRaw)) {
      return res.status(400).json({ ok: false, error: 'preferred_club_ids debe ser un array de UUID' });
    }
    preferredClubIds = [
      ...new Set(
        preferredClubIdsRaw
          .map((id: unknown) => (typeof id === 'string' ? id.trim() : ''))
          .filter((id) => id.length > 0),
      ),
    ].slice(0, 20);
    if (preferredClubIds.length > 0) {
      const { data: found, error: clubsErr } = await getSupabaseServiceRoleClient()
        .from('clubs')
        .select('id')
        .in('id', preferredClubIds);
      if (clubsErr) return res.status(500).json({ ok: false, error: clubsErr.message });
      const valid = new Set((found ?? []).map((c) => (c as { id: string }).id));
      const missing = preferredClubIds.filter((id) => !valid.has(id));
      if (missing.length > 0) {
        return res.status(400).json({ ok: false, error: 'Uno o más club_id de preferred_club_ids no existen' });
      }
    }
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
    .select('onboarding_completed, sex')
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
  let g = typeof gender === 'string' ? gender : 'any';
  if (!['male', 'female', 'mixed', 'any'].includes(g)) {
    return res.status(400).json({ ok: false, error: 'gender debe ser male, female, mixed o any' });
  }
  // mixed exige 2M+2F con sexo en perfil; si `sex` es null el cuarteto nunca pasaba validación biológica
  if (g === 'mixed' && !(pl as { sex?: string | null }).sex) {
    g = 'any';
  }
  let resolvedClubId: string | null = null;
  let poolPreferredClubIds: string[] = [];
  if (typeof club_id === 'string' && club_id.trim()) {
    resolvedClubId = club_id.trim();
  } else if (preferredClubIds.length === 1) {
    resolvedClubId = preferredClubIds[0]!;
  } else if (preferredClubIds.length > 1) {
    poolPreferredClubIds = preferredClubIds;
  }

  const { error: insErr } = await supabase.from('matchmaking_pool').insert({
    player_id: playerId,
    paired_with_id: paired_with_id ?? null,
    club_id: resolvedClubId,
    preferred_club_ids: poolPreferredClubIds,
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
  setImmediate(() => {
    runMatchmakingCycle().catch((e) => console.warn('[matchmaking] post-join run cycle:', (e as Error).message));
  });
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
 *     description: |
 *       Incluye `searching_count` (búsquedas activas) y, si tu fila tiene `club_id`, `searching_in_club_count`.
 *       Con `status: searching` el servidor puede disparar un ciclo de emparejamiento throttled (≈20s)
 *       además del cron, para entornos sin tarea programada.
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value: { ok: true, status: not_in_pool, match_id: null, searching_count: 3, searching_in_club_count: null }
 */
router.get('/status', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });
  const supabase = getSupabaseServiceRoleClient();
  const blockedUntil = await getMatchmakingBlockUntil(playerId);

  const { data: row } = await supabase
    .from('matchmaking_pool')
    .select('status, proposed_match_id, expansion_offer, club_id')
    .eq('player_id', playerId)
    .maybeSingle();
  const myClubId = (row as { club_id?: string | null } | null)?.club_id ?? null;
  const counts = await countActiveSearching(supabase, myClubId);

  if (blockedUntil) {
    return res.json({
      ok: true,
      status: 'blocked',
      match_id: null,
      expansion_offer: null,
      blocked_until: blockedUntil,
      searching_count: counts.total,
      searching_in_club_count: counts.in_club,
    });
  }

  if (!row) {
    return res.json({
      ok: true,
      status: 'not_in_pool',
      match_id: null,
      expansion_offer: null,
      searching_count: counts.total,
      searching_in_club_count: counts.in_club,
    });
  }

  const st = (row as { status: string }).status;
  if (st === 'matched') {
    const cleared = await clearMatchmakingPoolIfPlayerPaid(supabase, playerId);
    if (cleared) {
      return res.json({
        ok: true,
        status: 'not_in_pool',
        match_id: null,
        expansion_offer: null,
        searching_count: counts.total,
        searching_in_club_count: counts.in_club,
      });
    }
  }
  if (st === 'searching') {
    const t = Date.now();
    if (t - lastStatusTriggeredCycleMs >= STATUS_MATCHMAKING_CYCLE_THROTTLE_MS) {
      lastStatusTriggeredCycleMs = t;
      setImmediate(() => {
        runMatchmakingCycle().catch((e) =>
          console.warn('[matchmaking] status-poll run cycle:', (e as Error).message),
        );
      });
    }
  }

  return res.json({
    ok: true,
    status: st,
    match_id: (row as { proposed_match_id: string | null }).proposed_match_id,
    expansion_offer: (row as { expansion_offer?: unknown }).expansion_offer ?? null,
    searching_count: counts.total,
    searching_in_club_count: counts.in_club,
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

  const yourPaymentStatus = (part as { payment_status?: string } | null)?.payment_status ?? null;
  if (yourPaymentStatus === 'paid') {
    await clearMatchmakingPoolIfPlayerPaid(supabase, playerId, bookingId);
    return res.json({
      ok: true,
      has_proposal: false,
      status: 'not_in_pool',
      match_id: matchId,
      your_payment_status: 'paid',
    });
  }

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
    your_payment_status: yourPaymentStatus,
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
 *         description: |
 *           OK. Si `MATCHMAKING_RUN_DIAG=1` en el servidor y `formed=0`, puede incluirse `diag` con contadores
 *           (rechazos pre-cancha, sin pista libre, etc.).
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
    const r = await runMatchmakingCycle();
    const { formed, expired, expansion_prompts, diag } = r;
    return res.json({ ok: true, formed, expired, expansion_prompts, ...(diag ? { diag } : {}) });
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
