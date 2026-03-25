import { Request, Response } from 'express';
import Stripe from 'stripe';
import { getSupabaseServiceRoleClient } from '../lib/supabase';

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

    if (participant?.role === 'organizer') {
      await supabase
        .from('bookings')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', booking_id);
    }

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
        booking_id,
        bookings(
          start_at,
          end_at,
          courts(id, name, clubs(id, name, city))
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
      };
    });

    res.json({ ok: true, transactions });
  } catch (err) {
    console.error('[payments/transactions]', err);
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

    if (participant?.role === 'organizer') {
      await supabase
        .from('bookings')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', booking_id);
    }

    // Si es guest (join): añadir a match_players tras el pago
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

    res.json({ ok: true });
  } catch (err) {
    console.error('[payments/confirm-client]', err);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
}

type SimulatedTurnPaymentStatus = 'approved' | 'pending' | 'rejected';

/**
 * @openapi
 * /payments/simulate-turn-payment:
 *   post:
 *     tags: [Payments]
 *     summary: Simular pago de turno (pasarela mock)
 *     description: |
 *       Simula una pasarela de pagos para validar el flujo de cobro de turnos sin depender de Stripe u otro proveedor real.
 *       No genera cobros reales ni persiste transacciones finales.
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
 *               force_status:
 *                 type: string
 *                 enum: [approved, pending, rejected]
 *                 description: Fuerza un estado de respuesta para pruebas.
 *           examples:
 *             approved:
 *               value:
 *                 booking_id: "7fa11d8c-4cbc-4ed4-b6bf-95b6539df24b"
 *                 amount_cents: 3200
 *                 currency: "EUR"
 *                 force_status: "approved"
 *     responses:
 *       200:
 *         description: Resultado de simulación generado
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value:
 *                   ok: true
 *                   simulated: true
 *                   gateway: "mock"
 *                   booking_id: "7fa11d8c-4cbc-4ed4-b6bf-95b6539df24b"
 *                   amount_cents: 3200
 *                   currency: "EUR"
 *                   status: "approved"
 *                   transaction_id: "MOCK_2f122f6e1f"
 *       400:
 *         description: Validación de entrada
 *         content:
 *           application/json:
 *             example: { ok: false, error: "booking_id y amount_cents son obligatorios" }
 *       401:
 *         description: Sin token o sesión inválida
 *       404:
 *         description: Turno/reserva no encontrada
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

  const { booking_id, amount_cents, currency, force_status } = req.body ?? {};
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

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, status, total_price_cents, currency')
      .eq('id', booking_id)
      .maybeSingle();

    if (!booking) {
      res.status(404).json({ ok: false, error: 'Turno/reserva no encontrada' });
      return;
    }

    const statusPool: SimulatedTurnPaymentStatus[] = ['approved', 'pending', 'rejected'];
    const randomStatus = statusPool[Math.floor(Math.random() * statusPool.length)];
    const forced = typeof force_status === 'string' ? force_status : null;
    const status = statusPool.includes(forced as SimulatedTurnPaymentStatus)
      ? (forced as SimulatedTurnPaymentStatus)
      : randomStatus;

    const transactionId = `MOCK_${Math.random().toString(36).slice(2, 12).toUpperCase()}`;
    res.json({
      ok: true,
      simulated: true,
      gateway: 'mock',
      booking_id: booking.id,
      amount_cents: Math.trunc(parsedAmount),
      currency: (currency ?? booking.currency ?? 'EUR').toString().toUpperCase(),
      status,
      transaction_id: transactionId,
      message: 'Simulacion completada. No se realizo ningun cobro real.',
    });
  } catch (err) {
    console.error('[payments/simulate-turn-payment]', err);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
}
