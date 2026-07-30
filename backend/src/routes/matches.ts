import { Router, Request, Response } from 'express';
import { getPlayerIdFromBearer } from '../lib/authPlayer';
import { bookingStartIsTooFarInPast, BOOKING_START_PAST_ERROR } from '../lib/bookingStartNotInPast';
import { finalizePastMatches, finalizePastMatchesThrottled } from '../lib/finalizePastMatches';
import { validateGuestMatchJoinEligibility } from '../lib/guestJoinEligibility';
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
import { enrichMatchRowsWithClubImages } from '../lib/clubLogoUrl';
import { getEquippedFrames } from '../services/equippedFramesService';
import {
  assertGuestCanJoinMatch,
  tryRepairPaidGuestMissingFromMatch,
} from '../services/matchPlayerSlotService';
import { assertReservationTypeAllowedOnline, fetchAllowOnlineByType } from '../lib/reservationAllowOnline';
import { assertBookingWithinClubOperatingHours } from '../lib/clubOperatingHours';
import { clubTimezoneOrDefault } from '../lib/clubTimezone';
import { resolveOpenMatchEndAt } from '../lib/openMatchDuration';
import { getPrivateMatchInviteAccess } from '../lib/matchInviteAccess';
import { repairOpenMatchPlayersIfNeeded, syncMatchPlayersFromBooking } from '../lib/matchFromBookingSync';
import {
  fetchBookingParticipantsForRefund,
  listCashRefundCandidates,
  collectStripePlayerIds,
  refundBookingParticipant,
  type CashRefundDisposition,
} from '../lib/bookingParticipantRefund';
import {
  evaluateBookingRefundPolicy,
  refundPolicyUserMessage,
} from '../lib/bookingCancellationPolicy';
import { notifyBookingCancellationEmails } from '../lib/bookingCancellationNotify';
import { cancelActiveInvitesForMatch } from '../lib/matchInviteLifecycle';
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
  'id, created_at, updated_at, booking_id, visibility, elo_min, elo_max, gender, competitive, status, type, score_status, sets, match_end_reason, retired_team, score_confirmed_at, score_proposer_id';

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

type MatchRowWithPlayers = {
  match_players?: Array<{ players?: unknown } | null> | null;
};

/** Supabase expande la relación 1:1 `players` a veces como array de 1 elemento. */
function playerObjOf(mp: { players?: unknown } | null): { id?: string; frame?: unknown } | null {
  const raw = mp?.players;
  const p = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
  return p as { id?: string; frame?: unknown } | null;
}

/**
 * Adjunta el marco equipado (`frame`) a cada jugador de los partidos dados.
 * Muta los objetos `players` en sitio (soporta players como objeto o array).
 * Batchea todos los ids en una sola llamada a getEquippedFrames. Reutilizable
 * por detalle y listas.
 */
async function attachEquippedFramesToMatches(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  rows: MatchRowWithPlayers[],
): Promise<void> {
  const ids: string[] = [];
  for (const r of rows) {
    for (const mp of r.match_players ?? []) {
      const pid = playerObjOf(mp)?.id;
      if (pid) ids.push(pid);
    }
  }
  if (ids.length === 0) return;
  const frames = await getEquippedFrames(supabase, ids);
  for (const r of rows) {
    for (const mp of r.match_players ?? []) {
      const p = playerObjOf(mp);
      if (p?.id) p.frame = frames.get(p.id) ?? null;
    }
  }
}

/** Enriquecido estándar de filas de partido para el cliente: imágenes de club + marco. */
async function enrichMatchRowsForClient(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  rows: unknown[],
): Promise<void> {
  await enrichMatchRowsWithClubImages(supabase, rows as Parameters<typeof enrichMatchRowsWithClubImages>[1]);
  await attachEquippedFramesToMatches(supabase, rows as MatchRowWithPlayers[]);
}

function expandSelect(bookingRel: 'bookings' | 'bookings!inner'): string {
  return `id, created_at, updated_at, booking_id, visibility, elo_min, elo_max, gender, competitive, status, type, score_status, score_confirmed_at, sets, match_end_reason, retired_team, score_proposer_id,
          ${bookingRel} (
            id, organizer_player_id, start_at, end_at, status, total_price_cents, currency, court_id, reservation_type, timezone, deleted_at,
            payment_transactions (amount_cents, status),
            courts (
              id, club_id, name, indoor, glass_type, sport,
              clubs (id, name, address, city, lat, lng, logo_url, photo_urls, timezone)
            )
          ),
          match_players (
            id, team, created_at, slot_index, result,
            players (id, first_name, last_name, elo_rating, phone, liga, avatar_url)
          )`;
}

/** Listado Buscar partido: sin payment_transactions (menos payload). */
function expandSelectDiscovery(): string {
  return `id, created_at, updated_at, booking_id, visibility, elo_min, elo_max, gender, competitive, status, type,
          bookings!inner (
            id, organizer_player_id, start_at, end_at, status, total_price_cents, currency, court_id, timezone,
            courts (
              id, club_id, name, indoor, glass_type, sport,
              clubs (id, name, address, city, lat, lng, logo_url, photo_urls, timezone)
            )
          ),
          match_players (
            id, team, slot_index,
            players (id, first_name, last_name, elo_rating, phone, avatar_url)
          )`;
}

const DISCOVERY_DEFAULT_DAYS = 14;
const DISCOVERY_DEFAULT_LIMIT = 100;
const DISCOVERY_MAX_LIMIT = 150;

function countFilledSlots(row: { match_players?: Array<{ players?: { id?: string } | Array<{ id?: string }> | null }> | null }): number {
  return (row.match_players ?? []).filter((mp) => {
    const raw = mp?.players;
    if (!raw) return false;
    const p = Array.isArray(raw) ? raw[0] : raw;
    return Boolean(p?.id);
  }).length;
}

/** Al menos 1 plaza libre (1–3 huecos); no exige exactamente 1. */
function isJoinableDiscoveryRow(row: { match_players?: Array<{ players?: { id?: string } | null }> | null }): boolean {
  return countFilledSlots(row) < 4;
}

const DISCOVERY_MATCH_PLAYERS_SELECT =
  'id, team, slot_index, players (id, first_name, last_name, elo_rating, phone, avatar_url)';

async function repairDiscoveryMatchPlayers(supabase: ReturnType<typeof getSupabaseServiceRoleClient>, rows: any[]): Promise<any[]> {
  const out: any[] = [];
  for (const row of rows) {
    let current = row;
    const b = Array.isArray(current.bookings) ? current.bookings[0] : current.bookings;
    const bookingId = b?.id as string | undefined;
    const matchId = current.id as string | undefined;
    if (bookingId && matchId && countFilledSlots(current) === 0) {
      const repaired = await repairOpenMatchPlayersIfNeeded(supabase, matchId, bookingId);
      if (repaired) {
        const { data: mps, error: mpErr } = await supabase
          .from('match_players')
          .select(DISCOVERY_MATCH_PLAYERS_SELECT)
          .eq('match_id', matchId);
        if (mpErr) {
          console.error('[GET /matches discovery] repair refetch:', mpErr.message);
        } else {
          current = flattenMatchRowForClient({ ...current, match_players: mps ?? [] });
        }
      }
    }
    out.push(current);
  }
  return out;
}

function flattenMatchRows(rows: any[]): any[] {
  return rows.map((row) => flattenMatchRowForClient(row));
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
  const rawPlayerElo = parseFloat(String(req.query.player_elo ?? ''));
  const player_elo = !isNaN(rawPlayerElo) && rawPlayerElo >= 0 ? rawPlayerElo : undefined;
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
      const rows = flattenMatchRows(data ?? []);
      if (active_only) {
        const filtered = rows.filter((row: any) => {
          const b = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings;
          return getMatchListPhase(Date.now(), row.status, b?.start_at, b?.end_at) !== 'past';
        });
        await enrichMatchRowsForClient(supabase, filtered);
        return res.json({ ok: true, matches: filtered });
      }
      await enrichMatchRowsForClient(supabase, rows);
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
      if (player_elo !== undefined) {
        q = q.or(`elo_min.is.null,elo_max.is.null,and(elo_min.lte.${player_elo},elo_max.gte.${player_elo})`);
      }
      const { data, error } = await q;
      if (error) return res.status(500).json({ ok: false, error: error.message });
      const normalized = flattenMatchRows(data ?? []);
      const repaired = await repairDiscoveryMatchPlayers(supabase, normalized);
      const rows = repaired.filter((row: any) => {
        const b = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings;
        if (getMatchListPhase(Date.now(), row.status, b?.start_at, b?.end_at) === 'past') return false;
        if (joinable_only && !isJoinableDiscoveryRow(row)) return false;
        return true;
      });
      await enrichMatchRowsForClient(supabase, rows);
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
      if (player_elo !== undefined) {
        q = q.or(`elo_min.is.null,elo_max.is.null,and(elo_min.lte.${player_elo},elo_max.gte.${player_elo})`);
      }
      const { data, error } = await q;
      if (error) return res.status(500).json({ ok: false, error: error.message });
      const rows = flattenMatchRows(data ?? []);
      if (active_only) {
        const filtered = rows.filter((row: any) => {
          const b = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings;
          return getMatchListPhase(Date.now(), row.status, b?.start_at, b?.end_at) !== 'past';
        });
        await enrichMatchRowsForClient(supabase, filtered);
        return res.json({ ok: true, matches: filtered });
      }
      await enrichMatchRowsForClient(supabase, rows);
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
      .limit(500);
    if (orgBkErr) return res.status(500).json({ ok: false, error: orgBkErr.message });

    const bookingIds = [...new Set((orgBookings ?? []).map((b: { id: string }) => b.id))];
    if (bookingIds.length > 0) {
      const { data: orgMatches, error: orgMErr } = await supabase
        .from('matches')
        .select('id')
        .in('booking_id', bookingIds)
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
      .order('created_at', { ascending: false })
      .limit(Math.min(matchIds.size, 500));
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const filtered = (data ?? []).filter((row: any) => {
      const b = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings;
      if (!b?.start_at || !b?.end_at) return false;
      if (b.deleted_at != null) return false;
      if (String(row.status ?? '').toLowerCase() === 'cancelled') return false;
      if (String(b.status ?? '').toLowerCase() === 'cancelled') return false;
      const listPhase = getMatchListPhase(nowMs, row.status, b.start_at, b.end_at);
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

    await attachEquippedFramesToMatches(supabase, withFeedbackFlag as MatchRowWithPlayers[]);
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
      let myScoreVote: string | null = null;
      const scoreVoteCounts = { confirm: 0, reject: 0 };
      const { data: votesData } = await supabase
        .from('score_votes')
        .select('player_id, vote')
        .eq('match_id', id);
      if (votesData) {
        for (const v of votesData) {
          if (v.vote === 'confirm') scoreVoteCounts.confirm++;
          else if (v.vote === 'reject') scoreVoteCounts.reject++;
          if (viewerId && v.player_id === viewerId) {
            myScoreVote = v.vote;
          }
        }
      }
      const flattened = flattenMatchRowForClient(
        out as { bookings?: unknown; match_players?: unknown },
      );
      await enrichMatchRowsForClient(supabase, [flattened]);
      return res.json({
        ok: true,
        match: {
          ...flattened,
          has_my_feedback: hasMyFeedback,
          my_score_vote: myScoreVote,
          score_vote_counts: scoreVoteCounts,
        },
      });
    }
    const { data, error } = await supabase
      .from('matches')
      .select(SELECT_ONE)
      .eq('id', id)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Match not found' });
    let myScoreVote: string | null = null;
    const scoreVoteCounts = { confirm: 0, reject: 0 };
    const { playerId: viewerId } = await getPlayerIdFromBearer(req);
    const { data: votesData } = await supabase
      .from('score_votes')
      .select('player_id, vote')
      .eq('match_id', id);
    if (votesData) {
      for (const v of votesData) {
        if (v.vote === 'confirm') scoreVoteCounts.confirm++;
        else if (v.vote === 'reject') scoreVoteCounts.reject++;
        if (viewerId && v.player_id === viewerId) {
          myScoreVote = v.vote;
        }
      }
    }
    return res.json({
      ok: true,
      match: {
        ...data,
        my_score_vote: myScoreVote,
        score_vote_counts: scoreVoteCounts,
      },
    });
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
    const { finished, cancelled } = await finalizePastMatches({ cancelIncomplete: true });
    const result = await settleOverdueMatchPayments();
    return res.json({ ok: true, finished, cancelled, ...result });
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
  const effectiveEndAt = resolveOpenMatchEndAt(String(start_at));
  try {
    if (await playerHasDebt(String(organizer_player_id))) {
      return res.status(403).json({ ok: false, error: 'player_blocked_by_debt' });
    }
    const conflictReason = await hasCourtConflict(String(court_id), String(start_at), effectiveEndAt);
    if (conflictReason) {
      return res.status(409).json({ ok: false, error: conflictReason });
    }

    const supabase = getSupabaseServiceRoleClient();
    const hoursCheck = await assertBookingWithinClubOperatingHours(supabase, {
      courtId: String(court_id),
      startAt: String(start_at),
      endAt: effectiveEndAt,
      reservationType: 'open_match',
    });
    if (!hoursCheck.ok) {
      return res.status(400).json({ ok: false, error: hoursCheck.error });
    }
    const { data: courtClubRow } = await supabase
      .from('courts')
      .select('club_id, club:clubs(timezone)')
      .eq('id', court_id)
      .maybeSingle();
    const clubForOnline = (courtClubRow as { club_id?: string } | null)?.club_id;
    // El timezone de la reserva lo define el club (donde está físicamente la
    // pista), no el dispositivo. Evita guardar 'Europe/Madrid' por defecto.
    const clubRawTz = (courtClubRow as { club?: { timezone?: string | null } } | null)?.club?.timezone;
    const bookingTimezone = clubTimezoneOrDefault(clubRawTz ?? (typeof timezone === 'string' ? timezone : null));
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
          end_at: effectiveEndAt,
          timezone: bookingTimezone,
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

  const slotIdx =
    slot_index != null && Number.isFinite(Number(slot_index))
      ? Math.trunc(Number(slot_index))
      : 0;

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select('id, status, deleted_at, total_price_cents, organizer_player_id')
      .eq('id', booking_id)
      .maybeSingle();
    if (bookingErr) return res.status(500).json({ ok: false, error: bookingErr.message });
    if (!booking || booking.deleted_at != null || booking.status === 'cancelled') {
      return res.status(400).json({ ok: false, error: 'La reserva no está activa' });
    }

    let realMatchId = matchId;
    if (matchId.startsWith('mock-match-')) {
      const { data: matchByBooking } = await supabase
        .from('matches')
        .select('id, status')
        .eq('booking_id', booking_id)
        .maybeSingle();
      if (matchByBooking?.id) {
        realMatchId = matchByBooking.id;
        if (matchByBooking.status === 'cancelled') {
          return res.status(400).json({ ok: false, error: 'El partido está cancelado' });
        }
      }
    } else {
      const { data: matchRow } = await supabase
        .from('matches')
        .select('id, status')
        .eq('id', matchId)
        .maybeSingle();
      if (matchRow?.status === 'cancelled') {
        return res.status(400).json({ ok: false, error: 'El partido está cancelado' });
      }
    }

    if (!realMatchId.startsWith('mock-match-')) {
      const capacity = await assertGuestCanJoinMatch(
        supabase,
        realMatchId,
        booking_id,
        player_id,
        slotIdx,
      );
      if (!capacity.ok) {
        return res.status(409).json({
          ok: false,
          code: capacity.code,
          error: capacity.error ?? 'No hay plazas disponibles',
        });
      }
      if (capacity.code === 'already_in_match') {
        return res.status(409).json({ ok: false, code: 'already_in_match', error: 'El jugador ya está en este partido' });
      }
    }

    const shareCents = Math.ceil((booking.total_price_cents || 0) / 4);
    const becomesOrganizer = !booking.organizer_player_id;

    if (becomesOrganizer) {
      const { error: orgErr } = await supabase
        .from('bookings')
        .update({ organizer_player_id: player_id, updated_at: new Date().toISOString() })
        .eq('id', booking_id);
      if (orgErr) return res.status(500).json({ ok: false, error: orgErr.message });
    }

    if (!realMatchId.startsWith('mock-match-')) {
      const { error: errMP } = await supabase.from('match_players').insert([
        {
          match_id: realMatchId,
          player_id,
          team: team || 'A',
          slot_index: slotIdx,
          invite_status: 'accepted',
        },
      ]);
      if (errMP) {
        if (errMP.code === '23505') {
          return res.status(409).json({ ok: false, error: 'La plaza ya está ocupada o el jugador ya está en el partido' });
        }
        return res.status(500).json({ ok: false, error: errMP.message });
      }
    }

    const { error: errBP } = await supabase.from('booking_participants').insert([
      {
        booking_id,
        player_id,
        role: becomesOrganizer ? 'organizer' : 'guest',
        share_amount_cents: shareCents,
      },
    ]);
    if (errBP) {
      if (errBP.code === '23505') {
        return res.status(409).json({ ok: false, error: 'El jugador ya es participante de esta reserva' });
      }
      return res.status(500).json({ ok: false, error: errBP.message });
    }

    return res.status(200).json({ ok: true });
  } catch (err: unknown) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/** POST /matches/:id/admin-remove-player - Administrador remueve manualmente a un jugador */
router.post('/:id/admin-remove-player', async (req: Request, res: Response) => {
  const matchId = req.params.id;
  const { player_id, booking_id, cash_refund_action, apply_refund } = req.body as {
    player_id?: string;
    booking_id?: string;
    cash_refund_action?: CashRefundDisposition;
    apply_refund?: boolean;
  };

  if (!player_id || !booking_id) {
    return res.status(400).json({ ok: false, error: 'Faltan player_id o booking_id' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const now = new Date().toISOString();

    const clubId = await resolveClubIdForBooking(supabase, booking_id);
    const refundPolicy = await evaluateBookingRefundPolicy(supabase, booking_id);
    const shouldRefund =
      typeof apply_refund === 'boolean' ? apply_refund : refundPolicy.eligible;

    const participants = await fetchBookingParticipantsForRefund(supabase, booking_id);
    const participant = participants.find((p) => p.player_id === player_id);

    if (participant && clubId) {
      const stripeIds = await collectStripePlayerIds(supabase, booking_id);
      const cashCandidates = shouldRefund
        ? listCashRefundCandidates(participants, stripeIds, player_id)
        : [];
      if (cashCandidates.length > 0 && cash_refund_action !== 'cash_hand' && cash_refund_action !== 'wallet') {
        return res.status(400).json({
          ok: false,
          code: 'cash_refund_required',
          error: 'Este jugador pagó en efectivo. Indica si devuelves en mostrador o acreditas al monedero.',
          cash_players: cashCandidates,
        });
      }

      const refundResult = await refundBookingParticipant(supabase, booking_id, clubId, participant, {
        concept: 'Reembolso por baja de reserva',
        cashRefundAction: cash_refund_action,
        now,
        refundEligible: shouldRefund,
      });
      if (refundResult.errors.length > 0) {
        return res.status(502).json({
          ok: false,
          error: 'No se pudo completar el reembolso',
          refund_errors: refundResult.errors,
        });
      }
    }

    await notifyBookingCancellationEmails(supabase, {
      bookingId: booking_id,
      scenario: 'removed',
      cancelledBy: 'admin',
      refundPercent: shouldRefund ? 100 : 0,
      refundEligible: shouldRefund,
      policyMessage: shouldRefund ? undefined : refundPolicyUserMessage(refundPolicy),
      cashRefundAction: cash_refund_action,
      notifyPlayerIds: [player_id],
    });

    let realMatchId = matchId;
    if (matchId.startsWith('mock-match-')) {
      const { data: matchByBooking } = await supabase
        .from('matches')
        .select('id')
        .eq('booking_id', booking_id)
        .maybeSingle();
      if (matchByBooking?.id) realMatchId = matchByBooking.id;
    }

    if (!realMatchId.startsWith('mock-match-')) {
      await supabase.from('match_players').delete().eq('match_id', realMatchId).eq('player_id', player_id);
    }

    await supabase.from('booking_participants').delete().eq('booking_id', booking_id).eq('player_id', player_id);

    const { data: booking } = await supabase
      .from('bookings')
      .select('organizer_player_id')
      .eq('id', booking_id)
      .maybeSingle();
    if (booking?.organizer_player_id === player_id) {
      const { data: mpRows } = await supabase
        .from('match_players')
        .select('player_id, slot_index')
        .eq('match_id', realMatchId);
      const sortedRemaining = [...(mpRows ?? [])].sort(
        (a: { slot_index?: number | null }, b: { slot_index?: number | null }) =>
          (a.slot_index ?? 999) - (b.slot_index ?? 999),
      );
      const newOrg = sortedRemaining[0]?.player_id ?? null;
      await supabase
        .from('bookings')
        .update({ organizer_player_id: newOrg, updated_at: now })
        .eq('id', booking_id);
    }

    return res.status(200).json({
      ok: true,
      refund_eligible: refundPolicy.eligible,
      refund_applied: shouldRefund,
      policy_message: refundPolicy.eligible ? undefined : refundPolicyUserMessage(refundPolicy),
    });
  } catch (err: unknown) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
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
    await finalizePastMatchesThrottled();
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
      .select('id, booking_id, status, competitive, type, elo_min, elo_max, visibility')
      .eq('id', matchId)
      .maybeSingle();
    if (errMatch) return res.status(500).json({ ok: false, error: errMatch.message });
    if (!match) return res.status(404).json({ ok: false, error: 'Partido no encontrado' });
    if (String((match as { visibility?: string }).visibility ?? '').toLowerCase() === 'private') {
      const inviteAccess = await getPrivateMatchInviteAccess(supabase, matchId, playerId);
      if (!inviteAccess.ok) {
        return res.status(403).json({
          ok: false,
          code: 'private_match',
          error: 'Este partido es privado. Solo puedes unirte con invitación.',
        });
      }
    }
    if (!match.booking_id) {
      return res.status(400).json({ ok: false, error: 'El partido no tiene reserva asociada' });
    }

    const { data: contentionBooking, error: errContBk } = await supabase
      .from('bookings')
      .select('status, court_contention_status, start_at, end_at, total_price_cents')
      .eq('id', match.booking_id)
      .maybeSingle();
    if (errContBk) return res.status(500).json({ ok: false, error: errContBk.message });

    const eligibility = await validateGuestMatchJoinEligibility(supabase, {
      matchId,
      playerId,
      match,
      booking: contentionBooking,
    });
    if (!eligibility.ok) {
      return res.status(eligibility.httpStatus ?? 400).json({
        ok: false,
        code: eligibility.code,
        error: eligibility.error,
      });
    }

    const capacity = await assertGuestCanJoinMatch(
      supabase,
      matchId,
      match.booking_id,
      playerId,
      slotIndex,
    );
    if (!capacity.ok) {
      return res.status(409).json({
        ok: false,
        code: capacity.code,
        error: capacity.error,
      });
    }
    if (capacity.code === 'already_in_match') {
      return res.status(409).json({ ok: false, code: 'already_in_match', error: 'Ya estás en este partido' });
    }

    const totalCents = contentionBooking?.total_price_cents ?? 0;
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
    const visibilityValue = visibility === 'public' ? 'public' : 'private';
    if (existing) {
      await supabase
        .from('matches')
        .update({ visibility: visibilityValue, updated_at: new Date().toISOString() })
        .eq('id', (existing as { id: string }).id);
      await syncMatchPlayersFromBooking(supabase, (existing as { id: string }).id, String(booking_id));
      const { data: refreshed } = await supabase
        .from('matches')
        .select(SELECT_ONE)
        .eq('id', (existing as { id: string }).id)
        .maybeSingle();
      return res.status(200).json({ ok: true, match: refreshed ?? existing });
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
 * GET /matches/:id/cancel-preview — política de reembolso antes de salir/cancelar (jugador).
 */
router.get('/:id/cancel-preview', async (req: Request, res: Response) => {
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

    const { data: match, error: errMatch } = await supabase
      .from('matches')
      .select('id, booking_id, status, visibility')
      .eq('id', matchId)
      .maybeSingle();
    if (errMatch) return res.status(500).json({ ok: false, error: errMatch.message });
    if (!match) return res.status(404).json({ ok: false, error: 'Partido no encontrado' });
    if (!match.booking_id) {
      return res.status(400).json({ ok: false, error: 'El partido no tiene reserva asociada' });
    }

    const { data: mpRow } = await supabase
      .from('match_players')
      .select('player_id')
      .eq('match_id', matchId)
      .eq('player_id', player.id)
      .maybeSingle();

    const { data: booking } = await supabase
      .from('bookings')
      .select('organizer_player_id')
      .eq('id', match.booking_id)
      .maybeSingle();
    const isOrganizer = booking?.organizer_player_id === player.id;
    const inMatch = Boolean(mpRow);

    if (!inMatch) {
      return res.status(403).json({ ok: false, error: 'No estás en este partido' });
    }

    const refundPolicy = await evaluateBookingRefundPolicy(supabase, match.booking_id);
    return res.json({
      ok: true,
      refund_eligible: refundPolicy.eligible,
      is_organizer: isOrganizer,
      notice_hours: refundPolicy.notice_hours,
      incomplete_public_exempt: refundPolicy.incomplete_public_exempt,
      match_player_count: refundPolicy.match_player_count,
      hours_until_start: Math.round(refundPolicy.hours_until_start * 10) / 10,
      policy_message: refundPolicyUserMessage(refundPolicy),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /matches/:id/cancel
 * - **Organizador** (público o privado): cancela reserva + partido y reembolsa a todos los que pagaron.
 * - **Invitado** (se unió al partido): sale de su plaza y reembolso solo su pago; el partido sigue.
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

    const clubId = await resolveClubIdForBooking(supabase, booking.id);
    if (!clubId) {
      return res.status(500).json({ ok: false, error: 'No se pudo resolver el club de la reserva' });
    }

    const refundPolicy = await evaluateBookingRefundPolicy(supabase, booking.id);
    const now = new Date().toISOString();
    const isOrganizer = booking.organizer_player_id === playerId;

    const { data: mpRows, error: errMp } = await supabase
      .from('match_players')
      .select('player_id, slot_index')
      .eq('match_id', matchId);
    if (errMp) return res.status(500).json({ ok: false, error: errMp.message });

    const inMatch = (mpRows ?? []).some((r: { player_id: string }) => r.player_id === playerId);
    if (!inMatch) {
      return res.status(403).json({ ok: false, error: 'No estás en este partido' });
    }

    const refundAllPaidParticipants = async (): Promise<string[]> => {
      if (!refundPolicy.eligible) return [];
      const participants = await fetchBookingParticipantsForRefund(supabase, booking.id);
      const errors: string[] = [];
      for (const row of participants) {
        if (String(row.payment_status ?? '') !== 'paid') continue;
        const result = await refundBookingParticipant(supabase, booking.id, clubId, row, {
          concept: 'Reembolso por cancelación de reserva',
          refundEligible: true,
          refundPercent: 100,
          now,
        });
        errors.push(...result.errors);
      }
      return errors;
    };

    const refundLeavingPlayer = async (): Promise<string[]> => {
      if (!refundPolicy.eligible) return [];
      const participants = await fetchBookingParticipantsForRefund(supabase, booking.id);
      const row = participants.find((p) => p.player_id === playerId);
      if (!row) {
        const stripeSolo = await refundStripeBookingPaymentForPlayer(
          supabase,
          booking.id,
          clubId,
          playerId,
        );
        return stripeSolo.errors;
      }
      const result = await refundBookingParticipant(supabase, booking.id, clubId, row, {
        concept: 'Reembolso por baja de reserva',
        refundEligible: true,
        refundPercent: 100,
        now,
      });
      return result.errors;
    };

    if (isOrganizer) {
      const refundErrors = await refundAllPaidParticipants();
      if (refundErrors.length > 0) {
        return res.status(502).json({
          ok: false,
          error: 'No se pudieron completar los reembolsos. El partido no se canceló.',
          refund_errors: refundErrors,
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

      const inviteCancel = await cancelActiveInvitesForMatch(supabase, matchId);
      if (inviteCancel.error) {
        console.error('[matches/cancel] cancelActiveInvitesForMatch:', inviteCancel.error);
      }

      await supabase.from('match_players').delete().eq('match_id', matchId);

      if ((match as { type?: string }).type === 'matchmaking') {
        try {
          await releaseMatchmakingProposal(matchId, { cancelBooking: false });
        } catch (e) {
          console.error('[matches/cancel] releaseMatchmakingProposal (organizador):', e);
        }
      }

      void notifyBookingCancellationEmails(supabase, {
        bookingId: booking.id,
        scenario: 'cancelled',
        cancelledBy: 'player',
        refundPercent: refundPolicy.eligible ? 100 : 0,
        refundEligible: refundPolicy.eligible,
        policyMessage: refundPolicyUserMessage(refundPolicy),
      });

      return res.json({
        ok: true,
        cancelled_entire_match: true,
        match: matchRow,
        refund_eligible: refundPolicy.eligible,
        policy_message: refundPolicy.eligible ? undefined : refundPolicyUserMessage(refundPolicy),
      });
    }

    const refundErrors = await refundLeavingPlayer();
    if (refundErrors.length > 0) {
      return res.status(502).json({
        ok: false,
        error: 'No se pudo completar tu reembolso. No se aplicó la baja.',
        refund_errors: refundErrors,
      });
    }

    void notifyBookingCancellationEmails(supabase, {
      bookingId: booking.id,
      scenario: 'left',
      cancelledBy: 'player',
      refundPercent: refundPolicy.eligible ? 100 : 0,
      refundEligible: refundPolicy.eligible,
      policyMessage: refundPolicyUserMessage(refundPolicy),
      notifyPlayerIds: [playerId],
    });

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

    await supabase.from('matches').update({ updated_at: now }).eq('id', matchId);

    const { data: matchRow } = await supabase
      .from('matches')
      .select('id, status')
      .eq('id', matchId)
      .maybeSingle();

    return res.json({
      ok: true,
      cancelled_entire_match: false,
      refund_eligible: refundPolicy.eligible,
      policy_message: refundPolicy.eligible ? undefined : refundPolicyUserMessage(refundPolicy),
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

    return res.json({
      ok: true,
      match: data,
      warning: matchRow.booking_id
        ? 'El partido quedó cancelado pero la reserva sigue activa. Usa DELETE /bookings/:id para cancelar la reserva completa.'
        : undefined,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
