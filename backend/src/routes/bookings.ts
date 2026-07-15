import { Router, Request, Response } from 'express';
import { bookingStartIsTooFarInPast, BOOKING_START_PAST_ERROR } from '../lib/bookingStartNotInPast';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { recordPayment } from '../lib/payment';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { findTournamentConflict } from '../lib/tournamentConflicts';
import { isExpiredMatchLock, MATCH_DRAFT_LOCK_MARKER, getAvailableCourtIds } from '../lib/courtConflict';
import { refundStripeBookingPaymentTransactions, refundStripeBookingPaymentForPlayer, resolveClubIdForBooking } from '../services/paymentRefundService';
import crypto from 'crypto';
import { sendBookingRelocatedEmail, sendBookingCancelledByOverrideEmail } from '../lib/mailer';
import { canAccessClub } from '../lib/clubAccess';
import { requireClubOwnerOrAdminOrPortalStaff } from '../middleware/requireClubOwnerOrAdminOrPortalStaff';
import { insertClubChatMention } from '../lib/clubChatMentions';
import { zonedDayRangeUtcIso } from '../lib/zonedDayBounds';
import { clubTimezoneOrDefault } from '../lib/clubTimezone';
import { ensureOpenMatchRecordForBooking, type OpenMatchSyncOpts } from '../lib/matchFromBookingSync';
import { checkWalletBalances, computeBookingStatus, upsertManualPayments } from '../lib/bookingManualPayment';
import {
  collectStripePlayerIds,
  fetchBookingParticipantsForRefund,
  listCashRefundCandidates,
  refundAllBookingParticipants,
  refundBookingParticipant,
  validateCashRefundMap,
  bookingParticipantsHavePayments,
  type CashRefundMap,
} from '../lib/bookingParticipantRefund';
import {
  evaluateBookingRefundPolicy,
  refundPolicyUserMessage,
} from '../lib/bookingCancellationPolicy';
import { resolveAdminRefundPercent } from '../lib/refundPercent';
import { notifyBookingCancellationEmails } from '../lib/bookingCancellationNotify';
import { syncMatchPlayersFromBooking } from '../lib/matchFromBookingSync';
import { assertBookingWithinClubOperatingHours } from '../lib/clubOperatingHours';
import { parseEloRange } from '../lib/openMatchRules';
import { normalizeReservationTypeSlug } from '../lib/reservationTypeSlug';
import {
  cancelDisplacedBookingsForOccupyingReservation,
  contentionStatusForNewMatchBooking,
  overlappingBookingBlocksNewReservation,
  resolveCourtContention,
} from '../lib/courtContentionService';
import { getFrontendUrl } from '../lib/env';
import { getPlayerIdFromBearer } from '../lib/authPlayer';

const router = Router();
router.use(attachAuthContext);

const SELECT_LIST =
  'id, created_at, court_id, organizer_player_id, start_at, end_at, started_at, timezone, total_price_cents, currency, status, reservation_type, court_contention_status, contention_third_paid_at, source_channel, notes, courts(name, club_id, clubs(name)), players!bookings_organizer_player_id_fkey(id, first_name, last_name, phone, elo_rating), booking_participants(player_id, role, payment_status, payment_method, paid_amount_cents, wallet_amount_cents, share_amount_cents, players!booking_participants_player_id_fkey(id, first_name, last_name, phone, elo_rating)), payment_transactions(amount_cents, status, stripe_payment_intent_id, payer_player_id), tournament_booking_links(tournament_id, court_id, tournaments(id, name, registration_mode, tournament_inscriptions(id, status, player_id_1, player_id_2, players_1:players!tournament_inscriptions_player_id_1_fkey(id, first_name, last_name, phone, elo_rating), players_2:players!tournament_inscriptions_player_id_2_fkey(id, first_name, last_name, phone, elo_rating)))), matches(id, visibility, elo_min, elo_max)';
// payment_transactions joined to get per-player payment data (no migration needed)
const SELECT_ONE =
  'id, created_at, updated_at, court_id, organizer_player_id, start_at, end_at, started_at, timezone, total_price_cents, currency, pricing_rule_ids, status, reservation_type, source_channel, cancelled_at, cancelled_by, cancellation_reason, notes, courts(name, club_id, clubs(name)), players!bookings_organizer_player_id_fkey(id, first_name, last_name, email, phone, elo_rating), booking_participants(id, player_id, role, share_amount_cents, payment_status, payment_method, paid_amount_cents, wallet_amount_cents, players!booking_participants_player_id_fkey(id, first_name, last_name, email, phone, elo_rating)), payment_transactions(id, payer_player_id, amount_cents, stripe_payment_intent_id, status), tournament_booking_links(tournament_id, court_id, tournaments(id, name)), matches(id, elo_min, elo_max, visibility, gender)';

/** Maps frontend status values to DB-safe values (partial_payment is not in DB constraint) */
function toDbStatus(status: string): string {
  if (status === 'partial_payment') return 'pending_payment';
  return status;
}

// ─────────────────────────────────────────────────────────────────────────────

/** When a grilla booking linked to a tournament changes time/court, align torneo + hermanas en pista. */
async function propagateTournamentFromBookingUpdate(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  bookingId: string,
  bookingRow: { start_at: string; end_at: string },
): Promise<void> {
  const { data: link } = await supabase
    .from('tournament_booking_links')
    .select('tournament_id')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (!link?.tournament_id) return;

  const tid = String(link.tournament_id);
  const startAt = String(bookingRow.start_at);
  const endAt = String(bookingRow.end_at);
  const durationMin = Math.round(
    (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000,
  );

  await supabase
    .from('tournaments')
    .update({
      start_at: startAt,
      end_at: endAt,
      duration_min: durationMin,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tid);

  const { data: allLinks } = await supabase
    .from('tournament_booking_links')
    .select('booking_id')
    .eq('tournament_id', tid);
  const bookingIds = (allLinks ?? []).map((x: { booking_id: string }) => x.booking_id);

  for (const bid of bookingIds) {
    const { data: row } = await supabase.from('bookings').select('status').eq('id', bid).maybeSingle();
    if ((row as { status?: string } | null)?.status === 'cancelled') continue;
    await supabase
      .from('bookings')
      .update({
        start_at: startAt,
        end_at: endAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bid);
  }

  const { data: courtRows } = await supabase
    .from('bookings')
    .select('id, court_id, status')
    .in('id', bookingIds);
  for (const r of courtRows ?? []) {
    if ((r as { status?: string }).status === 'cancelled') continue;
    await supabase
      .from('tournament_booking_links')
      .update({ court_id: (r as { court_id: string }).court_id })
      .eq('booking_id', (r as { id: string }).id);
  }

  const activeCourts = (courtRows ?? [])
    .filter((r: { status?: string }) => r.status !== 'cancelled')
    .map((r: { court_id: string }) => r.court_id);
  const distinctCourts = [...new Set(activeCourts)];

  await supabase.from('tournament_courts').delete().eq('tournament_id', tid);
  if (distinctCourts.length) {
    await supabase
      .from('tournament_courts')
      .insert(distinctCourts.map((court_id) => ({ tournament_id: tid, court_id })));
  }
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
  reservationType?: string;
  occupiesCourtImmediately?: boolean;
}): Promise<{ conflict: boolean; reason?: string }> {
  const supabase = getSupabaseServiceRoleClient();
  const startMs = new Date(params.startAt).getTime();
  const endMs = new Date(params.endAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    return { conflict: true, reason: 'Rango horario inválido' };
  }

  const { data: courtRow, error: cMetaErr } = await supabase
    .from('courts')
    .select('club_id, is_hidden, status')
    .eq('id', params.courtId)
    .maybeSingle();
  if (cMetaErr) return { conflict: true, reason: cMetaErr.message };
  if (!courtRow) return { conflict: true, reason: 'Pista no encontrada' };
  if ((courtRow as { is_hidden?: boolean | null }).is_hidden) {
    return { conflict: true, reason: 'Esta pista no admite reservas (uso interno)' };
  }
  const cStatus = (courtRow as { status?: string | null }).status;
  if (cStatus && cStatus !== 'operational') {
    return { conflict: true, reason: 'La pista no está operativa' };
  }
  const preClubId = (courtRow as { club_id?: string | null }).club_id;

  const newType = normalizeReservationTypeSlug(params.reservationType ?? 'standard');
  const occupiesImmediately = params.occupiesCourtImmediately ?? true;

  let q = supabase
    .from('bookings')
    .select('id, start_at, end_at, status, notes, reservation_type, court_contention_status')
    .eq('court_id', params.courtId)
    .neq('status', 'cancelled')
    .is('deleted_at', null);
  if (params.excludeBookingId) q = q.neq('id', params.excludeBookingId);
  const { data: existingBookings, error: bErr } = await q;
  if (bErr) return { conflict: true, reason: bErr.message };
  const bookingOverlap = (existingBookings ?? []).some((b: any) => {
    if (isExpiredMatchLock(b.notes)) return false;
    return overlappingBookingBlocksNewReservation(b, startMs, endMs, newType, occupiesImmediately);
  });
  if (bookingOverlap) {
    return { conflict: true, reason: 'La pista ya tiene una reserva en ese horario' };
  }

  // 2) Conflicto contra cursos de escuela activos
  const clubId = preClubId ?? null;
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

const MATCH_LOCK_TTL_MS = 5 * 60 * 1000;

/**
 * POST /bookings/block
 * Creates a short-lived "draft match" lock on a court slot so it cannot be
 * taken by a concurrent mobile booking while the admin fills the match form.
 * Body: { court_id, start_at, end_at }
 * Returns: { ok, block_id, expires_at }
 */
router.post('/block', async (req: Request, res: Response) => {
  const { court_id, start_at, end_at } = req.body ?? {};
  if (!court_id || !start_at || !end_at) {
    return res.status(400).json({ ok: false, error: 'court_id, start_at y end_at son obligatorios' });
  }
  if (bookingStartIsTooFarInPast(String(start_at))) {
    return res.status(400).json({ ok: false, error: BOOKING_START_PAST_ERROR });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    // Lazy cleanup: drop any expired draft locks on this court before conflict check
    const { data: stale } = await supabase
      .from('bookings')
      .select('id, notes')
      .eq('court_id', court_id)
      .eq('reservation_type', 'blocked')
      .like('notes', `${MATCH_DRAFT_LOCK_MARKER}%`);
    const expiredIds = (stale ?? [])
      .filter((r: { notes?: string | null }) => isExpiredMatchLock(r.notes))
      .map((r: { id: string }) => r.id);
    if (expiredIds.length) {
      await supabase.from('bookings').delete().in('id', expiredIds);
    }
    const hoursCheck = await assertBookingWithinClubOperatingHours(supabase, {
      courtId: String(court_id),
      startAt: String(start_at),
      endAt: String(end_at),
      reservationType: 'blocked',
    });
    if (!hoursCheck.ok) {
      return res.status(400).json({ ok: false, error: hoursCheck.error });
    }
    const conflict = await hasCourtConflict({ courtId: String(court_id), startAt: String(start_at), endAt: String(end_at) });
    if (conflict.conflict) {
      return res.status(409).json({ ok: false, error: conflict.reason ?? 'Conflicto de horario' });
    }
    const expiresAt = new Date(Date.now() + MATCH_LOCK_TTL_MS).toISOString();
    const { data, error } = await supabase
      .from('bookings')
      .insert({
        court_id,
        organizer_player_id: null,
        start_at,
        end_at,
        timezone: 'Europe/Madrid',
        total_price_cents: 0,
        currency: 'EUR',
        status: 'pending_payment',
        notes: `${MATCH_DRAFT_LOCK_MARKER}:${expiresAt}`,
        reservation_type: 'blocked',
        source_channel: 'manual',
      })
      .select('id')
      .single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(201).json({ ok: true, block_id: (data as { id: string }).id, expires_at: expiresAt });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * DELETE /bookings/block/:id
 * Releases a match draft lock. Only deletes if the target booking is a draft lock.
 */
router.delete('/block/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: existing, error: exErr } = await supabase
      .from('bookings')
      .select('id, notes, reservation_type')
      .eq('id', id)
      .maybeSingle();
    if (exErr) return res.status(500).json({ ok: false, error: exErr.message });
    if (!existing) return res.json({ ok: true, released: false });
    const row = existing as { notes?: string | null; reservation_type?: string };
    if (row.reservation_type !== 'blocked' || !row.notes?.includes(MATCH_DRAFT_LOCK_MARKER)) {
      return res.status(400).json({ ok: false, error: 'El booking no es un draft lock' });
    }
    const { error: delErr } = await supabase.from('bookings').delete().eq('id', id);
    if (delErr) return res.status(500).json({ ok: false, error: delErr.message });
    return res.json({ ok: true, released: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /bookings/block-maintenance
 * Blocks a court for a full day. If existing bookings are found, attempts to
 * relocate each one to another free court at the same time. If any booking
 * cannot be relocated the operation is aborted and the caller is informed.
 */
router.post('/block-maintenance', async (req: Request, res: Response) => {
  const { court_id, date, reason } = req.body ?? {};
  if (!court_id || !date) {
    return res.status(400).json({ ok: false, error: 'court_id y date son obligatorios' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();

    // Resolve club_id from court
    const { data: courtRow, error: cErr } = await supabase
      .from('courts')
      .select('club_id')
      .eq('id', court_id)
      .maybeSingle();
    if (cErr) return res.status(500).json({ ok: false, error: cErr.message });
    const clubId = (courtRow as { club_id?: string } | null)?.club_id;
    if (!clubId) return res.status(404).json({ ok: false, error: 'Pista no encontrada' });

    // Find all active bookings on this court for the given date
    const dayStart = `${date}T00:00:00`;
    const dayEnd = `${date}T23:59:59`;
    const { data: existing, error: bErr } = await supabase
      .from('bookings')
      .select('id, start_at, end_at, status, reservation_type, notes, organizer_player_id, players!bookings_organizer_player_id_fkey(first_name, last_name)')
      .eq('court_id', court_id)
      .neq('status', 'cancelled')
      .is('deleted_at', null)
      .gte('start_at', dayStart)
      .lte('start_at', dayEnd);
    if (bErr) return res.status(500).json({ ok: false, error: bErr.message });

    // Filter out expired draft locks
    const bookingsToMove = (existing ?? []).filter((b: any) => !isExpiredMatchLock(b.notes));

    // For each booking, find a free court at the same time
    const relocations: { bookingId: string; toCourt: string; startAt: string; endAt: string; playerName: string }[] = [];
    const conflicts: { bookingId: string; startAt: string; endAt: string; playerName: string }[] = [];

    for (const b of bookingsToMove as any[]) {
      const playerName = b.players ? `${b.players.first_name} ${b.players.last_name}` : 'Sin jugador';
      const result = await getAvailableCourtIds(clubId, b.start_at, b.end_at, b.id);
      if (!result.ok) {
        conflicts.push({ bookingId: b.id, startAt: b.start_at, endAt: b.end_at, playerName });
        continue;
      }
      // Exclude the court being blocked
      const available = result.courtIds.filter((id: string) => id !== court_id);
      if (available.length === 0) {
        conflicts.push({ bookingId: b.id, startAt: b.start_at, endAt: b.end_at, playerName });
      } else {
        relocations.push({ bookingId: b.id, toCourt: available[0], startAt: b.start_at, endAt: b.end_at, playerName });
      }
    }

    if (conflicts.length > 0) {
      const details = conflicts.map(c => {
        const start = c.startAt.slice(11, 16);
        const end = c.endAt.slice(11, 16);
        return `${c.playerName} (${start}–${end})`;
      });
      return res.status(409).json({
        ok: false,
        error: `No se puede bloquear la pista porque ${conflicts.length === 1 ? 'la siguiente reserva no tiene' : 'las siguientes reservas no tienen'} pista alternativa disponible`,
        conflicts,
        details,
      });
    }

    // All bookings can be relocated — execute moves
    for (const r of relocations) {
      const { error: moveErr } = await supabase
        .from('bookings')
        .update({ court_id: r.toCourt, updated_at: new Date().toISOString() })
        .eq('id', r.bookingId);
      if (moveErr) {
        return res.status(500).json({ ok: false, error: `Error al mover reserva ${r.bookingId}: ${moveErr.message}` });
      }
    }

    // Create the maintenance block
    const startHour = '07';
    const endHour = '23';
    const { data: blockData, error: blockErr } = await supabase
      .from('bookings')
      .insert({
        court_id,
        organizer_player_id: null,
        start_at: `${date}T${startHour}:00:00`,
        end_at: `${date}T${endHour}:00:00`,
        timezone: 'Europe/Madrid',
        total_price_cents: 0,
        currency: 'EUR',
        status: 'confirmed',
        notes: `__COURT_MAINTENANCE__: ${(reason || 'Mantenimiento').trim()}`,
        reservation_type: 'blocked',
        source_channel: 'manual',
      })
      .select('id')
      .single();
    if (blockErr) return res.status(500).json({ ok: false, error: blockErr.message });

    return res.status(201).json({
      ok: true,
      block_id: (blockData as { id: string }).id,
      relocated: relocations.map(r => ({
        booking_id: r.bookingId,
        to_court: r.toCourt,
        start_at: r.startAt,
        end_at: r.endAt,
        player_name: r.playerName,
      })),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

const COURT_MAINTENANCE_PREFIX = '__COURT_MAINTENANCE__';

/**
 * @openapi
 * /bookings/bulk-block-slots:
 *   post:
 *     tags: [Bookings]
 *     summary: Bloquear varios tramos de pista (mantenimiento o torneo)
 *     description: |
 *       Crea bloqueos en lote para los tramos indicados. Solo inserta slots sin conflicto;
 *       no cancela reservas existentes ni desplaza jugadores.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ranges]
 *             properties:
 *               booking_type:
 *                 type: string
 *                 enum: [blocked, tournament]
 *                 default: blocked
 *               reason:
 *                 type: string
 *                 example: Mantenimiento
 *               ranges:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [court_id, start_at, end_at]
 *                   properties:
 *                     court_id:
 *                       type: string
 *                       format: uuid
 *                     start_at:
 *                       type: string
 *                       format: date-time
 *                     end_at:
 *                       type: string
 *                       format: date-time
 *           example:
 *             booking_type: blocked
 *             reason: Cambio de césped
 *             ranges:
 *               - court_id: "00000000-0000-0000-0000-000000000001"
 *                 start_at: "2026-07-01T09:00:00.000Z"
 *                 end_at: "2026-07-01T11:00:00.000Z"
 *     responses:
 *       201:
 *         description: Bloqueos creados (puede incluir tramos omitidos por conflicto)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 created: { type: integer }
 *                 skipped:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       court_id: { type: string }
 *                       start_at: { type: string }
 *                       end_at: { type: string }
 *                       error: { type: string }
 *       400:
 *         description: Petición inválida
 *       409:
 *         description: Ningún tramo válido
 */
router.post('/bulk-block-slots', async (req: Request, res: Response) => {
  const { ranges, booking_type, reason } = req.body ?? {};
  if (!Array.isArray(ranges) || ranges.length === 0) {
    return res.status(400).json({ ok: false, error: 'ranges es obligatorio y no puede estar vacío' });
  }

  const reservationType = normalizeReservationTypeSlug(booking_type ?? 'blocked');
  if (reservationType !== 'blocked' && reservationType !== 'tournament') {
    return res.status(400).json({ ok: false, error: 'booking_type debe ser blocked o tournament' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const trimmedReason = String(reason ?? '').trim() || (reservationType === 'tournament' ? 'Torneo' : 'Mantenimiento');
    const notes =
      reservationType === 'blocked'
        ? `${COURT_MAINTENANCE_PREFIX}: ${trimmedReason}`
        : trimmedReason;

    const toInsert: Record<string, unknown>[] = [];
    const skipped: { court_id: string; start_at: string; end_at: string; error: string }[] = [];
    const timezoneByCourt = new Map<string, string>();
    let merged = 0;

    for (const range of ranges) {
      const court_id = range?.court_id;
      const start_at = range?.start_at;
      const end_at = range?.end_at;
      if (!court_id || !start_at || !end_at) {
        skipped.push({
          court_id: String(court_id ?? ''),
          start_at: String(start_at ?? ''),
          end_at: String(end_at ?? ''),
          error: 'court_id, start_at y end_at son obligatorios',
        });
        continue;
      }
      if (bookingStartIsTooFarInPast(String(start_at))) {
        skipped.push({
          court_id: String(court_id),
          start_at: String(start_at),
          end_at: String(end_at),
          error: BOOKING_START_PAST_ERROR,
        });
        continue;
      }

      const hoursCheck = await assertBookingWithinClubOperatingHours(supabase, {
        courtId: String(court_id),
        startAt: String(start_at),
        endAt: String(end_at),
        reservationType,
      });
      if (!hoursCheck.ok) {
        skipped.push({
          court_id: String(court_id),
          start_at: String(start_at),
          end_at: String(end_at),
          error: hoursCheck.error,
        });
        continue;
      }

      if (reservationType === 'blocked') {
        const startMs = new Date(String(start_at)).getTime();
        const endMs = new Date(String(end_at)).getTime();
        const { data: maintRows } = await supabase
          .from('bookings')
          .select('id, start_at, end_at, notes')
          .eq('court_id', court_id)
          .eq('reservation_type', 'blocked')
          .neq('status', 'cancelled')
          .is('deleted_at', null)
          .like('notes', `${COURT_MAINTENANCE_PREFIX}%`);
        const overlapping = (maintRows ?? []).find((row: { start_at: string; end_at: string; notes?: string | null }) => {
          if (!row.notes?.includes(COURT_MAINTENANCE_PREFIX)) return false;
          const rStart = new Date(row.start_at).getTime();
          const rEnd = new Date(row.end_at).getTime();
          return startMs <= rEnd && endMs >= rStart;
        }) as { id: string; start_at: string; end_at: string } | undefined;
        if (overlapping) {
          const mergedStart = new Date(Math.min(startMs, new Date(overlapping.start_at).getTime())).toISOString();
          const mergedEnd = new Date(Math.max(endMs, new Date(overlapping.end_at).getTime())).toISOString();
          const { error: updErr } = await supabase
            .from('bookings')
            .update({ start_at: mergedStart, end_at: mergedEnd, notes, updated_at: new Date().toISOString() })
            .eq('id', overlapping.id);
          if (updErr) {
            skipped.push({ court_id: String(court_id), start_at: String(start_at), end_at: String(end_at), error: updErr.message });
          } else {
            merged += 1;
          }
          continue;
        }
      }

      const conflict = await hasCourtConflict({
        courtId: String(court_id),
        startAt: String(start_at),
        endAt: String(end_at),
        reservationType,
        occupiesCourtImmediately: true,
      });
      if (conflict.conflict) {
        skipped.push({
          court_id: String(court_id),
          start_at: String(start_at),
          end_at: String(end_at),
          error: conflict.reason ?? 'Conflicto de horario',
        });
        continue;
      }

      let bookingTimezone = timezoneByCourt.get(String(court_id));
      if (!bookingTimezone) {
        const { data: courtData } = await supabase
          .from('courts')
          .select('club:clubs(timezone)')
          .eq('id', court_id)
          .maybeSingle();
        bookingTimezone = clubTimezoneOrDefault(
          (courtData as { club?: { timezone?: string | null } } | null)?.club?.timezone,
        );
        timezoneByCourt.set(String(court_id), bookingTimezone);
      }

      toInsert.push({
        court_id,
        organizer_player_id: null,
        start_at,
        end_at,
        timezone: bookingTimezone,
        total_price_cents: 0,
        currency: 'EUR',
        status: 'confirmed',
        notes,
        reservation_type: reservationType,
        source_channel: 'manual',
      });
    }

    if (toInsert.length === 0) {
      return res.status(409).json({
        ok: false,
        error: 'Ningún tramo válido para bloquear',
        skipped,
      });
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('bookings')
      .insert(toInsert)
      .select('id');
    if (insertErr) return res.status(500).json({ ok: false, error: insertErr.message });

    return res.status(201).json({
      ok: true,
      created: (inserted ?? []).length,
      merged,
      skipped,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /bookings:
 *   get:
 *     tags: [Bookings]
 *     summary: Listar reservas
 *     parameters:
 *       - in: query
 *         name: club_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: court_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: organizer_player_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: date
 *         description: YYYY-MM-DD; día civil en `time_zone` (no medianoche UTC). Mutuamente excluyente con date_from/date_to.
 *         schema: { type: string, example: "2026-05-12" }
 *       - in: query
 *         name: date_from
 *         description: YYYY-MM-DD inicio de rango (inclusive). Requiere date_to.
 *         schema: { type: string, example: "2026-05-01" }
 *       - in: query
 *         name: date_to
 *         description: YYYY-MM-DD fin de rango (inclusive). Requiere date_from.
 *         schema: { type: string, example: "2026-05-07" }
 *       - in: query
 *         name: time_zone
 *         description: IANA (por defecto Europe/Madrid).
 *         schema: { type: string, example: "Europe/Madrid" }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               bookings: []
 *       400:
 *         description: date, date_from/date_to o time_zone inválidos
 */
router.get('/', async (req: Request, res: Response) => {
  const court_id = req.query.court_id as string | undefined;
  const club_id = req.query.club_id as string | undefined;
  const organizer_player_id = req.query.organizer_player_id as string | undefined;
  const date = req.query.date as string | undefined; // YYYY-MM-DD
  const date_from = req.query.date_from as string | undefined;
  const date_to = req.query.date_to as string | undefined;
  const time_zone = String(req.query.time_zone ?? 'Europe/Madrid').trim() || 'Europe/Madrid';
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

    const isRangeQuery = Boolean(date_from && date_to);
    const rangeLimit = isRangeQuery ? 2000 : 200;

    let q = supabase
      .from('bookings')
      .select(SELECT_LIST)
      .order('start_at', { ascending: true })
      .limit(rangeLimit);

    if (courtIdsForClub) q = q.in('court_id', courtIdsForClub);
    else if (court_id) q = q.eq('court_id', court_id);

    if (organizer_player_id) q = q.eq('organizer_player_id', organizer_player_id);
    if (isRangeQuery) {
      try {
        const from = date_from! <= date_to! ? date_from! : date_to!;
        const to = date_from! <= date_to! ? date_to! : date_from!;
        const { start } = zonedDayRangeUtcIso(from, time_zone);
        const { endExclusive } = zonedDayRangeUtcIso(to, time_zone);
        q = q.gte('start_at', start).lt('start_at', endExclusive);
      } catch {
        return res.status(400).json({ ok: false, error: 'date_from, date_to o time_zone invalida' });
      }
    } else if (date) {
      try {
        const { start, endExclusive } = zonedDayRangeUtcIso(date, time_zone);
        q = q.gte('start_at', start).lt('start_at', endExclusive);
      } catch {
        return res.status(400).json({ ok: false, error: 'date o time_zone invalida' });
      }
    }
    q = q.neq('status', 'cancelled').is('deleted_at', null);
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    // Filter out match draft locks — they're ephemeral soft-locks from the match creation modal
    const filtered = (data ?? []).filter((b: any) => !(b.reservation_type === 'blocked' && typeof b.notes === 'string' && b.notes.includes(MATCH_DRAFT_LOCK_MARKER)));
    return res.json({ ok: true, bookings: filtered });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * GET /bookings/mine/court-reservations
 * Reservas de pista privada (`standard`) del jugador autenticado — sin partido asociado.
 */
router.get('/mine/court-reservations', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });

  const phaseRaw = String(req.query.phase ?? 'upcoming').trim().toLowerCase();
  const phase = phaseRaw === 'past' || phaseRaw === 'all' ? phaseRaw : 'upcoming';
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(req.query.limit) || 50)));

  try {
    const supabase = getSupabaseServiceRoleClient();
    const nowIso = new Date().toISOString();

    let q = supabase
      .from('bookings')
      .select(
        'id, court_id, organizer_player_id, start_at, end_at, total_price_cents, currency, status, reservation_type, courts(name, club_id, clubs(name))',
      )
      .eq('organizer_player_id', playerId)
      .eq('reservation_type', 'standard')
      .neq('status', 'cancelled')
      .is('deleted_at', null)
      .order('start_at', { ascending: phase !== 'past' })
      .limit(limit);

    if (phase === 'upcoming') {
      q = q.gte('end_at', nowIso);
    } else if (phase === 'past') {
      q = q.lt('end_at', nowIso);
    }

    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const bookingIds = (data ?? []).map((b: { id: string }) => b.id);
    let matchBookingIds = new Set<string>();
    if (bookingIds.length > 0) {
      const { data: matchRows } = await supabase
        .from('matches')
        .select('booking_id')
        .in('booking_id', bookingIds);
      matchBookingIds = new Set(
        (matchRows ?? [])
          .map((r: { booking_id?: string | null }) => r.booking_id)
          .filter((id): id is string => Boolean(id)),
      );
    }

    const reservations = (data ?? [])
      .filter((row: { id: string }) => !matchBookingIds.has(row.id))
      .map((row: any) => {
        const rawCourt = row.courts;
        const court = Array.isArray(rawCourt) ? rawCourt[0] : rawCourt;
        const rawClub = court?.clubs;
        const club = Array.isArray(rawClub) ? rawClub[0] : rawClub;
        return {
          id: row.id,
          court_id: row.court_id,
          court_name: court?.name ?? null,
          club_id: court?.club_id ?? null,
          club_name: club?.name ?? null,
          start_at: row.start_at,
          end_at: row.end_at,
          total_price_cents: Number(row.total_price_cents ?? 0),
          currency: row.currency ?? 'EUR',
          status: row.status,
        };
      });

    return res.json({ ok: true, reservations });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

type CourtReservationCancelContext =
  | {
      ok: true;
      booking: {
        id: string;
        organizer_player_id: string | null;
        start_at: string;
        end_at: string;
        status: string;
        reservation_type: string;
      };
      clubId: string;
    }
  | { ok: false; status: number; error: string };

async function loadCourtReservationForPlayerCancel(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  bookingId: string,
  playerId: string,
): Promise<CourtReservationCancelContext> {
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('id, organizer_player_id, start_at, end_at, status, reservation_type, deleted_at')
    .eq('id', bookingId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!booking || booking.deleted_at != null) {
    return { ok: false, status: 404, error: 'Reserva no encontrada' };
  }
  if (booking.organizer_player_id !== playerId) {
    return { ok: false, status: 403, error: 'No eres el organizador de esta reserva' };
  }
  if ((booking.reservation_type ?? '') !== 'standard') {
    return { ok: false, status: 400, error: 'Esta acción solo aplica a reservas de pista' };
  }
  if (booking.status === 'cancelled') {
    return { ok: false, status: 400, error: 'La reserva ya está cancelada' };
  }
  if (new Date(booking.end_at).getTime() <= Date.now()) {
    return { ok: false, status: 400, error: 'La reserva ya finalizó' };
  }

  const { data: matchRow } = await supabase
    .from('matches')
    .select('id')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (matchRow?.id) {
    return { ok: false, status: 400, error: 'Esta reserva tiene un partido asociado' };
  }

  const clubId = await resolveClubIdForBooking(supabase, bookingId);
  if (!clubId) {
    return { ok: false, status: 500, error: 'No se pudo resolver el club de la reserva' };
  }

  return { ok: true, booking, clubId };
}

/**
 * GET /bookings/:id/cancel-preview
 * Política de reembolso antes de cancelar una reserva de pista (`standard` sin partido).
 */
router.get('/:id/cancel-preview', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });

  try {
    const supabase = getSupabaseServiceRoleClient();
    const loaded = await loadCourtReservationForPlayerCancel(supabase, id, playerId);
    if (!loaded.ok) {
      return res.status(loaded.status).json({ ok: false, error: loaded.error });
    }

    const refundPolicy = await evaluateBookingRefundPolicy(supabase, id);
    return res.json({
      ok: true,
      refund_eligible: refundPolicy.eligible,
      notice_hours: refundPolicy.notice_hours,
      incomplete_public_exempt: refundPolicy.incomplete_public_exempt,
      hours_until_start: Math.round(refundPolicy.hours_until_start * 10) / 10,
      policy_message: refundPolicyUserMessage(refundPolicy),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /bookings/:id/cancel
 * Cancela reserva de pista del organizador y aplica reembolso según política del club.
 */
router.post('/:id/cancel', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });

  try {
    const supabase = getSupabaseServiceRoleClient();
    const loaded = await loadCourtReservationForPlayerCancel(supabase, id, playerId);
    if (!loaded.ok) {
      return res.status(loaded.status).json({ ok: false, error: loaded.error });
    }

    const refundPolicy = await evaluateBookingRefundPolicy(supabase, id);
    const now = new Date().toISOString();
    const refundErrors: string[] = [];

    if (refundPolicy.eligible) {
      const participants = await fetchBookingParticipantsForRefund(supabase, id);
      for (const row of participants) {
        if (String(row.payment_status ?? '') !== 'paid') continue;
        const result = await refundBookingParticipant(supabase, id, loaded.clubId, row, {
          concept: 'Reembolso por cancelación de reserva de pista',
          refundEligible: true,
          refundPercent: 100,
          now,
        });
        refundErrors.push(...result.errors);
      }
    }

    if (refundErrors.length > 0) {
      return res.status(502).json({
        ok: false,
        error: 'No se pudieron completar los reembolsos. La reserva no se canceló.',
        refund_errors: refundErrors,
      });
    }

    const { error: upErr } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        updated_at: now,
        cancelled_at: now,
        cancelled_by: 'player',
        deleted_at: now,
      })
      .eq('id', id)
      .is('deleted_at', null);
    if (upErr) return res.status(500).json({ ok: false, error: upErr.message });

    void notifyBookingCancellationEmails(supabase, {
      bookingId: id,
      scenario: 'cancelled',
      cancelledBy: 'player',
      refundPercent: refundPolicy.eligible ? 100 : 0,
      refundEligible: refundPolicy.eligible,
      policyMessage: refundPolicyUserMessage(refundPolicy),
    });

    return res.json({
      ok: true,
      refund_eligible: refundPolicy.eligible,
      policy_message: refundPolicy.eligible ? undefined : refundPolicyUserMessage(refundPolicy),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ─── Chat por turno (booking) ────────────────────────────────────────────────

const BOOKING_CHAT_BODY_MAX = 2000;

function canAccessBookingChat(req: Request, clubId: string): boolean {
  return canAccessClub(req, clubId, ['grilla', 'clientes']);
}

async function resolveBookingChatAuthorName(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  authUserId: string,
): Promise<string> {
  let authorName = 'Staff';
  const { data: owner } = await supabase
    .from('club_owners')
    .select('name')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (owner?.name) authorName = owner.name as string;
  const { data: player } = await supabase
    .from('players')
    .select('first_name, last_name')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (player) {
    const fn = String((player as { first_name?: string }).first_name || '').trim();
    const ln = String((player as { last_name?: string }).last_name || '').trim();
    authorName = `${fn} ${ln}`.trim() || authorName;
  }
  return authorName;
}

async function loadBookingChatContext(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  bookingId: string,
): Promise<{ clubId: string } | null> {
  const { data } = await supabase
    .from('bookings')
    .select('id, court_id, courts(club_id)')
    .eq('id', bookingId)
    .maybeSingle();
  if (!data) return null;
  const clubId = String((data as { courts?: { club_id?: string } }).courts?.club_id ?? '');
  if (!clubId) return null;
  return { clubId };
}

/**
 * @openapi
 * /bookings/{id}/chat:
 *   get:
 *     tags: [Bookings]
 *     summary: Mensajes del chat de un turno (portal)
 *     description: |
 *       Lista mensajes del chat asociado a una reserva (turno). Cada turno tiene su propio chat,
 *       agrupado por pista + fecha + hora. Requiere permiso de grilla o clientes en el club.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Lista de mensajes
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value: { ok: true, messages: [{ id: "…", created_at: "…", author_user_id: "…", author_name: "Ana", message: "Hola" }] }
 *       401: { description: Token requerido }
 *       403: { description: Sin acceso al club }
 *       404: { description: Reserva no encontrada }
 */
router.get('/:id/chat', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const ctx = await loadBookingChatContext(supabase, id);
    if (!ctx) return res.status(404).json({ ok: false, error: 'Reserva no encontrada' });
    if (!canAccessBookingChat(req, ctx.clubId)) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }
    const { data, error } = await supabase
      .from('booking_chat_messages')
      .select('id, created_at, author_user_id, author_name, message')
      .eq('booking_id', id)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, messages: data ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /bookings/{id}/chat:
 *   post:
 *     tags: [Bookings]
 *     summary: Enviar mensaje al chat de un turno (portal)
 *     description: |
 *       Si el texto incluye la mención `@club`, se registra una fila en notificaciones del club
 *       (consultar GET /clubs/{id}/chat-mentions).
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
 *             required: [message]
 *             properties:
 *               message: { type: string, example: "¿Hay pelotas nuevas? @club" }
 *     responses:
 *       200:
 *         description: Mensaje creado
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value: { ok: true, message: { id: "…", created_at: "…", author_user_id: "…", author_name: "Ana", message: "Hola" } }
 *       400: { description: message vacío o demasiado largo }
 *       401: { description: Token requerido }
 *       403: { description: Sin acceso al club }
 *       404: { description: Reserva no encontrada }
 */
router.post('/:id/chat', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const { id } = req.params;
  const message = String(req.body?.message ?? '').trim();
  if (!message) return res.status(400).json({ ok: false, error: 'message es obligatorio' });
  if (message.length > BOOKING_CHAT_BODY_MAX) {
    return res.status(400).json({ ok: false, error: `El mensaje debe tener como máximo ${BOOKING_CHAT_BODY_MAX} caracteres` });
  }
  if (!req.authContext?.userId) return res.status(401).json({ ok: false, error: 'Token requerido' });
  try {
    const supabase = getSupabaseServiceRoleClient();
    const ctx = await loadBookingChatContext(supabase, id);
    if (!ctx) return res.status(404).json({ ok: false, error: 'Reserva no encontrada' });
    if (!canAccessBookingChat(req, ctx.clubId)) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }

    const authorName = await resolveBookingChatAuthorName(supabase, req.authContext.userId);
    const { data, error } = await supabase
      .from('booking_chat_messages')
      .insert({
        booking_id: id,
        author_user_id: req.authContext.userId,
        author_name: authorName,
        message,
      })
      .select('id, created_at, author_user_id, author_name, message')
      .single();
    if (error) return res.status(500).json({ ok: false, error: error.message });

    try {
      await insertClubChatMention(supabase, {
        clubId: ctx.clubId,
        sourceType: 'booking',
        bookingId: id,
        sourceMessageId: data.id as string,
        authorUserId: req.authContext.userId,
        authorName,
        message,
      });
    } catch (mentionErr) {
      console.error('club_chat_mention (booking):', mentionErr);
    }

    return res.json({ ok: true, message: data });
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
  if (!canAccessClub(req, clubId, 'grilla')) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
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
    if (!clubId || !canAccessClub(req, clubId, 'grilla')) {
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
    elo_min,
    elo_max,
  } = req.body ?? {};

  if (!court_id || !start_at || !end_at || total_price_cents == null) {
    return res.status(400).json({
      ok: false,
      error: 'court_id, start_at, end_at, total_price_cents son obligatorios',
    });
  }

  const typesWithoutOrganizer = ['blocked', 'tournament'];
  const needsOrganizer = !typesWithoutOrganizer.includes(booking_type);
  if (needsOrganizer && !organizer_player_id) {
    return res.status(400).json({
      ok: false,
      error: 'organizer_player_id es obligatorio para booking_type=' + (booking_type ?? 'standard'),
    });
  }

  if (bookingStartIsTooFarInPast(String(start_at))) {
    return res.status(400).json({ ok: false, error: BOOKING_START_PAST_ERROR });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();

    const hoursCheck = await assertBookingWithinClubOperatingHours(supabase, {
      courtId: String(court_id),
      startAt: String(start_at),
      endAt: String(end_at),
      reservationType: booking_type ?? 'standard',
    });
    if (!hoursCheck.ok) {
      return res.status(400).json({ ok: false, error: hoursCheck.error });
    }

    // Reservas manuales desde grilla: el mismo cliente puede figurar en varias pistas a la misma hora (bloqueo grupal).
    const skipOrganizerOverlap = source_channel === 'manual';

    // Check player conflict — block only if the player is already in another booking at the SAME time
    if (organizer_player_id && !skipOrganizerOverlap) {
      const newStartMs = new Date(String(start_at)).getTime();
      const newEndMs = new Date(String(end_at)).getTime();

      const overlaps = (bookings: { start_at: string; end_at: string }[]): boolean =>
        bookings.some((b) => {
          const s = new Date(b.start_at).getTime();
          const e = new Date(b.end_at).getTime();
          return newStartMs < e && newEndMs > s;
        });

      // 1a. Bookings where the player is the organizer
      const { data: orgBookings } = await supabase
        .from('bookings')
        .select('start_at, end_at')
        .eq('organizer_player_id', String(organizer_player_id))
        .neq('status', 'cancelled')
        .is('deleted_at', null);

      if (overlaps(orgBookings ?? [])) {
        return res.status(409).json({ ok: false, error: 'El jugador ya tiene una reserva en ese horario' });
      }

      // 1b. Bookings where the player is a participant
      const { data: participations } = await supabase
        .from('booking_participants')
        .select('booking_id')
        .eq('player_id', String(organizer_player_id));

      const bIds = [...new Set((participations ?? []).map((p: any) => p.booking_id).filter(Boolean))];
      if (bIds.length > 0) {
        const { data: partBookings } = await supabase
          .from('bookings')
          .select('start_at, end_at')
          .in('id', bIds)
          .neq('status', 'cancelled')
          .is('deleted_at', null);

        if (overlaps(partBookings ?? [])) {
          return res.status(409).json({ ok: false, error: 'El jugador ya tiene una reserva en ese horario' });
        }
      }
    }

    const wantConfirmed = status === 'confirmed';
    const reservationType = normalizeReservationTypeSlug(booking_type ?? 'standard');

    let openMatchElo: OpenMatchSyncOpts | undefined;
    if (reservationType === 'open_match') {
      const eloParsed = parseEloRange(elo_min, elo_max);
      if (!eloParsed.ok) return res.status(400).json({ ok: false, error: eloParsed.error });
      openMatchElo = { elo_min: eloParsed.elo_min, elo_max: eloParsed.elo_max };
    }

    const previewParticipantRows: Array<{ paid_amount_cents?: number; wallet_amount_cents?: number }> = [];
    if (Array.isArray(participants)) {
      for (const p of participants) {
        if (!p?.player_id) continue;
        previewParticipantRows.push({
          paid_amount_cents: p.paid_amount_cents ?? 0,
          wallet_amount_cents: p.wallet_amount_cents ?? 0,
        });
      }
    }
    const wouldBeFullyPaid =
      wantConfirmed && !organizer_player_id
        ? true
        : previewParticipantRows.length > 0
          ? computeBookingStatus(Number(total_price_cents), previewParticipantRows as any) === 'confirmed'
          : false;
    const occupiesCourtImmediately =
      reservationType === 'standard'
        ? true
        : reservationType === 'open_match'
          ? wouldBeFullyPaid
          : true;

    const conflict = await hasCourtConflict({
      courtId: String(court_id),
      startAt: String(start_at),
      endAt: String(end_at),
      reservationType,
      occupiesCourtImmediately,
    });
    if (conflict.conflict) {
      return res.status(409).json({ ok: false, error: conflict.reason ?? 'Conflicto de horario' });
    }

    const courtContentionStatus = contentionStatusForNewMatchBooking(reservationType, wouldBeFullyPaid);

    // Club de la pista: define el timezone de la reserva (no el dispositivo) y
    // se reutiliza para las wallet transactions.
    const { data: courtData } = await supabase
      .from('courts')
      .select('club_id, club:clubs(timezone)')
      .eq('id', court_id)
      .maybeSingle();
    const clubIdForWallet = (courtData as { club_id?: string } | null)?.club_id as string | undefined;
    const bookingTimezone = clubTimezoneOrDefault(
      (courtData as { club?: { timezone?: string | null } } | null)?.club?.timezone
        ?? (typeof timezone === 'string' ? timezone : null),
    );

    // 1. Insert Booking (siempre como pending; el middleware de pago lo confirma si aplica)
    const { data: insertedBooking, error: bookingError } = await supabase
      .from('bookings')
      .insert([
        {
          court_id,
          organizer_player_id: organizer_player_id ?? null,
          start_at,
          end_at,
          timezone: bookingTimezone,
          total_price_cents: Number(total_price_cents),
          currency: currency ?? 'EUR',
          status: 'pending_payment',
          notes: notes ?? null,
          reservation_type: reservationType,
          court_contention_status: courtContentionStatus,
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
    // Asegurar que el organizador siempre esté (solo si existe)
    if (organizer_player_id && !participantRows.find((r) => r.player_id === organizer_player_id)) {
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

    if (participantRows.length > 0) {
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
        if (fallbackErr) {
          console.error('[POST /bookings] Fallback participants insert error:', fallbackErr.message);
          // Rollback: delete the orphan booking
          await supabase.from('bookings').delete().eq('id', booking.id);
          return res.status(400).json({
            ok: false,
            error: `Error al crear participantes: ${fallbackErr.message}`,
          });
        }
        for (const row of participantRows) {
          const paid = row.paid_amount_cents ?? 0;
          const wallet = row.wallet_amount_cents ?? 0;
          if (paid + wallet <= 0 && !row.payment_method) continue;
          const { error: patchErr } = await supabase
            .from('booking_participants')
            .update({
              paid_amount_cents: paid,
              wallet_amount_cents: wallet,
              payment_method: row.payment_method ?? null,
              payment_status: row.payment_status,
            })
            .eq('booking_id', booking.id)
            .eq('player_id', row.player_id);
          if (patchErr) {
            console.error('[POST /bookings] Participant payment patch error:', patchErr.message);
          }
        }
      }
    }

    // 4. Persistir pagos en payment_transactions y calcular status
    let finalStatus: string = 'pending_payment';
    if (hasPaymentData) {
      // 4a. Verificar saldo de wallet antes de debitar
      if (clubIdForWallet) {
        const walletCheck = await checkWalletBalances(supabase, clubIdForWallet, participantRows);
        if (!walletCheck.ok) {
          await supabase.from('booking_participants').delete().eq('booking_id', booking.id);
          await supabase.from('bookings').delete().eq('id', booking.id);
          return res.status(400).json({ ok: false, error: walletCheck.error });
        }
      }

      await upsertManualPayments(supabase, booking.id, participantRows);
      finalStatus = computeBookingStatus(Number(total_price_cents), participantRows);
      if (
        finalStatus !== 'confirmed' &&
        wantConfirmed &&
        computeBookingStatus(Number(total_price_cents), previewParticipantRows as any) === 'confirmed'
      ) {
        finalStatus = 'confirmed';
      }
      await supabase.from('bookings').update({ status: finalStatus }).eq('id', booking.id);
      if (finalStatus === 'confirmed') {
        await supabase
          .from('bookings')
          .update({ court_contention_status: null, updated_at: new Date().toISOString() })
          .eq('id', booking.id)
          .eq('court_contention_status', 'competing');
      }

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
      // Para tipos sin jugador (blocked, tournament), confirmar directamente sin crear payment_transaction
      if (!organizer_player_id) {
        finalStatus = 'confirmed';
        await supabase.from('bookings').update({ status: finalStatus }).eq('id', booking.id);
      } else {
        const payResult = await recordPayment(booking.id);
        if (!payResult.ok) {
          return res.status(500).json({ ok: false, error: payResult.error ?? 'Error al registrar pago' });
        }
        finalStatus = 'confirmed';
      }
    }

    const { data: finalBooking } = await supabase.from('bookings').select(SELECT_ONE).eq('id', booking.id).maybeSingle();
    await ensureOpenMatchRecordForBooking(supabase, booking.id, openMatchElo);

    const actuallyOccupiesCourt =
      reservationType !== 'open_match' && reservationType !== 'standard'
        ? true
        : finalStatus === 'confirmed';
    if (actuallyOccupiesCourt) {
      try {
        await cancelDisplacedBookingsForOccupyingReservation(
          supabase,
          booking.id,
          String(court_id),
          String(start_at),
          String(end_at),
        );
      } catch (displaceErr) {
        console.error('[POST /bookings] cancelDisplacedBookings:', displaceErr);
      }
    }

    try {
      await resolveCourtContention(supabase, booking.id);
    } catch (contentionErr) {
      console.error('[POST /bookings] resolveCourtContention:', contentionErr);
    }
    const { data: bookingWithMatch } = await supabase.from('bookings').select(SELECT_ONE).eq('id', booking.id).maybeSingle();
    return res.status(201).json({ ok: true, booking: bookingWithMatch ?? finalBooking ?? booking });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  console.log(`[PUT /bookings/${id}] body:`, JSON.stringify(req.body, null, 2));
  const { status, cancelled_by, cancellation_reason, notes, booking_type, participants, court_id, start_at, end_at, total_price_cents, elo_min, elo_max } = req.body ?? {};
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status !== undefined && status !== 'confirmed') update.status = toDbStatus(status);
  if (cancelled_by !== undefined) update.cancelled_by = cancelled_by;
  if (cancellation_reason !== undefined) update.cancellation_reason = cancellation_reason;
  if (status === 'cancelled') {
    update.cancelled_at = new Date().toISOString();
  }
  if (notes !== undefined) update.notes = notes;
  if (booking_type !== undefined) update.reservation_type = normalizeReservationTypeSlug(booking_type);
  if (court_id !== undefined) update.court_id = court_id;
  if (start_at !== undefined) update.start_at = start_at;
  if (end_at !== undefined) update.end_at = end_at;
  if (total_price_cents !== undefined && Number.isFinite(Number(total_price_cents))) {
    update.total_price_cents = Number(total_price_cents);
  }

  const hasEloUpdate = elo_min !== undefined || elo_max !== undefined;

  if (Object.keys(update).length === 1 && !Array.isArray(participants) && status !== 'confirmed' && !hasEloUpdate) {
    return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' });
  }

  let openMatchElo: OpenMatchSyncOpts | undefined;
  if (hasEloUpdate) {
    const eloParsed = parseEloRange(
      elo_min !== undefined ? elo_min : null,
      elo_max !== undefined ? elo_max : null,
    );
    if (!eloParsed.ok) return res.status(400).json({ ok: false, error: eloParsed.error });
    openMatchElo = { elo_min: eloParsed.elo_min, elo_max: eloParsed.elo_max };
  }

  try {
    const supabase = getSupabaseServiceRoleClient();

    interface ExistingBooking {
      court_id: string;
      start_at: string;
      end_at: string;
      reservation_type?: string | null;
      status?: string | null;
    }

    let existingBooking: ExistingBooking | null = null;

    if (court_id !== undefined || start_at !== undefined || end_at !== undefined) {
      const { data: ex, error: exErr } = await supabase
        .from('bookings')
        .select('court_id, start_at, end_at, reservation_type, status')
        .eq('id', id)
        .maybeSingle();
      if (exErr) return res.status(500).json({ ok: false, error: exErr.message });
      if (!ex) return res.status(404).json({ ok: false, error: 'Booking not found' });
      existingBooking = ex as ExistingBooking;
    }

    const scheduleTouched =
      existingBooking != null &&
      ((court_id !== undefined && String(court_id) !== String(existingBooking.court_id)) ||
        (start_at !== undefined && String(start_at) !== String(existingBooking.start_at)) ||
        (end_at !== undefined && String(end_at) !== String(existingBooking.end_at)));

    if (scheduleTouched && existingBooking) {
      const nextCourt = String(court_id ?? existingBooking.court_id);
      const nextStart = String(start_at ?? existingBooking.start_at);
      const nextEnd = String(end_at ?? existingBooking.end_at);
      const nextType = normalizeReservationTypeSlug(
        booking_type ?? existingBooking.reservation_type ?? 'standard',
      );
      const hoursCheck = await assertBookingWithinClubOperatingHours(supabase, {
        courtId: nextCourt,
        startAt: nextStart,
        endAt: nextEnd,
        reservationType: nextType,
      });
      if (!hoursCheck.ok) {
        return res.status(400).json({ ok: false, error: hoursCheck.error });
      }
      const conflict = await hasCourtConflict({
        courtId: nextCourt,
        startAt: nextStart,
        endAt: nextEnd,
        excludeBookingId: id,
        reservationType: nextType,
        occupiesCourtImmediately:
          nextType !== 'open_match' && nextType !== 'standard'
            ? true
            : String(existingBooking.status ?? '').toLowerCase() === 'confirmed',
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

      const existingParticipants = await fetchBookingParticipantsForRefund(supabase, id);
      const newPlayerIds = new Set(
        participants
          .filter((p: { player_id?: string }) => p.player_id)
          .map((p: { player_id: string }) => String(p.player_id)),
      );
      const removedParticipants = existingParticipants.filter(
        (p) => p.player_id && !newPlayerIds.has(String(p.player_id)),
      );

      if (removedParticipants.length > 0) {
        const refundPolicy = await evaluateBookingRefundPolicy(supabase, id);
        for (const removed of removedParticipants) {
          if (clubIdForWallet) {
            const refundResult = await refundBookingParticipant(supabase, id, clubIdForWallet, removed, {
              concept: 'Reembolso por baja de reserva',
              refundEligible: refundPolicy.eligible,
              refundPercent: refundPolicy.eligible ? 100 : 0,
            });
            if (refundResult.errors.length > 0) {
              console.error(
                `[PUT /bookings/${id}] refund on remove ${removed.player_id}:`,
                refundResult.errors,
              );
            }
          }
          await notifyBookingCancellationEmails(supabase, {
            bookingId: id,
            scenario: 'removed',
            cancelledBy: 'admin',
            refundPercent: refundPolicy.eligible ? 100 : 0,
            refundEligible: refundPolicy.eligible,
            policyMessage: refundPolicyUserMessage(refundPolicy),
            notifyPlayerIds: [removed.player_id],
          });
        }
      }

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
          await supabase.from('booking_participants')
            .update({
              share_amount_cents: row.share_amount_cents,
              payment_status: row.payment_status,
              payment_method: row.payment_method,
              paid_amount_cents: row.paid_amount_cents,
              wallet_amount_cents: row.wallet_amount_cents,
            })
            .eq('booking_id', id).eq('role', 'organizer');
        }
      }

      // Insertar guests nuevos (con columnas de pago)
      const guestRows = newParticipantRows.filter((r) => r.role === 'guest');
      if (guestRows.length > 0) {
        const { error: gErr } = await supabase.from('booking_participants').insert(
          guestRows.map((r: any) => ({
            booking_id: r.booking_id,
            player_id: r.player_id,
            role: r.role,
            share_amount_cents: r.share_amount_cents,
            payment_status: r.payment_status,
            payment_method: r.payment_method,
            paid_amount_cents: r.paid_amount_cents,
            wallet_amount_cents: r.wallet_amount_cents,
          })),
        );
        if (gErr) console.error('[PUT /bookings] Guest insert error:', gErr.message);
      }

      // Persistir pagos en payment_transactions y recalcular status
      if (hasPaymentData) {
        // Verificar saldo de wallet antes de debitar
        if (clubIdForWallet) {
          // Sumar débitos previos de esta reserva que se van a borrar (restauran saldo)
          const walletCheck = await checkWalletBalances(supabase, clubIdForWallet, newParticipantRows);
          if (!walletCheck.ok) {
            return res.status(400).json({ ok: false, error: walletCheck.error });
          }
        }

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
        if (refreshed) {
          let bookingOut = refreshed;
          if (scheduleTouched) {
            try {
              await propagateTournamentFromBookingUpdate(supabase, id, refreshed as { start_at: string; end_at: string });
              const { data: again } = await supabase.from('bookings').select(SELECT_ONE).eq('id', id).maybeSingle();
              if (again) bookingOut = again;
            } catch (e) {
              console.error('[PUT /bookings] propagate tournament:', e);
            }
          }
          await ensureOpenMatchRecordForBooking(supabase, id, openMatchElo);
          if (Array.isArray(participants)) {
            const { data: linkedMatch } = await supabase.from('matches').select('id').eq('booking_id', id).maybeSingle();
            if (linkedMatch?.id) {
              await syncMatchPlayersFromBooking(supabase, linkedMatch.id, id);
            }
          }
          try {
            await resolveCourtContention(supabase, id);
          } catch (contentionErr) {
            console.error(`[PUT /bookings/${id}] resolveCourtContention:`, contentionErr);
          }
          const { data: withMatch } = await supabase.from('bookings').select(SELECT_ONE).eq('id', id).maybeSingle();
          return res.json({ ok: true, booking: withMatch ?? bookingOut });
        }
      }
    }

    let bookingOut = data;
    if (scheduleTouched) {
      try {
        await propagateTournamentFromBookingUpdate(supabase, id, data as { start_at: string; end_at: string });
        const { data: again } = await supabase.from('bookings').select(SELECT_ONE).eq('id', id).maybeSingle();
        if (again) bookingOut = again;
      } catch (e) {
        console.error('[PUT /bookings] propagate tournament:', e);
      }
    }
    await ensureOpenMatchRecordForBooking(supabase, id, openMatchElo);
    if (Array.isArray(participants)) {
      const { data: linkedMatch } = await supabase.from('matches').select('id').eq('booking_id', id).maybeSingle();
      if (linkedMatch?.id) {
        await syncMatchPlayersFromBooking(supabase, linkedMatch.id, id);
      }
    }
    try {
      await resolveCourtContention(supabase, id);
    } catch (contentionErr) {
      console.error(`[PUT /bookings/${id}] resolveCourtContention:`, contentionErr);
    }
    const { data: withMatch } = await supabase.from('bookings').select(SELECT_ONE).eq('id', id).maybeSingle();
    return res.json({ ok: true, booking: withMatch ?? bookingOut });
  } catch (err) {
    console.error(`[PUT /bookings/${id}] Unhandled error:`, (err as Error).message, (err as Error).stack);
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /bookings/{id}/refund-preview:
 *   get:
 *     tags: [Bookings]
 *     summary: Vista previa de jugadores con pago en efectivo
 *     description: Lista participantes que pagaron en efectivo y requieren decisión del mostrador antes de cancelar o dar de baja.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: player_id
 *         schema: { type: string, format: uuid }
 *         description: Filtra a un solo jugador (baja individual)
 *     responses:
 *       200:
 *         description: Lista de jugadores con efectivo pendiente de disposición
 */
router.get('/:id/refund-preview', async (req: Request, res: Response) => {
  const { id } = req.params;
  const filterPlayerId = typeof req.query.player_id === 'string' ? req.query.player_id : undefined;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const policy = await evaluateBookingRefundPolicy(supabase, id);
    const participants = await fetchBookingParticipantsForRefund(supabase, id);
    const stripeIds = await collectStripePlayerIds(supabase, id);
    const cash_players = listCashRefundCandidates(participants, stripeIds, filterPlayerId);
    const has_refundable_payments = bookingParticipantsHavePayments(
      filterPlayerId
        ? participants.filter((p) => p.player_id === filterPlayerId)
        : participants,
      stripeIds,
    );
    const policy_eligible = policy.eligible;
    const refund_eligible = policy_eligible && has_refundable_payments;
    const admin_can_choose_percent = !policy_eligible && has_refundable_payments;
    return res.json({
      ok: true,
      cash_players,
      has_refundable_payments,
      policy_eligible,
      admin_can_choose_percent,
      refund_eligible,
      notice_hours: policy.notice_hours,
      incomplete_public_exempt: policy.incomplete_public_exempt,
      match_player_count: policy.match_player_count,
      hours_until_start: Math.round(policy.hours_until_start * 10) / 10,
      policy_message:
        has_refundable_payments && !policy_eligible ? refundPolicyUserMessage(policy) : undefined,
      refund_percent_options: [0, 25, 50, 75, 100],
      suggested_refund_percent: refund_eligible ? 100 : 0,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body ?? {};
  const cashRefunds = (body.cash_refunds ?? undefined) as CashRefundMap | undefined;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const now = new Date().toISOString();

    const { data: bookingRow, error: fetchErr } = await supabase
      .from('bookings')
      .select('id, court_id, courts(club_id)')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (fetchErr) return res.status(500).json({ ok: false, error: fetchErr.message });
    if (!bookingRow) return res.status(404).json({ ok: false, error: 'Booking not found' });

    const clubId = (bookingRow.courts as { club_id?: string } | null)?.club_id;

    const policy = await evaluateBookingRefundPolicy(supabase, id);
    const participants = await fetchBookingParticipantsForRefund(supabase, id);
    const stripeIds = await collectStripePlayerIds(supabase, id);
    const hasPayments = bookingParticipantsHavePayments(participants, stripeIds);
    const refundPercent = resolveAdminRefundPercent(body, policy.eligible, hasPayments);

    if (clubId && refundPercent > 0) {
      const cashCandidates = listCashRefundCandidates(participants, stripeIds);
      const validation = validateCashRefundMap(cashCandidates, cashRefunds);
      if (!validation.ok) {
        return res.status(400).json({
          ok: false,
          code: 'cash_refund_required',
          error: validation.error,
          cash_players: cashCandidates,
          missing_player_ids: validation.missing_player_ids,
        });
      }

      const refundResult = await refundAllBookingParticipants(
        supabase,
        id,
        clubId,
        cashRefunds,
        refundPercent < 100
          ? `Reembolso parcial (${refundPercent}%) por cancelación de reserva`
          : 'Reembolso por cancelación de reserva',
        refundPercent,
      );
      if (refundResult.errors.length > 0) {
        console.error(`[DELETE /bookings/${id}] Refund errors:`, refundResult.errors);
        return res.status(502).json({
          ok: false,
          error: 'No se pudieron completar todos los reembolsos. La reserva no se canceló.',
          refund_errors: refundResult.errors,
        });
      }
    }

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

    await supabase
      .from('matches')
      .update({ status: 'cancelled' })
      .eq('booking_id', id)
      .not('status', 'in', '("cancelled","finished")');

    await notifyBookingCancellationEmails(supabase, {
      bookingId: id,
      scenario: 'cancelled',
      cancelledBy: 'admin',
      refundPercent,
      refundEligible: refundPercent > 0,
      policyMessage: refundPercent > 0 ? undefined : refundPolicyUserMessage(policy),
      cashRefunds,
    });

    return res.json({
      ok: true,
      booking: data,
      refund_eligible: policy.eligible,
      refund_applied: refundPercent > 0,
      refund_percent: refundPercent,
      incomplete_public_exempt: policy.incomplete_public_exempt,
      policy_message: policy.eligible ? undefined : refundPolicyUserMessage(policy),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.post('/:id/override-move', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { target_court_id, start_at, end_at } = req.body ?? {};

  if (!target_court_id || !start_at || !end_at) {
    return res.status(400).json({ ok: false, error: 'target_court_id, start_at y end_at son obligatorios' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const startMs = new Date(start_at).getTime();
    const endMs = new Date(end_at).getTime();

    // 1. Fetch target court and club
    const { data: targetCourt, error: courtErr } = await supabase
      .from('courts')
      .select('club_id, name, clubs(name)')
      .eq('id', target_court_id)
      .maybeSingle();

    if (courtErr) return res.status(500).json({ ok: false, error: courtErr.message });
    if (!targetCourt) return res.status(404).json({ ok: false, error: 'Pista de destino no encontrada' });
    const clubId = targetCourt.club_id;

    // 2. Find overlapping bookings on target court
    const { data: conflicts, error: confErr } = await supabase
      .from('bookings')
      .select(`
        id,
        start_at,
        end_at,
        reservation_type,
        status,
        timezone,
        total_price_cents,
        organizer_player_id,
        courts(name),
        booking_participants(
          id,
          player_id,
          role,
          payment_status,
          paid_amount_cents,
          wallet_amount_cents,
          share_amount_cents,
          players:players!booking_participants_player_id_fkey(id, first_name, last_name, email)
        ),
        payment_transactions(
          id,
          payer_player_id,
          amount_cents,
          stripe_payment_intent_id,
          status
        )
      `)
      .eq('court_id', target_court_id)
      .neq('status', 'cancelled')
      .is('deleted_at', null)
      .neq('id', id);

    if (confErr) return res.status(500).json({ ok: false, error: confErr.message });

    const overlappingConflicts = (conflicts ?? []).filter(b => {
      const s = new Date(b.start_at).getTime();
      const e = new Date(b.end_at).getTime();
      return startMs < e && endMs > s;
    });

    // 3. Filter for incomplete match groups
    const MATCH_GRID_FILL_TYPES = new Set(['open_match', 'pozo', 'standard']);
    const incompleteConflicts = overlappingConflicts.filter(b => {
      const type = b.reservation_type ?? 'standard';
      if (!MATCH_GRID_FILL_TYPES.has(type)) return false;

      const pCount = b.booking_participants?.length ?? 0;
      if (pCount >= 4) return false;

      const total = b.total_price_cents ?? 0;
      let paid = 0;
      const txByPlayer = new Map<string, number>();
      for (const t of b.payment_transactions ?? []) {
        if (t.status !== 'succeeded' || !t.payer_player_id) continue;
        txByPlayer.set(t.payer_player_id, (txByPlayer.get(t.payer_player_id) ?? 0) + (t.amount_cents ?? 0));
      }
      const txTotal = Array.from(txByPlayer.values()).reduce((sum, n) => sum + n, 0);
      if (txTotal > 0) {
        paid = txTotal;
      } else {
        const bpTotal = (b.booking_participants ?? []).reduce(
          (sum: number, p: any) => sum + (p.paid_amount_cents ?? 0) + (p.wallet_amount_cents ?? 0),
          0
        );
        if (bpTotal > 0) {
          paid = bpTotal;
        } else {
          paid = (b.booking_participants ?? [])
            .filter((p: any) => p.payment_status === 'paid')
            .reduce((sum: number, p: any) => sum + (p.share_amount_cents ?? 0), 0);
        }
      }

      const isPaid = total <= 0 ? (paid > 0 || b.status === 'confirmed') : (paid >= total);
      return !isPaid;
    });

    let displacedInfo: any = null;

    if (incompleteConflicts.length > 0) {
      const conflictToDisplace = incompleteConflicts[0];

      const nowIso = new Date().toISOString();
      const { error: cancelErr } = await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          updated_at: nowIso,
          cancelled_at: nowIso,
          cancelled_by: 'owner',
          deleted_at: nowIso,
        })
        .eq('id', conflictToDisplace.id);

      if (cancelErr) return res.status(500).json({ ok: false, error: 'Error al cancelar el partido en conflicto: ' + cancelErr.message });

      await refundStripeBookingPaymentTransactions(supabase, conflictToDisplace.id, clubId);

      const refundRows: any[] = [];
      for (const bp of conflictToDisplace.booking_participants ?? []) {
        if (!bp.player_id) continue;
        const amt = (bp.paid_amount_cents ?? 0) + (bp.wallet_amount_cents ?? 0);
        if (amt > 0) {
          refundRows.push({
            player_id: bp.player_id,
            club_id: clubId,
            amount_cents: amt,
            concept: `Reembolso por cancelación de reserva (prioridad a partido completo)`,
            type: 'refund',
            booking_id: conflictToDisplace.id,
            created_at: nowIso,
          });
        }
      }
      if (refundRows.length > 0) {
        await supabase.from('wallet_transactions').insert(refundRows);
      }

      await supabase
        .from('matches')
        .update({ status: 'cancelled' })
        .eq('booking_id', conflictToDisplace.id)
        .not('status', 'in', '("cancelled","finished")');

      let notifiedCount = 0;
      const oldCourtName = (conflictToDisplace.courts as any)?.name ?? 'Pista Original';
      const tz = conflictToDisplace.timezone || 'Europe/Madrid';
      const formattedDate = new Date(conflictToDisplace.start_at).toLocaleDateString('es-ES', { timeZone: tz });
      const formattedTime = new Date(conflictToDisplace.start_at).toLocaleTimeString('es-ES', { timeZone: tz, hour: '2-digit', minute: '2-digit' });

      for (const bp of conflictToDisplace.booking_participants ?? []) {
        if (!bp.player_id) continue;
        const player = (bp as any).players;
        if (!player || !player.email) continue;

        await sendBookingCancelledByOverrideEmail(
          player.email,
          `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || 'Jugador',
          (targetCourt as any).clubs?.name ?? 'WeMatch Club',
          formattedDate,
          formattedTime,
          oldCourtName
        );
        notifiedCount++;
      }

      displacedInfo = {
        booking_id: conflictToDisplace.id,
        action: 'cancelled',
        players_notified: notifiedCount,
      };
    }

    const { data: updatedBooking, error: moveAdminErr } = await supabase
      .from('bookings')
      .update({
        court_id: target_court_id,
        start_at,
        end_at,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(SELECT_ONE)
      .maybeSingle();

    if (moveAdminErr) {
      return res.status(500).json({ ok: false, error: 'Error al mover reserva de admin: ' + moveAdminErr.message });
    }

    return res.json({
      ok: true,
      booking: updatedBooking,
      displaced: displacedInfo
    });

  } catch (err) {
    console.error('[POST /bookings/:id/override-move] Error:', err);
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.get('/:id/player-response', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { action, player_id, token } = req.query ?? {};

  if (!action || !player_id || !token) {
    return res.status(400).send('Parámetros query faltantes (action, player_id, token)');
  }

  if (action !== 'keep' && action !== 'refund') {
    return res.status(400).send('Acción inválida');
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const secret = process.env.WEBHOOK_SECRET || 'fallback_secret';
    const expectedToken = crypto.createHmac('sha256', secret)
      .update(`${id}:${player_id}`)
      .digest('hex');

    if (token !== expectedToken) {
      return res.status(403).send('Enlace inválido o expirado.');
    }

    const { data: existingResponse, error: responseErr } = await supabase
      .from('booking_override_responses')
      .select('*')
      .eq('booking_id', id)
      .eq('player_id', player_id)
      .maybeSingle();

    if (responseErr) return res.status(500).send('Error de base de datos: ' + responseErr.message);
    if (!existingResponse) {
      return res.status(404).send('No se encontró una solicitud pendiente para esta reserva.');
    }

    if (existingResponse.responded_at) {
      const frontendUrl = getFrontendUrl();
      return res.redirect(`${frontendUrl}/booking-response?status=already_responded`);
    }

    if (action === 'keep') {
      const { error: updateErr } = await supabase
        .from('booking_override_responses')
        .update({
          action: 'keep',
          responded_at: new Date().toISOString()
        })
        .eq('id', existingResponse.id);

      if (updateErr) return res.status(500).send('Error al guardar respuesta: ' + updateErr.message);

      const { data: bRow } = await supabase
        .from('bookings')
        .select('court_id, courts(name), start_at, timezone')
        .eq('id', id)
        .maybeSingle();

      const courtName = (bRow as any)?.courts?.name ?? '';
      const startAt = (bRow as any)?.start_at ?? '';
      const bookingTz = (bRow as any)?.timezone ?? 'Europe/Madrid';
      const frontendUrl = getFrontendUrl();
      return res.redirect(`${frontendUrl}/booking-response?status=keep_success&court=${encodeURIComponent(courtName)}&time=${encodeURIComponent(startAt)}&tz=${encodeURIComponent(bookingTz)}`);
    } else {
      const { data: bookingRow } = await supabase
        .from('bookings')
        .select('id, court_id, courts(club_id)')
        .eq('id', id)
        .maybeSingle();

      const clubId = (bookingRow?.courts as any)?.club_id;
      if (clubId) {
        await refundStripeBookingPaymentForPlayer(supabase, id, clubId, String(player_id));

        const { data: bpRow } = await supabase
          .from('booking_participants')
          .select('paid_amount_cents, wallet_amount_cents')
          .eq('booking_id', id)
          .eq('player_id', player_id)
          .maybeSingle();

        if (bpRow) {
          const amt = (bpRow.paid_amount_cents ?? 0) + (bpRow.wallet_amount_cents ?? 0);
          if (amt > 0) {
            await supabase.from('wallet_transactions').insert({
              player_id,
              club_id: clubId,
              amount_cents: amt,
              concept: `Reembolso por cancelación de reserva (reclamado por jugador)`,
              type: 'refund',
              booking_id: id,
              created_at: new Date().toISOString(),
            });
          }
        }
      }

      await supabase
        .from('booking_override_responses')
        .update({
          action: 'refund',
          responded_at: new Date().toISOString()
        })
        .eq('id', existingResponse.id);

      await supabase
        .from('booking_participants')
        .delete()
        .eq('booking_id', id)
        .eq('player_id', player_id);

      const { data: matchRow } = await supabase
        .from('matches')
        .select('id')
        .eq('booking_id', id)
        .maybeSingle();
      if (matchRow) {
        await supabase
          .from('match_players')
          .delete()
          .eq('match_id', matchRow.id)
          .eq('player_id', player_id);
      }

      const { data: allParticipants } = await supabase
        .from('booking_participants')
        .select('player_id')
        .eq('booking_id', id);

      if (!allParticipants || allParticipants.length === 0) {
        const nowIso = new Date().toISOString();
        await supabase
          .from('bookings')
          .update({
            status: 'cancelled',
            updated_at: nowIso,
            cancelled_at: nowIso,
            cancelled_by: 'owner',
            deleted_at: nowIso,
          })
          .eq('id', id);

        await supabase
          .from('matches')
          .update({ status: 'cancelled' })
          .eq('booking_id', id)
          .not('status', 'in', '("cancelled","finished")');
      }

      const frontendUrl = getFrontendUrl();
      return res.redirect(`${frontendUrl}/booking-response?status=refund_success`);
    }

  } catch (err) {
    console.error('[GET /bookings/:id/player-response] Error:', err);
    return res.status(500).send('Error interno del servidor');
  }
});

router.post('/process-override-timeouts', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const webhookSecret = process.env.WEBHOOK_SECRET || 'fallback_secret';
  const isAuth = authHeader === `Bearer ${webhookSecret}` || req.headers['x-webhook-secret'] === webhookSecret;
  if (!isAuth && process.env.NODE_ENV === 'production') {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: pendingResponses, error: fetchErr } = await supabase
      .from('booking_override_responses')
      .select('*, bookings(id, court_id, courts(club_id))')
      .is('responded_at', null)
      .lte('deadline', new Date().toISOString());

    if (fetchErr) return res.status(500).json({ ok: false, error: fetchErr.message });

    const processedBookingIds = new Set<string>();

    for (const resp of pendingResponses ?? []) {
      const bookingId = resp.booking_id;
      const playerId = resp.player_id;
      const clubId = (resp.bookings?.courts as any)?.club_id;

      processedBookingIds.add(bookingId);

      if (clubId) {
        await refundStripeBookingPaymentForPlayer(supabase, bookingId, clubId, playerId);

        const { data: bpRow } = await supabase
          .from('booking_participants')
          .select('paid_amount_cents, wallet_amount_cents')
          .eq('booking_id', bookingId)
          .eq('player_id', playerId)
          .maybeSingle();

        if (bpRow) {
          const amt = (bpRow.paid_amount_cents ?? 0) + (bpRow.wallet_amount_cents ?? 0);
          if (amt > 0) {
            await supabase.from('wallet_transactions').insert({
              player_id: playerId,
              club_id: clubId,
              amount_cents: amt,
              concept: `Reembolso por cancelación de reserva (timeout de respuesta)`,
              type: 'refund',
              booking_id: bookingId,
              created_at: new Date().toISOString(),
            });
          }
        }
      }

      await supabase
        .from('booking_override_responses')
        .update({
          action: 'refund',
          responded_at: new Date().toISOString()
        })
        .eq('id', resp.id);

      await supabase
        .from('booking_participants')
        .delete()
        .eq('booking_id', bookingId)
        .eq('player_id', playerId);

      const { data: matchRow } = await supabase
        .from('matches')
        .select('id')
        .eq('booking_id', bookingId)
        .maybeSingle();
      if (matchRow) {
        await supabase
          .from('match_players')
          .delete()
          .eq('match_id', matchRow.id)
          .eq('player_id', playerId);
      }
    }

    for (const bookingId of processedBookingIds) {
      const { data: participants } = await supabase
        .from('booking_participants')
        .select('player_id')
        .eq('booking_id', bookingId);

      if (!participants || participants.length === 0) {
        const nowIso = new Date().toISOString();
        await supabase
          .from('bookings')
          .update({
            status: 'cancelled',
            updated_at: nowIso,
            cancelled_at: nowIso,
            cancelled_by: 'owner',
            deleted_at: nowIso,
          })
          .eq('id', bookingId);

        await supabase
          .from('matches')
          .update({ status: 'cancelled' })
          .eq('booking_id', bookingId)
          .not('status', 'in', '("cancelled","finished")');
      }
    }

    return res.json({ ok: true, processed_count: pendingResponses?.length ?? 0 });
  } catch (err) {
    console.error('[POST /bookings/process-override-timeouts] Error:', err);
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
