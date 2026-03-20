import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { recordPayment } from '../lib/payment';

const router = Router();

const SELECT_LIST =
  'id, created_at, court_id, organizer_player_id, start_at, end_at, timezone, total_price_cents, currency, status, reservation_type, source_channel, notes, players!bookings_organizer_player_id_fkey(first_name, last_name)';
const SELECT_ONE =
  'id, created_at, updated_at, court_id, organizer_player_id, start_at, end_at, timezone, total_price_cents, currency, pricing_rule_ids, status, reservation_type, source_channel, cancelled_at, cancelled_by, cancellation_reason, notes, players!bookings_organizer_player_id_fkey(id, first_name, last_name, email), booking_participants(player_id, role, players!booking_participants_player_id_fkey(id, first_name, last_name, email))';

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
    .neq('status', 'cancelled');
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
