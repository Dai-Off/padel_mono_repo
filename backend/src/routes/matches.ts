import { Router, Request, Response } from 'express';
import { finalizePastMatches, finalizePastMatchesThrottled } from '../lib/finalizePastMatches';
import { getMatchListPhase } from '../lib/matchLifecycle';
import { getSupabaseServiceRoleClient } from '../lib/supabase';

const router = Router();

const SELECT_LIST =
  'id, created_at, booking_id, visibility, elo_min, elo_max, gender, competitive, status';
const SELECT_ONE =
  'id, created_at, updated_at, booking_id, visibility, elo_min, elo_max, gender, competitive, status';

function expandSelect(bookingRel: 'bookings' | 'bookings!inner'): string {
  return `id, created_at, booking_id, visibility, elo_min, elo_max, gender, competitive, status,
          ${bookingRel} (
            id, start_at, end_at, total_price_cents, currency, court_id,
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

function dateToWeekday(d: Date): 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun' {
  const idx = d.getUTCDay();
  if (idx === 0) return 'sun';
  return (['mon', 'tue', 'wed', 'thu', 'fri', 'sat'][idx - 1] as 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat');
}

async function hasCourtConflict(courtId: string, startAt: string, endAt: string): Promise<string | null> {
  const supabase = getSupabaseServiceRoleClient();
  const startMs = new Date(startAt).getTime();
  const endMs = new Date(endAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) return 'Rango horario inválido';

  const { data: existingBookings, error: bErr } = await supabase
    .from('bookings')
    .select('id, start_at, end_at, status')
    .eq('court_id', courtId)
    .neq('status', 'cancelled');
  if (bErr) return bErr.message;
  const bookingOverlap = (existingBookings ?? []).some((b: any) => {
    const s = new Date(b.start_at).getTime();
    const e = new Date(b.end_at).getTime();
    return startMs < e && endMs > s;
  });
  if (bookingOverlap) return 'La pista ya tiene una reserva en ese horario';

  const { data: court, error: cErr } = await supabase
    .from('courts')
    .select('club_id')
    .eq('id', courtId)
    .maybeSingle();
  if (cErr) return cErr.message;
  const clubId = (court as { club_id?: string } | null)?.club_id;
  if (!clubId) return null;

  const dateStr = startAt.slice(0, 10);
  const weekday = dateToWeekday(new Date(`${dateStr}T00:00:00Z`));
  const { data: courses, error: scErr } = await supabase
    .from('club_school_courses')
    .select('id, starts_on, ends_on, is_active')
    .eq('club_id', clubId)
    .eq('court_id', courtId)
    .eq('is_active', true);
  if (scErr) return scErr.message;
  const validCourseIds = (courses ?? [])
    .filter((c: any) => (!c.starts_on || dateStr >= c.starts_on) && (!c.ends_on || dateStr <= c.ends_on))
    .map((c: any) => c.id);
  if (!validCourseIds.length) return null;
  const { data: days, error: dayErr } = await supabase
    .from('club_school_course_days')
    .select('course_id, weekday, start_time, end_time')
    .in('course_id', validCourseIds)
    .eq('weekday', weekday);
  if (dayErr) return dayErr.message;

  const reqStartMin = Number(startAt.slice(11, 13)) * 60 + Number(startAt.slice(14, 16));
  const reqEndMin = Number(endAt.slice(11, 13)) * 60 + Number(endAt.slice(14, 16));
  const courseOverlap = (days ?? []).some((d: any) => {
    const s = Number(String(d.start_time).slice(0, 2)) * 60 + Number(String(d.start_time).slice(3, 5));
    const e = Number(String(d.end_time).slice(0, 2)) * 60 + Number(String(d.end_time).slice(3, 5));
    return reqStartMin < e && reqEndMin > s;
  });
  if (courseOverlap) return 'La pista está ocupada por un curso de escuela en ese horario';
  return null;
}

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

/** Crea booking + match en una sola llamada. body: court_id, organizer_player_id, start_at, end_at, total_price_cents, visibility?, competitive? */
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
  } = req.body ?? {};
  if (!court_id || !organizer_player_id || !start_at || !end_at || total_price_cents == null) {
    return res.status(400).json({
      ok: false,
      error: 'court_id, organizer_player_id, start_at, end_at y total_price_cents son obligatorios',
    });
  }
  try {
    const conflictReason = await hasCourtConflict(String(court_id), String(start_at), String(end_at));
    if (conflictReason) {
      return res.status(409).json({ ok: false, error: conflictReason });
    }

    const supabase = getSupabaseServiceRoleClient();
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
          elo_min: elo_min != null ? Number(elo_min) : null,
          elo_max: elo_max != null ? Number(elo_max) : null,
          gender: gender ?? 'any',
          competitive: competitive !== false,
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
      .select('id, booking_id, status')
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

router.post('/', async (req: Request, res: Response) => {
  const { booking_id, visibility, elo_min, elo_max, gender, competitive } = req.body ?? {};
  if (!booking_id) {
    return res.status(400).json({ ok: false, error: 'booking_id es obligatorio' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('matches')
      .insert([
        {
          booking_id,
          visibility: visibility === 'public' ? 'public' : 'private',
          elo_min: elo_min != null ? Number(elo_min) : null,
          elo_max: elo_max != null ? Number(elo_max) : null,
          gender: gender ?? 'any',
          competitive: competitive !== false,
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

router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { visibility, elo_min, elo_max, gender, competitive, status } = req.body ?? {};
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
