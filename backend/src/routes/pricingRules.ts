import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdmin } from '../middleware/requireClubOwnerOrAdmin';

const router = Router();
router.use(attachAuthContext);
router.use(requireClubOwnerOrAdmin);

function canAccessClub(req: Request, clubId: string): boolean {
  if (req.authContext?.adminId) return true;
  return req.authContext?.allowedClubIds?.includes(clubId) ?? false;
}

/**
 * POST /pricing-rules/seed-defaults
 * Crea reglas de precios por defecto para todas las pistas de un club.
 * Útil para desbloquear horarios disponibles cuando pricing_rules está vacío.
 *
 * Body:
 * - club_id (required)
 * - days_of_week? (default [1..7])
 * - start_minutes? (default 480 = 08:00)
 * - end_minutes? (default 1320 = 22:00)
 * - amount_cents? (default 2000 = 20.00€ por hora)
 * - currency? (default 'EUR')
 * - overwrite? (default false) si true, desactiva reglas activas existentes y crea nuevas
 */
router.post('/seed-defaults', async (req: Request, res: Response) => {
  const {
    club_id,
    days_of_week,
    start_minutes,
    end_minutes,
    amount_cents,
    currency,
    overwrite,
  } = req.body ?? {};

  if (!club_id || !String(club_id).trim()) {
    return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  }
  if (!canAccessClub(req, String(club_id))) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }

  const dows = Array.isArray(days_of_week) && days_of_week.length
    ? days_of_week.map((d: unknown) => Number(d)).filter((n: number) => Number.isFinite(n) && n >= 0 && n <= 7)
    : [1, 2, 3, 4, 5, 6, 7];

  const startMin = start_minutes != null ? Number(start_minutes) : 8 * 60;
  const endMin = end_minutes != null ? Number(end_minutes) : 22 * 60;
  const amountCents = amount_cents != null ? Number(amount_cents) : 2000;

  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || startMin < 0 || endMin > 24 * 60 || startMin >= endMin) {
    return res.status(400).json({ ok: false, error: 'start_minutes/end_minutes inválidos' });
  }
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return res.status(400).json({ ok: false, error: 'amount_cents inválido' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data: courts, error: courtsErr } = await supabase
      .from('courts')
      .select('id')
      .eq('club_id', String(club_id));
    if (courtsErr) return res.status(500).json({ ok: false, error: courtsErr.message });

    const courtIds = (courts ?? []).map((c: { id: string }) => c.id);
    if (courtIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'El club no tiene pistas' });
    }

    if (overwrite === true) {
      const { error: disableErr } = await supabase
        .from('pricing_rules')
        .update({ active: false })
        .in('court_id', courtIds)
        .eq('active', true);
      if (disableErr) return res.status(500).json({ ok: false, error: disableErr.message });
    }

    // Avoid duplicates: if a court already has any active rule, skip it (unless overwrite=true)
    const { data: existingActive, error: exErr } = await supabase
      .from('pricing_rules')
      .select('court_id')
      .in('court_id', courtIds)
      .eq('active', true);
    if (exErr) return res.status(500).json({ ok: false, error: exErr.message });

    const activeSet = new Set((existingActive ?? []).map((r: { court_id: string }) => r.court_id));
    const targetCourtIds = overwrite === true ? courtIds : courtIds.filter((id) => !activeSet.has(id));

    if (targetCourtIds.length === 0) {
      return res.json({ ok: true, inserted: 0, skipped: courtIds.length });
    }

    const rows = targetCourtIds.map((courtId) => ({
      court_id: courtId,
      days_of_week: dows,
      start_minutes: startMin,
      end_minutes: endMin,
      amount_cents: amountCents,
      currency: (currency ?? 'EUR') as string,
      active: true,
    }));

    const { error: insErr } = await supabase.from('pricing_rules').insert(rows);
    if (insErr) return res.status(500).json({ ok: false, error: insErr.message });

    return res.status(201).json({
      ok: true,
      inserted: rows.length,
      skipped: courtIds.length - rows.length,
      defaults: {
        days_of_week: dows,
        start_minutes: startMin,
        end_minutes: endMin,
        amount_cents: amountCents,
        currency: (currency ?? 'EUR') as string,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;

