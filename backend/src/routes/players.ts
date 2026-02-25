import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';

const router = Router();

// GET /players -> lista básica de jugadores
router.get('/', async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data, error } = await supabase
      .from('players')
      .select(
        `
        id,
        created_at,
        first_name,
        last_name,
        email,
        phone,
        elo_rating,
        status
      `
      )
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.json({ ok: true, players: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

// GET /players/:id -> detalle de un jugador
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data, error } = await supabase
      .from('players')
      .select(
        `
        id,
        created_at,
        updated_at,
        first_name,
        last_name,
        email,
        phone,
        elo_rating,
        elo_last_updated_at,
        stripe_customer_id,
        consents,
        status
      `
      )
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    if (!data) {
      return res.status(404).json({ ok: false, error: 'Player not found' });
    }

    return res.json({ ok: true, player: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

// POST /players -> crear jugador
router.post('/', async (req: Request, res: Response) => {
  const { first_name, last_name, email, phone, elo_rating } = req.body ?? {};

  if (!first_name || !last_name || !email) {
    return res.status(400).json({
      ok: false,
      error: 'first_name, last_name y email son obligatorios',
    });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data, error } = await supabase
      .from('players')
      .insert([
        {
          first_name,
          last_name,
          email,
          phone: phone ?? null,
          elo_rating: typeof elo_rating === 'number' ? elo_rating : 1200,
        },
      ])
      .select(
        `
        id,
        created_at,
        first_name,
        last_name,
        email,
        phone,
        elo_rating,
        status
      `
      )
      .maybeSingle();

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(201).json({ ok: true, player: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

// PUT /players/:id -> actualizar jugador
router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { first_name, last_name, email, phone, elo_rating, status } = req.body ?? {};

  const update: Record<string, unknown> = {};
  if (first_name !== undefined) update.first_name = first_name;
  if (last_name !== undefined) update.last_name = last_name;
  if (email !== undefined) update.email = email;
  if (phone !== undefined) update.phone = phone;
  if (elo_rating !== undefined) update.elo_rating = elo_rating;
  if (status !== undefined) update.status = status;
  update.updated_at = new Date().toISOString();

  if (Object.keys(update).length === 1) {
    return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data, error } = await supabase
      .from('players')
      .update(update)
      .eq('id', id)
      .select(
        `
        id,
        created_at,
        updated_at,
        first_name,
        last_name,
        email,
        phone,
        elo_rating,
        status
      `
      )
      .maybeSingle();

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    if (!data) {
      return res.status(404).json({ ok: false, error: 'Player not found' });
    }

    return res.json({ ok: true, player: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

// DELETE /players/:id -> borrado lógico (status=deleted)
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data, error } = await supabase
      .from('players')
      .update({ status: 'deleted', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, status')
      .maybeSingle();

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    if (!data) {
      return res.status(404).json({ ok: false, error: 'Player not found' });
    }

    return res.json({ ok: true, player: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

export default router;

