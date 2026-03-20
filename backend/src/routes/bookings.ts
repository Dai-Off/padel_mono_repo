import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { recordPayment } from '../lib/payment';

const router = Router();

const SELECT_LIST =
  'id, created_at, court_id, organizer_player_id, start_at, end_at, timezone, total_price_cents, currency, status, reservation_type, source_channel, notes, players!bookings_organizer_player_id_fkey(first_name, last_name)';
const SELECT_ONE =
  'id, created_at, updated_at, court_id, organizer_player_id, start_at, end_at, timezone, total_price_cents, currency, pricing_rule_ids, status, reservation_type, source_channel, cancelled_at, cancelled_by, cancellation_reason, notes, players!bookings_organizer_player_id_fkey(id, first_name, last_name, email), booking_participants(player_id, role, players!booking_participants_player_id_fkey(id, first_name, last_name, email))';

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
    q = q.neq('status', 'cancelled');
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, bookings: data ?? [] });
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
    const { data, error } = await supabase
      .from('bookings')
      .select(SELECT_ONE)
      .eq('id', id)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Booking not found' });
    return res.json({ ok: true, booking: data });
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
    const supabase = getSupabaseServiceRoleClient();

    const wantConfirmed = status === 'confirmed';

    // 1. Insert Booking (siempre como pending; el middleware de pago lo confirma si aplica)
    const { data: booking, error: bookingError } = await supabase
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
      .select(SELECT_ONE)
      .single();

    if (bookingError) return res.status(500).json({ ok: false, error: bookingError.message });

    // 2. Insert Participants
    const participantRows = [
      {
        booking_id: booking.id,
        player_id: organizer_player_id,
        role: 'organizer',
        share_amount_cents: 0,
        payment_status: 'pending',
      },
    ];

    if (Array.isArray(participants)) {
      participants.forEach((p: any) => {
        if (p.player_id && p.player_id !== organizer_player_id) {
          participantRows.push({
            booking_id: booking.id,
            player_id: p.player_id,
            role: 'guest',
            share_amount_cents: 0,
            payment_status: 'pending',
          });
        }
      });
    }

    const { error: participantsError } = await supabase
      .from('booking_participants')
      .insert(participantRows);

    if (participantsError) {
      console.error('Error creating participants:', participantsError.message);
    }

    // 3. Si el admin indicó "Pagar" → middleware de pago simula el cobro
    if (wantConfirmed) {
      const payResult = await recordPayment(booking.id);
      if (!payResult.ok) {
        return res.status(500).json({ ok: false, error: payResult.error ?? 'Error al registrar pago' });
      }
      const { data: updated } = await supabase
        .from('bookings')
        .select(SELECT_ONE)
        .eq('id', booking.id)
        .single();
      return res.status(201).json({ ok: true, booking: updated ?? booking });
    }

    return res.status(201).json({ ok: true, booking });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, cancelled_by, cancellation_reason, notes, booking_type, participants, court_id, start_at, end_at } = req.body ?? {};
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status !== undefined && status !== 'confirmed') update.status = status;
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

  if (Object.keys(update).length === 1 && !Array.isArray(participants) && status !== 'confirmed') {
    return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data, error } = await supabase
      .from('bookings')
      .update(update)
      .eq('id', id)
      .select(SELECT_ONE)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Booking not found' });

    // Si se marca como pagada → middleware de pago
    if (status === 'confirmed') {
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

    // Update guest participants if provided
    if (Array.isArray(participants)) {
      const organizerPlayerId = (data as any).organizer_player_id;

      // Delete existing guest participants
      await supabase
        .from('booking_participants')
        .delete()
        .eq('booking_id', id)
        .eq('role', 'guest');

      // Insert new guests (skip if same as organizer)
      const guestRows = participants
        .filter((p: any) => p.player_id && p.player_id !== organizerPlayerId)
        .map((p: any) => ({
          booking_id: id,
          player_id: p.player_id,
          role: 'guest',
          payment_status: 'pending',
          share_amount_cents: 0,
        }));

      if (guestRows.length > 0) {
        const { error: pErr } = await supabase
          .from('booking_participants')
          .insert(guestRows);
        if (pErr) console.error('Error updating participants:', pErr.message);
      }
    }

    return res.json({ ok: true, booking: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
        cancelled_at: new Date().toISOString(),
        cancelled_by: 'player',
      })
      .eq('id', id)
      .select('id, status')
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Booking not found' });
    return res.json({ ok: true, booking: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
