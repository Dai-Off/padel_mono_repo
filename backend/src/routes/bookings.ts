import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';

const router = Router();

const SELECT_LIST =
  'id, created_at, court_id, organizer_player_id, start_at, end_at, timezone, total_price_cents, currency, status';
const SELECT_ONE =
  'id, created_at, updated_at, court_id, organizer_player_id, start_at, end_at, timezone, total_price_cents, currency, pricing_rule_ids, status, cancelled_at, cancelled_by, cancellation_reason';

router.get('/', async (req: Request, res: Response) => {
  const court_id = req.query.court_id as string | undefined;
  const organizer_player_id = req.query.organizer_player_id as string | undefined;
  try {
    const supabase = getSupabaseServiceRoleClient();
    let q = supabase
      .from('bookings')
      .select(SELECT_LIST)
      .order('start_at', { ascending: false })
      .limit(50);
    if (court_id) q = q.eq('court_id', court_id);
    if (organizer_player_id) q = q.eq('organizer_player_id', organizer_player_id);
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, bookings: data ?? [] });
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
  } = req.body ?? {};
  if (!court_id || !organizer_player_id || !start_at || !end_at || total_price_cents == null) {
    return res.status(400).json({
      ok: false,
      error: 'court_id, organizer_player_id, start_at, end_at, total_price_cents son obligatorios',
    });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
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
          pricing_rule_ids: Array.isArray(pricing_rule_ids) ? pricing_rule_ids : null,
        },
      ])
      .select(SELECT_ONE)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(201).json({ ok: true, booking: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, cancelled_by, cancellation_reason } = req.body ?? {};
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status !== undefined) update.status = status;
  if (cancelled_by !== undefined) update.cancelled_by = cancelled_by;
  if (cancellation_reason !== undefined) update.cancellation_reason = cancellation_reason;
  if (status === 'cancelled') {
    update.cancelled_at = new Date().toISOString();
  }
  if (Object.keys(update).length === 1) {
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
