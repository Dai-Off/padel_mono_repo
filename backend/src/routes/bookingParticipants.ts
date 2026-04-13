import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { recomputeBookingStatus } from '../lib/bookings/recomputeBookingStatus';

const router = Router();

const SELECT_FIELDS = 'id, created_at, booking_id, player_id, role, share_amount_cents, payment_status';

router.get('/', async (req: Request, res: Response) => {
  const booking_id = req.query.booking_id as string | undefined;
  const player_id = req.query.player_id as string | undefined;
  try {
    const supabase = getSupabaseServiceRoleClient();
    let q = supabase
      .from('booking_participants')
      .select(SELECT_FIELDS)
      .order('created_at', { ascending: false })
      .limit(100);
    if (booking_id) q = q.eq('booking_id', booking_id);
    if (player_id) q = q.eq('player_id', player_id);
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, booking_participants: data ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('booking_participants')
      .select(SELECT_FIELDS)
      .eq('id', id)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Booking participant not found' });
    return res.json({ ok: true, booking_participant: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { booking_id, player_id, role, share_amount_cents } = req.body ?? {};
  if (!booking_id || !player_id || !role) {
    return res.status(400).json({
      ok: false,
      error: 'booking_id, player_id y role son obligatorios',
    });
  }
  if (role !== 'organizer' && role !== 'guest') {
    return res.status(400).json({ ok: false, error: 'role debe ser organizer o guest' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('booking_participants')
      .insert([
        {
          booking_id,
          player_id,
          role,
          share_amount_cents: share_amount_cents != null ? Number(share_amount_cents) : 0,
        },
      ])
      .select(SELECT_FIELDS)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(201).json({ ok: true, booking_participant: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { role, share_amount_cents, payment_status } = req.body ?? {};
  const update: Record<string, unknown> = {};
  if (role !== undefined) update.role = role;
  if (share_amount_cents !== undefined) update.share_amount_cents = Number(share_amount_cents);
  if (payment_status !== undefined) update.payment_status = payment_status;
  if (Object.keys(update).length === 0) {
    return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('booking_participants')
      .update(update)
      .eq('id', id)
      .select(SELECT_FIELDS)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Booking participant not found' });
    if (payment_status === 'paid' && data.booking_id) {
      try {
        await recomputeBookingStatus(data.booking_id);
      } catch (e) {
        console.error('[bookingParticipants PATCH recompute]', e);
      }
    }
    return res.json({ ok: true, booking_participant: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { error } = await supabase.from('booking_participants').delete().eq('id', id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, deleted: id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
