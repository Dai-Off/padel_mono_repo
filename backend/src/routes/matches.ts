import { Router, Request, Response } from 'express';
import { getPlayerIdFromBearer } from '../lib/authPlayer';
import { bookingStartIsTooFarInPast, BOOKING_START_PAST_ERROR } from '../lib/bookingStartNotInPast';
import { finalizePastMatches, finalizePastMatchesThrottled } from '../lib/finalizePastMatches';
import { getMatchListPhase } from '../lib/matchLifecycle';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { hasCourtConflict } from '../lib/courtConflict';
import { settleOverdueMatchPayments } from '../services/matchDebtService';
import { playerHasDebt } from '../lib/players/playerDebt';
import {
  refundStripeBookingPaymentForPlayer,
  refundStripeBookingPaymentTransactions,
  resolveClubIdForBooking,
} from '../services/paymentRefundService';
import { releaseMatchmakingProposal } from '../services/matchmakingService';
import { tryRepairPaidGuestMissingFromMatch } from '../services/matchPlayerSlotService';
import { assertReservationTypeAllowedOnline, fetchAllowOnlineByType } from '../lib/reservationAllowOnline';
import { syncMatchPlayersFromBooking } from '../lib/matchFromBookingSync';
import {
  matchAffectsElo,
  normalizeMatchType,
  parseEloRange,
  resolveCompetitiveForCreate,
} from '../lib/openMatchRules';

const router = Router();

const SELECT_LIST =
  'id, created_at, updated_at, booking_id, visibility, elo_min, elo_max, gender, competitive, status, type, score_status, sets, match_end_reason, retired_team';
const SELECT_ONE =
  'id, created_at, updated_at, booking_id, visibility, elo_min, elo_max, gender, competitive, status, type, score_status, sets, match_end_reason, retired_team, score_confirmed_at';

/** Supabase expand devuelve relaciones 1:1 a veces como array; aplanamos para clientes. */
function flattenMatchRowForClient<T extends { bookings?: unknown; match_players?: unknown }>(row: T): T {
  const rawB = row.bookings;
  const bookings = Array.isArray(rawB) ? rawB[0] ?? null : rawB;
  const rawMps = row.match_players;
  const match_players = Array.isArray(rawMps)
    ? rawMps.map((mp: { players?: unknown }) => {
        const rawP = mp?.players;
        const players = Array.isArray(rawP) ? rawP[0] ?? null : rawP;
        return players === mp?.players ? mp : { ...mp, players };
      })
    : rawMps;
  return { ...row, bookings, match_players };
}

function expandSelect(bookingRel: 'bookings' | 'bookings!inner'): string {
  return `id, created_at, updated_at, booking_id, visibility, elo_min, elo_max, gender, competitive, status, type, score_status, sets, match_end_reason, retired_team,
          ${bookingRel} (
            id, organizer_player_id, start_at, end_at, status, total_price_cents, currency, court_id, reservation_type,
            payment_transactions (amount_cents, status),
            courts (
              id, club_id, name, indoor, glass_type, sport,
              clubs (id, name, address, city)
            )
          ),
          match_players (
            id, team, created_at, slot_index,
            players (id, first_name, last_name, elo_rating, liga, avatar_url)
          )`;
}

/** Listado Buscar partido: sin payment_transactions (menos payload). */
function expandSelectDiscovery(): string {
  return `id, created_at, updated_at, booking_id, visibility, elo_min, elo_max, gender, competitive, status, type,
          bookings!inner (
            id, organizer_player_id, start_at, end_at, status, total_price_cents, currency, court_id,
            courts (
              id, club_id, name, indoor, glass_type, sport,
              clubs (id, name, address, city)
            )
          ),
          match_players (
            id, team, slot_index,
            players (id, first_name, last_name, elo_rating, avatar_url)
          )`;
}

const DISCOVERY_DEFAULT_DAYS = 14;
const DISCOVERY_DEFAULT_LIMIT = 100;
const DISCOVERY_MAX_LIMIT = 150;

function countFilledSlots(row: { match_players?: Array<{ players?: { id?: string } | null }> | null }): number {
  return (row.match_players ?? []).filter((mp) => Boolean(mp?.players?.id)).length;
}

function isJoinableDiscoveryRow(row: { match_players?: Array<{ players?: { id?: string } | null }> | null }): boolean {
  return countFilledSlots(row) < 4;
}

/**
 * @openapi
 * /matches:
 *   get:
 *     tags: [Matches]
 *     summary: Listar partidos
 *     parameters:
 *       - in: query
 *         name: booking_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: expand
 *         schema: { type: string, enum: ['1', 'true'] }
 *       - in: query
 *         name: active_only
 *         description: Solo partidos con reserva activa (end_at futuro) y match no cancelado/finalizado.
 *         schema: { type: string, enum: ['1', 'true', '0', 'false'] }
 *       - in: query
 *         name: date_from
 *         description: ISO8601; filtra por bookings.start_at >= date_from (con expand).
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: date_to
 *         description: ISO8601; filtra por bookings.start_at <= date_to (con expand).
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: club_id
 *         description: Con expand=1, solo partidos cuyas reservas están en pistas de ese club (evita el límite global de 100).
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: visibility
 *         description: Filtra por visibilidad del partido.
 *         schema: { type: string, enum: [public, private] }
 *       - in: query
 *         name: discovery
 *         description: Listado para Buscar partido (públicos activos, type=open, orden por hora, límite ampliado).
 *         schema: { type: string, enum: ['1', 'true'] }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             examples:
 *               ok: { value: { ok: true, matches: [] } }
 */
router.get('/', async (req: Request, res: Response) => {
  const booking_id = req.query.booking_id as string | undefined;
  const expand = req.query.expand === '1' || req.query.expand === 'true';
  /** Solo partidos no jugados aún: end_at futuro y estado distinto de cancelado/finalizado. Query param explícito para no romper clientes que listan histórico. */
  const active_only = req.query.active_only === '1' || req.query.active_only === 'true';
  const date_from = req.query.date_from as string | undefined;
  const date_to = req.query.date_to as string | undefined;
  const filter_club_id = String(req.query.club_id ?? '').trim() || undefined;
  const rawVisibility = String(req.query.visibility ?? '').trim().toLowerCase();
  const visibility = rawVisibility === 'public' || rawVisibility === 'private' ? rawVisibility : undefined;
  const discovery = req.query.discovery === '1' || req.query.discovery === 'true';
  try {
    await finalizePastMatchesThrottled();
    const supabase = getSupabaseServiceRoleClient();
    const nowIso = new Date().toISOString();

    if (expand && filter_club_id) {
      const { data: courtRows, error: cErr } = await supabase.from('courts').select('id').eq('club_id', filter_club_id);
      if (cErr) return res.status(500).json({ ok: false, error: cErr.message });
      const courtIds = (courtRows ?? []).map((c: { id: string }) => c.id);
      if (courtIds.length === 0) return res.json({ ok: true, matches: [] });

      let bq = supabase
        .from('bookings')
        .select('id')
        .in('court_id', courtIds)
        .neq('status', 'cancelled')
        .is('deleted_at', null);
      if (active_only) bq = bq.gt('end_at', nowIso);
      if (date_from) bq = bq.gte('start_at', date_from);
      if (date_to) bq = bq.lte('start_at', date_to);
      bq = bq.limit(500);
      const { data: bidRows, error: bErr } = await bq;
      if (bErr) return res.status(500).json({ ok: false, error: bErr.message });
      const bookingIds = [...new Set((bidRows ?? []).map((r: { id: string }) => r.id))];
      if (bookingIds.length === 0) return res.json({ ok: true, matches: [] });

      const bookingRel = active_only ? 'bookings!inner' : 'bookings';
      let mq = supabase.from('matches').select(expandSelect(bookingRel)).in('booking_id', bookingIds);
      if (active_only) {
        mq = mq
          .not('status', 'eq', 'cancelled')
          .not('status', 'eq', 'finished')
          .gt('bookings.end_at', nowIso)
          .order('start_at', { ascending: true, foreignTable: 'bookings' })
          .limit(200);
      } else {
        mq = mq.limit(200);
        if (date_from || date_to) {
          mq = mq.order('start_at', { ascending: true, foreignTable: 'bookings' });
        } else {
          mq = mq.order('created_at', { ascending: false });
        }
      }
      if (booking_id) mq = mq.eq('booking_id', booking_id);
      if (visibility) mq = mq.eq('visibility', visibility);
      const { data, error } = await mq;
      if (error) return res.status(500).json({ ok: false, error: error.message });
      const rows = data ?? [];
      if (active_only) {
        const filtered = rows.filter((row: any) => {
          const b = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings;
          return getMatchListPhase(Date.now(), row.status, b?.start_at, b?.end_at) !== 'past';
        });
        return res.json({ ok: true, matches: filtered });
      }
      return res.json({ ok: true, matches: rows });
    }

    if (expand && discovery) {
      const joinable_only = req.query.joinable_only !== '0' && req.query.joinable_only !== 'false';
      const limitRaw = Math.trunc(Number(req.query.limit) || DISCOVERY_DEFAULT_LIMIT);
      const limit = Math.min(DISCOVERY_MAX_LIMIT, Math.max(1, limitRaw));

      const rangeStart = new Date();
      rangeStart.setUTCHours(0, 0, 0, 0);
      const rangeEnd = new Date(rangeStart);
      rangeEnd.setUTCDate(rangeEnd.getUTCDate() + DISCOVERY_DEFAULT_DAYS);
      const defaultFrom = rangeStart.toISOString();
      const defaultTo = rangeEnd.toISOString();
      const effectiveFrom = date_from ?? defaultFrom;
      const effectiveTo = date_to ?? defaultTo;

      let q = supabase
        .from('matches')
        .select(expandSelectDiscovery())
        .eq('visibility', 'public')
        .eq('type', 'open')
        .not('status', 'eq', 'cancelled')
        .not('status', 'eq', 'finished')
        .gt('bookings.end_at', nowIso)
        .is('bookings.deleted_at', null)
        .gte('bookings.start_at', effectiveFrom)
        .lte('bookings.start_at', effectiveTo)
        .order('start_at', { ascending: true, foreignTable: 'bookings' })
        .limit(limit);
      if (booking_id) q = q.eq('booking_id', booking_id);
      const { data, error } = await q;
      if (error) return res.status(500).json({ ok: false, error: error.message });
      const rows = (data ?? []).filter((row: any) => {
        const b = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings;
        if (getMatchListPhase(Date.now(), row.status, b?.start_at, b?.end_at) === 'past') return false;
        if (joinable_only && !isJoinableDiscoveryRow(row)) return false;
        return true;
      });
      return res.json({ ok: true, matches: rows });
    }

    if (expand) {
      const bookingRel = active_only ? 'bookings!inner' : 'bookings';
      let q = supabase.from('matches').select(expandSelect(bookingRel));
      if (active_only) {
        q = q
          .not('status', 'eq', 'cancelled')
          .not('status', 'eq', 'finished')
          .gt('bookings.end_at', nowIso)
          .is('bookings.deleted_at', null)
          .order('start_at', { ascending: true, foreignTable: 'bookings' })
          .limit(visibility === 'public' ? 300 : 100);
      } else {
        q = q.limit(200);
        if (date_from || date_to) {
          q = q.order('start_at', { ascending: true, foreignTable: 'bookings' });
        } else {
          q = q.order('created_at', { ascending: false });
        }
      }
      if (date_from) q = q.gte('bookings.start_at', date_from);
      if (date_to) q = q.lte('bookings.start_at', date_to);
      if (booking_id) q = q.eq('booking_id', booking_id);
      if (visibility) q = q.eq('visibility', visibility);
      const { data, error } = await q;
      if (error) return res.status(500).json({ ok: false, error: error.message });
      const rows = data ?? [];
      if (active_only) {
        const filtered = rows.filter((row: any) => {
          const b = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings;
          return getMatchListPhase(Date.now(), row.status, b?.start_at, b?.end_at) !== 'past';
        });
        return res.json({ ok: true, matches: filtered });
      }
      return res.json({ ok: true, matches: rows });
    }

    let q = active_only
      ? supabase
          .from('matches')
          .select(`${SELECT_LIST}, bookings!inner(end_at, start_at)`)
          .not('status', 'eq', 'cancelled')
          .not('status', 'eq', 'finished')
          .gt('bookings.end_at', nowIso)
          .order('start_at', { ascending: true, foreignTable: 'bookings' })
          .limit(100)
      : supabase.from('matches').select(SELECT_LIST).order('created_at', { ascending: false }).limit(50);
    if (booking_id) q = q.eq('booking_id', booking_id);
    if (visibility) q = q.eq('visibility', visibility);
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    const rows = data ?? [];
    if (active_only) {
      const filtered = rows.filter((row: any) => {
        const b = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings;
        return getMatchListPhase(Date.now(), row.status, b?.start_at, b?.end_at) !== 'past';
      });
      return res.json({ ok: true, matches: filtered });
    }
    return res.json({ ok: true, matches: rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /matches/mine:
 *   get:
 *     tags: [Matches]
 *     summary: Partidos del jugador autenticado
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: phase
 *         schema: { type: string, enum: [past, upcoming, all] }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200: { description: OK }
 *       401: { description: No autenticado }
 */
router.get('/mine', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });

  const phaseRaw = String(req.query.phase ?? 'all').trim().toLowerCase();
  const phase = phaseRaw === 'past' || phaseRaw === 'upcoming' ? phaseRaw : 'all';
  // Límite cliente: máx 200 para historial completo (Tu actividad).
  const limit = Math.min(200, Math.max(1, Math.trunc(Number(req.query.limit) || 50)));

  try {
    await finalizePastMatchesThrottled();
    const supabase = getSupabaseServiceRoleClient();
    const nowMs = Date.now();
    const { data: mpRows, error: mpErr } = await supabase
      .from('match_players')
      .select('match_id')
      .eq('player_id', playerId);
    if (mpErr) return res.status(500).json({ ok: false, error: mpErr.message });

    const matchIds = new Set((mpRows ?? []).map((r: { match_id: string }) => r.match_id));

    // Fallback: partidos creados por el jugador (organizador) aunque por alguna razón
    // todavía no exista fila en match_players.
    const { data: orgBookings, error: orgBkErr } = await supabase
      .from('bookings')
      .select('id')
      .eq('organizer_player_id', playerId)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .limit(500);
    if (orgBkErr) return res.status(500).json({ ok: false, error: orgBkErr.message });

    const bookingIds = [...new Set((orgBookings ?? []).map((b: { id: string }) => b.id))];
    if (bookingIds.length > 0) {
      const { data: orgMatches, error: orgMErr } = await supabase
        .from('matches')
        .select('id')
        .in('booking_id', bookingIds)
        .neq('status', 'cancelled')
        .limit(500);
      if (orgMErr) return res.status(500).json({ ok: false, error: orgMErr.message });
      for (const row of orgMatches ?? []) {
        const id = (row as { id: string }).id;
        if (id) matchIds.add(id);
      }
    }

    if (matchIds.size === 0) return res.json({ ok: true, matches: [] });

    const { data, error } = await supabase
      .from('matches')
      .select(expandSelect('bookings'))
      .in('id', [...matchIds])
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(Math.min(matchIds.size, 500));
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const filtered = (data ?? []).filter((row: any) => {
      const b = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings;
      // Si no tiene booking usamos sólo el estado para determinar la fase.
      const listPhase = getMatchListPhase(nowMs, row.status, b?.start_at, b?.end_at);
      if (phase === 'past') return listPhase === 'past';
      if (phase === 'upcoming') return listPhase !== 'past';
      return true;
    });

    filtered.sort((a: any, b: any) => {
      const ba = Array.isArray(a.bookings) ? a.bookings[0] : a.bookings;
      const bb = Array.isArray(b.bookings) ? b.bookings[0] : b.bookings;
      const ta = new Date(ba?.start_at ?? 0).getTime();
      const tb = new Date(bb?.start_at ?? 0).getTime();
      return phase === 'upcoming' ? ta - tb : tb - ta;
    });
    const sliced = filtered.slice(0, limit);
    const slicedIds = [...new Set(sliced.map((m: any) => m.id).filter(Boolean))];
    let feedbackByMatch = new Set<string>();
    if (slicedIds.length > 0) {
      const { data: myFeedbackRows, error: fbErr } = await supabase
        .from('match_feedback')
        .select('match_id')
        .eq('reviewer_id', playerId)
        .in('match_id', slicedIds);
      if (fbErr) return res.status(500).json({ ok: false, error: fbErr.message });
      feedbackByMatch = new Set((myFeedbackRows ?? []).map((r: { match_id: string }) => r.match_id));
    }

    const withFeedbackFlag = sliced.map((m: any) =>
      flattenMatchRowForClient({
        ...m,
        has_my_feedback: feedbackByMatch.has(m.id),
      }),
    );

    return res.json({ ok: true, matches: withFeedbackFlag });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /matches/{id}:
 *   get:
 *     tags: [Matches]
 *     summary: Detalle de partido
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: expand
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       404: { description: No encontrado }
 */
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const expand = req.query.expand === '1' || req.query.expand === 'true';
  try {
    await finalizePastMatchesThrottled();
    const supabase = getSupabaseServiceRoleClient();
    if (expand) {
      const { data, error } = await supabase
        .from('matches')
        .select(expandSelect('bookings'))
        .eq('id', id)
        .maybeSingle();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      if (!data) return res.status(404).json({ ok: false, error: 'Match not found' });

      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      let out = data;
      if (token) {
        const { data: authData, error: authErr } = await supabase.auth.getUser(token);
        const email =
          authErr || !authData?.user?.email
            ? null
            : String(authData.user.email).trim().toLowerCase();
        if (email) {
          const { data: pl } = await supabase.from('players').select('id').eq('email', email).maybeSingle();
          const playerId = (pl as { id?: string } | null)?.id;
          const bookingId = (out as { booking_id?: string | null }).booking_id;
          if (playerId && bookingId) {
            const repaired = await tryRepairPaidGuestMissingFromMatch(supabase, id, bookingId, playerId);
            if (repaired) {
              const { data: d2, error: e2 } = await supabase
                .from('matches')
                .select(expandSelect('bookings'))
                .eq('id', id)
                .maybeSingle();
              if (!e2 && d2) out = d2;
            }
          }
        }
      }
      let hasMyFeedback = false;
      const { playerId: viewerId } = await getPlayerIdFromBearer(req);
      if (viewerId) {
        const { data: fbRow } = await supabase
          .from('match_feedback')
          .select('match_id')
          .eq('match_id', id)
          .eq('reviewer_id', viewerId)
          .maybeSingle();
        hasMyFeedback = !!fbRow;
      }
      const flattened = flattenMatchRowForClient(
        out as { bookings?: unknown; match_players?: unknown },
      );
      return res.json({
        ok: true,
        match: { ...flattened, has_my_feedback: hasMyFeedback },
      });
    }
    const { data, error } = await supabase
      .from('matches')
      .select(SELECT_ONE)
      .eq('id', id)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Match not found' });
    return res.json({ ok: true, match: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /matches/create-with-booking:
 *   post:
 *     tags: [Matches]
 *     summary: Crear reserva y partido
 *     description: |
 *       Los partidos `type=open` son siempre amistosos (no afectan ELO). Opcionalmente `elo_min`/`elo_max` filtran quién puede unirse.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [court_id, organizer_player_id, start_at, end_at, total_price_cents]
 *             properties:
 *               type: { type: string, enum: [open, matchmaking], default: open }
 *               competitive: { type: boolean, description: 'Solo aplica si type=matchmaking; open siempre amistoso }
 *     responses:
 *       201: { description: Creado }
 *       409: { description: Conflicto de pista }
 */
/**
 * @openapi
 * /matches/run-debt-settlement:
 *   post:
 *     tags: [Matches]
 *     summary: Procesa matches vencidos y cobra la deuda al organizador (CU-4.1)
 *     description: Protegido por header `x-cron-secret` igual a env CRON_SECRET (opcional en dev).
 *     parameters:
 *       - in: header
 *         name: x-cron-secret
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
router.post('/run-debt-settlement', async (req: Request, res: Response) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const h = req.headers['x-cron-secret'];
    if (h !== secret) return res.status(403).json({ ok: false, error: 'No autorizado' });
  }
  try {
    const finished = await finalizePastMatches();
    const result = await settleOverdueMatchPayments();
    return res.json({ ok: true, finished, ...result });
  } catch (e) {
    return res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

router.post('/create-with-booking', async (req: Request, res: Response) => {
  const {
    court_id,
    organizer_player_id,
    start_at,
    end_at,
    total_price_cents,
    timezone,
    visibility,
    elo_min,
    elo_max,
    gender,
    competitive,
    source_channel,
    type: bodyType,
  } = req.body ?? {};
  if (!court_id || !organizer_player_id || !start_at || !end_at || total_price_cents == null) {
    return res.status(400).json({
      ok: false,
      error: 'court_id, organizer_player_id, start_at, end_at y total_price_cents son obligatorios',
    });
  }
  if (bookingStartIsTooFarInPast(String(start_at))) {
    return res.status(400).json({ ok: false, error: BOOKING_START_PAST_ERROR });
  }
  try {
    if (await playerHasDebt(String(organizer_player_id))) {
      return res.status(403).json({ ok: false, error: 'player_blocked_by_debt' });
    }
    const conflictReason = await hasCourtConflict(String(court_id), String(start_at), String(end_at));
    if (conflictReason) {
      return res.status(409).json({ ok: false, error: conflictReason });
    }

    const supabase = getSupabaseServiceRoleClient();
    const { data: courtClubRow } = await supabase.from('courts').select('club_id').eq('id', court_id).maybeSingle();
    const clubForOnline = (courtClubRow as { club_id?: string } | null)?.club_id;
    const sch = ['mobile', 'web', 'manual', 'system'].includes(source_channel) ? source_channel : 'web';
    if (clubForOnline) {
      const allowMap = await fetchAllowOnlineByType(supabase, clubForOnline);
      const gate = assertReservationTypeAllowedOnline(allowMap, 'open_match', sch);
      if (!gate.ok) {
        return res.status(403).json({ ok: false, error: gate.error });
      }
    }
    const type = normalizeMatchType(bodyType);
    const isCompetitive = resolveCompetitiveForCreate(type, competitive);
    const eloParsed = parseEloRange(elo_min, elo_max);
    if (!eloParsed.ok) return res.status(400).json({ ok: false, error: eloParsed.error });
    const eloMinIns = eloParsed.elo_min;
    const eloMaxIns = eloParsed.elo_max;

    const { data: booking, error: errBooking } = await supabase
      .from('bookings')
      .insert([
        {
          court_id,
          organizer_player_id,
          start_at,
          end_at,
          timezone: timezone ?? 'Europe/Madrid',
          total_price_cents: Number(total_price_cents),
          currency: 'EUR',
          status: 'pending_payment',
          source_channel: ['mobile', 'web', 'manual', 'system'].includes(source_channel)
            ? source_channel
            : 'web',
          reservation_type: 'open_match',
        },
      ])
      .select('id')
      .maybeSingle();
    if (errBooking) return res.status(500).json({ ok: false, error: errBooking.message });
    if (!booking) return res.status(500).json({ ok: false, error: 'No se pudo crear la reserva' });

    const { data: match, error: errMatch } = await supabase
      .from('matches')
      .insert([
        {
          booking_id: booking.id,
          visibility: visibility === 'public' ? 'public' : 'private',
          elo_min: eloMinIns,
          elo_max: eloMaxIns,
          gender: gender ?? 'any',
          competitive: isCompetitive,
          type,
        },
      ])
      .select(SELECT_ONE)
      .maybeSingle();
    if (errMatch) return res.status(500).json({ ok: false, error: errMatch.message });
    if (!match) return res.status(500).json({ ok: false, error: 'No se pudo crear el partido' });

    const totalCents = Number(total_price_cents);
    const shareCents = Math.ceil(totalCents / 4);

    const { data: organizerParticipant, error: errBP } = await supabase
      .from('booking_participants')
      .insert([
        { booking_id: booking.id, player_id: organizer_player_id, role: 'organizer', share_amount_cents: shareCents },
      ])
      .select('id')
      .maybeSingle();
    if (errBP) return res.status(500).json({ ok: false, error: errBP.message });
    if (!organizerParticipant) return res.status(500).json({ ok: false, error: 'No se pudo crear participante' });

    const { error: errMP } = await supabase.from('match_players').insert([
      { match_id: match.id, player_id: organizer_player_id, team: 'A', invite_status: 'accepted', slot_index: 0 },
    ]);
    if (errMP) return res.status(500).json({ ok: false, error: errMP.message });

    return res.status(201).json({
      ok: true,
      match,
      booking: { id: booking.id, organizer_participant_id: organizerParticipant.id },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/** POST /matches/:id/admin-add-player - Administrador añade manualmente un jugador al partido/reserva */
router.post('/:id/admin-add-player', async (req: Request, res: Response) => {
  const matchId = req.params.id;
  const { player_id, team, slot_index, booking_id } = req.body;
  
  if (!player_id || !booking_id) {
    return res.status(400).json({ ok: false, error: 'Faltan player_id o booking_id' });
  }
  
  try {
    const supabase = getSupabaseServiceRoleClient();
    
    // 1. Si NO es un match mockeado, insertarlo en match_players
    if (!matchId.startsWith('mock-match-')) {
      const { error: errMP } = await supabase.from('match_players').insert([
        { match_id: matchId, player_id, team: team || 'A', slot_index: slot_index || 0, invite_status: 'accepted' }
      ]);
      // Ignoramos error de unicidad por si el dev clickea dos veces
      if (errMP && errMP.code !== '23505') {
         console.error('Error insertando en match_players:', errMP);
      }
    }
    
    // 2. Insertarlo en booking_participants
    const { data: booking } = await supabase.from('bookings').select('total_price_cents').eq('id', booking_id).single();
    const shareCents = booking ? Math.ceil((booking.total_price_cents || 0) / 4) : 0;
    
    const { error: errBP } = await supabase.from('booking_participants').insert([
      { booking_id, player_id, role: 'guest', share_amount_cents: shareCents }
    ]);
    if (errBP && errBP.code !== '23505') {
       console.error('Error insertando en booking_participants:', errBP);
    }
    
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** POST /matches/:id/admin-remove-player - Administrador remueve manualmente a un jugador */
router.post('/:id/admin-remove-player', async (req: Request, res: Response) => {
  const matchId = req.params.id;
  const { player_id, booking_id } = req.body;

  if (!player_id || !booking_id) {
    return res.status(400).json({ ok: false, error: 'Faltan player_id o booking_id' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const now = new Date().toISOString();

    // 1. Fetch participant payment before removal to compute refund
    const { data: participant } = await supabase
      .from('booking_participants')
      .select('paid_amount_cents, wallet_amount_cents, payment_status')
      .eq('booking_id', booking_id)
      .eq('player_id', player_id)
      .maybeSingle();

    // 2. Remover de match_players
    if (!matchId.startsWith('mock-match-')) {
       await supabase.from('match_players').delete().eq('match_id', matchId).eq('player_id', player_id);
    }

    // 3. Remover de booking_participants
    await supabase.from('booking_participants').delete().eq('booking_id', booking_id).eq('player_id', player_id);

    // 4. Acreditar en wallet si el jugador había pagado
    if (participant && participant.payment_status === 'paid') {
      const refundCents = (participant.paid_amount_cents ?? 0) + (participant.wallet_amount_cents ?? 0);
      if (refundCents > 0) {
        const { data: bookingRow } = await supabase
          .from('bookings')
          .select('courts(club_id)')
          .eq('id', booking_id)
          .maybeSingle();
        const clubId = (bookingRow?.courts as { club_id?: string } | null)?.club_id;
        if (clubId) {
          await supabase.from('wallet_transactions').insert({
            player_id,
            club_id: clubId,
            amount_cents: refundCents,
            concept: 'Reembolso por baja de reserva',
            type: 'refund',
            booking_id,
            created_at: now,
          });
        }
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** POST /matches/:id/prepare-join - valida plaza y devuelve datos para pago. Body: { slot_index }.
 *  No crea participantes: el alta real ocurre tras pago exitoso. */
router.post('/:id/prepare-join', async (req: Request, res: Response) => {
  const matchId = req.params.id;
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token requerido' });
  }
  const slotIndex = req.body?.slot_index;
  if (slotIndex == null || typeof slotIndex !== 'number' || slotIndex < 0 || slotIndex > 3) {
    return res.status(400).json({ ok: false, error: 'slot_index (0-3) es obligatorio' });
  }
  try {
    await finalizePastMatches();
    const supabase = getSupabaseServiceRoleClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user?.email) {
      return res.status(401).json({ ok: false, error: 'Sesión inválida o expirada' });
    }
    const email = String(user.email).trim().toLowerCase();
    const { data: player, error: errPlayer } = await supabase
      .from('players')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (errPlayer) return res.status(500).json({ ok: false, error: errPlayer.message });
    if (!player) return res.status(404).json({ ok: false, error: 'No existe jugador con tu email' });
    const playerId = player.id;

    const { data: match, error: errMatch } = await supabase
      .from('matches')
      .select('id, booking_id, status, competitive, type, elo_min, elo_max')
      .eq('id', matchId)
      .maybeSingle();
    if (errMatch) return res.status(500).json({ ok: false, error: errMatch.message });
    if (!match) return res.status(404).json({ ok: false, error: 'Partido no encontrado' });
    if (match.status === 'cancelled') {
      return res.status(400).json({ ok: false, error: 'El partido está cancelado' });
    }
    if (match.status === 'finished') {
      return res.status(400).json({ ok: false, error: 'El partido ya finalizó.' });
    }
    if (!match.booking_id) {
      return res.status(400).json({ ok: false, error: 'El partido no tiene reserva asociada' });
    }

    const { data: contentionBooking, error: errContBk } = await supabase
      .from('bookings')
      .select('status, court_contention_status')
      .eq('id', match.booking_id)
      .maybeSingle();
    if (errContBk) return res.status(500).json({ ok: false, error: errContBk.message });
    if (contentionBooking?.status === 'cancelled') {
      return res.status(400).json({
        ok: false,
        code: 'contention_lost',
        error: 'Este partido ya no tiene la pista: otro grupo completó el partido antes.',
      });
    }
    if (contentionBooking?.court_contention_status === 'lost') {
      return res.status(400).json({
        ok: false,
        code: 'contention_lost',
        error: 'Este partido ya no tiene la pista: otro grupo completó el partido antes.',
      });
    }

    const { data: joinPlayer, error: errJP } = await supabase
      .from('players')
      .select('elo_rating, onboarding_completed')
      .eq('id', playerId)
      .maybeSingle();
    if (errJP) return res.status(500).json({ ok: false, error: errJP.message });

    const mCompetitive = !!(match as { competitive?: boolean }).competitive;
    const mType = String((match as { type?: string }).type ?? 'open');
    if (matchAffectsElo(mCompetitive, mType) && !(joinPlayer as { onboarding_completed?: boolean })?.onboarding_completed) {
      return res.status(403).json({ ok: false, error: 'Complete el cuestionario de nivelación primero' });
    }
    const eloJoin = Number((joinPlayer as { elo_rating?: number }).elo_rating ?? 0);
    const eloMin = (match as { elo_min?: number | null }).elo_min;
    const eloMax = (match as { elo_max?: number | null }).elo_max;
    if (eloMin != null && eloMax != null) {
      if (eloJoin < eloMin || eloJoin > eloMax) {
        return res.status(403).json({ ok: false, error: 'Tu nivel no está en el rango permitido para este partido' });
      }
    }

    const { data: existing } = await supabase
      .from('match_players')
      .select('id')
      .eq('match_id', matchId)
      .eq('player_id', playerId)
      .maybeSingle();
    if (existing) {
      return res.status(409).json({ ok: false, error: 'Ya estás en este partido' });
    }

    const { data: matchPlayers } = await supabase
      .from('match_players')
      .select('slot_index')
      .eq('match_id', matchId);
    const taken = (matchPlayers ?? []).map((p: { slot_index?: number }) => p.slot_index).filter((s): s is number => s != null);
    if (taken.includes(slotIndex)) {
      return res.status(400).json({ ok: false, error: 'Esa plaza ya está ocupada' });
    }

    if ((matchPlayers ?? []).length >= 4) {
      return res.status(400).json({ ok: false, error: 'El partido está completo' });
    }

    const { data: targetBooking } = await supabase
      .from('bookings')
      .select('start_at, end_at')
      .eq('id', match.booking_id)
      .maybeSingle();
    const joinPhase = getMatchListPhase(
      Date.now(),
      match.status,
      targetBooking?.start_at,
      targetBooking?.end_at
    );
    if (joinPhase === 'past') {
      return res.status(400).json({
        ok: false,
        error: 'El partido ya finalizó o no está disponible.',
      });
    }
    const targetStart = targetBooking?.start_at ? new Date(targetBooking.start_at).getTime() : 0;
    const targetEnd = targetBooking?.end_at ? new Date(targetBooking.end_at).getTime() : 0;
    if (targetStart && targetEnd) {
      const { data: myMatches } = await supabase
        .from('match_players')
        .select('match_id')
        .eq('player_id', playerId);
      const myMatchIds = (myMatches ?? []).map((m: { match_id: string }) => m.match_id);
      if (myMatchIds.length > 0) {
        const { data: matchesWithBookings } = await supabase
          .from('matches')
          .select('id, status, bookings(start_at, end_at)')
          .in('id', myMatchIds)
          .neq('status', 'cancelled');
        const overlaps = (matchesWithBookings ?? []).some((m: { status: string; bookings?: { start_at: string; end_at: string } | { start_at: string; end_at: string }[] }) => {
          const b = Array.isArray(m.bookings) ? m.bookings[0] : m.bookings;
          if (!b?.start_at || !b?.end_at) return false;
          const exStart = new Date(b.start_at).getTime();
          const exEnd = new Date(b.end_at).getTime();
          return targetStart < exEnd && targetEnd > exStart;
        });
        if (overlaps) {
          return res.status(400).json({
            ok: false,
            code: 'schedule_conflict',
            error: 'Ya tienes un partido a esa hora. Elige otro horario.',
          });
        }
      }
    }

    const { data: booking } = await supabase
      .from('bookings')
      .select('total_price_cents')
      .eq('id', match.booking_id)
      .maybeSingle();
    const totalCents = booking?.total_price_cents ?? 0;
    const shareCents = Math.ceil(totalCents / 4);

    return res.status(200).json({
      ok: true,
      booking_id: match.booking_id,
      share_amount_cents: shareCents,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/** POST /matches/:id/join - deshabilitado. Usa prepare-join + pago primero. */
router.post('/:id/join', async (_req: Request, res: Response) => {
  return res.status(400).json({
    ok: false,
    error: 'Para unirte debes pagar primero. Usa prepare-join y el flujo de pago.',
  });
});

/**
 * @openapi
 * /matches:
 *   post:
 *     tags: [Matches]
 *     summary: Crear partido ligado a una reserva existente
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [booking_id]
 *             properties:
 *               booking_id: { type: string, format: uuid }
 *               type: { type: string, enum: [open, matchmaking] }
 *     responses:
 *       201: { description: Creado }
 */
router.post('/', async (req: Request, res: Response) => {
  const { booking_id, visibility, elo_min, elo_max, gender, competitive, type: bodyType } = req.body ?? {};
  if (!booking_id) {
    return res.status(400).json({ ok: false, error: 'booking_id es obligatorio' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: existing } = await supabase.from('matches').select(SELECT_ONE).eq('booking_id', booking_id).maybeSingle();
    if (existing) {
      await syncMatchPlayersFromBooking(supabase, (existing as { id: string }).id, String(booking_id));
      return res.status(200).json({ ok: true, match: existing });
    }

    const type = normalizeMatchType(bodyType);
    const isCompetitive = resolveCompetitiveForCreate(type, competitive);
    const eloParsed = parseEloRange(elo_min, elo_max);
    if (!eloParsed.ok) return res.status(400).json({ ok: false, error: eloParsed.error });
    const eloMinIns = eloParsed.elo_min;
    const eloMaxIns = eloParsed.elo_max;
    const { data, error } = await supabase
      .from('matches')
      .insert([
        {
          booking_id,
          visibility: visibility === 'public' ? 'public' : 'private',
          elo_min: eloMinIns,
          elo_max: eloMaxIns,
          gender: gender ?? 'any',
          competitive: isCompetitive,
          type,
        },
      ])
      .select(SELECT_ONE)
      .maybeSingle();
    if (error) {
      if (error.code === '23505') {
        const { data: again } = await supabase.from('matches').select(SELECT_ONE).eq('booking_id', booking_id).maybeSingle();
        if (again) {
          await syncMatchPlayersFromBooking(supabase, (again as { id: string }).id, String(booking_id));
          return res.status(200).json({ ok: true, match: again });
        }
      }
      return res.status(500).json({ ok: false, error: error.message });
    }
    if (data) {
      await syncMatchPlayersFromBooking(supabase, (data as { id: string }).id, String(booking_id));
    }
    return res.status(201).json({ ok: true, match: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /matches/{id}:
 *   put:
 *     tags: [Matches]
 *     summary: Actualizar partido
 *     description: No permite modificar marcador (`score_status`, `sets`, etc.); usar rutas `/matches/:id/score/*`.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: OK }
 *       400: { description: Campos de marcador bloqueados }
 */
/**
 * POST /matches/:id/cancel
 * - Partido **público**: cualquier jugador en el partido. Si es el único → cancela reserva + partido y reembolsa todos los Stripe de la reserva. Si hay más → solo sale él, reembolso Stripe suyo, el partido sigue (reorganiza organizador si hace falta).
 * - Partido **privado**: solo el organizador; siempre cancelación total (igual que antes).
 */
router.post('/:id/cancel', async (req: Request, res: Response) => {
  const matchId = req.params.id;
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token requerido' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user?.email) {
      return res.status(401).json({ ok: false, error: 'Sesión inválida o expirada' });
    }
    const { data: player, error: errPlayer } = await supabase
      .from('players')
      .select('id')
      .eq('email', String(user.email).trim().toLowerCase())
      .maybeSingle();
    if (errPlayer) return res.status(500).json({ ok: false, error: errPlayer.message });
    if (!player) return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });
    const playerId = player.id;

    const { data: match, error: errMatch } = await supabase
      .from('matches')
      .select('id, booking_id, status, visibility, type')
      .eq('id', matchId)
      .maybeSingle();
    if (errMatch) return res.status(500).json({ ok: false, error: errMatch.message });
    if (!match) return res.status(404).json({ ok: false, error: 'Partido no encontrado' });
    if (match.status === 'cancelled') {
      return res.json({
        ok: true,
        cancelled_entire_match: true,
        match: { id: match.id, status: 'cancelled' },
      });
    }
    if (!match.booking_id) {
      return res.status(400).json({ ok: false, error: 'El partido no tiene reserva asociada' });
    }

    const { data: booking, error: errBooking } = await supabase
      .from('bookings')
      .select('id, organizer_player_id, deleted_at, status')
      .eq('id', match.booking_id)
      .maybeSingle();
    if (errBooking) return res.status(500).json({ ok: false, error: errBooking.message });
    if (!booking || booking.deleted_at != null || booking.status === 'cancelled') {
      return res.status(400).json({ ok: false, error: 'La reserva ya no está activa' });
    }

    const { data: bookingTimes } = await supabase
      .from('bookings')
      .select('start_at, end_at')
      .eq('id', match.booking_id)
      .maybeSingle();
    const phase = getMatchListPhase(
      Date.now(),
      match.status,
      bookingTimes?.start_at ?? null,
      bookingTimes?.end_at ?? null,
    );
    if (phase === 'past') {
      return res.status(400).json({ ok: false, error: 'El partido ya finalizó' });
    }

    const isPublic = String((match as { visibility?: string }).visibility ?? '') === 'public';

    const clubId = await resolveClubIdForBooking(supabase, booking.id);
    if (!clubId) {
      return res.status(500).json({ ok: false, error: 'No se pudo resolver el club de la reserva' });
    }

    const now = new Date().toISOString();

    if (!isPublic) {
      if (booking.organizer_player_id !== playerId) {
        return res.status(403).json({
          ok: false,
          error: 'Solo el organizador puede cancelar un partido privado',
        });
      }
      const stripeRef = await refundStripeBookingPaymentTransactions(supabase, booking.id, clubId);
      if (stripeRef.errors.length > 0) {
        return res.status(502).json({
          ok: false,
          error: 'No se pudieron completar los reembolsos con tarjeta (app). El partido no se canceló.',
          refund_errors: stripeRef.errors,
        });
      }
      const { error: errUpB } = await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          updated_at: now,
          cancelled_at: now,
          cancelled_by: 'player',
          deleted_at: now,
        })
        .eq('id', booking.id)
        .is('deleted_at', null);
      if (errUpB) return res.status(500).json({ ok: false, error: errUpB.message });

      const { data: matchRow, error: errUpM } = await supabase
        .from('matches')
        .update({ status: 'cancelled', updated_at: now })
        .eq('id', matchId)
        .select('id, status')
        .maybeSingle();
      if (errUpM) return res.status(500).json({ ok: false, error: errUpM.message });

      if ((match as { type?: string }).type === 'matchmaking') {
        try {
          await releaseMatchmakingProposal(matchId, { cancelBooking: false });
        } catch (e) {
          console.error('[matches/cancel] releaseMatchmakingProposal (privado):', e);
        }
      }

      return res.json({ ok: true, cancelled_entire_match: true, match: matchRow });
    }

    const { data: mpRows, error: errMp } = await supabase
      .from('match_players')
      .select('player_id, slot_index')
      .eq('match_id', matchId);
    if (errMp) return res.status(500).json({ ok: false, error: errMp.message });

    const inMatch = (mpRows ?? []).some((r: { player_id: string }) => r.player_id === playerId);
    if (!inMatch) {
      return res.status(403).json({ ok: false, error: 'No estás en este partido' });
    }

    const n = (mpRows ?? []).length;
    if (n <= 1) {
      const stripeRef = await refundStripeBookingPaymentTransactions(supabase, booking.id, clubId);
      if (stripeRef.errors.length > 0) {
        return res.status(502).json({
          ok: false,
          error: 'No se pudieron completar los reembolsos con tarjeta (app).',
          refund_errors: stripeRef.errors,
        });
      }
      const { error: errUpB } = await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          updated_at: now,
          cancelled_at: now,
          cancelled_by: 'player',
          deleted_at: now,
        })
        .eq('id', booking.id)
        .is('deleted_at', null);
      if (errUpB) return res.status(500).json({ ok: false, error: errUpB.message });

      const { data: matchRow, error: errUpM } = await supabase
        .from('matches')
        .update({ status: 'cancelled', updated_at: now })
        .eq('id', matchId)
        .select('id, status')
        .maybeSingle();
      if (errUpM) return res.status(500).json({ ok: false, error: errUpM.message });

      if ((match as { type?: string }).type === 'matchmaking') {
        try {
          await releaseMatchmakingProposal(matchId, { cancelBooking: false });
        } catch (e) {
          console.error('[matches/cancel] releaseMatchmakingProposal (público vacío):', e);
        }
      }

      return res.json({ ok: true, cancelled_entire_match: true, match: matchRow });
    }

    const stripeSolo = await refundStripeBookingPaymentForPlayer(supabase, booking.id, clubId, playerId);
    if (stripeSolo.errors.length > 0) {
      return res.status(502).json({
        ok: false,
        error: 'No se pudo reembolsar tu pago con tarjeta. No se aplicó la baja.',
        refund_errors: stripeSolo.errors,
      });
    }

    const { error: delMp } = await supabase
      .from('match_players')
      .delete()
      .eq('match_id', matchId)
      .eq('player_id', playerId);
    if (delMp) return res.status(500).json({ ok: false, error: delMp.message });

    const { error: delBp } = await supabase
      .from('booking_participants')
      .delete()
      .eq('booking_id', booking.id)
      .eq('player_id', playerId);
    if (delBp) return res.status(500).json({ ok: false, error: delBp.message });

    if (booking.organizer_player_id === playerId) {
      const sortedRemaining = [...(mpRows ?? [])]
        .filter((r: { player_id: string }) => r.player_id !== playerId)
        .sort(
          (a: { slot_index?: number | null }, b: { slot_index?: number | null }) =>
            (a.slot_index ?? 999) - (b.slot_index ?? 999),
        );
      const newOrg = sortedRemaining[0]?.player_id;
      if (newOrg) {
        await supabase
          .from('bookings')
          .update({ organizer_player_id: newOrg, updated_at: now })
          .eq('id', booking.id);
      }
    }

    await supabase.from('matches').update({ updated_at: now }).eq('id', matchId);

    const { data: matchRow } = await supabase
      .from('matches')
      .select('id, status')
      .eq('id', matchId)
      .maybeSingle();

    return res.json({
      ok: true,
      cancelled_entire_match: false,
      match: matchRow ?? { id: matchId, status: match.status },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body ?? {};
  const blocked = [
    'score_status',
    'sets',
    'match_end_reason',
    'retired_team',
    'leveling_applied_at',
    'friendly_count_applied_at',
    'score_first_proposer_team',
    'score_confirmed_at',
  ];
  if (Object.keys(body).some((k) => blocked.includes(k))) {
    return res.status(400).json({
      ok: false,
      error: 'Marcador y estado de puntuación solo se actualizan vía /matches/:id/score/*',
    });
  }
  const { visibility, elo_min, elo_max, gender, competitive, status } = body;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (visibility !== undefined) update.visibility = visibility;
  if (gender !== undefined) update.gender = gender;
  if (status !== undefined) update.status = status;
  if (elo_min !== undefined || elo_max !== undefined) {
    const eloParsed = parseEloRange(
      elo_min !== undefined ? elo_min : null,
      elo_max !== undefined ? elo_max : null,
    );
    if (!eloParsed.ok) return res.status(400).json({ ok: false, error: eloParsed.error });
    if (elo_min !== undefined) update.elo_min = eloParsed.elo_min;
    if (elo_max !== undefined) update.elo_max = eloParsed.elo_max;
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    if (competitive !== undefined) {
      const { data: cur } = await supabase.from('matches').select('type').eq('id', id).maybeSingle();
      const curType = normalizeMatchType((cur as { type?: string } | null)?.type);
      if (curType === 'open' && competitive === true) {
        return res.status(400).json({
          ok: false,
          error: 'Los partidos abiertos no pueden ser competitivos; usá matchmaking para ranked',
        });
      }
      if (curType === 'matchmaking') {
        update.competitive = competitive;
      }
    }
    if (Object.keys(update).length === 1) {
      return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' });
    }
    const { data, error } = await supabase
      .from('matches')
      .update(update)
      .eq('id', id)
      .select(SELECT_ONE)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Match not found' });
    return res.json({ ok: true, match: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const now = new Date().toISOString();

    // Fetch match before deletion: need booking_id (wallet refund) and type (matchmaking release)
    const { data: matchRow } = await supabase
      .from('matches')
      .select('id, booking_id, type')
      .eq('id', id)
      .maybeSingle();
    if (!matchRow) return res.status(404).json({ ok: false, error: 'Match not found' });

    const { data, error } = await supabase
      .from('matches')
      .update({ status: 'cancelled', updated_at: now })
      .eq('id', id)
      .select('id, status')
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Match not found' });

    // Release matchmaking slot if applicable (from develop)
    if (matchRow.type === 'matchmaking') {
      try {
        await releaseMatchmakingProposal(id, { cancelBooking: false });
      } catch (e) {
        console.error('[matches/delete] releaseMatchmakingProposal:', e);
      }
    }

    // Refund wallet for all paid participants of the associated booking
    if (matchRow.booking_id) {
      const { data: bookingRow } = await supabase
        .from('bookings')
        .select('courts(club_id)')
        .eq('id', matchRow.booking_id)
        .maybeSingle();
      const clubId = (bookingRow?.courts as { club_id?: string } | null)?.club_id;

      if (clubId) {
        const { data: paidParticipants } = await supabase
          .from('booking_participants')
          .select('player_id, paid_amount_cents, wallet_amount_cents')
          .eq('booking_id', matchRow.booking_id)
          .eq('payment_status', 'paid');

        if (paidParticipants && paidParticipants.length > 0) {
          const refundRows = paidParticipants
            .filter((p) => (p.paid_amount_cents ?? 0) + (p.wallet_amount_cents ?? 0) > 0)
            .map((p) => ({
              player_id: p.player_id,
              club_id: clubId,
              amount_cents: (p.paid_amount_cents ?? 0) + (p.wallet_amount_cents ?? 0),
              concept: 'Reembolso por cancelación de partido',
              type: 'refund',
              booking_id: matchRow.booking_id,
              created_at: now,
            }));
          if (refundRows.length > 0) {
            await supabase.from('wallet_transactions').insert(refundRows);
          }
        }
      }
    }

    return res.json({ ok: true, match: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
