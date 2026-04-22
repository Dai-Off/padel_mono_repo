import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdmin } from '../middleware/requireClubOwnerOrAdmin';

const router = Router();
router.use(attachAuthContext);
router.use(requireClubOwnerOrAdmin);

const RESERVATION_TYPES = [
  'standard', 'open_match', 'pozo', 'fixed_recurring',
  'school_group', 'school_individual', 'flat_rate',
  'tournament', 'blocked',
] as const;

function canAccessClub(req: Request, clubId: string): boolean {
  if (req.authContext?.adminId) return true;
  return req.authContext?.allowedClubIds?.includes(clubId) ?? false;
}

/**
 * GET /reservation-type-prices?club_id=xxx
 * Devuelve precios por tipo de reserva. Si no hay fila para un tipo, devuelve 0.
 */
router.get('/', async (req: Request, res: Response) => {
  const club_id = req.query.club_id as string | undefined;
  if (!club_id?.trim()) {
    return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  }
  if (!canAccessClub(req, club_id.trim())) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: rows, error } = await supabase
      .from('reservation_type_prices')
      .select('reservation_type, price_per_hour_cents, currency, color')
      .eq('club_id', club_id.trim());

    if (error) return res.status(500).json({ ok: false, error: error.message });

    const byType: Record<string, { price_per_hour_cents: number; currency: string; color: string | null }> = {};
    for (const t of RESERVATION_TYPES) {
      byType[t] = { price_per_hour_cents: 0, currency: 'EUR', color: null };
    }
    for (const r of rows ?? []) {
      if (RESERVATION_TYPES.includes(r.reservation_type as (typeof RESERVATION_TYPES)[number])) {
        byType[r.reservation_type] = {
          price_per_hour_cents: Number(r.price_per_hour_cents) || 0,
          currency: r.currency ?? 'EUR',
          color: r.color ?? null,
        };
      }
    }
    return res.json({ ok: true, prices: byType });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * PUT /reservation-type-prices
 * Body: { club_id, prices: { standard: 2000, open_match: 1800, ... } }
 * price_per_hour_cents en céntimos (ej: 2000 = 20€/h)
 */
router.put('/', async (req: Request, res: Response) => {
  const { club_id, prices } = req.body ?? {};
  if (!club_id?.trim()) {
    return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  }
  if (!canAccessClub(req, String(club_id).trim())) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }
  if (!prices || typeof prices !== 'object') {
    return res.status(400).json({ ok: false, error: 'prices es obligatorio y debe ser un objeto' });
  }

  const { colors } = req.body ?? {};

  try {
    const supabase = getSupabaseServiceRoleClient();
    const clubId = String(club_id).trim();
    const now = new Date().toISOString();

    for (const type of RESERVATION_TYPES) {
      const raw = prices[type];
      const cents = raw != null ? Math.max(0, Math.round(Number(raw))) : 0;
      const rawColor = colors?.[type];
      const color = typeof rawColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : null;

      const { error: upsertErr } = await supabase
        .from('reservation_type_prices')
        .upsert(
          {
            club_id: clubId,
            reservation_type: type,
            price_per_hour_cents: cents,
            currency: 'EUR',
            color,
            updated_at: now,
          },
          { onConflict: 'club_id,reservation_type' }
        );

      if (upsertErr) return res.status(500).json({ ok: false, error: upsertErr.message });
    }

    const { data: rows } = await supabase
      .from('reservation_type_prices')
      .select('reservation_type, price_per_hour_cents, currency, color')
      .eq('club_id', clubId);

    const byType: Record<string, { price_per_hour_cents: number; currency: string; color: string | null }> = {};
    for (const r of rows ?? []) {
      byType[r.reservation_type] = {
        price_per_hour_cents: Number(r.price_per_hour_cents) || 0,
        currency: r.currency ?? 'EUR',
        color: r.color ?? null,
      };
    }
    return res.json({ ok: true, prices: byType });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
