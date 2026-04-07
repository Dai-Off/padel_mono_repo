import { Router, Request, Response } from 'express';
import { resolveClubLogoUrlForClient } from '../lib/clubLogoUrl';
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

type ClubSearchRow = {
  id: string;
  name: string;
  city: string;
  address: string;
  lat: number | null;
  lng: number | null;
  logo_url: string | null;
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
      .select('id, club_id, name, indoor, glass_type')
      .eq('is_hidden', false);

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
      .select('id, name, city, address, lat, lng, logo_url')
      .in('id', clubIds);
    if (clubsError) return res.status(500).json({ ok: false, error: clubsError.message });

    const clubMap = new Map<string, ClubSearchRow>(
      (clubs ?? []).map((c) => [c.id, c as ClubSearchRow])
    );
    const missingClubIds = clubIds.filter((id) => !clubMap.has(id));
    if (missingClubIds.length) {
      console.log('[search/courts] Clubs not found for court(s):', missingClubIds);
    }

    const resolvedLogoByClubId = new Map<string, string | null>(
      await Promise.all(
        [...clubMap.entries()].map(async ([id, club]) => {
          const url = await resolveClubLogoUrlForClient(supabase, club.logo_url);
          return [id, url] as const;
        })
      )
    );

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

    // Day-of-week reference:
    // - JS getUTCDay(): 0..6 (Sun=0)
    // - Many DB schemas store ISO: 1..7 (Mon=1..Sun=7)
    // We support both to avoid "no slots" when data uses the other convention.
    const jsDow = new Date(searchDate + 'T12:00:00Z').getUTCDay(); // 0..6
    const isoDow = jsDow === 0 ? 7 : jsDow; // 1..7

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

    // Use local midnight so time-slot labels ("10:00") represent local clock time,
    // consistent with how the mobile app and web grid display hours.
    const baseDate = new Date(searchDate + 'T00:00:00').getTime();

    const bookedRangesByCourt = new Map<string, { start: number; end: number }[]>();
    for (const b of bookings ?? []) {
      const start = new Date(b.start_at).getTime();
      const end = new Date(b.end_at).getTime();
      const list = bookedRangesByCourt.get(b.court_id) ?? [];
      list.push({ start, end });
      bookedRangesByCourt.set(b.court_id, list);
    }

    // Also block slots occupied by active school courses for the searched day
    const weekdayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
    const weekday = weekdayMap[new Date(searchDate + 'T00:00:00Z').getUTCDay()];
    const { data: schoolCourses } = await supabase
      .from('club_school_courses')
      .select('id, court_id, starts_on, ends_on, is_active')
      .in('court_id', courtIds)
      .eq('is_active', true);
    const validCourseIds = (schoolCourses ?? [])
      .filter((c: any) => (!c.starts_on || searchDate >= c.starts_on) && (!c.ends_on || searchDate <= c.ends_on))
      .map((c: any) => c.id);
    if (validCourseIds.length) {
      const { data: schoolDays } = await supabase
        .from('club_school_course_days')
        .select('course_id, weekday, start_time, end_time')
        .in('course_id', validCourseIds)
        .eq('weekday', weekday);
      const byCourse = new Map((schoolCourses ?? []).map((c: any) => [c.id, c]));
      for (const d of schoolDays ?? []) {
        const course = byCourse.get(d.course_id);
        if (!course) continue;
        const startMin = Number(String(d.start_time).slice(0, 2)) * 60 + Number(String(d.start_time).slice(3, 5));
        const endMin = Number(String(d.end_time).slice(0, 2)) * 60 + Number(String(d.end_time).slice(3, 5));
        const start = baseDate + startMin * 60 * 1000;
        const end = baseDate + endMin * 60 * 1000;
        const list = bookedRangesByCourt.get(course.court_id) ?? [];
        list.push({ start, end });
        bookedRangesByCourt.set(course.court_id, list);
      }
    }

    const rulesByCourt = new Map<string, { startMin: number; endMin: number; amountCents: number }[]>();
    for (const r of pricingRules ?? []) {
      const dows = Array.isArray(r.days_of_week) ? r.days_of_week : [];
      const matchesDay = dows.some((d: unknown) => {
        const n = Number(d);
        return n === isoDow || n === jsDow;
      });
      if (!matchesDay) continue;
      const list = rulesByCourt.get(r.court_id) ?? [];
      list.push({
        startMin: r.start_minutes,
        endMin: r.end_minutes,
        amountCents: r.amount_cents,
      });
      rulesByCourt.set(r.court_id, list);
    }

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

        const logoUrl = resolvedLogoByClubId.get(club.id) ?? null;

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
          imageUrl: logoUrl,
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
