import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';

/**
 * Public routes accessible by authenticated players (not restricted to club owner/admin).
 * Requires a valid Bearer token (any authenticated user), but no role check.
 */
const router = Router();

/**
 * GET /public/slot-price
 * Returns the calculated price for a booking slot applying the following priority:
 *   1. Custom tariff configured in club_day_schedule (Tarifas del Club)
 *   2. Flat rate from reservation_type_prices (Precios por Reserva)
 *
 * Query params:
 *   court_id          — UUID of the court
 *   date              — YYYY-MM-DD
 *   slot              — HH:MM  (start time of the booking)
 *   duration_minutes  — number (default 60)
 */
router.get('/slot-price', async (req: Request, res: Response) => {
  const court_id        = req.query.court_id        as string | undefined;
  const date            = req.query.date            as string | undefined;
  const slot            = req.query.slot            as string | undefined;
  const durationMinutes = Number(req.query.duration_minutes ?? 60);

  if (!court_id || !date || !slot) {
    return res.status(400).json({ ok: false, error: 'court_id, date y slot son obligatorios' });
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return res.status(400).json({ ok: false, error: 'duration_minutes debe ser un número positivo' });
  }

  const supabase = getSupabaseServiceRoleClient();

  // Resolve club_id from court_id
  const { data: courtRow, error: courtErr } = await supabase
    .from('courts')
    .select('club_id')
    .eq('id', court_id)
    .maybeSingle();
  if (courtErr) return res.status(500).json({ ok: false, error: courtErr.message });
  if (!courtRow?.club_id) return res.status(404).json({ ok: false, error: 'Pista no encontrada' });

  const club_id = courtRow.club_id as string;

  // Parse start slot into total minutes from midnight
  const [startH, startM] = slot.split(':').map(Number);
  const startMinutes = startH * 60 + (startM || 0);
  const endMinutes   = startMinutes + durationMinutes;

  const firstHour = Math.floor(startMinutes / 60);
  const lastHour  = endMinutes % 60 === 0
    ? endMinutes / 60 - 1
    : Math.floor(endMinutes / 60);

  const hourSlots: string[] = [];
  for (let h = firstHour; h <= lastHour; h++) {
    hourSlots.push(`${String(h).padStart(2, '0')}:00:00`);
  }

  // Step 1: custom tariffs from club_day_schedule
  const { data: scheduleRows } = await supabase
    .from('club_day_schedule')
    .select('slot, tariff_id')
    .eq('club_id', club_id)
    .eq('court_id', court_id)
    .eq('date', date)
    .in('slot', hourSlots);

  // Step 2: resolve prices for found tariff_ids
  const tariffIds = [...new Set((scheduleRows ?? []).map((r: any) => r.tariff_id).filter(Boolean))];
  const tariffPriceById = new Map<string, number>();
  if (tariffIds.length > 0) {
    const { data: tariffRows } = await supabase
      .from('club_tariffs')
      .select('id, price_cents')
      .in('id', tariffIds);
    for (const t of tariffRows ?? []) {
      tariffPriceById.set(t.id, t.price_cents);
    }
  }

  const calendarPriceByHour = new Map<number, number>();
  for (const row of scheduleRows ?? []) {
    const slotHour = parseInt(String(row.slot).substring(0, 2), 10);
    const price = tariffPriceById.get(row.tariff_id);
    if (price != null) calendarPriceByHour.set(slotHour, price);
  }

  // Step 3: flat_rate fallback from reservation_type_prices
  const { data: flatRateRow } = await supabase
    .from('reservation_type_prices')
    .select('price_per_hour_cents')
    .eq('club_id', club_id)
    .eq('reservation_type', 'flat_rate')
    .maybeSingle();
  const flatRateCents = flatRateRow?.price_per_hour_cents ?? 0;

  // Step 4: prorate each hourly slot
  let totalPriceCents = 0;
  const breakdown: {
    slot: string;
    minutes: number;
    price_per_hour_cents: number;
    contribution_cents: number;
    source: 'calendar' | 'flat_rate' | 'none';
  }[] = [];
  const usedSources = new Set<string>();

  for (let h = firstHour; h <= lastHour; h++) {
    const slotStartMin = h * 60;
    const slotEndMin   = slotStartMin + 60;
    const overlapMin   = Math.min(endMinutes, slotEndMin) - Math.max(startMinutes, slotStartMin);
    if (overlapMin <= 0) continue;

    let pricePerHour: number;
    let source: 'calendar' | 'flat_rate' | 'none';

    if (calendarPriceByHour.has(h)) {
      pricePerHour = calendarPriceByHour.get(h)!;
      source = 'calendar';
    } else if (flatRateCents > 0) {
      pricePerHour = flatRateCents;
      source = 'flat_rate';
    } else {
      pricePerHour = 0;
      source = 'none';
    }

    const contribution = Math.round((overlapMin / 60) * pricePerHour);
    totalPriceCents += contribution;
    usedSources.add(source);
    breakdown.push({ slot: `${String(h).padStart(2, '0')}:00`, minutes: overlapMin, price_per_hour_cents: pricePerHour, contribution_cents: contribution, source });
  }

  const dominantSource = usedSources.has('calendar')
    ? (usedSources.size > 1 ? 'mixed' : 'calendar')
    : usedSources.has('flat_rate') ? 'flat_rate' : 'none';

  return res.json({
    ok: true,
    club_id,
    court_id,
    date,
    slot,
    duration_minutes: durationMinutes,
    total_price_cents: totalPriceCents,
    source: dominantSource,
    breakdown,
  });
});

export default router;
