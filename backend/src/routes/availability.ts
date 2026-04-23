import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';

const router = Router();

function dateToWeekday(d: Date): 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun' {
  const idx = d.getUTCDay();
  if (idx === 0) return 'sun';
  return (['mon', 'tue', 'wed', 'thu', 'fri', 'sat'][idx - 1] as 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat');
}

function overlaps(s1: number, e1: number, s2: number, e2: number): boolean {
  return s1 < e2 && e1 > s2;
}

/**
 * GET /availability/slots
 * Optimized endpoint to fetch free slots for one or more clubs.
 */
router.get('/slots', async (req: Request, res: Response) => {
  const club_id_raw = req.query.club_id as string | undefined;
  const club_ids_raw = req.query.club_ids as string | undefined;
  const date = req.query.date as string | undefined; 
  const court_id = req.query.court_id as string | undefined;
  const duration_minutes = Number(req.query.duration_minutes ?? 60);

  const clubIds = club_ids_raw ? club_ids_raw.split(',') : (club_id_raw ? [club_id_raw] : []);

  if (clubIds.length === 0 || !date) {
    return res.status(400).json({ ok: false, error: 'club_id(s) y date son obligatorios' });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ ok: false, error: 'date debe tener formato YYYY-MM-DD' });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'Token requerido' });

  const supabase = getSupabaseServiceRoleClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ ok: false, error: 'Sesión inválida' });

  try {
    // 1. Fetch Courts
    let courtQuery = supabase
      .from('courts')
      .select('id, name, club_id')
      .in('club_id', clubIds)
      .eq('status', 'operational')
      .eq('is_hidden', false);
    if (court_id) courtQuery = courtQuery.eq('id', court_id);
    
    const { data: courts, error: courtErr } = await courtQuery;
    if (courtErr) throw courtErr;
    if (!courts || courts.length === 0) return res.json({ ok: true, results: [] });

    const courtIds = courts.map(c => c.id);

    // 2. Fetch everything in parallel to minimize latency
    const [scheduleRes, bookingsRes, coursesRes, tournamentsRes] = await Promise.all([
      supabase.from('club_day_schedule').select('court_id, slot').in('court_id', courtIds).eq('date', date),
      supabase.from('bookings').select('court_id, start_at, end_at').in('court_id', courtIds).neq('status', 'cancelled').is('deleted_at', null).gte('start_at', `${date}T00:00:00Z`).lte('start_at', `${date}T23:59:59Z`),
      supabase.from('club_school_courses').select('id, court_id, club_id, starts_on, ends_on').in('club_id', clubIds).eq('is_active', true),
      supabase.from('tournaments').select('id, club_id, start_at, end_at, status, tournament_courts(court_id)').in('club_id', clubIds).neq('status', 'cancelled')
    ]);

    if (scheduleRes.error) throw scheduleRes.error;
    if (bookingsRes.error) throw bookingsRes.error;
    if (coursesRes.error) throw coursesRes.error;
    if (tournamentsRes.error) throw tournamentsRes.error;

    // 3. Prepare lookups
    const weekday = dateToWeekday(new Date(`${date}T00:00:00Z`));
    
    // School Courses
    const activeCourseIds = (coursesRes.data ?? [])
      .filter(c => (!c.starts_on || date >= c.starts_on) && (!c.ends_on || date <= c.ends_on))
      .map(c => c.id);
    
    let schoolBlocks: { court_id: string; startMin: number; endMin: number }[] = [];
    if (activeCourseIds.length > 0) {
      const { data: schoolDays } = await supabase
        .from('club_school_course_days')
        .select('course_id, start_time, end_time')
        .in('course_id', activeCourseIds)
        .eq('weekday', weekday);
      
      const courseToCourt = new Map(coursesRes.data?.map(c => [c.id, c.court_id]));
      schoolBlocks = (schoolDays ?? []).map(d => {
        const sMin = Number(String(d.start_time).slice(0, 2)) * 60 + Number(String(d.start_time).slice(3, 5));
        const eMin = Number(String(d.end_time).slice(0, 2)) * 60 + Number(String(d.end_time).slice(3, 5));
        return { court_id: courseToCourt.get(d.course_id)!, startMin: sMin, endMin: eMin };
      });
    }

    // Tournaments Pre-processed
    const tournamentList = (tournamentsRes.data ?? []).map(t => ({
      club_id: t.club_id,
      startMs: new Date(t.start_at).getTime(),
      endMs: new Date(t.end_at).getTime(),
      courts: new Set((t.tournament_courts as any[]).map(tc => tc.court_id))
    }));

    // Fallback schedule
    const fallbackSlots = [];
    for (let h = 7; h <= 22; h++) fallbackSlots.push(`${String(h).padStart(2, '0')}:00:00`);

    const results = [];
    for (const court of courts) {
      const candidates = scheduleRes.data?.filter(s => s.court_id === court.id).map(s => s.slot) ?? [];
      const slots = candidates.length > 0 ? candidates : fallbackSlots;
      
      const courtBookings = (bookingsRes.data ?? []).filter(b => b.court_id === court.id).map(b => ({
        s: new Date(b.start_at).getTime(),
        e: new Date(b.end_at).getTime()
      }));
      const courtSchool = schoolBlocks.filter(b => b.court_id === court.id);
      const courtTournaments = tournamentList.filter(t => t.club_id === court.club_id && t.courts.has(court.id));

      const freeSlots = [];
      for (const slotTime of slots) {
        const [h, m] = slotTime.split(':').map(Number);
        const sMin = h * 60 + m;
        const eMin = sMin + duration_minutes;
        
        const sMs = new Date(`${date}T${slotTime.slice(0, 5)}:00Z`).getTime();
        const eMs = sMs + duration_minutes * 60 * 1000;

        if (courtBookings.some(b => overlaps(sMs, eMs, b.s, b.e))) continue;
        if (courtSchool.some(s => overlaps(sMin, eMin, s.startMin, s.endMin))) continue;
        if (courtTournaments.some(t => overlaps(sMs, eMs, t.startMs, t.endMs))) continue;

        const endH = Math.floor(eMin / 60);
        const endM = eMin % 60;
        freeSlots.push({
          start: slotTime.slice(0, 5),
          end: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
        });
      }
      results.push({ court_id: court.id, court_name: court.name, club_id: court.club_id, free_slots: freeSlots });
    }

    return res.json({ ok: true, date, results });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
