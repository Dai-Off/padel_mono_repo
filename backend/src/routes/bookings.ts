import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { recordPayment } from '../lib/payment';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { findTournamentConflict } from '../lib/tournamentConflicts';

const router = Router();
router.use(attachAuthContext);

const SELECT_LIST =
  'id, created_at, court_id, organizer_player_id, start_at, end_at, started_at, timezone, total_price_cents, currency, status, reservation_type, source_channel, notes, players!bookings_organizer_player_id_fkey(first_name, last_name), booking_participants(player_id, role, players!booking_participants_player_id_fkey(first_name, last_name)), payment_transactions(amount_cents, status, stripe_payment_intent_id, payer_player_id)';
// payment_transactions joined to get per-player payment data (no migration needed)
const SELECT_ONE =
  'id, created_at, updated_at, court_id, organizer_player_id, start_at, end_at, started_at, timezone, total_price_cents, currency, pricing_rule_ids, status, reservation_type, source_channel, cancelled_at, cancelled_by, cancellation_reason, notes, players!bookings_organizer_player_id_fkey(id, first_name, last_name, email), booking_participants(id, player_id, role, share_amount_cents, payment_status, players!booking_participants_player_id_fkey(id, first_name, last_name, email)), payment_transactions(id, payer_player_id, amount_cents, stripe_payment_intent_id, status)';

// ─── Helpers de pago ─────────────────────────────────────────────────────────

function computeBookingStatus(
  totalPriceCents: number,
  participants: Array<{ paid_amount_cents?: number; wallet_amount_cents?: number }>,
): 'pending_payment' | 'confirmed' {
  const totalPaid = participants.reduce(
    (sum, p) => sum + (p.paid_amount_cents ?? 0) + (p.wallet_amount_cents ?? 0),
    0,
  );
  if (totalPaid >= totalPriceCents && totalPriceCents > 0) return 'confirmed';
  return 'pending_payment';
}

/** Maps frontend status values to DB-safe values (partial_payment is not in DB constraint) */
function toDbStatus(status: string): string {
  if (status === 'partial_payment') return 'pending_payment';
  return status;
}

/** Stores per-player manual payments in payment_transactions (works without migration 015) */
async function upsertManualPayments(
  supabase: ReturnType<typeof import('../lib/supabase').getSupabaseServiceRoleClient>,
  bookingId: string,
  participants: Array<{ player_id: string; paid_amount_cents?: number; wallet_amount_cents?: number; payment_method?: string | null }>,
): Promise<void> {
  // Remove previous manual payments for this booking
  const { error: delErr } = await supabase
    .from('payment_transactions')
    .delete()
    .eq('booking_id', bookingId)
    .like('stripe_payment_intent_id', 'manual_%');
  if (delErr) console.error('[upsertManualPayments] delete error:', delErr.message);

  // Insert one row per player with paid > 0 (cash/card/wallet)
  // stripe_payment_intent_id must be globally unique — encode booking+player+method
  for (const p of participants) {
    const cashCardCents = p.paid_amount_cents ?? 0;
    const walletCents = p.wallet_amount_cents ?? 0;
    const totalPaid = cashCardCents + walletCents;
    if (totalPaid <= 0) continue;

    const method = p.payment_method === 'wallet' ? 'wallet'
      : p.payment_method === 'card' ? 'card' : 'cash';
    const uniqueId = `manual_${method}_${bookingId}_${p.player_id}`;
    const { error: insErr } = await supabase.from('payment_transactions').insert({
      booking_id: bookingId,
      payer_player_id: p.player_id,
      amount_cents: totalPaid,
      currency: 'EUR',
      stripe_payment_intent_id: uniqueId,
      status: 'succeeded',
    });
    if (insErr) console.error('[upsertManualPayments] insert error:', insErr.message, { uniqueId, totalPaid });
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function canAccessClub(req: Request, clubId: string): boolean {
  if (req.authContext?.adminId) return true;
  return req.authContext?.allowedClubIds?.includes(clubId) ?? false;
}

function dateToWeekday(d: Date): 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun' {
  const idx = d.getUTCDay();
  if (idx === 0) return 'sun';
  return (['mon', 'tue', 'wed', 'thu', 'fri', 'sat'][idx - 1] as 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat');
}

async function hasCourtConflict(params: {
  courtId: string;
  startAt: string;
  endAt: string;
  excludeBookingId?: string;
}): Promise<{ conflict: boolean; reason?: string }> {
  const supabase = getSupabaseServiceRoleClient();
  const startMs = new Date(params.startAt).getTime();
  const endMs = new Date(params.endAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    return { conflict: true, reason: 'Rango horario inválido' };
  }

  // 1) Conflicto contra bookings existentes
  let q = supabase
    .from('bookings')
    .select('id, start_at, end_at, status')
    .eq('court_id', params.courtId)
    .neq('status', 'cancelled')
    .is('deleted_at', null);
  if (params.excludeBookingId) q = q.neq('id', params.excludeBookingId);
  const { data: existingBookings, error: bErr } = await q;
  if (bErr) return { conflict: true, reason: bErr.message };
  const bookingOverlap = (existingBookings ?? []).some((b: any) => {
    const s = new Date(b.start_at).getTime();
    const e = new Date(b.end_at).getTime();
    return startMs < e && endMs > s;
  });
  if (bookingOverlap) {
    return { conflict: true, reason: 'La pista ya tiene una reserva en ese horario' };
  }

  // 2) Conflicto contra cursos de escuela activos
  const { data: court, error: cErr } = await supabase
    .from('courts')
    .select('club_id')
    .eq('id', params.courtId)
    .maybeSingle();
  if (cErr) return { conflict: true, reason: cErr.message };
  const clubId = (court as { club_id?: string } | null)?.club_id;
  if (!clubId) return { conflict: false };

  const dateStr = params.startAt.slice(0, 10);
  const weekday = dateToWeekday(new Date(`${dateStr}T00:00:00Z`));
  const { data: courses, error: scErr } = await supabase
    .from('club_school_courses')
    .select('id, starts_on, ends_on, is_active')
    .eq('club_id', clubId)
    .eq('court_id', params.courtId)
    .eq('is_active', true);
  if (scErr) return { conflict: true, reason: scErr.message };
  const validCourseIds = (courses ?? [])
    .filter((c: any) => (!c.starts_on || dateStr >= c.starts_on) && (!c.ends_on || dateStr <= c.ends_on))
    .map((c: any) => c.id);
  if (!validCourseIds.length) return { conflict: false };

  const { data: days, error: dayErr } = await supabase
    .from('club_school_course_days')
    .select('course_id, weekday, start_time, end_time')
    .in('course_id', validCourseIds)
    .eq('weekday', weekday);
  if (dayErr) return { conflict: true, reason: dayErr.message };

  const reqStartMin = Number(params.startAt.slice(11, 13)) * 60 + Number(params.startAt.slice(14, 16));
  const reqEndMin = Number(params.endAt.slice(11, 13)) * 60 + Number(params.endAt.slice(14, 16));
  const courseOverlap = (days ?? []).some((d: any) => {
    const s = Number(String(d.start_time).slice(0, 2)) * 60 + Number(String(d.start_time).slice(3, 5));
    const e = Number(String(d.end_time).slice(0, 2)) * 60 + Number(String(d.end_time).slice(3, 5));
    return reqStartMin < e && reqEndMin > s;
  });
  if (courseOverlap) {
    return { conflict: true, reason: 'La pista está ocupada por un curso de escuela en ese horario' };
  }

  const tConflict = await findTournamentConflict({
    clubId,
    courtIds: [params.courtId],
    startAt: params.startAt,
    endAt: params.endAt,
  });
  if (tConflict) {
    return { conflict: true, reason: tConflict };
  }
  return { conflict: false };
}

router.get('/', async (req: Request, res: Response) => {
  const court_id = req.query.court_id as string | undefined;
  const club_id = req.query.club_id as string | undefined;
  const organizer_player_id = req.query.organizer_player_id as string | undefined;
  const date = req.query.date as string | undefined; // YYYY-MM-DD
  try {
    const supabase = getSupabaseServiceRoleClient();

    // When club_id is provided, resolve it to the set of court IDs for that club
    let courtIdsForClub: string[] | null = null;
    if (club_id) {
      const { data: clubCourts, error: courtsErr } = await supabase
        .from('courts')
        .select('id')
        .eq('club_id', club_id);
      if (courtsErr) return res.status(500).json({ ok: false, error: courtsErr.message });
      courtIdsForClub = (clubCourts ?? []).map((c: { id: string }) => c.id);
      if (courtIdsForClub.length === 0) {
        // Club exists but has no courts — return empty immediately
        return res.json({ ok: true, bookings: [] });
      }
    }

    let q = supabase
      .from('bookings')
      .select(SELECT_LIST)
      .order('start_at', { ascending: true })
      .limit(200);

    if (courtIdsForClub) q = q.in('court_id', courtIdsForClub);
    else if (court_id) q = q.eq('court_id', court_id);

    if (organizer_player_id) q = q.eq('organizer_player_id', organizer_player_id);
    if (date) {
      // Filter bookings whose start falls within the given calendar day (UTC)
      const nextDay = new Date(date + 'T00:00:00Z');
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const nextDayStr = nextDay.toISOString().split('T')[0];
      q = q.gte('start_at', `${date}T00:00:00Z`).lt('start_at', `${nextDayStr}T00:00:00Z`);
    }
    q = q.neq('status', 'cancelled').is('deleted_at', null);
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, bookings: data ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /bookings/checkin/today:
 *   get:
 *     tags: [Check-in]
 *     summary: Check de turnos del dia para club
 *     description: |
 *       Devuelve los turnos del dia con los jugadores que deben presentarse,
 *       estado de pago por participante e indicador de inicio de turno.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: club_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: ID del club a consultar.
 *       - in: query
 *         name: date
 *         required: false
 *         schema: { type: string, example: "2026-03-27" }
 *         description: Fecha YYYY-MM-DD. Si no se envia, usa hoy (UTC).
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               date: "2026-03-27"
 *               items:
 *                 - booking_id: "uuid-booking"
 *                   court_id: "uuid-court"
 *                   court_name: "Pista 1"
 *                   start_at: "2026-03-27T18:00:00.000Z"
 *                   end_at: "2026-03-27T19:30:00.000Z"
 *                   started_at: null
 *                   started_turn: false
 *                   booking_status: "confirmed"
 *                   participants:
 *                     - participant_id: "uuid-participant"
 *                       player_id: "uuid-player"
 *                       player_name: "Ana Garcia"
 *                       payment_status: "paid"
 *                       is_paid: true
 *                       must_present: true
 *       400: { description: Falta club_id o date invalida }
 *       401: { description: Sin token o sesion invalida }
 *       403: { description: Sin acceso al club }
 *       500: { description: Error interno }
 */
router.get('/checkin/today', async (req: Request, res: Response) => {
  if (!req.authContext) return res.status(401).json({ ok: false, error: 'Token requerido' });
  const clubId = String(req.query.club_id ?? '').trim();
  if (!clubId) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, clubId)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  const dateStr = String(req.query.date ?? '').trim() || new Date().toISOString().slice(0, 10);
  const startUtc = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(startUtc.getTime())) {
    return res.status(400).json({ ok: false, error: 'date invalida. Usa YYYY-MM-DD.' });
  }
  const endUtc = new Date(startUtc);
  endUtc.setUTCDate(endUtc.getUTCDate() + 1);
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: clubCourts, error: courtsErr } = await supabase
      .from('courts')
      .select('id')
      .eq('club_id', clubId);
    if (courtsErr) return res.status(500).json({ ok: false, error: courtsErr.message });
    const courtIds = (clubCourts ?? []).map((c: { id: string }) => c.id);
    if (courtIds.length === 0) return res.json({ ok: true, date: dateStr, items: [] });

    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id,
        court_id,
        start_at,
        end_at,
        started_at,
        status,
        courts ( name ),
        booking_participants (
          id,
          player_id,
          payment_status,
          players ( first_name, last_name )
        )
      `)
      .in('court_id', courtIds)
      .neq('status', 'cancelled')
      .is('deleted_at', null)
      .gte('start_at', startUtc.toISOString())
      .lt('start_at', endUtc.toISOString())
      .order('start_at', { ascending: true });
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const items = (data ?? []).map((b: any) => {
      const rawCourt = b.courts;
      const court = Array.isArray(rawCourt) ? rawCourt[0] : rawCourt;
      const participants = (Array.isArray(b.booking_participants) ? b.booking_participants : []).map((p: any) => {
        const rawPlayer = p.players;
        const player = Array.isArray(rawPlayer) ? rawPlayer[0] : rawPlayer;
        const firstName = String(player?.first_name ?? '').trim();
        const lastName = String(player?.last_name ?? '').trim();
        return {
          participant_id: p.id,
          player_id: p.player_id,
          player_name: `${firstName} ${lastName}`.trim() || 'Jugador',
          payment_status: p.payment_status ?? 'pending',
          is_paid: p.payment_status === 'paid',
          must_present: true,
        };
      });
      return {
        booking_id: b.id,
        court_id: b.court_id,
        court_name: String(court?.name ?? 'Pista'),
        start_at: b.start_at,
        end_at: b.end_at,
        started_at: b.started_at ?? null,
        started_turn: Boolean(b.started_at),
        booking_status: b.status,
        participants,
      };
    });
    return res.json({ ok: true, date: dateStr, items });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /bookings/{id}/start-turn:
 *   post:
 *     tags: [Check-in]
 *     summary: Marcar inicio de turno
 *     description: Marca el inicio real del turno seteando `started_at`.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: ID del booking.
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               started_at:
 *                 type: string
 *                 format: date-time
 *                 description: Fecha/hora opcional; por defecto usa ahora.
 *           example:
 *             started_at: "2026-03-27T18:05:00.000Z"
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               booking:
 *                 id: "uuid-booking"
 *                 started_at: "2026-03-27T18:05:00.000Z"
 *       404: { description: Booking no encontrado }
 *       400: { description: started_at invalido }
 *       500: { description: Error interno }
 */
router.post('/:id/start-turn', async (req: Request, res: Response) => {
  if (!req.authContext) return res.status(401).json({ ok: false, error: 'Token requerido' });
  const { id } = req.params;
  const startedAtRaw = req.body?.started_at;
  const startedAt = startedAtRaw ? new Date(String(startedAtRaw)) : new Date();
  if (Number.isNaN(startedAt.getTime())) {
    return res.status(400).json({ ok: false, error: 'started_at invalido' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: bookingRef, error: bookingRefErr } = await supabase
      .from('bookings')
      .select('id, courts ( club_id )')
      .eq('id', id)
      .maybeSingle();
    if (bookingRefErr) return res.status(500).json({ ok: false, error: bookingRefErr.message });
    if (!bookingRef) return res.status(404).json({ ok: false, error: 'Booking not found' });
    const rawCourt = (bookingRef as any).courts;
    const court = Array.isArray(rawCourt) ? rawCourt[0] : rawCourt;
    const clubId = String(court?.club_id ?? '');
    if (!clubId || !canAccessClub(req, clubId)) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }

    const { data, error } = await supabase
      .from('bookings')
      .update({
        started_at: startedAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(SELECT_ONE)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Booking not found' });
    return res.json({ ok: true, booking: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.post('/:id/mark-paid', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const payResult = await recordPayment(id);
    if (!payResult.ok) {
      return res.status(400).json({ ok: false, error: payResult.error ?? 'Error al registrar pago' });
    }
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('bookings')
      .select(SELECT_ONE)
      .eq('id', id)
      .single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Booking not found' });
    return res.json({ ok: true, booking: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: bookingData, error: bookingErr } = await supabase
      .from('bookings')
      .select(SELECT_ONE)
      .eq('id', id)
      .maybeSingle();
    if (bookingErr) return res.status(500).json({ ok: false, error: bookingErr.message });
    if (!bookingData) return res.status(404).json({ ok: false, error: 'Booking not found' });
    return res.json({ ok: true, booking: bookingData });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const {
    court_id,
    organizer_player_id,
    start_at,
    end_at,
    timezone,
    total_price_cents,
    currency,
    pricing_rule_ids,
    status,
    notes,
    booking_type,
    source_channel,
    participants, // Array of { player_id }
  } = req.body ?? {};

  if (!court_id || !organizer_player_id || !start_at || !end_at || total_price_cents == null) {
    return res.status(400).json({
      ok: false,
      error: 'court_id, organizer_player_id, start_at, end_at, total_price_cents son obligatorios',
    });
  }

  try {
    const conflict = await hasCourtConflict({
      courtId: String(court_id),
      startAt: String(start_at),
      endAt: String(end_at),
    });
    if (conflict.conflict) {
      return res.status(409).json({ ok: false, error: conflict.reason ?? 'Conflicto de horario' });
    }

    const supabase = getSupabaseServiceRoleClient();

    const wantConfirmed = status === 'confirmed';

    // 1. Insert Booking (siempre como pending; el middleware de pago lo confirma si aplica)
    const { data: insertedBooking, error: bookingError } = await supabase
      .from('bookings')
      .insert([
        {
          court_id,
          organizer_player_id,
          start_at,
          end_at,
          timezone: timezone ?? 'Europe/Madrid',
          total_price_cents: Number(total_price_cents),
          currency: currency ?? 'EUR',
          status: 'pending_payment',
          notes: notes ?? null,
          reservation_type: booking_type ?? 'standard',
          pricing_rule_ids: Array.isArray(pricing_rule_ids) ? pricing_rule_ids : null,
          source_channel: ['mobile', 'web', 'manual', 'system'].includes(source_channel)
            ? source_channel
            : 'web',
        },
      ])
      .select('id')
      .single();

    if (bookingError) {
      console.error('[POST /bookings] Insert error:', bookingError);
      return res.status(500).json({ ok: false, error: bookingError.message });
    }
    const booking = insertedBooking as { id: string };

    // 2. Obtener club_id para wallet transactions
    const { data: courtData } = await supabase
      .from('courts').select('club_id').eq('id', court_id).maybeSingle();
    const clubIdForWallet = (courtData as any)?.club_id as string | undefined;

    // 3. Construir filas de participantes (incluye organizador si viene en el array)
    const participantRows: any[] = [];
    const hasPaymentData = Array.isArray(participants) && participants.some(
      (p: any) => (p.paid_amount_cents ?? 0) > 0 || (p.wallet_amount_cents ?? 0) > 0,
    );

    if (Array.isArray(participants) && participants.length > 0) {
      for (const p of participants) {
        if (!p.player_id) continue;
        const paidCents = p.paid_amount_cents ?? 0;
        const walletCents = p.wallet_amount_cents ?? 0;
        participantRows.push({
          booking_id: booking.id,
          player_id: p.player_id,
          role: p.player_id === organizer_player_id ? 'organizer' : 'guest',
          share_amount_cents: p.share_amount_cents ?? 0,
          paid_amount_cents: paidCents,
          wallet_amount_cents: walletCents,
          payment_method: p.payment_method ?? null,
          payment_status: paidCents + walletCents > 0 ? 'paid' : 'pending',
        });
      }
    }
    // Asegurar que el organizador siempre esté
    if (!participantRows.find((r) => r.player_id === organizer_player_id)) {
      participantRows.push({
        booking_id: booking.id,
        player_id: organizer_player_id,
        role: 'organizer',
        share_amount_cents: 0,
        paid_amount_cents: 0,
        wallet_amount_cents: 0,
        payment_method: null,
        payment_status: 'pending',
      });
    }

    const { error: participantsError } = await supabase
      .from('booking_participants')
      .insert(participantRows);
    if (participantsError) {
      console.error('[POST /bookings] Participants insert error:', participantsError.message);
      // Migration 015 not yet applied — retry without payment columns
      const rowsBase = participantRows.map((r: any) => ({
        booking_id: r.booking_id,
        player_id: r.player_id,
        role: r.role,
        share_amount_cents: r.share_amount_cents,
        payment_status: r.payment_status,
      }));
      const { error: fallbackErr } = await supabase.from('booking_participants').insert(rowsBase);
      if (fallbackErr) console.error('[POST /bookings] Fallback participants insert error:', fallbackErr.message);
    }

    // 4. Persistir pagos en payment_transactions y calcular status
    let finalStatus: string = 'pending_payment';
    if (hasPaymentData) {
      await upsertManualPayments(supabase, booking.id, participantRows);
      finalStatus = computeBookingStatus(Number(total_price_cents), participantRows);
      await supabase.from('bookings').update({ status: finalStatus }).eq('id', booking.id);

      // 4b. Descontar saldo de wallet para quienes pagaron con wallet
      if (clubIdForWallet) {
        for (const p of participantRows) {
          if (p.payment_method === 'wallet' && p.wallet_amount_cents > 0) {
            await supabase.from('wallet_transactions').insert({
              player_id: p.player_id,
              club_id: clubIdForWallet,
              amount_cents: -Math.abs(p.wallet_amount_cents),
              concept: `Pago reserva #${booking.id.slice(0, 8)}`,
              type: 'debit',
              booking_id: booking.id,
              notes: 'Débito automático por pago de reserva',
            });
          }
        }
      }
    } else if (wantConfirmed) {
      const payResult = await recordPayment(booking.id);
      if (!payResult.ok) {
        return res.status(500).json({ ok: false, error: payResult.error ?? 'Error al registrar pago' });
      }
      finalStatus = 'confirmed';
    }

    const { data: finalBooking } = await supabase.from('bookings').select(SELECT_ONE).eq('id', booking.id).maybeSingle();
    return res.status(201).json({ ok: true, booking: finalBooking ?? booking });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  console.log(`[PUT /bookings/${id}] body:`, JSON.stringify(req.body, null, 2));
  const { status, cancelled_by, cancellation_reason, notes, booking_type, participants, court_id, start_at, end_at, total_price_cents } = req.body ?? {};
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status !== undefined && status !== 'confirmed') update.status = toDbStatus(status);
  if (cancelled_by !== undefined) update.cancelled_by = cancelled_by;
  if (cancellation_reason !== undefined) update.cancellation_reason = cancellation_reason;
  if (status === 'cancelled') {
    update.cancelled_at = new Date().toISOString();
  }
  if (notes !== undefined) update.notes = notes;
  if (booking_type !== undefined) update.reservation_type = booking_type;
  if (court_id !== undefined) update.court_id = court_id;
  if (start_at !== undefined) update.start_at = start_at;
  if (end_at !== undefined) update.end_at = end_at;
  if (total_price_cents !== undefined && Number.isFinite(Number(total_price_cents))) {
    update.total_price_cents = Number(total_price_cents);
  }

  if (Object.keys(update).length === 1 && !Array.isArray(participants) && status !== 'confirmed') {
    return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();

    if (court_id !== undefined || start_at !== undefined || end_at !== undefined) {
      const { data: existingBooking, error: exErr } = await supabase
        .from('bookings')
        .select('court_id, start_at, end_at')
        .eq('id', id)
        .maybeSingle();
      if (exErr) return res.status(500).json({ ok: false, error: exErr.message });
      if (!existingBooking) return res.status(404).json({ ok: false, error: 'Booking not found' });
      const nextCourt = String(court_id ?? (existingBooking as any).court_id);
      const nextStart = String(start_at ?? (existingBooking as any).start_at);
      const nextEnd = String(end_at ?? (existingBooking as any).end_at);
      const conflict = await hasCourtConflict({
        courtId: nextCourt,
        startAt: nextStart,
        endAt: nextEnd,
        excludeBookingId: id,
      });
      if (conflict.conflict) {
        return res.status(409).json({ ok: false, error: conflict.reason ?? 'Conflicto de horario' });
      }
    }

    let { data, error: updateError } = await supabase
      .from('bookings')
      .update(update)
      .eq('id', id)
      .select(SELECT_ONE)
      .maybeSingle();
    if (updateError) {
      console.error(`[PUT /bookings/${id}] Update error:`, updateError.message, 'update obj:', JSON.stringify(update));
      return res.status(500).json({ ok: false, error: updateError.message });
    }
    if (!data) return res.status(404).json({ ok: false, error: 'Booking not found' });

    // Si se marca como pagada y NO hay participantes con datos de pago → middleware de pago
    // Cuando hay participantes con datos de pago, la lógica de abajo (hasPaymentData) se encarga
    const hasParticipantPayments = Array.isArray(participants) && participants.some(
      (p: any) => (p.paid_amount_cents ?? 0) > 0 || (p.wallet_amount_cents ?? 0) > 0,
    );
    if (status === 'confirmed' && !hasParticipantPayments) {
      const payResult = await recordPayment(id);
      if (!payResult.ok) {
        return res.status(500).json({ ok: false, error: payResult.error ?? 'Error al registrar pago' });
      }
      const { data: refreshed } = await supabase
        .from('bookings')
        .select(SELECT_ONE)
        .eq('id', id)
        .single();
      if (refreshed) Object.assign(data, refreshed);
    }

    // Actualizar participantes si se proporcionaron
    if (Array.isArray(participants)) {
      const organizerPlayerId = (data as any).organizer_player_id;
      const bookingTotalCents = (data as any).total_price_cents ?? 0;
      const hasPaymentData = participants.some(
        (p: any) => (p.paid_amount_cents ?? 0) > 0 || (p.wallet_amount_cents ?? 0) > 0,
      );

      // Obtener club_id para wallet
      const { data: courtRow } = await supabase
        .from('courts').select('club_id')
        .eq('id', (data as any).court_id).maybeSingle();
      const clubIdForWallet = (courtRow as any)?.club_id as string | undefined;

      // Eliminar guests anteriores y upsert organizer
      await supabase.from('booking_participants').delete()
        .eq('booking_id', id).eq('role', 'guest');

      const newParticipantRows: any[] = [];
      for (const p of participants) {
        if (!p.player_id) continue;
        const paidCents = p.paid_amount_cents ?? 0;
        const walletCents = p.wallet_amount_cents ?? 0;
        const isOrganizer = p.player_id === organizerPlayerId;
        const row = {
          booking_id: id,
          player_id: p.player_id,
          role: isOrganizer ? 'organizer' : 'guest',
          share_amount_cents: p.share_amount_cents ?? 0,
          paid_amount_cents: paidCents,
          wallet_amount_cents: walletCents,
          payment_method: p.payment_method ?? null,
          payment_status: paidCents + walletCents > 0 ? 'paid' : 'pending',
        };
        newParticipantRows.push(row);
        if (isOrganizer) {
          // Update organizer using only base columns (always safe)
          await supabase.from('booking_participants')
            .update({ share_amount_cents: row.share_amount_cents, payment_status: row.payment_status })
            .eq('booking_id', id).eq('role', 'organizer');
        }
      }

      // Insertar guests nuevos (solo columnas base)
      const guestRows = newParticipantRows.filter((r) => r.role === 'guest');
      if (guestRows.length > 0) {
        const guestRowsBase = guestRows.map((r: any) => ({
          booking_id: r.booking_id, player_id: r.player_id, role: r.role,
          share_amount_cents: r.share_amount_cents, payment_status: r.payment_status,
        }));
        const { error: gErr } = await supabase.from('booking_participants').insert(guestRowsBase);
        if (gErr) console.error('[PUT /bookings] Guest insert error:', gErr.message);
      }

      // Persistir pagos en payment_transactions y recalcular status
      if (hasPaymentData) {
        await upsertManualPayments(supabase, id, newParticipantRows);
        const newStatus = computeBookingStatus(bookingTotalCents, newParticipantRows);
        await supabase.from('bookings').update({ status: newStatus }).eq('id', id);

        // Descontar saldo de wallet para quienes pagaron con wallet
        if (clubIdForWallet) {
          // Primero borrar débitos anteriores de esta reserva para evitar duplicados
          await supabase.from('wallet_transactions').delete()
            .eq('booking_id', id).eq('type', 'debit');

          for (const p of newParticipantRows) {
            if (p.payment_method === 'wallet' && p.wallet_amount_cents > 0) {
              await supabase.from('wallet_transactions').insert({
                player_id: p.player_id,
                club_id: clubIdForWallet,
                amount_cents: -Math.abs(p.wallet_amount_cents),
                concept: `Pago reserva #${id.slice(0, 8)}`,
                type: 'debit',
                booking_id: id,
                notes: 'Débito automático por pago de reserva',
              });
            }
          }
        }

        const { data: refreshed } = await supabase.from('bookings').select(SELECT_ONE).eq('id', id).maybeSingle();
        if (refreshed) return res.json({ ok: true, booking: refreshed });
      }
    }

    return res.json({ ok: true, booking: data });
  } catch (err) {
    console.error(`[PUT /bookings/${id}] Unhandled error:`, (err as Error).message, (err as Error).stack);
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        updated_at: now,
        cancelled_at: now,
        cancelled_by: 'owner',
        deleted_at: now,
      })
      .eq('id', id)
      .is('deleted_at', null)
      .select('id, status, deleted_at')
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Booking not found' });
    return res.json({ ok: true, booking: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
