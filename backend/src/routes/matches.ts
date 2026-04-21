import { Router, Request, Response } from 'express';
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
  refundWalletForBookingParticipants,
  refundWalletForSingleParticipant,
  resolveClubIdForBooking,
} from '../services/paymentRefundService';

const router = Router();

const SELECT_LIST =
  'id, created_at, updated_at, booking_id, visibility, elo_min, elo_max, gender, competitive, status, type, score_status, sets, match_end_reason, retired_team';
const SELECT_ONE =
  'id, created_at, updated_at, booking_id, visibility, elo_min, elo_max, gender, competitive, status, type, score_status, sets, match_end_reason, retired_team, score_confirmed_at';

function expandSelect(bookingRel: 'bookings' | 'bookings!inner'): string {
  return `id, created_at, updated_at, booking_id, visibility, elo_min, elo_max, gender, competitive, status, type, score_status, sets, match_end_reason, retired_team,
          ${bookingRel} (
            id, organizer_player_id, start_at, end_at, total_price_cents, currency, court_id,
            payment_transactions (amount_cents, status),
            courts (
              id, club_id, name, indoor, glass_type,
              clubs (id, name, address, city)
            )
          ),
          match_players (
            id, team, created_at, slot_index,
            players (id, first_name, last_name, elo_rating)
          )`;
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
  try {
    await finalizePastMatchesThrottled();
    const supabase = getSupabaseServiceRoleClient();
    const nowIso = new Date().toISOString();

    if (expand) {
      const bookingRel = active_only ? 'bookings!inner' : 'bookings';
      let q = supabase.from('matches').select(expandSelect(bookingRel));
      if (active_only) {
        q = q
          .not('status', 'eq', 'cancelled')
          .not('status', 'eq', 'finished')
          .gt('bookings.end_at', nowIso)
          .order('start_at', { ascending: true, foreignTable: 'bookings' })
          .limit(100);
      } else {
        q = q.order('created_at', { ascending: false }).limit(50);
      }
      if (booking_id) q = q.eq('booking_id', booking_id);
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
    await finalizePastMatches();
    const supabase = getSupabaseServiceRoleClient();
    if (expand) {
      const { data, error } = await supabase
        .from('matches')
        .select(expandSelect('bookings'))
        .eq('id', id)
        .maybeSingle();
      if (error) return res.status(500).json({ ok: false, error: error.message });
      if (!data) return res.status(404).json({ ok: false, error: 'Match not found' });
      return res.json({ ok: true, match: data });
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
 *       Partido competitivo abierto (`type=open`) fija `elo_min`/`elo_max` en ±0.5 respecto al organizador (no editables).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [court_id, organizer_player_id, start_at, end_at, total_price_cents]
 *             properties:
 *               type: { type: string, enum: [open, matchmaking], default: open }
 *               competitive: { type: boolean, default: true }
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
    const type = bodyType === 'matchmaking' ? 'matchmaking' : 'open';
    const isCompetitive = competitive !== false;
    let eloMinIns = elo_min != null ? Number(elo_min) : null;
    let eloMaxIns = elo_max != null ? Number(elo_max) : null;
    if (isCompetitive && type === 'open') {
      const { data: orgPl } = await supabase
        .from('players')
        .select('elo_rating')
        .eq('id', organizer_player_id)
        .maybeSingle();
      const elo = Number((orgPl as { elo_rating?: number } | null)?.elo_rating ?? 3.5);
      eloMinIns = Math.round((elo - 0.5) * 10) / 10;
      eloMaxIns = Math.round((elo + 0.5) * 10) / 10;
    }

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
    
    // 1. Remover de match_players
    if (!matchId.startsWith('mock-match-')) {
       await supabase.from('match_players').delete().eq('match_id', matchId).eq('player_id', player_id);
    }
    
    // 2. Remover de booking_participants
    await supabase.from('booking_participants').delete().eq('booking_id', booking_id).eq('player_id', player_id);
    
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/** POST /matches/:id/prepare-join - prepara unirse (crea participant pendiente de pago). Body: { slot_index }.
 *  Devuelve participant_id y booking_id para crear PaymentIntent. El join real se hace tras pago exitoso. */
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

    const { data: joinPlayer, error: errJP } = await supabase
      .from('players')
      .select('elo_rating, onboarding_completed')
      .eq('id', playerId)
      .maybeSingle();
    if (errJP) return res.status(500).json({ ok: false, error: errJP.message });

    const mCompetitive = !!(match as { competitive?: boolean }).competitive;
    const mType = String((match as { type?: string }).type ?? 'open');
    if (mCompetitive && !(joinPlayer as { onboarding_completed?: boolean })?.onboarding_completed) {
      return res.status(403).json({ ok: false, error: 'Complete el cuestionario de nivelación primero' });
    }
    const eloJoin = Number((joinPlayer as { elo_rating?: number }).elo_rating ?? 0);
    const eloMin = (match as { elo_min?: number | null }).elo_min;
    const eloMax = (match as { elo_max?: number | null }).elo_max;
    if (mCompetitive && mType === 'open' && eloMin != null && eloMax != null) {
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

    const { data: existingParticipant } = await supabase
      .from('booking_participants')
      .select('id')
      .eq('booking_id', match.booking_id)
      .eq('player_id', playerId)
      .maybeSingle();
    if (existingParticipant) {
      return res.status(409).json({ ok: false, error: 'Ya tienes una plaza reservada en este partido' });
    }

    const { data: participant, error: errBP } = await supabase
      .from('booking_participants')
      .insert([
        { booking_id: match.booking_id, player_id: playerId, role: 'guest', share_amount_cents: shareCents },
      ])
      .select('id')
      .maybeSingle();
    if (errBP) return res.status(500).json({ ok: false, error: errBP.message });
    if (!participant) return res.status(500).json({ ok: false, error: 'No se pudo preparar la plaza' });

    return res.status(200).json({
      ok: true,
      participant_id: participant.id,
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
    const type = bodyType === 'matchmaking' ? 'matchmaking' : 'open';
    const isCompetitive = competitive !== false;
    let eloMinIns = elo_min != null ? Number(elo_min) : null;
    let eloMaxIns = elo_max != null ? Number(elo_max) : null;
    if (isCompetitive && type === 'open') {
      const { data: bk } = await supabase
        .from('bookings')
        .select('organizer_player_id')
        .eq('id', booking_id)
        .maybeSingle();
      const orgId = (bk as { organizer_player_id?: string } | null)?.organizer_player_id;
      if (orgId) {
        const { data: orgPl } = await supabase.from('players').select('elo_rating').eq('id', orgId).maybeSingle();
        const elo = Number((orgPl as { elo_rating?: number } | null)?.elo_rating ?? 3.5);
        eloMinIns = Math.round((elo - 0.5) * 10) / 10;
        eloMaxIns = Math.round((elo + 0.5) * 10) / 10;
      }
    }
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
    if (error) return res.status(500).json({ ok: false, error: error.message });
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
      .select('id, booking_id, status, visibility')
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

      await refundWalletForBookingParticipants(supabase, booking.id, clubId);

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

      await refundWalletForBookingParticipants(supabase, booking.id, clubId);

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
  if (elo_min !== undefined) update.elo_min = elo_min;
  if (elo_max !== undefined) update.elo_max = elo_max;
  if (gender !== undefined) update.gender = gender;
  if (competitive !== undefined) update.competitive = competitive;
  if (status !== undefined) update.status = status;
  if (Object.keys(update).length === 1) {
    return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
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
    const { data, error } = await supabase
      .from('matches')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, status')
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Match not found' });
    return res.json({ ok: true, match: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
