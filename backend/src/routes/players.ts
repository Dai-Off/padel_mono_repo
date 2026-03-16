import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';

const router = Router();

// GET /players/me -> jugador actual según Bearer token (requiere sesión)
router.get('/me', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token requerido' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user?.email) {
      return res.status(401).json({ ok: false, error: 'Sesión inválida o expirada' });
    }
    const email = String(user.email).trim().toLowerCase();
    const { data: player, error: errPlayer } = await supabase
      .from('players')
      .select('id, created_at, first_name, last_name, email, phone, elo_rating, status')
      .eq('email', email)
      .maybeSingle();
    if (errPlayer) return res.status(500).json({ ok: false, error: errPlayer.message });
    if (!player) return res.status(404).json({ ok: false, error: 'No existe jugador con tu email' });
    return res.json({ ok: true, player });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// POST /players/manual -> alta manual en el club (nombre, apellidos, teléfono obligatorios; email opcional)
router.post('/manual', async (req: Request, res: Response) => {
  const { first_name, last_name, phone, email } = req.body ?? {};

  const firstName = typeof first_name === 'string' ? first_name.trim() : '';
  const lastName = typeof last_name === 'string' ? last_name.trim() : '';
  const phoneStr = typeof phone === 'string' ? phone.trim() : '';

  if (!firstName || !lastName || !phoneStr) {
    return res.status(400).json({
      ok: false,
      error: 'first_name, last_name y phone son obligatorios',
    });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data: existingByPhone } = await supabase
      .from('players')
      .select('id')
      .eq('phone', phoneStr)
      .neq('status', 'deleted')
      .maybeSingle();
    if (existingByPhone) {
      return res.status(409).json({ ok: false, error: 'Ya existe un usuario con este teléfono' });
    }

    const emailStr = typeof email === 'string' ? email.trim().toLowerCase() : null;
    if (emailStr) {
      const { data: existingByEmail } = await supabase
        .from('players')
        .select('id')
        .eq('email', emailStr)
        .neq('status', 'deleted')
        .maybeSingle();
      if (existingByEmail) {
        return res.status(409).json({ ok: false, error: 'Ya existe un usuario con este correo' });
      }
    }

    const { data, error } = await supabase
      .from('players')
      .insert([
        {
          first_name: firstName,
          last_name: lastName,
          phone: phoneStr,
          email: emailStr,
          auth_user_id: null,
        },
      ])
      .select('id, created_at, first_name, last_name, email, phone, elo_rating, status')
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ ok: false, error: 'Ya existe un usuario con este teléfono o correo' });
      }
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(201).json({ ok: true, player: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ ok: false, error: message });
  }
});

// GET /players -> lista de jugadores (soporta search con ?q=...)
router.get('/', async (req: Request, res: Response) => {
  const query = req.query.q as string | undefined;
  try {
    const supabase = getSupabaseServiceRoleClient();

    let q = supabase
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
        status,
        auth_user_id
      `
      )
      .order('created_at', { ascending: false })
      .limit(50);

    if (query) {
      q = q.or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`);
    }

    const { data, error } = await q;

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

