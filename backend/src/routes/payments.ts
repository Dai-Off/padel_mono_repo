import { Request, Response } from 'express';
import Stripe from 'stripe';
import { bookingStartIsTooFarInPast, BOOKING_START_PAST_ERROR } from '../lib/bookingStartNotInPast';
import { playerMeetsTournamentGender } from '../lib/tournamentGender';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import {
  cleanupExpiredTournamentInvites,
  finalizeTournamentPaidJoin,
  getTournamentSlots,
  STRIPE_META_TOURNAMENT_PURPOSE,
} from '../services/tournamentsService';
import { refreshBookingStatusAfterParticipantPayment } from '../lib/bookingPaymentSync';
import { zonedTimeToUtc } from './learningTimezone';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

function getStripe(): Stripe {
  if (!stripeSecretKey) throw new Error('STRIPE_SECRET_KEY no configurada');
  return new Stripe(stripeSecretKey);
}

/**
 * POST /payments/create-intent-for-new-match
 * Body: { court_id, organizer_player_id, start_at, end_at, total_price_cents, timezone?, visibility?, competitive?, gender?, elo_min?, elo_max? }
 *
 * Crea PaymentIntent para pagar y reservar un partido. NO crea booking/match aún.
 * El partido se crea SOLO cuando el pago se confirma (webhook o confirm-client).
 */
export async function createIntentForNewMatchHandler(req: Request, res: Response): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ ok: false, error: 'Token requerido' });
    return;
  }

  const {
    court_id,
    organizer_player_id,
    start_at,
    end_at,
    total_price_cents,
    pay_full,
    timezone,
    visibility,
    competitive,
    gender,
    elo_min,
    elo_max,
    source_channel,
  } = req.body ?? {};

  if (!court_id || !organizer_player_id || !start_at || !end_at || total_price_cents == null) {
    res.status(400).json({
      ok: false,
      error: 'court_id, organizer_player_id, start_at, end_at y total_price_cents son obligatorios',
    });
    return;
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user?.email) {
      res.status(401).json({ ok: false, error: 'Sesión inválida o expirada' });
      return;
    }

    const { data: player } = await supabase
      .from('players')
      .select('id, email, stripe_customer_id')
      .eq('email', user.email.trim().toLowerCase())
      .maybeSingle();

    if (!player || player.id !== organizer_player_id) {
      res.status(403).json({ ok: false, error: 'No eres el organizador' });
      return;
    }

    const newStart = new Date(start_at).getTime();
    const newEnd = new Date(end_at).getTime();
    if (!Number.isFinite(newStart) || !Number.isFinite(newEnd) || newEnd <= newStart) {
      res.status(400).json({ ok: false, error: 'Rango horario inválido' });
      return;
    }
    if (bookingStartIsTooFarInPast(String(start_at))) {
      res.status(400).json({ ok: false, error: BOOKING_START_PAST_ERROR });
      return;
    }
    const { data: playerMatches } = await supabase
      .from('match_players')
      .select('match_id')
      .eq('player_id', organizer_player_id);
    const matchIds = (playerMatches ?? []).map((m: { match_id: string }) => m.match_id);
    if (matchIds.length > 0) {
      const { data: matchesWithBookings } = await supabase
        .from('matches')
        .select('id, status, bookings(start_at, end_at)')
        .in('id', matchIds)
        .neq('status', 'cancelled');
      const overlaps = (matchesWithBookings ?? []).some((m: { status: string; bookings?: { start_at: string; end_at: string } | { start_at: string; end_at: string }[] }) => {
        const b = Array.isArray(m.bookings) ? m.bookings[0] : m.bookings;
        if (!b?.start_at || !b?.end_at) return false;
        const exStart = new Date(b.start_at).getTime();
        const exEnd = new Date(b.end_at).getTime();
        return newStart < exEnd && newEnd > exStart;
      });
      if (overlaps) {
        res.status(400).json({
          ok: false,
          error: 'Ya tienes un partido a esa hora. Elige otro horario.',
        });
        return;
      }
    }

    const { data: courtBookings } = await supabase
      .from('bookings')
      .select('id, start_at, end_at')
      .eq('court_id', court_id)
      .in('status', ['confirmed', 'pending_payment']);
    const courtOverlaps = (courtBookings ?? []).some((b) => {
      const exStart = new Date(b.start_at).getTime();
      const exEnd = new Date(b.end_at).getTime();
      return newStart < exEnd && newEnd > exStart;
    });
    if (courtOverlaps) {
      res.status(400).json({
        ok: false,
        error: 'Esa pista ya está reservada para ese horario. Elige otra hora.',
      });
      return;
    }

    const totalCents = Number(total_price_cents);
    const isPayFull = pay_full === true || pay_full === 'true' || pay_full === 1;
    const amountCents = isPayFull ? totalCents : Math.ceil(totalCents / 4);
    if (isPayFull && amountCents < 100) {
      res.status(400).json({ ok: false, error: 'El monto mínimo es 1€' });
      return;
    }
    if (!isPayFull && amountCents < 50) {
      res.status(400).json({ ok: false, error: 'El monto mínimo por jugador es 0.50€' });
      return;
    }

    const stripe = getStripe();
    const metadata: Record<string, string> = {
      court_id,
      organizer_player_id,
      start_at,
      end_at,
      total_price_cents: String(totalCents),
      payer_player_id: player.id,
      timezone: timezone ?? 'Europe/Madrid',
      visibility: visibility === 'public' ? 'public' : 'private',
      competitive: competitive !== false ? '1' : '0',
      gender: gender ?? 'any',
      source_channel: ['mobile', 'web', 'manual', 'system'].includes(source_channel)
        ? source_channel
        : 'mobile',
    };
    if (elo_min != null) metadata.elo_min = String(elo_min);
    if (elo_max != null) metadata.elo_max = String(elo_max);
    if (isPayFull) metadata.pay_full = '1';

    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: amountCents,
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      setup_future_usage: 'off_session',
      metadata,
    };

    if (player.stripe_customer_id) {
      paymentIntentParams.customer = player.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: player.email,
        metadata: { player_id: player.id },
      });
      paymentIntentParams.customer = customer.id;
      await supabase
        .from('players')
        .update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() })
        .eq('id', player.id);
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    res.json({
      ok: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amountCents,
    });
  } catch (err) {
    console.error('[payments/create-intent-for-new-match]', err);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
}

/**
 * POST /payments/create-intent-for-tournament
 * Body: { tournament_id }
 *
 * Crea PaymentIntent para la inscripción. La inscripción se confirma en webhook / confirm-client.
 */
export async function createIntentForTournamentHandler(req: Request, res: Response): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ ok: false, error: 'Token requerido' });
    return;
  }

  const tournament_id = req.body?.tournament_id as string | undefined;
  if (!tournament_id || typeof tournament_id !== 'string') {
    res.status(400).json({ ok: false, error: 'tournament_id es obligatorio' });
    return;
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user?.email) {
      res.status(401).json({ ok: false, error: 'Sesión inválida o expirada' });
      return;
    }

    const { data: player } = await supabase
      .from('players')
      .select('id, email, stripe_customer_id')
      .eq('email', user.email.trim().toLowerCase())
      .maybeSingle();

    if (!player) {
      res.status(404).json({ ok: false, error: 'Jugador no encontrado' });
      return;
    }

    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .select('id, visibility, status, max_players, gender, registration_mode, price_cents, elo_min, elo_max')
      .eq('id', tournament_id)
      .maybeSingle();

    if (tErr || !tournament) {
      res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
      return;
    }

    if (String((tournament as { visibility?: string }).visibility) !== 'public') {
      res.status(403).json({ ok: false, error: 'Solo torneos públicos permiten esta inscripción' });
      return;
    }
    if (String((tournament as { status: string }).status) !== 'open') {
      res.status(400).json({ ok: false, error: 'El torneo no está abierto' });
      return;
    }
    const registrationMode = String((tournament as { registration_mode?: string }).registration_mode ?? 'individual');
    if (!['individual', 'both'].includes(registrationMode)) {
      res.status(400).json({ ok: false, error: 'Este torneo no admite inscripción individual desde la app' });
      return;
    }

    const priceCents = Number((tournament as { price_cents: number }).price_cents ?? 0);
    if (priceCents < 50) {
      res.status(400).json({
        ok: false,
        error: 'Este torneo no requiere pago con tarjeta o el importe es demasiado bajo',
      });
      return;
    }

    await cleanupExpiredTournamentInvites(tournament_id);
    const slots = await getTournamentSlots(tournament_id);
    if (slots.confirmedPlayers >= Number((tournament as { max_players: number }).max_players)) {
      res.status(409).json({ ok: false, error: 'No hay cupos disponibles' });
      return;
    }

    const { data: existingIns } = await supabase
      .from('tournament_inscriptions')
      .select('id')
      .eq('tournament_id', tournament_id)
      .eq('player_id_1', player.id)
      .maybeSingle();
    if (existingIns) {
      res.status(409).json({ ok: false, error: 'Ya estás inscrito en este torneo' });
      return;
    }

    const { data: joinPlayer } = await supabase
      .from('players')
      .select('gender, elo_rating')
      .eq('id', player.id)
      .maybeSingle();
    const playerGenderOk = playerMeetsTournamentGender(
      (tournament as { gender?: string }).gender,
      (joinPlayer as { gender?: string } | null)?.gender
    );
    const playerElo = Number((joinPlayer as { elo_rating?: number } | null)?.elo_rating ?? 0);
    const eloMin = (tournament as { elo_min?: number | null }).elo_min;
    const eloMax = (tournament as { elo_max?: number | null }).elo_max;
    const playerEloOk =
      (eloMin == null || playerElo >= Number(eloMin)) &&
      (eloMax == null || playerElo <= Number(eloMax));
    const meetsAutoRequirements = playerGenderOk && playerEloOk;
    let hasApprovedEntryRequest = false;
    if (!meetsAutoRequirements) {
      const { data: approvedReq } = await supabase
        .from('tournament_entry_requests')
        .select('id')
        .eq('tournament_id', tournament_id)
        .eq('player_id', player.id)
        .eq('status', 'approved')
        .order('resolved_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      hasApprovedEntryRequest = Boolean(approvedReq?.id);
    }
    if (!meetsAutoRequirements && !hasApprovedEntryRequest) {
      res.status(403).json({
        ok: false,
        error:
          'No cumples los requisitos automáticos del torneo (Elo/género). Envía una solicitud al organizador y completa el pago cuando te la aprueben.',
      });
      return;
    }

    const stripe = getStripe();
    const metadata: Record<string, string> = {
      tournament_id,
      payer_player_id: player.id,
      purpose: STRIPE_META_TOURNAMENT_PURPOSE,
    };

    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: priceCents,
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      setup_future_usage: 'off_session',
      metadata,
    };

    if (player.stripe_customer_id) {
      paymentIntentParams.customer = player.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: player.email,
        metadata: { player_id: player.id },
      });
      paymentIntentParams.customer = customer.id;
      await supabase
        .from('players')
        .update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() })
        .eq('id', player.id);
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    res.json({
      ok: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amountCents: priceCents,
    });
  } catch (err) {
    console.error('[payments/create-intent-for-tournament]', err);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
}

/**
 * POST /payments/create-intent
 * Body: { booking_id, participant_id }
 * Headers: Authorization: Bearer <token>
 *
 * Crea un PaymentIntent para que el jugador pague su parte del booking.
 * Devuelve { clientSecret } para usarlo con Stripe en el cliente.
 */
export async function createIntentHandler(req: Request, res: Response): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ ok: false, error: 'Token requerido' });
    return;
  }

  const { booking_id, participant_id, slot_index } = req.body ?? {};
  if (!booking_id || !participant_id) {
    res.status(400).json({ ok: false, error: 'booking_id y participant_id son obligatorios' });
    return;
  }

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user?.email) {
      res.status(401).json({ ok: false, error: 'Sesión inválida o expirada' });
      return;
    }

    const { data: participant, error: errParticipant } = await supabase
      .from('booking_participants')
      .select('id, booking_id, player_id, role, share_amount_cents, payment_status')
      .eq('id', participant_id)
      .eq('booking_id', booking_id)
      .maybeSingle();

    if (errParticipant || !participant) {
      res.status(404).json({ ok: false, error: 'Participante no encontrado' });
      return;
    }

    if (participant.payment_status === 'paid') {
      res.status(400).json({ ok: false, error: 'Ya has pagado tu parte' });
      return;
    }

    const { data: player } = await supabase
      .from('players')
      .select('id, email, stripe_customer_id')
      .eq('email', user.email.trim().toLowerCase())
      .maybeSingle();

    if (!player || player.id !== participant.player_id) {
      res.status(403).json({ ok: false, error: 'No puedes pagar por este participante' });
      return;
    }

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, status, total_price_cents, currency')
      .eq('id', booking_id)
      .maybeSingle();

    if (!booking) {
      res.status(404).json({ ok: false, error: 'Reserva no encontrada' });
      return;
    }
    // Organizer: booking debe estar pending_payment. Guest (join): booking puede estar confirmed.
    if (participant.role === 'organizer' && booking.status !== 'pending_payment') {
      res.status(400).json({ ok: false, error: 'La reserva no está pendiente de pago' });
      return;
    }

    const amountCents = participant.share_amount_cents;
    if (amountCents < 50) {
      res.status(400).json({ ok: false, error: 'El monto mínimo es 0.50€' });
      return;
    }

    const stripe = getStripe();
    const metadata: Record<string, string> = {
      booking_id,
      participant_id,
      payer_player_id: player.id,
    };
    if (slot_index != null) metadata.slot_index = String(slot_index);

    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: amountCents,
      currency: (booking.currency ?? 'eur').toLowerCase(),
      automatic_payment_methods: { enabled: true },
      setup_future_usage: 'off_session',
      metadata,
    };

    if (player.stripe_customer_id) {
      paymentIntentParams.customer = player.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: player.email,
        metadata: { player_id: player.id },
      });
      paymentIntentParams.customer = customer.id;
      await supabase
        .from('players')
        .update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() })
        .eq('id', player.id);
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    await supabase.from('payment_transactions').insert({
      booking_id,
      payer_player_id: player.id,
      amount_cents: amountCents,
      currency: booking.currency ?? 'EUR',
      stripe_payment_intent_id: paymentIntent.id,
      status: 'requires_action',
    });

    res.json({
      ok: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amountCents,
    });
  } catch (err) {
    console.error('[payments/create-intent]', err);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
}

/**
 * Webhook handler para Stripe. Debe montarse con express.raw({ type: 'application/json' }).
 * Actualiza payment_transactions y booking cuando payment_intent.succeeded.
 * Opción A: con 1 pago del organizador → booking pasa a confirmed.
 */
export async function webhookHandler(req: Request, res: Response): Promise<void> {
  const sig = req.headers['stripe-signature'] as string | undefined;
  const rawBody = req.body as Buffer | undefined;

  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    res.status(400).send('Webhook requiere body raw');
    return;
  }

  if (!stripeWebhookSecret) {
    console.warn('[payments/webhook] STRIPE_WEBHOOK_SECRET no configurado, verificando evento sin firma');
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripeWebhookSecret
      ? stripe.webhooks.constructEvent(rawBody, sig!, stripeWebhookSecret)
      : JSON.parse(rawBody.toString()) as Stripe.Event;
  } catch (err) {
    console.error('[payments/webhook] Error verificando firma:', err);
    res.status(400).send(`Webhook Error: ${(err as Error).message}`);
    return;
  }

  if (event.type !== 'payment_intent.succeeded') {
    res.json({ received: true });
    return;
  }

  const pi = event.data.object as Stripe.PaymentIntent;
  const meta = pi.metadata ?? {};

  try {
    const supabase = getSupabaseServiceRoleClient();

    // Flujo "nuevo partido": crear booking + match (idempotente)
    if (meta.court_id && meta.organizer_player_id) {
      const { data: existing } = await supabase
        .from('payment_transactions')
        .select('id')
        .eq('stripe_payment_intent_id', pi.id)
        .maybeSingle();
      if (!existing) {
        await processNewMatchPayment(supabase, pi);
      }
      res.json({ received: true });
      return;
    }

    // Inscripción torneo (pago)
    if (
      meta.purpose === STRIPE_META_TOURNAMENT_PURPOSE &&
      meta.tournament_id &&
      meta.payer_player_id
    ) {
      const { data: existingPi } = await supabase
        .from('payment_transactions')
        .select('id')
        .eq('stripe_payment_intent_id', pi.id)
        .maybeSingle();
      if (!existingPi) {
        const amountCents =
          typeof pi.amount_received === 'number' ? pi.amount_received : Number(pi.amount ?? 0);
        await finalizeTournamentPaidJoin({
          tournamentId: String(meta.tournament_id),
          playerId: String(meta.payer_player_id),
          stripePaymentIntentId: pi.id,
          amountCents,
        });
      }
      res.json({ received: true });
      return;
    }

    // Flujo "pago de participante existente"
    const { booking_id, participant_id } = meta;
    if (!booking_id || !participant_id) {
      console.warn('[payments/webhook] PaymentIntent sin metadata esperada:', pi.id);
      res.json({ received: true });
      return;
    }

    const { error: errTx } = await supabase
      .from('payment_transactions')
      .update({ status: 'succeeded', updated_at: new Date().toISOString() })
      .eq('stripe_payment_intent_id', pi.id);
    if (errTx) console.error('[payments/webhook] Error actualizando transaction:', errTx);

    const { error: errBP } = await supabase
      .from('booking_participants')
      .update({ payment_status: 'paid' })
      .eq('id', participant_id);
    if (errBP) console.error('[payments/webhook] Error actualizando participant:', errBP);

    const { data: participant } = await supabase
      .from('booking_participants')
      .select('role, player_id')
      .eq('id', participant_id)
      .maybeSingle();

    if (participant?.role === 'guest') {
      const { data: match } = await supabase
        .from('matches')
        .select('id')
        .eq('booking_id', booking_id)
        .maybeSingle();
      if (match) {
        const { data: existing } = await supabase
          .from('match_players')
          .select('id')
          .eq('match_id', match.id)
          .eq('player_id', participant.player_id)
          .maybeSingle();
        if (!existing) {
          const slotIdx = meta.slot_index != null ? parseInt(meta.slot_index, 10) : undefined;
          const team = slotIdx != null ? (slotIdx <= 1 ? 'A' : 'B') : 'A';
          await supabase.from('match_players').insert({
            match_id: match.id,
            player_id: participant.player_id,
            team,
            invite_status: 'accepted',
            slot_index: slotIdx ?? null,
          });
        }
      }
    }

    await refreshBookingStatusAfterParticipantPayment(supabase, booking_id);

    res.json({ received: true });
  } catch (err) {
    console.error('[payments/webhook]', err);
    res.status(500).json({ error: (err as Error).message });
  }
}

/**
 * POST /payments/customer-portal
 * Crea una sesión del Customer Portal de Stripe para que el usuario gestione sus métodos de pago.
 * Devuelve { url } para abrir en el navegador.
 */
export async function customerPortalHandler(req: Request, res: Response): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ ok: false, error: 'Token requerido' });
    return;
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user?.email) {
      res.status(401).json({ ok: false, error: 'Sesión inválida o expirada' });
      return;
    }

    const { data: player } = await supabase
      .from('players')
      .select('id, email, stripe_customer_id')
      .eq('email', user.email.trim().toLowerCase())
      .maybeSingle();

    if (!player) {
      res.status(404).json({ ok: false, error: 'Jugador no encontrado' });
      return;
    }

    let customerId = player.stripe_customer_id;

    if (!customerId) {
      const stripe = getStripe();
      const customer = await stripe.customers.create({
        email: player.email,
        metadata: { player_id: player.id },
      });
      customerId = customer.id;
      await supabase
        .from('players')
        .update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() })
        .eq('id', player.id);
    }

    const returnUrl = (req.body?.return_url as string) || 'padelapp://payments';
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    res.json({ ok: true, url: session.url });
  } catch (err) {
    console.error('[payments/customer-portal]', err);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
}

/**
 * GET /payments/transactions
 * Lista transacciones del jugador autenticado (payer_player_id).
 */
export async function listTransactionsHandler(req: Request, res: Response): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ ok: false, error: 'Token requerido' });
    return;
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user?.email) {
      res.status(401).json({ ok: false, error: 'Sesión inválida o expirada' });
      return;
    }

    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('email', user.email.trim().toLowerCase())
      .maybeSingle();

    if (!player) {
      res.status(404).json({ ok: false, error: 'Jugador no encontrado' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const { data: rows, error } = await supabase
      .from('payment_transactions')
      .select(`
        id,
        amount_cents,
        currency,
        status,
        created_at,
        updated_at,
        booking_id,
        tournament_id,
        bookings(
          start_at,
          end_at,
          courts(id, name, clubs(id, name, city))
        ),
        tournaments(
          name,
          clubs(id, name, city)
        )
      `)
      .eq('payer_player_id', player.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[payments/transactions]', error);
      res.status(500).json({ ok: false, error: error.message });
      return;
    }

    const transactions = (rows ?? []).map((t: Record<string, unknown>) => {
      const rawB = t.bookings;
      const b = (Array.isArray(rawB) ? rawB[0] : rawB) as Record<string, unknown> | null;
      const rawCourt = b?.courts;
      const court = (Array.isArray(rawCourt) ? rawCourt[0] : rawCourt) as Record<string, unknown> | null;
      const rawClub = court?.clubs;
      const club = (Array.isArray(rawClub) ? rawClub[0] : rawClub) as Record<string, unknown> | null;

      const rawTour = t.tournaments;
      const tour = (Array.isArray(rawTour) ? rawTour[0] : rawTour) as Record<string, unknown> | null;
      const rawTourClub = tour?.clubs;
      const tourClub = (Array.isArray(rawTourClub) ? rawTourClub[0] : rawTourClub) as Record<string, unknown> | null;

      const clubName = (club?.name as string | undefined) ?? (tourClub?.name as string | undefined) ?? null;
      const courtName = (court?.name as string | undefined) ?? null;
      const tourName = (tour?.name as string | undefined) ?? null;

      let summary_label: string;
      if (clubName && courtName) {
        summary_label = `${clubName} · ${courtName}`;
      } else if (tourName && clubName) {
        summary_label = `${clubName} · Torneo: ${tourName}`;
      } else if (tourName) {
        summary_label = `Torneo: ${tourName}`;
      } else if (clubName) {
        summary_label = clubName;
      } else {
        summary_label = 'Pago en app';
      }

      return {
        id: t.id,
        amount_cents: t.amount_cents,
        currency: t.currency,
        status: t.status,
        created_at: t.created_at,
        updated_at: t.updated_at ?? t.created_at,
        booking_id: t.booking_id,
        tournament_id: t.tournament_id ?? null,
        start_at: b?.start_at ?? null,
        end_at: b?.end_at ?? null,
        court_name: courtName,
        club_name: clubName,
        city: (club?.city as string | undefined) ?? (tourClub?.city as string | undefined) ?? null,
        tournament_name: tourName,
        summary_label: summary_label,
      };
    });

    res.json({ ok: true, transactions });
  } catch (err) {
    console.error('[payments/transactions]', err);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
}

function canAccessClubForPayments(req: Request, clubId: string): boolean {
  if (req.authContext?.adminId) return true;
  return req.authContext?.allowedClubIds?.includes(clubId) ?? false;
}

/**
 * GET /payments/club-transactions
 * Lista transacciones cuyas reservas pertenecen a pistas del club (dueño / admin).
 * Requiere `attachAuthContext` + `requireClubOwnerOrAdmin` en el router.
 *
 * @openapi
 * /payments/club-transactions:
 *   get:
 *     tags: [Payments]
 *     summary: Listar transacciones del club (panel dueño/admin)
 *     description: |
 *       Devuelve pagos asociados a reservas en pistas del `club_id`. Incluye datos del pagador (jugador).
 *       No usar para la app del jugador; para eso existe GET /payments/transactions.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: club_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100, maximum: 200 }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 transactions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string, format: uuid }
 *                       amount_cents: { type: integer }
 *                       currency: { type: string }
 *                       status: { type: string }
 *                       created_at: { type: string, format: date-time }
 *                       booking_id: { type: string, format: uuid }
 *                       start_at: { type: string, nullable: true }
 *                       end_at: { type: string, nullable: true }
 *                       court_name: { type: string, nullable: true }
 *                       club_name: { type: string, nullable: true }
 *                       city: { type: string, nullable: true }
 *                       payer_first_name: { type: string, nullable: true }
 *                       payer_last_name: { type: string, nullable: true }
 *                       payer_email: { type: string, nullable: true }
 *             example:
 *               ok: true
 *               transactions:
 *                 - id: "uuid"
 *                   amount_cents: 2500
 *                   currency: "EUR"
 *                   status: "succeeded"
 *                   payer_first_name: "Ana"
 *                   payer_last_name: "García"
 *       400: { description: Falta club_id }
 *       401: { description: Sin token o sesión inválida }
 *       403: { description: Sin acceso al club o sin rol dueño/admin }
 *       500: { description: Error de base de datos }
 */
export async function listClubTransactionsHandler(req: Request, res: Response): Promise<void> {
  const clubId = String(req.query.club_id ?? '').trim();
  if (!clubId) {
    res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
    return;
  }
  if (!req.authContext) {
    res.status(401).json({ ok: false, error: 'Token requerido' });
    return;
  }
  if (!canAccessClubForPayments(req, clubId)) {
    res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    return;
  }

  const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: rows, error } = await supabase
      .from('payment_transactions')
      .select(`
        id,
        amount_cents,
        currency,
        status,
        created_at,
        booking_id,
        players ( first_name, last_name, email ),
        bookings!inner (
          start_at,
          end_at,
          courts!inner (
            id,
            name,
            club_id,
            clubs ( id, name, city )
          )
        )
      `)
      .eq('bookings.courts.club_id', clubId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[payments/club-transactions]', error);
      res.status(500).json({ ok: false, error: error.message });
      return;
    }

    const transactions = (rows ?? []).map((t: Record<string, unknown>) => {
      const rawB = t.bookings;
      const b = (Array.isArray(rawB) ? rawB[0] : rawB) as Record<string, unknown> | null;
      const rawCourt = b?.courts;
      const court = (Array.isArray(rawCourt) ? rawCourt[0] : rawCourt) as Record<string, unknown> | null;
      const rawClub = court?.clubs;
      const club = (Array.isArray(rawClub) ? rawClub[0] : rawClub) as Record<string, unknown> | null;
      const rawPayer = t.players;
      const payer = (Array.isArray(rawPayer) ? rawPayer[0] : rawPayer) as Record<string, unknown> | null;
      return {
        id: t.id,
        amount_cents: t.amount_cents,
        currency: t.currency,
        status: t.status,
        created_at: t.created_at,
        booking_id: t.booking_id,
        start_at: b?.start_at ?? null,
        end_at: b?.end_at ?? null,
        court_name: court?.name ?? null,
        club_name: club?.name ?? null,
        city: club?.city ?? null,
        payer_first_name: payer?.first_name ?? null,
        payer_last_name: payer?.last_name ?? null,
        payer_email: payer?.email ?? null,
      };
    });

    res.json({ ok: true, transactions });
  } catch (err) {
    console.error('[payments/club-transactions]', err);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
}

/**
 * GET /payments/cash-closing/expected
 * Calcula el "esperado" para el arqueo de caja de un día:
 * - suma pagos `succeeded` asociados a bookings de ese día en el club
 * - separa entre `cash` (físico) y `card` (no físico)
 *   usando prefijo en `stripe_payment_intent_id` mock (`CASH_`) y/o `bookings.source_channel='manual'`.
 *
 * @openapi
 * /payments/cash-closing/expected:
 *   get:
 *     tags: [Cash closing]
 *     summary: Obtener esperado de arqueo de caja (por club y día)
 *     description: |
 *       Devuelve el total esperado para el arqueo de caja, relacionado con los bookings de ese día.
 *       Incluye por cada booking cuánto se pagó en `cash` y cuánto en `card`.
 *       Requiere JWT con acceso al club (admin o dueño).
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: club_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: ID del club
 *       - in: query
 *         name: date
 *         required: false
 *         schema: { type: string, example: "2026-03-25" }
 *         description: Fecha en formato YYYY-MM-DD (por defecto: hoy)
 *       - in: query
 *         name: timezone
 *         required: false
 *         schema: { type: string, example: "Europe/Madrid" }
 *         description: Zona horaria usada para interpretar el día operativo
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, default: 500, maximum: 5000 }
 *         description: Límite de registros de transacciones consultadas
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               date: "2026-03-25"
 *               systemCashTotal_cents: 12800
 *               systemCardTotal_cents: 6400
 *               bookings:
 *                 - booking_id: "uuid"
 *                   start_at: "2026-03-25T18:00:00.000Z"
 *                   court_name: "Pista 1"
 *                   total_price_cents: 3200
 *                   cash_paid_cents: 3200
 *                   card_paid_cents: 0
 *       400: { description: Falta club_id o date inválida }
 *       401: { description: Sin token o sesión inválida }
 *       403: { description: Sin acceso al club }
 *       500: { description: Error de base de datos }
 */
export async function cashClosingExpectedHandler(req: Request, res: Response): Promise<void> {
  const clubId = String(req.query.club_id ?? '').trim();
  if (!clubId) {
    res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
    return;
  }
  if (!req.authContext) {
    res.status(401).json({ ok: false, error: 'Token requerido' });
    return;
  }
  if (!canAccessClubForPayments(req, clubId)) {
    res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    return;
  }

  const dateStr = String(req.query.date ?? '').trim() || new Date().toISOString().slice(0, 10);
  const timezone = String(req.query.timezone ?? 'Europe/Madrid').trim() || 'Europe/Madrid';
  const limit = Math.min(parseInt(req.query.limit as string) || 500, 5000);

  let startUtc: Date;
  let endUtc: Date;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
    startUtc = zonedTimeToUtc(`${dateStr}T00:00:00`, timezone);
    endUtc = new Date(zonedTimeToUtc(`${dateStr}T23:59:59`, timezone).getTime() + 999);
  } catch {
    startUtc = new Date(`${dateStr}T00:00:00.000Z`);
    endUtc = new Date(`${dateStr}T23:59:59.999Z`);
  }
  if (Number.isNaN(startUtc.getTime())) {
    res.status(400).json({ ok: false, error: 'date inválida. Usa YYYY-MM-DD.' });
    return;
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    let openingCashCents = 0;
    let openingRecord: Record<string, unknown> | null = null;

    const { data: openingRow, error: openingErr } = await supabase
      .from('club_cash_openings')
      .select('id, club_id, staff_id, employee_name, opened_by_name, opened_at, for_date, opening_cash_cents, notes')
      .eq('club_id', clubId)
      .eq('for_date', dateStr)
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (openingErr) {
      const isMissingTable = openingErr.message.includes('relation') && openingErr.message.includes('does not exist');
      if (!isMissingTable) {
        console.error('[payments/cash-closing/expected:opening]', openingErr);
        res.status(500).json({ ok: false, error: openingErr.message });
        return;
      }
    } else if (openingRow) {
      const rowRecord = openingRow as Record<string, unknown>;
      openingRecord = {
        ...rowRecord,
        employee_name: rowRecord.employee_name ?? rowRecord.opened_by_name ?? null,
      };
      openingCashCents = Math.max(0, Math.trunc(Number(openingRow.opening_cash_cents ?? 0)));
    }

    let lastClosedAtIso: string | null = null;
    const { data: lastClosing, error: lastClosingErr } = await supabase
      .from('club_cash_closings')
      .select('closed_at')
      .eq('club_id', clubId)
      .eq('for_date', dateStr)
      .order('closed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastClosingErr) {
      const isMissingTable =
        lastClosingErr.message.includes('relation') && lastClosingErr.message.includes('does not exist');
      if (!isMissingTable) {
        console.error('[payments/cash-closing/expected:last-closing]', lastClosingErr);
        res.status(500).json({ ok: false, error: lastClosingErr.message });
        return;
      }
    } else if (lastClosing?.closed_at) {
      lastClosedAtIso = String(lastClosing.closed_at);
    }

    let txQuery = supabase
      .from('payment_transactions')
      .select(`
        id,
        created_at,
        amount_cents,
        currency,
        status,
        stripe_payment_intent_id,
        booking_id,
        bookings (
          id,
          start_at,
          end_at,
          total_price_cents,
          source_channel,
          courts (
            id,
            name,
            club_id,
            clubs ( id, name, city )
          )
        )
      `)
      .eq('status', 'succeeded')
      .eq('bookings.courts.club_id', clubId)
      .gte('created_at', startUtc.toISOString())
      .lt('created_at', endUtc.toISOString())
      .limit(limit);
    const { data: rows, error } = await txQuery;

    if (error) {
      console.error('[payments/cash-closing/expected]', error);
      res.status(500).json({ ok: false, error: error.message });
      return;
    }

    type BookingExpected = {
      booking_id: string;
      start_at: string | null;
      end_at: string | null;
      court_name: string | null;
      total_price_cents: number | null;
      cash_paid_cents: number;
      card_paid_cents: number;
    };

    const byBooking = new Map<string, BookingExpected>();
    let systemCashTotalCents = 0;
    let systemCardTotalCents = 0;

    const closingCutoffMs = lastClosedAtIso ? new Date(lastClosedAtIso).getTime() : null;
    const filteredRows = ((rows ?? []) as Record<string, unknown>[]).filter((row) => {
      if (closingCutoffMs == null) return true;
      const createdAt = row.created_at;
      if (typeof createdAt !== 'string') return true;
      const createdMs = new Date(createdAt).getTime();
      if (!Number.isFinite(createdMs)) return true;
      return createdMs > closingCutoffMs;
    });

    for (const r of filteredRows) {
      const rawBooking = (r as any).bookings;
      const b = (Array.isArray(rawBooking) ? rawBooking[0] : rawBooking) as Record<string, unknown> | null;
      if (!b) continue;

      const bookingId = (b.id as string) || (r.booking_id as string) || '';
      if (!bookingId) continue;

      const rawCourts = b.courts;
      const court = (Array.isArray(rawCourts) ? rawCourts[0] : rawCourts) as Record<string, unknown> | null;

      const stripeRef = r.stripe_payment_intent_id as string | null;
      const sourceChannel = (b.source_channel as string | null) ?? null;
      const isCash =
        (typeof stripeRef === 'string' && stripeRef.startsWith('CASH_')) || sourceChannel === 'manual';

      const amount = typeof r.amount_cents === 'number' ? r.amount_cents : 0;

      const cur = byBooking.get(bookingId) ?? {
        booking_id: bookingId,
        start_at: (b.start_at as string | null) ?? null,
        end_at: (b.end_at as string | null) ?? null,
        court_name: court?.name ? String(court.name) : null,
        total_price_cents: typeof b.total_price_cents === 'number' ? b.total_price_cents : null,
        cash_paid_cents: 0,
        card_paid_cents: 0,
      };

      if (isCash) cur.cash_paid_cents += amount;
      else cur.card_paid_cents += amount;

      byBooking.set(bookingId, cur);
    }

    for (const b of byBooking.values()) {
      systemCashTotalCents += b.cash_paid_cents;
      systemCardTotalCents += b.card_paid_cents;
    }

    const openingOpenedAtMs = openingRecord?.opened_at
      ? new Date(String(openingRecord.opened_at)).getTime()
      : NaN;
    const shouldIncludeOpening =
      openingCashCents > 0 &&
      (
        !lastClosedAtIso ||
        !Number.isFinite(openingOpenedAtMs) ||
        openingOpenedAtMs > (closingCutoffMs ?? -Infinity)
      );
    const effectiveOpeningCashCents = shouldIncludeOpening ? openingCashCents : 0;

    const systemCashTotalEur = Math.round((systemCashTotalCents / 100) * 100) / 100;
    const systemCardTotalEur = Math.round((systemCardTotalCents / 100) * 100) / 100;
    const openingCashEur = Math.round((effectiveOpeningCashCents / 100) * 100) / 100;

    res.json({
      ok: true,
      date: dateStr,
      systemCashTotal_cents: systemCashTotalCents + effectiveOpeningCashCents,
      systemCardTotal_cents: systemCardTotalCents,
      systemCashTotal_eur: systemCashTotalEur + openingCashEur,
      systemCardTotal_eur: systemCardTotalEur,
      openingCashTotal_cents: effectiveOpeningCashCents,
      openingCashTotal_eur: openingCashEur,
      opening: openingRecord,
      bookings: Array.from(byBooking.values()).sort((a, b) => (a.start_at ?? '').localeCompare(b.start_at ?? '')),
    });
  } catch (err) {
    console.error('[payments/cash-closing/expected]', err);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
}

type CashClosingStatus = 'perfect' | 'surplus' | 'deficit';

function cashClosingStatusFromDiffCents(diffCents: number): CashClosingStatus {
  if (Math.abs(diffCents) < 1) return 'perfect';
  return diffCents > 0 ? 'surplus' : 'deficit';
}

/**
 * GET /payments/cash-opening/today
 * Devuelve la apertura de caja registrada para el día del club.
 *
 * @openapi
 * /payments/cash-opening/today:
 *   get:
 *     tags: [Cash opening]
 *     summary: Obtener apertura de caja del día
 *     description: |
 *       Busca la última apertura para `club_id` y `date` (o hoy por defecto).
 *       Se usa para exigir apertura diaria antes de operar el módulo de cierre de caja.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: club_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: ID del club
 *       - in: query
 *         name: date
 *         required: false
 *         schema: { type: string, example: "2026-04-14" }
 *         description: Fecha en formato YYYY-MM-DD (por defecto hoy)
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             examples:
 *               withOpening:
 *                 value:
 *                   ok: true
 *                   date: "2026-04-14"
 *                   opening:
 *                     id: "uuid"
 *                     club_id: "uuid"
 *                     staff_id: "uuid"
 *                     employee_name: "Martina"
 *                     opened_at: "2026-04-14T07:59:00.000Z"
 *                     for_date: "2026-04-14"
 *                     opening_cash_cents: 25000
 *                     notes: "Caja inicial"
 *               withoutOpening:
 *                 value:
 *                   ok: true
 *                   date: "2026-04-14"
 *                   opening: null
 *       400: { description: Falta club_id o date inválida }
 *       401: { description: Sin token o sesión inválida }
 *       403: { description: Sin acceso al club }
 *       500: { description: Error de base de datos }
 *       503: { description: Tabla no migrada }
 */
export async function getCashOpeningForDayHandler(req: Request, res: Response): Promise<void> {
  const clubId = String(req.query.club_id ?? '').trim();
  if (!clubId) {
    res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
    return;
  }
  if (!req.authContext) {
    res.status(401).json({ ok: false, error: 'Token requerido' });
    return;
  }
  if (!canAccessClubForPayments(req, clubId)) {
    res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    return;
  }

  const dateStr = String(req.query.date ?? '').trim() || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    res.status(400).json({ ok: false, error: 'date inválida. Usa YYYY-MM-DD.' });
    return;
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('club_cash_openings')
      .select('id, club_id, staff_id, employee_name, opened_by_name, opened_at, for_date, opening_cash_cents, notes')
      .eq('club_id', clubId)
      .eq('for_date', dateStr)
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        res.status(503).json({
          ok: false,
          error: 'Tabla club_cash_openings no existe. Aplica la migración 013 en base de datos.',
        });
        return;
      }
      res.status(500).json({ ok: false, error: error.message });
      return;
    }

    const opening = data
      ? {
          ...(data as Record<string, unknown>),
          employee_name: (data as Record<string, unknown>).employee_name ?? (data as Record<string, unknown>).opened_by_name ?? null,
        }
      : null;
    res.json({ ok: true, date: dateStr, opening });
  } catch (err) {
    console.error('[payments/cash-opening/today]', err);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
}

/**
 * POST /payments/cash-opening/records
 * Guarda apertura de caja del día para el club.
 *
 * @openapi
 * /payments/cash-opening/records:
 *   post:
 *     tags: [Cash opening]
 *     summary: Registrar apertura de caja diaria
 *     description: |
 *       Persiste el saldo inicial de caja para `for_date`, con empleado responsable.
 *       Solo permite una apertura por día y club (si ya existe devuelve 409).
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [club_id, staff_id, opening_cash_cents]
 *             properties:
 *               club_id: { type: string, format: uuid, description: Club al que pertenece la caja }
 *               staff_id: { type: string, format: uuid, description: Empleado responsable de la apertura }
 *               for_date: { type: string, example: "2026-04-14", description: Día de operación (YYYY-MM-DD) }
 *               opening_cash_cents: { type: integer, minimum: 0, description: Saldo inicial en céntimos }
 *               notes: { type: string, description: Observaciones opcionales de apertura }
 *           example:
 *             club_id: "uuid"
 *             staff_id: "uuid"
 *             for_date: "2026-04-14"
 *             opening_cash_cents: 25000
 *             notes: "Apertura turno mañana"
 *     responses:
 *       201:
 *         description: Creado
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               record:
 *                 id: "uuid"
 *                 club_id: "uuid"
 *                 staff_id: "uuid"
 *                 employee_name: "Martina"
 *                 opened_at: "2026-04-14T07:59:00.000Z"
 *                 for_date: "2026-04-14"
 *                 opening_cash_cents: 25000
 *                 notes: "Apertura turno mañana"
 *       400: { description: Validación de datos }
 *       401: { description: Sin token }
 *       403: { description: Sin acceso o staff inválido }
 *       409: { description: Ya existe apertura para ese día }
 *       500: { description: Error de base de datos }
 *       503: { description: Tabla no migrada }
 */
export async function createCashOpeningRecordHandler(req: Request, res: Response): Promise<void> {
  if (!req.authContext) {
    res.status(401).json({ ok: false, error: 'Token requerido' });
    return;
  }

  const { club_id: bodyClubId, staff_id, for_date, opening_cash_cents, notes } = req.body ?? {};
  const clubId = typeof bodyClubId === 'string' ? bodyClubId.trim() : '';
  const staffId = typeof staff_id === 'string' ? staff_id.trim() : '';
  if (!clubId || !staffId) {
    res.status(400).json({ ok: false, error: 'club_id y staff_id son obligatorios' });
    return;
  }
  if (!canAccessClubForPayments(req, clubId)) {
    res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    return;
  }

  const openingCashCents = Math.trunc(Number(opening_cash_cents));
  if (!Number.isFinite(openingCashCents) || openingCashCents < 0) {
    res.status(400).json({ ok: false, error: 'opening_cash_cents debe ser un entero >= 0' });
    return;
  }
  const forDateStr =
    typeof for_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(for_date.trim())
      ? for_date.trim()
      : new Date().toISOString().slice(0, 10);

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: staffRow, error: staffErr } = await supabase
      .from('club_staff')
      .select('id, club_id, name, status')
      .eq('id', staffId)
      .maybeSingle();

    if (staffErr) {
      res.status(500).json({ ok: false, error: staffErr.message });
      return;
    }
    if (!staffRow || staffRow.club_id !== clubId) {
      res.status(403).json({ ok: false, error: 'El empleado no pertenece a este club' });
      return;
    }
    if (staffRow.status !== 'active') {
      res.status(400).json({ ok: false, error: 'El empleado no está activo' });
      return;
    }

    const { data: existing, error: existingErr } = await supabase
      .from('club_cash_openings')
      .select('id')
      .eq('club_id', clubId)
      .eq('for_date', forDateStr)
      .limit(1)
      .maybeSingle();
    if (existingErr && !(existingErr.message.includes('relation') && existingErr.message.includes('does not exist'))) {
      res.status(500).json({ ok: false, error: existingErr.message });
      return;
    }
    if (existing?.id) {
      res.status(409).json({ ok: false, error: 'Ya existe una apertura de caja para este día' });
      return;
    }

    const employeeName = String(staffRow.name ?? '').trim() || 'Empleado';
    const { data: inserted, error: insErr } = await supabase
      .from('club_cash_openings')
      .insert({
        club_id: clubId,
        staff_id: staffId,
        employee_name: employeeName,
        opened_by_name: employeeName,
        for_date: forDateStr,
        opening_cash_cents: openingCashCents,
        notes: typeof notes === 'string' ? notes.trim().slice(0, 2000) : null,
      })
      .select('id, club_id, staff_id, employee_name, opened_by_name, opened_at, for_date, opening_cash_cents, notes')
      .maybeSingle();

    if (insErr) {
      if (insErr.message.includes('relation') && insErr.message.includes('does not exist')) {
        res.status(503).json({
          ok: false,
          error: 'Tabla club_cash_openings no existe. Aplica la migración 013 en base de datos.',
        });
        return;
      }
      console.error('[payments/cash-opening/records POST]', insErr);
      res.status(500).json({ ok: false, error: insErr.message });
      return;
    }

    const record = inserted
      ? {
          ...(inserted as Record<string, unknown>),
          employee_name:
            (inserted as Record<string, unknown>).employee_name ??
            (inserted as Record<string, unknown>).opened_by_name ??
            null,
        }
      : null;
    res.status(201).json({ ok: true, record });
  } catch (err) {
    console.error('[payments/cash-opening/records POST]', err);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
}

/**
 * GET /payments/cash-closing/records
 * Historial de arqueos guardados para el club.
 *
 * @openapi
 * /payments/cash-closing/records:
 *   get:
 *     tags: [Cash closing]
 *     summary: Listar arqueos de caja guardados
 *     description: Devuelve los cierres persistidos del club, más recientes primero.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: club_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: date
 *         required: false
 *         schema: { type: string, example: "2026-04-14" }
 *         description: Filtra por día operativo (`for_date`)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 200 }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               records:
 *                 - id: "uuid"
 *                   closed_at: "2026-03-25T18:00:00Z"
 *                   employee_name: "Ana"
 *                   real_cash_cents: 21600
 *                   status: "perfect"
 *       400: { description: Falta club_id }
 *       401: { description: Sin token }
 *       403: { description: Sin acceso al club }
 *       500: { description: Error de base de datos }
 *       503: { description: Tabla no migrada }
 */
export async function listCashClosingRecordsHandler(req: Request, res: Response): Promise<void> {
  const clubId = String(req.query.club_id ?? '').trim();
  if (!clubId) {
    res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
    return;
  }
  if (!req.authContext) {
    res.status(401).json({ ok: false, error: 'Token requerido' });
    return;
  }
  if (!canAccessClubForPayments(req, clubId)) {
    res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    return;
  }
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const dateStr = String(req.query.date ?? '').trim();
  if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    res.status(400).json({ ok: false, error: 'date inválida. Usa YYYY-MM-DD.' });
    return;
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    let query = supabase
      .from('club_cash_closings')
      .select(
        'id, club_id, staff_id, employee_name, closed_at, for_date, real_cash_cents, real_card_cents, system_cash_cents, system_card_cents, difference_cents, observations, status'
      )
      .eq('club_id', clubId)
      .order('closed_at', { ascending: false })
      .limit(limit);
    if (dateStr) query = query.eq('for_date', dateStr);
    const { data, error } = await query;

    if (error) {
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        res.status(503).json({
          ok: false,
          error: 'Tabla club_cash_closings no existe. Aplica la migración 012 en Supabase.',
        });
        return;
      }
      console.error('[payments/cash-closing/records]', error);
      res.status(500).json({ ok: false, error: error.message });
      return;
    }

    res.json({ ok: true, records: data ?? [] });
  } catch (err) {
    console.error('[payments/cash-closing/records]', err);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
}

/**
 * POST /payments/cash-closing/records
 * Guarda un arqueo de caja (persistente).
 *
 * @openapi
 * /payments/cash-closing/records:
 *   post:
 *     tags: [Cash closing]
 *     summary: Guardar arqueo de caja
 *     description: |
 *       Persiste el cierre con montos en céntimos y valida que `staff_id` pertenezca al club.
 *       Calcula `difference_cents` y `status` en servidor.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [club_id, staff_id, real_cash_cents, real_card_cents, system_cash_cents, system_card_cents]
 *             properties:
 *               club_id: { type: string, format: uuid }
 *               staff_id: { type: string, format: uuid }
 *               for_date: { type: string, example: "2026-03-25", description: Día del arqueo (YYYY-MM-DD) }
 *               real_cash_cents: { type: integer, minimum: 0 }
 *               real_card_cents: { type: integer, minimum: 0 }
 *               system_cash_cents: { type: integer, minimum: 0 }
 *               system_card_cents: { type: integer, minimum: 0 }
 *               observations: { type: string }
 *           example:
 *             club_id: "uuid"
 *             staff_id: "uuid"
 *             for_date: "2026-03-25"
 *             real_cash_cents: 21600
 *             real_card_cents: 18800
 *             system_cash_cents: 21600
 *             system_card_cents: 18800
 *             observations: "OK"
 *     responses:
 *       201:
 *         description: Creado
 *       400: { description: Validación }
 *       401: { description: Sin token }
 *       403: { description: Sin acceso o staff no pertenece al club }
 *       500: { description: Error de base de datos }
 *       503: { description: Tabla no migrada }
 */
export async function createCashClosingRecordHandler(req: Request, res: Response): Promise<void> {
  if (!req.authContext) {
    res.status(401).json({ ok: false, error: 'Token requerido' });
    return;
  }

  const {
    club_id: bodyClubId,
    staff_id,
    for_date,
    real_cash_cents,
    real_card_cents,
    system_cash_cents,
    system_card_cents,
    observations,
  } = req.body ?? {};

  const clubId = typeof bodyClubId === 'string' ? bodyClubId.trim() : '';
  const staffId = typeof staff_id === 'string' ? staff_id.trim() : '';

  if (!clubId || !staffId) {
    res.status(400).json({ ok: false, error: 'club_id y staff_id son obligatorios' });
    return;
  }
  if (!canAccessClubForPayments(req, clubId)) {
    res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    return;
  }

  const rc = Math.trunc(Number(real_cash_cents));
  const rcd = Math.trunc(Number(real_card_cents));
  const sc = Math.trunc(Number(system_cash_cents));
  const scd = Math.trunc(Number(system_card_cents));
  if (![rc, rcd, sc, scd].every((n) => Number.isFinite(n) && n >= 0)) {
    res.status(400).json({ ok: false, error: 'Los montos en céntimos deben ser números >= 0' });
    return;
  }

  const forDateStr =
    typeof for_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(for_date.trim())
      ? for_date.trim()
      : new Date().toISOString().slice(0, 10);

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data: staffRow, error: staffErr } = await supabase
      .from('club_staff')
      .select('id, club_id, name, status')
      .eq('id', staffId)
      .maybeSingle();

    if (staffErr) {
      res.status(500).json({ ok: false, error: staffErr.message });
      return;
    }
    if (!staffRow || staffRow.club_id !== clubId) {
      res.status(403).json({ ok: false, error: 'El empleado no pertenece a este club' });
      return;
    }
    if (staffRow.status !== 'active') {
      res.status(400).json({ ok: false, error: 'El empleado no está activo' });
      return;
    }

    const employeeName = String(staffRow.name ?? '').trim() || 'Empleado';
    const diffCents = Math.trunc(rc + rcd - sc - scd);
    const status = cashClosingStatusFromDiffCents(diffCents);

    const { data: inserted, error: insErr } = await supabase
      .from('club_cash_closings')
      .insert({
        club_id: clubId,
        staff_id: staffId,
        employee_name: employeeName,
        for_date: forDateStr,
        real_cash_cents: rc,
        real_card_cents: rcd,
        system_cash_cents: sc,
        system_card_cents: scd,
        difference_cents: diffCents,
        observations: typeof observations === 'string' ? observations.trim().slice(0, 2000) : null,
        status,
      })
      .select(
        'id, club_id, staff_id, employee_name, closed_at, for_date, real_cash_cents, real_card_cents, system_cash_cents, system_card_cents, difference_cents, observations, status'
      )
      .maybeSingle();

    if (insErr) {
      if (insErr.message.includes('relation') && insErr.message.includes('does not exist')) {
        res.status(503).json({
          ok: false,
          error: 'Tabla club_cash_closings no existe. Aplica la migración 012 en Supabase.',
        });
        return;
      }
      console.error('[payments/cash-closing/records POST]', insErr);
      res.status(500).json({ ok: false, error: insErr.message });
      return;
    }

    res.status(201).json({ ok: true, record: inserted });
  } catch (err) {
    console.error('[payments/cash-closing/records POST]', err);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
}

async function processNewMatchPayment(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  pi: Stripe.PaymentIntent
): Promise<void> {
  const meta = pi.metadata ?? {};
  const court_id = meta.court_id;
  const organizer_player_id = meta.organizer_player_id;
  const payer_player_id = meta.payer_player_id;
  const start_at = meta.start_at;
  const end_at = meta.end_at;
  const total_price_cents = parseInt(meta.total_price_cents ?? '0', 10);
  const timezone = meta.timezone ?? 'Europe/Madrid';
  const visibility = meta.visibility === 'public' ? 'public' : 'private';
  const competitive = meta.competitive !== '0';
  const gender = meta.gender ?? 'any';
  const elo_min = meta.elo_min ? parseInt(meta.elo_min, 10) : null;
  const elo_max = meta.elo_max ? parseInt(meta.elo_max, 10) : null;
  const source_channel = ['mobile', 'web', 'manual', 'system'].includes(meta.source_channel)
    ? meta.source_channel
    : 'mobile';

  if (!court_id || !organizer_player_id || !start_at || !end_at || total_price_cents <= 0) return;

  const newStart = new Date(start_at).getTime();
  const newEnd = new Date(end_at).getTime();
  const { data: courtBookings } = await supabase
    .from('bookings')
    .select('id, start_at, end_at')
    .eq('court_id', court_id)
    .in('status', ['confirmed', 'pending_payment']);
  const courtOverlaps = (courtBookings ?? []).some((b) => {
    const exStart = new Date(b.start_at).getTime();
    const exEnd = new Date(b.end_at).getTime();
    return newStart < exEnd && newEnd > exStart;
  });
  if (courtOverlaps) {
    console.error('[payments/webhook] Slot already booked, skipping booking creation. Payment may need refund.', {
      court_id,
      start_at,
      end_at,
      paymentIntentId: pi.id,
    });
    return;
  }

  const isPayFull = meta.pay_full === '1';
  const shareCents = isPayFull ? total_price_cents : Math.ceil(total_price_cents / 4);

  const { data: booking, error: errBooking } = await supabase
    .from('bookings')
    .insert([{
      court_id,
      organizer_player_id,
      start_at,
      end_at,
      timezone,
      total_price_cents,
      currency: 'EUR',
      status: 'confirmed',
      source_channel,
    }])
    .select('id')
    .maybeSingle();

  if (errBooking || !booking) {
    console.error('[payments/webhook] Error creando booking:', errBooking);
    return;
  }

  const { data: match, error: errMatch } = await supabase
    .from('matches')
    .insert([{
      booking_id: booking.id,
      visibility,
      elo_min,
      elo_max,
      gender,
      competitive,
    }])
    .select('id')
    .maybeSingle();

  if (errMatch || !match) {
    console.error('[payments/webhook] Error creando match:', errMatch);
    return;
  }

  await supabase.from('booking_participants').insert([{
    booking_id: booking.id,
    player_id: organizer_player_id,
    role: 'organizer',
    share_amount_cents: shareCents,
    payment_status: 'paid',
  }]);

  await supabase.from('match_players').insert([{
    match_id: match.id,
    player_id: organizer_player_id,
    team: 'A',
    invite_status: 'accepted',
    slot_index: 0,
  }]);

  await supabase.from('payment_transactions').insert({
    booking_id: booking.id,
    payer_player_id: payer_player_id ?? organizer_player_id,
    amount_cents: shareCents,
    currency: 'EUR',
    stripe_payment_intent_id: pi.id,
    status: 'succeeded',
  });
}

/**
 * POST /payments/confirm-client
 * Body: { payment_intent_id }
 * Headers: Authorization: Bearer <token>
 *
 * Tras pago exitoso: si es "nuevo partido" (metadata con court_id) crea booking+match.
 * Si es pago de participante existente (metadata con booking_id) solo actualiza estados.
 */
export async function confirmClientHandler(req: Request, res: Response): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ ok: false, error: 'Token requerido' });
    return;
  }

  const { payment_intent_id } = req.body ?? {};
  if (!payment_intent_id || typeof payment_intent_id !== 'string') {
    res.status(400).json({ ok: false, error: 'payment_intent_id es obligatorio' });
    return;
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user?.email) {
      res.status(401).json({ ok: false, error: 'Sesión inválida o expirada' });
      return;
    }

    const stripe = getStripe();
    const pi = await stripe.paymentIntents.retrieve(payment_intent_id);
    if (pi.status !== 'succeeded') {
      res.status(400).json({ ok: false, error: 'El pago aún no está confirmado' });
      return;
    }

    const meta = pi.metadata ?? {};
    const payer_player_id = meta.payer_player_id;

    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('email', user.email.trim().toLowerCase())
      .maybeSingle();
    if (!player || (payer_player_id && player.id !== payer_player_id)) {
      res.status(403).json({ ok: false, error: 'No eres el pagador de este pago' });
      return;
    }

    // Flujo "nuevo partido": metadata tiene court_id, no booking_id
    if (meta.court_id && meta.organizer_player_id) {
      const { data: existingTx } = await supabase
        .from('payment_transactions')
        .select('booking_id')
        .eq('stripe_payment_intent_id', payment_intent_id)
        .maybeSingle();
      if (existingTx) {
        const { data: m } = await supabase
          .from('matches')
          .select('id, created_at, booking_id, visibility, elo_min, elo_max, gender, competitive, status')
          .eq('booking_id', existingTx.booking_id)
          .maybeSingle();
        res.json({ ok: true, match: m ?? {}, booking: { id: existingTx.booking_id } });
        return;
      }
      const court_id = meta.court_id;
      const organizer_player_id = meta.organizer_player_id;
      const start_at = meta.start_at;
      const end_at = meta.end_at;
      const total_price_cents = parseInt(meta.total_price_cents ?? '0', 10);
      const timezone = meta.timezone ?? 'Europe/Madrid';
      const visibility = meta.visibility === 'public' ? 'public' : 'private';
      const competitive = meta.competitive !== '0';
      const gender = meta.gender ?? 'any';
      const elo_min = meta.elo_min ? parseInt(meta.elo_min, 10) : null;
      const elo_max = meta.elo_max ? parseInt(meta.elo_max, 10) : null;
      const source_channel = ['mobile', 'web', 'manual', 'system'].includes(meta.source_channel)
        ? meta.source_channel
        : 'mobile';

      if (!court_id || !start_at || !end_at || total_price_cents <= 0) {
        res.status(400).json({ ok: false, error: 'Metadata de pago incompleta' });
        return;
      }

      if (organizer_player_id !== player.id) {
        res.status(403).json({ ok: false, error: 'No eres el organizador' });
        return;
      }

      const newStart = new Date(start_at).getTime();
      const newEnd = new Date(end_at).getTime();
      const { data: courtBookings } = await supabase
        .from('bookings')
        .select('id, start_at, end_at')
        .eq('court_id', court_id)
        .in('status', ['confirmed', 'pending_payment']);
      const courtOverlaps = (courtBookings ?? []).some((b) => {
        const exStart = new Date(b.start_at).getTime();
        const exEnd = new Date(b.end_at).getTime();
        return newStart < exEnd && newEnd > exStart;
      });
      if (courtOverlaps) {
        res.status(400).json({
          ok: false,
          error: 'Esa pista ya está reservada para ese horario. Contacta con soporte para el reembolso.',
        });
        return;
      }

      const isPayFull = meta.pay_full === '1';
      const shareCents = isPayFull ? total_price_cents : Math.ceil(total_price_cents / 4);

      const { data: booking, error: errBooking } = await supabase
        .from('bookings')
        .insert([{
          court_id,
          organizer_player_id,
          start_at,
          end_at,
          timezone,
          total_price_cents,
          currency: 'EUR',
          status: 'confirmed',
          source_channel,
        }])
        .select('id')
        .maybeSingle();

      if (errBooking || !booking) {
        console.error('[payments/confirm-client] Error creando booking:', errBooking);
        res.status(500).json({ ok: false, error: 'No se pudo crear la reserva' });
        return;
      }

      const { data: match, error: errMatch } = await supabase
        .from('matches')
        .insert([{
          booking_id: booking.id,
          visibility,
          elo_min,
          elo_max,
          gender,
          competitive,
        }])
        .select('id, created_at, booking_id, visibility, elo_min, elo_max, gender, competitive, status')
        .maybeSingle();

      if (errMatch || !match) {
        console.error('[payments/confirm-client] Error creando match:', errMatch);
        res.status(500).json({ ok: false, error: 'No se pudo crear el partido' });
        return;
      }

      const { data: organizerParticipant, error: errBP } = await supabase
        .from('booking_participants')
        .insert([{
          booking_id: booking.id,
          player_id: organizer_player_id,
          role: 'organizer',
          share_amount_cents: shareCents,
          payment_status: 'paid',
        }])
        .select('id')
        .maybeSingle();

      if (errBP || !organizerParticipant) {
        console.error('[payments/confirm-client] Error creando participant:', errBP);
      }

      const { error: errMP } = await supabase.from('match_players').insert([{
        match_id: match.id,
        player_id: organizer_player_id,
        team: 'A',
        invite_status: 'accepted',
        slot_index: 0,
      }]);
      if (errMP) console.error('[payments/confirm-client] Error creando match_player:', errMP);

      await supabase.from('payment_transactions').insert({
        booking_id: booking.id,
        payer_player_id: player.id,
        amount_cents: shareCents,
        currency: 'EUR',
        stripe_payment_intent_id: pi.id,
        status: 'succeeded',
      });

      res.json({ ok: true, match, booking: { id: booking.id } });
      return;
    }

    // Inscripción torneo (pago)
    if (
      meta.purpose === STRIPE_META_TOURNAMENT_PURPOSE &&
      meta.tournament_id &&
      payer_player_id
    ) {
      const amountCents =
        typeof pi.amount_received === 'number' ? pi.amount_received : Number(pi.amount ?? 0);
      const done = await finalizeTournamentPaidJoin({
        tournamentId: String(meta.tournament_id),
        playerId: String(payer_player_id),
        stripePaymentIntentId: payment_intent_id,
        amountCents,
      });
      if (!done.ok) {
        console.warn('[payments/confirm-client] finalizeTournamentPaidJoin rejected', {
          payment_intent_id,
          tournament_id: String(meta.tournament_id),
          payer_player_id: String(payer_player_id),
          amountCents,
          error: done.error,
        });
        res.status(400).json({ ok: false, error: done.error });
        return;
      }
      res.json({ ok: true, tournament_id: String(meta.tournament_id) });
      return;
    }

    // Flujo "pago de participante existente" (join)
    const { booking_id, participant_id } = meta;
    if (!booking_id || !participant_id || !payer_player_id) {
      res.status(400).json({ ok: false, error: 'Metadata de pago inválida' });
      return;
    }

    await supabase
      .from('payment_transactions')
      .update({ status: 'succeeded', updated_at: new Date().toISOString() })
      .eq('stripe_payment_intent_id', pi.id);

    await supabase
      .from('booking_participants')
      .update({ payment_status: 'paid' })
      .eq('id', participant_id);

    const { data: participant } = await supabase
      .from('booking_participants')
      .select('role, player_id')
      .eq('id', participant_id)
      .maybeSingle();

    // Si es guest (join): añadir a match_players tras el pago
    if (participant?.role === 'guest') {
      const { data: match } = await supabase
        .from('matches')
        .select('id, competitive, type, elo_min, elo_max')
        .eq('booking_id', booking_id)
        .maybeSingle();
      if (match) {
        const { data: joinPlayer } = await supabase
          .from('players')
          .select('elo_rating, onboarding_completed')
          .eq('id', participant.player_id)
          .maybeSingle();
        const mCompetitive = !!(match as { competitive?: boolean }).competitive;
        const mType = String((match as { type?: string }).type ?? 'open');
        if (mCompetitive && !(joinPlayer as { onboarding_completed?: boolean })?.onboarding_completed) {
          res.status(403).json({ ok: false, error: 'Complete el cuestionario de nivelación primero' });
          return;
        }
        const eloJoin = Number((joinPlayer as { elo_rating?: number }).elo_rating ?? 0);
        const eloMin = (match as { elo_min?: number | null }).elo_min;
        const eloMax = (match as { elo_max?: number | null }).elo_max;
        if (mCompetitive && mType === 'open' && eloMin != null && eloMax != null) {
          if (eloJoin < eloMin || eloJoin > eloMax) {
            res.status(403).json({ ok: false, error: 'Tu nivel no está en el rango permitido para este partido' });
            return;
          }
        }

        const { data: existing } = await supabase
          .from('match_players')
          .select('id')
          .eq('match_id', match.id)
          .eq('player_id', participant.player_id)
          .maybeSingle();
        if (!existing) {
          const slotIdx = meta.slot_index != null ? parseInt(meta.slot_index, 10) : undefined;
          const team = slotIdx != null ? (slotIdx <= 1 ? 'A' : 'B') : 'A';
          await supabase.from('match_players').insert({
            match_id: match.id,
            player_id: participant.player_id,
            team,
            invite_status: 'accepted',
            slot_index: slotIdx ?? null,
          });
        }
      }
    }

    await refreshBookingStatusAfterParticipantPayment(supabase, booking_id);

    res.json({ ok: true });
  } catch (err) {
    console.error('[payments/confirm-client]', err);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
}

type SimulatedTurnPaymentStatus = 'approved' | 'pending' | 'rejected';
type SimulatedTurnPaymentMethod = 'cash' | 'card';

/**
 * @openapi
 * /payments/simulate-turn-payment:
 *   post:
 *     tags: [Payments]
 *     summary: Simular y confirmar pago de turno (sin pasarela real)
 *     description: |
 *       Endpoint mock para entornos sin pasarela real (o para pruebas manuales).
 *       Por defecto (`always_paid=true`) marca el `booking_participants.payment_status=paid`,
 *       actualiza el `booking` si corresponde y crea una `payment_transactions` mock con estado `succeeded`.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema: { type: string }
 *         description: Token Bearer del usuario autenticado.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [booking_id, amount_cents]
 *             properties:
 *               booking_id:
 *                 type: string
 *                 format: uuid
 *                 description: ID del turno/reserva a cobrar.
 *               amount_cents:
 *                 type: integer
 *                 minimum: 50
 *                 description: Monto en centavos.
 *               currency:
 *                 type: string
 *                 default: EUR
 *                 example: EUR
 *               payment_method:
 *                 type: string
 *                 enum: [cash, card]
 *                 default: cash
 *                 description: |
 *                   Clasifica el pago como físico (cash) o no físico (card).
 *                   Se refleja en `stripe_payment_intent_id` mock (prefijo `CASH_` o `MOCK_`).
 *               participant_id:
 *                 type: string
 *                 format: uuid
 *                 description: |
 *                   ID de `booking_participants` a marcar como pagado.
 *                   Si se omite, se usa el participante `organizer` si existe; si no, el primero disponible.
 *               payer_player_id:
 *                 type: string
 *                 format: uuid
 *                 description: Jugador que figura como pagador en `payment_transactions` (opcional).
 *               force_status:
 *                 type: string
 *                 enum: [approved, pending, rejected]
 *                 description: Fuerza el estado de simulación si `always_paid=false`.
 *               always_paid:
 *                 type: boolean
 *                 default: true
 *                 description: Si es `true`, siempre se marca como aprobado y se persiste como `succeeded`.
 *           examples:
 *             approved:
 *               value:
 *                 booking_id: "7fa11d8c-4cbc-4ed4-b6bf-95b6539df24b"
 *                 amount_cents: 3200
 *                 currency: "EUR"
 *                 force_status: "approved"
 *                 payment_method: "cash"
 *                 always_paid: true
 *     responses:
 *       200:
 *         description: Pago simulado y confirmado (si `always_paid=true`)
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value:
 *                   ok: true
 *                   paid: true
 *                   gateway: "mock"
 *                   booking_id: "7fa11d8c-4cbc-4ed4-b6bf-95b6539df24b"
 *                   participant_id: "..."
 *                   payment_method: "cash"
 *                   amount_cents: 3200
 *                   currency: "EUR"
 *                   status: "approved"
 *                   transaction_id: "CASH_..."
 *       400:
 *         description: Validación de entrada
 *         content:
 *           application/json:
 *             example: { ok: false, error: "booking_id y amount_cents son obligatorios" }
 *       404:
 *         description: Turno/reserva o participante no encontrada
 *       401:
 *         description: Sin token o sesión inválida
 *       500:
 *         description: Error interno
 */
export async function simulateTurnPaymentHandler(req: Request, res: Response): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ ok: false, error: 'Token requerido' });
    return;
  }

  const {
    booking_id,
    amount_cents,
    currency,
    force_status,
    payment_method,
    participant_id,
    payer_player_id,
    always_paid,
  } = req.body ?? {};
  if (!booking_id || amount_cents == null) {
    res.status(400).json({ ok: false, error: 'booking_id y amount_cents son obligatorios' });
    return;
  }

  const parsedAmount = Number(amount_cents);
  if (!Number.isFinite(parsedAmount) || parsedAmount < 50) {
    res.status(400).json({ ok: false, error: 'amount_cents debe ser un entero mayor o igual a 50' });
    return;
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user?.email) {
      res.status(401).json({ ok: false, error: 'Sesion invalida o expirada' });
      return;
    }

    const paymentMethodRaw = typeof payment_method === 'string' ? payment_method : null;
    const payment_method_validated: SimulatedTurnPaymentMethod = paymentMethodRaw === 'cash' ? 'cash' : 'card';
    if (paymentMethodRaw != null && !['cash', 'card'].includes(paymentMethodRaw)) {
      res.status(400).json({ ok: false, error: 'payment_method inválido. Usa cash o card.' });
      return;
    }

    const alwaysPaid = always_paid === undefined ? true : Boolean(always_paid);

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, status, total_price_cents, currency, source_channel')
      .eq('id', booking_id)
      .maybeSingle();

    if (!booking) {
      res.status(404).json({ ok: false, error: 'Turno/reserva no encontrada' });
      return;
    }

    const { data: participantRows, error: participantErr } = await supabase
      .from('booking_participants')
      .select('id, role, player_id, share_amount_cents')
      .eq('booking_id', booking_id);
    if (participantErr) {
      res.status(500).json({ ok: false, error: participantErr.message });
      return;
    }
    if (!participantRows || participantRows.length === 0) {
      res.status(404).json({ ok: false, error: 'No existe booking_participants para este booking' });
      return;
    }

    const chosenParticipant = participant_id
      ? participantRows.find((p) => p.id === participant_id) ?? null
      : (participantRows.find((p) => p.role === 'organizer') ?? participantRows[0]);

    if (!chosenParticipant) {
      res.status(404).json({ ok: false, error: 'participant_id no encontrado para este booking' });
      return;
    }

    const forced = typeof force_status === 'string' ? force_status : null;
    const statusPool: SimulatedTurnPaymentStatus[] = ['approved', 'pending', 'rejected'];
    const randomStatus = statusPool[Math.floor(Math.random() * statusPool.length)];
    const simulatedStatus = statusPool.includes(forced as SimulatedTurnPaymentStatus)
      ? (forced as SimulatedTurnPaymentStatus)
      : randomStatus;
    const finalStatus: SimulatedTurnPaymentStatus = alwaysPaid ? 'approved' : simulatedStatus;

    const transactionPrefix = payment_method_validated === 'cash' ? 'CASH' : 'MOCK';
    const transactionId = `${transactionPrefix}_${booking_id}_${chosenParticipant.id}`;
    const currencyOut = (currency ?? booking.currency ?? 'EUR').toString().toUpperCase();
    const amountToCharge = Math.trunc(parsedAmount);
    const payerId = (payer_player_id != null && String(payer_player_id).trim())
      ? String(payer_player_id).trim()
      : chosenParticipant.player_id;

    if (finalStatus !== 'approved') {
      res.json({
        ok: true,
        paid: false,
        simulated: true,
        gateway: 'mock',
        booking_id: booking.id,
        participant_id: chosenParticipant.id,
        payment_method: payment_method_validated,
        amount_cents: amountToCharge,
        currency: currencyOut,
        status: finalStatus,
        transaction_id: transactionId,
        message: 'Simulación completada. No se confirmó el pago.',
      });
      return;
    }

    const { data: existingTx } = await supabase
      .from('payment_transactions')
      .select('id')
      .eq('stripe_payment_intent_id', transactionId)
      .maybeSingle();

    if (!existingTx) {
      await supabase.from('payment_transactions').insert({
        booking_id: booking.id,
        payer_player_id: payerId,
        amount_cents: amountToCharge,
        currency: currencyOut,
        stripe_payment_intent_id: transactionId,
        status: 'succeeded',
      });
    } else {
      await supabase
        .from('payment_transactions')
        .update({ status: 'succeeded', updated_at: new Date().toISOString() })
        .eq('stripe_payment_intent_id', transactionId);
    }

    await supabase
      .from('booking_participants')
      .update({ payment_status: 'paid' })
      .eq('id', chosenParticipant.id);

    if (chosenParticipant.role === 'organizer') {
      const nextSourceChannel = payment_method_validated === 'cash' ? 'manual' : 'mobile';
      await supabase
        .from('bookings')
        .update({
          source_channel: nextSourceChannel,
          updated_at: new Date().toISOString(),
        })
        .eq('id', booking.id);
    }

    if (chosenParticipant.role === 'guest') {
      const { data: match } = await supabase
        .from('matches')
        .select('id')
        .eq('booking_id', booking.id)
        .maybeSingle();

      if (match) {
        const { data: existing } = await supabase
          .from('match_players')
          .select('id')
          .eq('match_id', match.id)
          .eq('player_id', chosenParticipant.player_id)
          .maybeSingle();

        if (!existing) {
          await supabase.from('match_players').insert({
            match_id: match.id,
            player_id: chosenParticipant.player_id,
            team: 'A',
            invite_status: 'accepted',
            slot_index: null,
          });
        }
      }
    }

    await refreshBookingStatusAfterParticipantPayment(supabase, booking.id);

    res.json({
      ok: true,
      paid: true,
      simulated: true,
      gateway: 'mock',
      booking_id: booking.id,
      participant_id: chosenParticipant.id,
      payment_method: payment_method_validated,
      amount_cents: amountToCharge,
      currency: currencyOut,
      status: finalStatus,
      transaction_id: transactionId,
      message: 'Pago simulado y confirmado (sin pasarela real).',
    });
  } catch (err) {
    console.error('[payments/simulate-turn-payment]', err);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
}
