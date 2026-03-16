import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';

const router = Router();

export type SearchCourtResult = {
  id: string;
  clubId: string;
  clubName: string;
  courtName: string;
  city: string;
  address: string;
  lat: number | null;
  lng: number | null;
  indoor: boolean;
  glassType: string;
  imageUrl: string | null;
  distanceKm: number | null;
  minPriceCents: number;
  minPriceFormatted: string;
  timeSlots: string[];
};

/** GET /search/courts - Busca pistas con disponibilidad. Filtros opcionales por query. */
router.get('/courts', async (req: Request, res: Response) => {
  const dateFrom = req.query.date_from as string | undefined;
  const dateTo = req.query.date_to as string | undefined;
  const indoor = req.query.indoor as string | undefined;
  const glassType = req.query.glass_type as string | undefined;

  try {
    const supabase = getSupabaseServiceRoleClient();

    let courtsQuery = supabase
      .from('courts')
      .select('id, club_id, name, indoor, glass_type');

    if (indoor === 'true') courtsQuery = courtsQuery.eq('indoor', true);
    else if (indoor === 'false') courtsQuery = courtsQuery.eq('indoor', false);
    if (glassType === 'normal') courtsQuery = courtsQuery.eq('glass_type', 'normal');
    else if (glassType === 'panoramic') courtsQuery = courtsQuery.eq('glass_type', 'panoramic');

    const { data: courts, error: courtsError } = await courtsQuery;
    if (courtsError) return res.status(500).json({ ok: false, error: courtsError.message });
    if (!courts?.length) {
      console.log('[search/courts] No courts found (status=operational)');
      return res.json({ ok: true, results: [] });
    }

    const clubIds = [...new Set(courts.map((c) => c.club_id))];
    const { data: clubs, error: clubsError } = await supabase
      .from('clubs')
      .select('id, name, city, address, lat, lng')
      .in('id', clubIds);
    if (clubsError) return res.status(500).json({ ok: false, error: clubsError.message });

    const clubMap = new Map(clubs?.map((c) => [c.id, c]) ?? []);
    const missingClubIds = clubIds.filter((id) => !clubMap.has(id));
    if (missingClubIds.length) {
      console.log('[search/courts] Clubs not found for court(s):', missingClubIds);
    }

    const courtIds = courts.map((c) => c.id);

    const { data: pricingRules } = await supabase
      .from('pricing_rules')
      .select('court_id, days_of_week, start_minutes, end_minutes, amount_cents')
      .in('court_id', courtIds)
      .eq('active', true);

    const searchDate = dateFrom ?? new Date().toISOString().slice(0, 10);

    let bookingsQuery = supabase
      .from('bookings')
      .select('id, court_id, start_at, end_at, total_price_cents, status')
      .in('court_id', courtIds)
      .neq('status', 'cancelled');

    const day = new Date(searchDate + 'T12:00:00Z').getUTCDay();
    const dow = day === 0 ? 7 : day;

    if (dateFrom) {
      bookingsQuery = bookingsQuery.gte('start_at', `${dateFrom}T00:00:00Z`);
    }
    if (dateTo) {
      bookingsQuery = bookingsQuery.lte('start_at', `${dateTo}T23:59:59Z`);
    }

    const { data: bookings, error: bookingsError } = await bookingsQuery;
    if (bookingsError) return res.status(500).json({ ok: false, error: bookingsError.message });

    console.log('[search/courts] Bookings found:', bookings?.length ?? 0, 'for date', searchDate, 'courts', courtIds.length);
    if (bookings?.length) {
      console.log('[search/courts] Sample:', bookings.slice(0, 3).map((b) => ({ court_id: b.court_id, start_at: b.start_at, status: b.status })));
    }

    const bookedRangesByCourt = new Map<string, { start: number; end: number }[]>();
    for (const b of bookings ?? []) {
      const start = new Date(b.start_at).getTime();
      const end = new Date(b.end_at).getTime();
      const list = bookedRangesByCourt.get(b.court_id) ?? [];
      list.push({ start, end });
      bookedRangesByCourt.set(b.court_id, list);
    }

    const rulesByCourt = new Map<string, { startMin: number; endMin: number; amountCents: number }[]>();
    const dowNum = Number(dow);
    for (const r of pricingRules ?? []) {
      const dows = Array.isArray(r.days_of_week) ? r.days_of_week : [];
      const matchesDay = dows.some((d: unknown) => Number(d) === dowNum);
      if (!matchesDay) continue;
      const list = rulesByCourt.get(r.court_id) ?? [];
      list.push({
        startMin: r.start_minutes,
        endMin: r.end_minutes,
        amountCents: r.amount_cents,
      });
      rulesByCourt.set(r.court_id, list);
    }

    const baseDate = new Date(searchDate + 'T00:00:00Z').getTime();

    const results: SearchCourtResult[] = courts.flatMap((court) => {
        const club = clubMap.get(court.club_id);
        if (!club) {
          console.warn(`[search] Club not found for court ${court.id} (club_id: ${court.club_id})`);
          return [];
        }
        const rules = rulesByCourt.get(court.id) ?? [];
        const booked = bookedRangesByCourt.get(court.id) ?? [];
        const timeSlots: string[] = [];
        let minPriceCents = 0;

        for (const rule of rules) {
          for (let min = rule.startMin; min < rule.endMin; min += 60) {
            const slotStart = baseDate + min * 60 * 1000;
            const slotEnd = slotStart + 60 * 60 * 1000;
            const overlaps = booked.some(
              (b) => !(slotEnd <= b.start || slotStart >= b.end)
            );
            if (!overlaps) {
              const h = Math.floor(min / 60);
              timeSlots.push(`${String(h).padStart(2, '0')}:00`);
              if (minPriceCents === 0 || rule.amountCents < minPriceCents) {
                minPriceCents = rule.amountCents;
              }
            }
          }
        }

        const minPriceFormatted = minPriceCents ? `${Math.round(minPriceCents / 100)}€` : '-';

        return [{
          id: court.id,
          clubId: club.id,
          clubName: club.name,
          courtName: court.name,
          city: club.city,
          address: club.address,
          lat: club.lat,
          lng: club.lng,
          indoor: court.indoor,
          glassType: court.glass_type,
          imageUrl: null as string | null,
          distanceKm: null as number | null,
          minPriceCents,
          minPriceFormatted,
          timeSlots: [...new Set(timeSlots)].sort(),
        } satisfies SearchCourtResult];
      });

    console.log('[search/courts] Courts:', courts.length, 'Clubs:', clubs?.length ?? 0, 'Results:', results.length);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.json({ ok: true, results });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
