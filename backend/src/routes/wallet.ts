import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';

const router = Router();

// ─── GET /wallet/balance?player_id=&club_id= ──────────────────────────────────
// Devuelve el saldo vigente + últimas 20 transacciones de un jugador en un club.
router.get('/balance', async (req: Request, res: Response) => {
  const { player_id, club_id } = req.query as Record<string, string>;
  if (!player_id || !club_id) {
    return res.status(400).json({ ok: false, error: 'player_id y club_id son requeridos' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data: txs, error } = await supabase
      .from('wallet_transactions')
      .select('id, amount_cents, concept, type, booking_id, created_at, notes')
      .eq('player_id', player_id)
      .eq('club_id', club_id)
      .order('created_at', { ascending: false })
      .limit(20);

    // If table doesn't exist (migration 014 not applied), return zero balance
    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return res.json({ ok: true, balance_cents: 0, transactions: [] });
      }
      console.error('[GET /wallet/balance] txs error:', JSON.stringify(error));
      return res.status(500).json({ ok: false, error: error.message });
    }

    const { data: sumData, error: sumError } = await supabase
      .from('wallet_transactions')
      .select('amount_cents')
      .eq('player_id', player_id)
      .eq('club_id', club_id);

    if (sumError) return res.status(500).json({ ok: false, error: sumError.message });

    const balance_cents = (sumData ?? []).reduce((acc, t) => acc + t.amount_cents, 0);

    return res.json({ ok: true, balance_cents, transactions: txs ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ─── GET /wallet/transactions?player_id=&club_id=&limit=&offset= ──────────────
// Historial completo paginado.
router.get('/transactions', async (req: Request, res: Response) => {
  const { player_id, club_id } = req.query as Record<string, string>;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  if (!player_id || !club_id) {
    return res.status(400).json({ ok: false, error: 'player_id y club_id son requeridos' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data, error, count } = await supabase
      .from('wallet_transactions')
      .select('*', { count: 'exact' })
      .eq('player_id', player_id)
      .eq('club_id', club_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return res.status(500).json({ ok: false, error: error.message });

    return res.json({ ok: true, transactions: data ?? [], total: count ?? 0 });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ─── GET /wallet/club-balances?club_id= ───────────────────────────────────────
// Todos los jugadores con saldo distinto de cero en el club (vista admin).
router.get('/club-balances', async (req: Request, res: Response) => {
  const { club_id } = req.query as Record<string, string>;
  if (!club_id) {
    return res.status(400).json({ ok: false, error: 'club_id es requerido' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('player_id, amount_cents, players ( first_name, last_name, email, phone )')
      .eq('club_id', club_id);

    if (error) return res.status(500).json({ ok: false, error: error.message });

    // Agrupar y sumar por jugador
    const map = new Map<string, { player_id: string; player: any; balance_cents: number }>();
    for (const row of data ?? []) {
      const pid = row.player_id;
      if (!map.has(pid)) {
        map.set(pid, { player_id: pid, player: row.players, balance_cents: 0 });
      }
      map.get(pid)!.balance_cents += row.amount_cents;
    }

    const balances = Array.from(map.values())
      .filter(b => b.balance_cents !== 0)
      .sort((a, b) => a.balance_cents - b.balance_cents); // más deudores primero

    return res.json({ ok: true, balances });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ─── POST /wallet/transactions ────────────────────────────────────────────────
// Crea una transacción manual (crédito, débito, ajuste, devolución).
// Body: { player_id, club_id, amount_cents, concept, type, booking_id?, notes?, created_by_auth_id? }
router.post('/transactions', async (req: Request, res: Response) => {
  const {
    player_id,
    club_id,
    amount_cents,
    concept,
    type,
    booking_id,
    notes,
    created_by_auth_id,
  } = req.body ?? {};

  if (!player_id || !club_id || amount_cents === undefined || !concept || !type) {
    return res.status(400).json({
      ok: false,
      error: 'player_id, club_id, amount_cents, concept y type son requeridos',
    });
  }

  const VALID_TYPES = ['credit', 'debit', 'refund', 'adjustment'];
  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({
      ok: false,
      error: `type debe ser uno de: ${VALID_TYPES.join(', ')}`,
    });
  }

  if (typeof amount_cents !== 'number' || !Number.isInteger(amount_cents) || amount_cents === 0) {
    return res.status(400).json({ ok: false, error: 'amount_cents debe ser un entero distinto de 0' });
  }

  // Negativo automático para débito
  const finalAmount = type === 'debit' ? -Math.abs(amount_cents) : Math.abs(amount_cents);

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data, error } = await supabase
      .from('wallet_transactions')
      .insert({
        player_id,
        club_id,
        amount_cents: finalAmount,
        concept,
        type,
        booking_id: booking_id ?? null,
        notes: notes ?? null,
        created_by_auth_id: created_by_auth_id ?? null,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });

    return res.status(201).json({ ok: true, transaction: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// ─── DELETE /wallet/transactions/:id ─────────────────────────────────────────
// Elimina una transacción (solo ajustes manuales, no recomendado en producción).
router.delete('/transactions/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { error } = await supabase
      .from('wallet_transactions')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
