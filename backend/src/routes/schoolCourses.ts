import { Router, Request, Response, NextFunction } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdmin } from '../middleware/requireClubOwnerOrAdmin';

const router = Router();

router.get('/public/list', async (req: Request, res: Response) => {
  console.log('[DEBUG] GET /school-courses/public/list hit');
  const sport = String(req.query.sport ?? '').trim();
  const level = String(req.query.level ?? '').trim();

  try {
    const supabase = getSupabaseServiceRoleClient();
    
    // 1) Fetch active courses with club data
    let q = supabase
      .from('club_school_courses')
      .select(`
        *,
        clubs!inner (
          id, name, address, city, logo_url
        )
      `)
      .eq('is_active', true);

    if (sport && SPORTS.includes(sport as Sport)) q = q.eq('sport', sport);
    if (level && LEVELS.includes(level as Level)) q = q.eq('level', level);

    const { data: courses, error } = await q.order('created_at', { ascending: false });

    if (error) {
       console.error('[DEBUG] Supabase error:', error);
       return res.status(500).json({ ok: false, error: error.message });
    }
    if (!courses || courses.length === 0) return res.json({ ok: true, courses: [] });

    const courseIds = courses.map((c: any) => c.id);

    // 2) Fetch days and enrollments in parallel
    const [daysRes, enrolledRes, staffRes] = await Promise.all([
      supabase
        .from('club_school_course_days')
        .select('*')
        .in('course_id', courseIds),
      supabase
        .from('club_school_course_enrollments')
        .select('course_id, status')
        .in('course_id', courseIds)
        .neq('status', 'cancelled'),
      supabase
        .from('club_staff')
        .select('id, name, avatar_url')
        .in('id', courses.map((c: any) => c.staff_id).filter(Boolean))
    ]);

    if (daysRes.error) return res.status(500).json({ ok: false, error: daysRes.error.message });
    if (enrolledRes.error) return res.status(500).json({ ok: false, error: enrolledRes.error.message });

    const daysByCourse = new Map<string, any[]>();
    for (const d of daysRes.data ?? []) {
      const list = daysByCourse.get(d.course_id) ?? [];
      list.push(d);
      daysByCourse.set(d.course_id, list);
    }

    const enrolledCount = new Map<string, number>();
    for (const e of enrolledRes.data ?? []) {
        enrolledCount.set(e.course_id, (enrolledCount.get(e.course_id) ?? 0) + 1);
    }

    const staffMap = new Map((staffRes.data ?? []).map((s: any) => [s.id, s]));

    const result = courses.map((c: any) => ({
      id: c.id,
      name: c.name,
      sport: c.sport,
      level: c.level,
      club_id: c.club_id,
      club_name: c.clubs?.name,
      club_address: c.clubs?.address,
      club_city: c.clubs?.city,
      club_logo_url: c.clubs?.logo_url,
      price_cents: c.price_cents,
      capacity: c.capacity,
      enrolled_count: enrolledCount.get(c.id) ?? 0,
      days: daysByCourse.get(c.id) ?? [],
      staff: staffMap.get(c.staff_id) || null,
      starts_on: c.starts_on,
      ends_on: c.ends_on,
    }));

    return res.json({ ok: true, courses: result });
  } catch (err) {
    console.error('[DEBUG] Catch error:', err);
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.use(attachAuthContext);

/**
 * @openapi
 * /school-courses/public/my-enrollments:
 *   get:
 *     tags: [School Courses]
 *     summary: List my course enrollments
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *       401: { description: Unauthorized }
 */
router.get('/public/my-enrollments', async (req: Request, res: Response) => {
  console.log('[DEBUG] GET /school-courses/public/my-enrollments hit');
  if (!req.authContext) {
    console.log('[DEBUG] Unauthorized: no authContext');
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  const { userId } = req.authContext;

  try {
    const supabase = getSupabaseServiceRoleClient();
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user?.email) return res.status(401).json({ ok: false, error: 'Invalid token' });

    // 1. Get player profile by email (more robust)
    const email = user.email.trim().toLowerCase();
    const { data: player, error: pErr } = await supabase
      .from('players')
      .select('id')
      .eq('email', email)
      .neq('status', 'deleted')
      .maybeSingle();

    if (pErr || !player) {
      console.log('[DEBUG] Player not found for email:', email);
      return res.status(404).json({ ok: false, error: 'Player profile not found' });
    }

    // 2. Get enrollments with course and club info
    const { data, error } = await supabase
      .from('club_school_course_enrollments')
      .select(`
        *,
        course:club_school_courses (
          *,
          club:clubs (
            id, name, logo_url
          )
        )
      `)
      .eq('player_id', player.id)
      .eq('status', 'active');

    if (error) return res.status(500).json({ ok: false, error: error.message });

    // 3. Get days for these courses
    const courseIds = (data ?? []).map(e => e.course_id).filter(Boolean);
    const { data: daysData, error: daysErr } = await supabase
      .from('club_school_course_days')
      .select('*')
      .in('course_id', courseIds);

    if (daysErr) return res.status(500).json({ ok: false, error: daysErr.message });

    const daysByCourse = new Map<string, any[]>();
    for (const d of daysData ?? []) {
      const list = daysByCourse.get(d.course_id) ?? [];
      list.push(d);
      daysByCourse.set(d.course_id, list);
    }

    const enrollments = (data ?? []).map(e => ({
      ...e,
      course: e.course ? {
        ...e.course,
        days: daysByCourse.get(e.course_id) ?? []
      } : null
    }));

    return res.json({ ok: true, enrollments });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /school-courses/public/enroll/{id}:
 *   post:
 *     tags: [School Courses]
 *     summary: Enroll in a course (Public)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       201: { description: Enrolled successfully }
 *       400: { description: Capacity reached or already enrolled }
 *       401: { description: Unauthorized }
 */
router.post('/public/enroll/:id', async (req: Request, res: Response) => {
  console.log('[DEBUG] POST /school-courses/public/enroll hit, id:', req.params.id);
  if (!req.authContext) {
    console.log('[DEBUG] Unauthorized: no authContext');
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  const { id } = req.params;
  const { userId } = req.authContext;

  try {
    const supabase = getSupabaseServiceRoleClient();
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user?.email) return res.status(401).json({ ok: false, error: 'Invalid token' });

    // 1. Get player profile by email
    const email = user.email.trim().toLowerCase();
    const { data: player, error: pErr } = await supabase
      .from('players')
      .select('id, first_name, last_name, email, phone')
      .eq('email', email)
      .neq('status', 'deleted')
      .maybeSingle();

    if (pErr || !player) {
      return res.status(404).json({ ok: false, error: 'Player profile not found' });
    }

    // 2. Check course exists and capacity
    const { data: course, error: cErr } = await supabase
      .from('club_school_courses')
      .select('id, capacity, is_active')
      .eq('id', id)
      .maybeSingle();

    if (cErr || !course) return res.status(404).json({ ok: false, error: 'Course not found' });
    if (!course.is_active) return res.status(400).json({ ok: false, error: 'Course is not active' });

    // 3. Count current active enrollments
    const { count, error: countErr } = await supabase
      .from('club_school_course_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', id)
      .eq('status', 'active');

    if (countErr) return res.status(500).json({ ok: false, error: countErr.message });
    if (count !== null && count >= course.capacity) {
      return res.status(400).json({ ok: false, error: 'Course capacity reached' });
    }

    // 4. Check if already enrolled
    const { data: existing } = await supabase
      .from('club_school_course_enrollments')
      .select('id')
      .eq('course_id', id)
      .eq('player_id', player.id)
      .eq('status', 'active')
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ ok: false, error: 'Already enrolled in this course' });
    }

    // 5. Create enrollment (Mocked payment -> directly active)
    const { data: enrollment, error: insErr } = await supabase
      .from('club_school_course_enrollments')
      .insert({
        course_id: id,
        player_id: player.id,
        student_name: `${player.first_name} ${player.last_name}`,
        student_email: player.email,
        student_phone: player.phone,
        status: 'active'
      })
      .select()
      .single();

    if (insErr) return res.status(500).json({ ok: false, error: insErr.message });

    return res.status(201).json({ ok: true, enrollment });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

type Sport = 'padel' | 'tenis';
type Level =
  | 'Principiante'
  | 'Intermedio'
  | 'Avanzado'
  | 'Competicion'
  | 'Elite'
  | 'Infantil';
type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const SPORTS: Sport[] = ['padel', 'tenis'];
const LEVELS: Level[] = [
  'Principiante',
  'Intermedio',
  'Avanzado',
  'Competicion',
  'Elite',
  'Infantil',
];

const COURSE_FIELDS =
  'id, club_id, name, sport, level, staff_id, court_id, price_cents, capacity, is_active, starts_on, ends_on, created_at, updated_at';

function canAccessClub(req: Request, clubId: string): boolean {
  if (req.authContext?.adminId) return true;
  return req.authContext?.allowedClubIds?.includes(clubId) ?? false;
}

function validHHMM(v: string): boolean {
  return /^\d{2}:\d{2}$/.test(v) && Number(v.slice(0, 2)) <= 23 && Number(v.slice(3, 5)) <= 59;
}

function minutes(v: string): number {
  return Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
}

function parseWeekdays(input: unknown): Weekday[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('weekdays debe ser un array no vacío');
  }
  const out = Array.from(new Set(input.map((x) => String(x)))) as Weekday[];
  if (!out.every((d) => WEEKDAYS.includes(d))) {
    throw new Error('weekdays contiene valores inválidos');
  }
  return out;
}

function dateRangeOverlaps(
  aStart: string | null | undefined,
  aEnd: string | null | undefined,
  bStart: string | null | undefined,
  bEnd: string | null | undefined
): boolean {
  const as = aStart ?? '1900-01-01';
  const ae = aEnd ?? '2999-12-31';
  const bs = bStart ?? '1900-01-01';
  const be = bEnd ?? '2999-12-31';
  return as <= be && bs <= ae;
}

function isoToWeekday(iso: string): Weekday {
  const d = new Date(iso);
  const idx = d.getUTCDay(); // 0 = sun
  return idx === 0 ? 'sun' : (WEEKDAYS[idx - 1] as Weekday);
}

async function validateCourseSchedulingConflicts(params: {
  clubId: string;
  staffId: string;
  courtId: string;
  weekdays: Weekday[];
  startTime: string;
  endTime: string;
  startsOn?: string | null;
  endsOn?: string | null;
  excludeCourseId?: string;
  isActive?: boolean;
}): Promise<string | null> {
  if (params.isActive === false) return null;
  const supabase = getSupabaseServiceRoleClient();

  // 1) Conflicts against other active courses (same staff or same court, overlapping day/time/date-range)
  let coursesQ = supabase
    .from('club_school_courses')
    .select('id, name, staff_id, court_id, starts_on, ends_on, is_active')
    .eq('club_id', params.clubId)
    .eq('is_active', true);
  if (params.excludeCourseId) coursesQ = coursesQ.neq('id', params.excludeCourseId);
  const { data: courses, error: cErr } = await coursesQ;
  if (cErr) return cErr.message;
  const candidateCourseIds = (courses ?? []).map((c: any) => c.id);
  if (candidateCourseIds.length) {
    const { data: days, error: dErr } = await supabase
      .from('club_school_course_days')
      .select('course_id, weekday, start_time, end_time')
      .in('course_id', candidateCourseIds)
      .in('weekday', params.weekdays)
      .lt('start_time', params.endTime)
      .gt('end_time', params.startTime);
    if (dErr) return dErr.message;
    const daysByCourse = new Set((days ?? []).map((d: any) => d.course_id));
    for (const course of courses ?? []) {
      if (!daysByCourse.has(course.id)) continue;
      if (!dateRangeOverlaps(params.startsOn, params.endsOn, course.starts_on, course.ends_on)) continue;
      if (course.staff_id === params.staffId) {
        return `Conflicto: el profesor ya tiene otro curso en ese horario (${course.name ?? course.id})`;
      }
      if (course.court_id === params.courtId) {
        return `Conflicto: la pista ya tiene otro curso en ese horario (${course.name ?? course.id})`;
      }
    }
  }

  // 2) Conflicts against existing bookings (including bookings created by matches)
  let bookingsQ = supabase
    .from('bookings')
    .select('id, start_at, end_at, status, reservation_type')
    .eq('court_id', params.courtId)
    .neq('status', 'cancelled');
  const fromDate = params.startsOn ?? new Date().toISOString().slice(0, 10);
  bookingsQ = bookingsQ.gte('start_at', `${fromDate}T00:00:00Z`);
  if (params.endsOn) {
    bookingsQ = bookingsQ.lte('start_at', `${params.endsOn}T23:59:59Z`);
  }
  const { data: bookings, error: bErr } = await bookingsQ;
  if (bErr) return bErr.message;
  const reqStart = minutes(params.startTime);
  const reqEnd = minutes(params.endTime);
  for (const b of bookings ?? []) {
    const wd = isoToWeekday(String(b.start_at));
    if (!params.weekdays.includes(wd)) continue;
    const bStart = String(b.start_at).slice(11, 16);
    const bEnd = String(b.end_at).slice(11, 16);
    if (!validHHMM(bStart) || !validHHMM(bEnd)) continue;
    const bStartMin = minutes(bStart);
    const bEndMin = minutes(bEnd);
    if (reqStart < bEndMin && reqEnd > bStartMin) {
      return 'Conflicto: ya existe una reserva/partido en esa pista y horario';
    }
  }

  // 3) Conflicts against tournaments
  let tournamentsQ = supabase
    .from('tournaments')
    .select('id, start_at, end_at, status, tournament_courts!inner(court_id)')
    .eq('club_id', params.clubId)
    .eq('tournament_courts.court_id', params.courtId)
    .neq('status', 'cancelled');
  const fromTournamentDate = params.startsOn ?? new Date().toISOString().slice(0, 10);
  tournamentsQ = tournamentsQ.gte('start_at', `${fromTournamentDate}T00:00:00Z`);
  if (params.endsOn) {
    tournamentsQ = tournamentsQ.lte('start_at', `${params.endsOn}T23:59:59Z`);
  }
  const { data: tournaments, error: tErr } = await tournamentsQ;
  if (tErr) return tErr.message;
  for (const t of tournaments ?? []) {
    const wd = isoToWeekday(String((t as { start_at: string }).start_at));
    if (!params.weekdays.includes(wd)) continue;
    const tStart = String((t as { start_at: string }).start_at).slice(11, 16);
    const tEnd = String((t as { end_at: string }).end_at).slice(11, 16);
    if (!validHHMM(tStart) || !validHHMM(tEnd)) continue;
    const tStartMin = minutes(tStart);
    const tEndMin = minutes(tEnd);
    if (reqStart < tEndMin && reqEnd > tStartMin) {
      return 'Conflicto: ya existe un torneo en esa pista y horario';
    }
  }
  return null;
}

async function ensureCourseRelations(
  req: Request,
  clubId: string,
  staffId: string,
  courtId: string
): Promise<string | null> {
  const supabase = getSupabaseServiceRoleClient();
  if (!canAccessClub(req, clubId)) return 'No tienes acceso a este club';

  const { data: staffRow, error: staffErr } = await supabase
    .from('club_staff')
    .select('id, club_id')
    .eq('id', staffId)
    .maybeSingle();
  if (staffErr) return staffErr.message;
  if (!staffRow || (staffRow as { club_id: string }).club_id !== clubId) {
    return 'staff_id inválido para este club';
  }

  const { data: courtRow, error: courtErr } = await supabase
    .from('courts')
    .select('id, club_id')
    .eq('id', courtId)
    .maybeSingle();
  if (courtErr) return courtErr.message;
  if (!courtRow || (courtRow as { club_id: string }).club_id !== clubId) {
    return 'court_id inválido para este club';
  }

  return null;
}


/**
 * @openapi
 * /school-courses:
 *   get:
 *     tags: [School courses]
 *     summary: Listar cursos de escuela de un club
 *     description: Devuelve cursos con contador de alumnos inscriptos y filtros por deporte/nivel.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: club_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: ID del club.
 *       - in: query
 *         name: sport
 *         required: false
 *         schema: { type: string, enum: [padel, tenis] }
 *         description: Filtro por deporte.
 *       - in: query
 *         name: level
 *         required: false
 *         schema: { type: string, enum: [Principiante, Intermedio, Avanzado, Competicion, Elite, Infantil] }
 *         description: Filtro por nivel.
 *     responses:
 *       200:
 *         description: Cursos encontrados.
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value:
 *                   ok: true
 *                   courses:
 *                     - id: "uuid"
 *                       name: "Curso Martes 19:00"
 *                       sport: "padel"
 *                       level: "Intermedio"
 *                       enrolled_count: 10
 *       400: { description: Validación }
 *       403: { description: Sin acceso al club }
 */
router.get('/', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const clubId = String(req.query.club_id ?? '').trim();
  const sport = String(req.query.sport ?? '').trim();
  const level = String(req.query.level ?? '').trim();
  if (!clubId) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, clubId)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  if (sport && !SPORTS.includes(sport as Sport)) {
    return res.status(400).json({ ok: false, error: 'sport inválido' });
  }
  if (level && !LEVELS.includes(level as Level)) {
    return res.status(400).json({ ok: false, error: 'level inválido' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    let q = supabase.from('club_school_courses').select(COURSE_FIELDS).eq('club_id', clubId).order('created_at', { ascending: false });
    if (sport) q = q.eq('sport', sport);
    if (level) q = q.eq('level', level);

    const { data: courses, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    const courseIds = (courses ?? []).map((c: { id: string }) => c.id);

    const [daysRes, enrolledRes, staffRes, courtRes] = await Promise.all([
      courseIds.length
        ? supabase
            .from('club_school_course_days')
            .select('id, course_id, weekday, start_time, end_time')
            .in('course_id', courseIds)
            .order('weekday')
            .order('start_time')
        : Promise.resolve({ data: [], error: null } as any),
      courseIds.length
        ? supabase
            .from('club_school_course_enrollments')
            .select('course_id, status')
            .in('course_id', courseIds)
        : Promise.resolve({ data: [], error: null } as any),
      supabase.from('club_staff').select('id, name').eq('club_id', clubId),
      supabase.from('courts').select('id, name').eq('club_id', clubId),
    ]);
    if (daysRes.error) return res.status(500).json({ ok: false, error: daysRes.error.message });
    if (enrolledRes.error) return res.status(500).json({ ok: false, error: enrolledRes.error.message });
    if (staffRes.error) return res.status(500).json({ ok: false, error: staffRes.error.message });
    if (courtRes.error) return res.status(500).json({ ok: false, error: courtRes.error.message });

    const byCourseDays = new Map<string, any[]>();
    for (const d of daysRes.data ?? []) {
      const list = byCourseDays.get(d.course_id) ?? [];
      list.push(d);
      byCourseDays.set(d.course_id, list);
    }
    const enrolledCount = new Map<string, number>();
    for (const e of enrolledRes.data ?? []) {
      if (e.status !== 'cancelled') {
        enrolledCount.set(e.course_id, (enrolledCount.get(e.course_id) ?? 0) + 1);
      }
    }
    const staffById = new Map((staffRes.data ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));
    const courtById = new Map((courtRes.data ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));

    const out = (courses ?? []).map((c: any) => ({
      ...c,
      days: byCourseDays.get(c.id) ?? [],
      enrolled_count: enrolledCount.get(c.id) ?? 0,
      staff_name: staffById.get(c.staff_id) ?? null,
      court_name: courtById.get(c.court_id) ?? null,
    }));
    return res.json({ ok: true, courses: out });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /school-courses/{id}:
 *   get:
 *     tags: [School courses]
 *     summary: Obtener detalles de un curso
 *     description: Devuelve datos del curso, días semanales y contador de alumnos.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: ID del curso
 *     responses:
 *       200:
 *         description: Detalles del curso
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value:
 *                   ok: true
 *                   course:
 *                     id: "uuid"
 *                     name: "Curso Intermedio"
 *                     sport: "padel"
 *                     level: "Intermedio"
 *                     staff_name: "Juan"
 *                     court_name: "PISTA 1"
 *                     price_cents: 6000
 *                     capacity: 8
 *                     enrolled_count: 5
 *                     days: [{ weekday: "tue", start_time: "19:00", end_time: "20:00" }]
 *       403: { description: Sin acceso }
 *       404: { description: No encontrado }
 */
router.get('/:id', requireClubOwnerOrAdmin, async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;
  // Fix route conflict: if someone calls /school-courses/slots,
  // Express may match this parameterized route first.
  // We forward to let /school-courses/slots handler run.
  if (id === 'slots') return next();
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: course, error: cErr } = await supabase
      .from('club_school_courses')
      .select('id, club_id, name, sport, level, staff_id, court_id, price_cents, capacity, is_active, starts_on, ends_on')
      .eq('id', id)
      .maybeSingle();

    if (cErr) return res.status(500).json({ ok: false, error: cErr.message });
    if (!course) return res.status(404).json({ ok: false, error: 'Curso no encontrado' });

    const clubId = (course as any).club_id as string;
    if (!canAccessClub(req, clubId)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este curso' });

    const [daysRes, staffRes, courtRes, enrollCountRes] = await Promise.all([
      supabase
        .from('club_school_course_days')
        .select('id, course_id, weekday, start_time, end_time')
        .eq('course_id', id)
        .order('weekday')
        .order('start_time'),
      supabase.from('club_staff').select('id, name').eq('id', (course as any).staff_id).maybeSingle(),
      supabase.from('courts').select('id, name').eq('id', (course as any).court_id).maybeSingle(),
      supabase
        .from('club_school_course_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('course_id', id)
        .neq('status', 'cancelled'),
    ]);

    if (daysRes.error) return res.status(500).json({ ok: false, error: daysRes.error.message });
    if (staffRes.error) return res.status(500).json({ ok: false, error: staffRes.error.message });
    if (courtRes.error) return res.status(500).json({ ok: false, error: courtRes.error.message });
    if (enrollCountRes.error) return res.status(500).json({ ok: false, error: enrollCountRes.error.message });

    const enrolled_count = enrollCountRes.count ?? 0;

    const out = {
      ...course,
      days: daysRes.data ?? [],
      enrolled_count,
      staff_name: (staffRes.data as any)?.name ?? null,
      court_name: (courtRes.data as any)?.name ?? null,
    };

    return res.json({ ok: true, course: out });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /school-courses:
 *   post:
 *     tags: [School courses]
 *     summary: Crear curso de escuela
 *     description: Crea un curso y sus días semanales de dictado, enlazado a staff y pista.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [club_id, name, sport, level, staff_id, court_id, price_cents, capacity, weekdays, start_time, end_time]
 *             properties:
 *               club_id: { type: string, format: uuid }
 *               name: { type: string, example: "Curso Martes 19:00" }
 *               sport: { type: string, enum: [padel, tenis] }
 *               level: { type: string, enum: [Principiante, Intermedio, Avanzado, Competicion, Elite, Infantil] }
 *               staff_id: { type: string, format: uuid }
 *               court_id: { type: string, format: uuid }
 *               price_cents: { type: integer, example: 6000 }
 *               capacity: { type: integer, example: 8 }
 *               weekdays:
 *                 type: array
 *                 items: { type: string, enum: [mon, tue, wed, thu, fri, sat, sun] }
 *                 example: [tue, thu]
 *               start_time: { type: string, example: "19:00" }
 *               end_time: { type: string, example: "20:00" }
 *               starts_on: { type: string, format: date, example: "2026-03-01" }
 *               ends_on: { type: string, format: date, example: "2026-06-30" }
 *           examples:
 *             body:
 *               value:
 *                 club_id: "uuid"
 *                 name: "Curso Intermedio Martes"
 *                 sport: "padel"
 *                 level: "Intermedio"
 *                 staff_id: "uuid"
 *                 court_id: "uuid"
 *                 price_cents: 6000
 *                 capacity: 8
 *                 weekdays: [tue, thu]
 *                 start_time: "19:00"
 *                 end_time: "20:00"
 *     responses:
 *       201: { description: Creado }
 *       400: { description: Validación }
 *       403: { description: Sin acceso al club }
 */
router.post('/', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const {
    club_id,
    name,
    sport,
    level,
    staff_id,
    court_id,
    price_cents,
    capacity,
    weekdays,
    start_time,
    end_time,
    starts_on,
    ends_on,
    is_active,
  } = req.body ?? {};

  const clubId = String(club_id ?? '').trim();
  const courseName = String(name ?? '').trim();
  if (!clubId || !courseName) {
    return res.status(400).json({ ok: false, error: 'club_id y name son obligatorios' });
  }
  if (!SPORTS.includes(sport as Sport)) return res.status(400).json({ ok: false, error: 'sport inválido' });
  if (!LEVELS.includes(level as Level)) return res.status(400).json({ ok: false, error: 'level inválido' });
  if (!String(staff_id ?? '').trim()) return res.status(400).json({ ok: false, error: 'staff_id es obligatorio' });
  if (!String(court_id ?? '').trim()) return res.status(400).json({ ok: false, error: 'court_id es obligatorio' });
  if (!validHHMM(String(start_time ?? '')) || !validHHMM(String(end_time ?? ''))) {
    return res.status(400).json({ ok: false, error: 'start_time/end_time deben ser HH:mm' });
  }
  if (minutes(String(start_time)) >= minutes(String(end_time))) {
    return res.status(400).json({ ok: false, error: 'start_time debe ser menor que end_time' });
  }
  const cap = Number(capacity);
  if (!Number.isFinite(cap) || cap <= 0) return res.status(400).json({ ok: false, error: 'capacity inválido' });
  const price = Number(price_cents);
  if (!Number.isFinite(price) || price < 0) {
    return res.status(400).json({ ok: false, error: 'price_cents inválido' });
  }
  let days: Weekday[];
  try {
    days = parseWeekdays(weekdays);
  } catch (e) {
    return res.status(400).json({ ok: false, error: (e as Error).message });
  }

  const relErr = await ensureCourseRelations(req, clubId, String(staff_id), String(court_id));
  if (relErr) return res.status(403).json({ ok: false, error: relErr });

  const scheduleConflict = await validateCourseSchedulingConflicts({
    clubId,
    staffId: String(staff_id),
    courtId: String(court_id),
    weekdays: days,
    startTime: String(start_time),
    endTime: String(end_time),
    startsOn: starts_on || null,
    endsOn: ends_on || null,
    isActive: is_active !== false,
  });
  if (scheduleConflict) return res.status(409).json({ ok: false, error: scheduleConflict });

  try {
    const supabase = getSupabaseServiceRoleClient();
    const row = {
      club_id: clubId,
      name: courseName,
      sport,
      level,
      staff_id: String(staff_id),
      court_id: String(court_id),
      price_cents: Math.round(price),
      capacity: Math.round(cap),
      is_active: is_active !== false,
      starts_on: starts_on || null,
      ends_on: ends_on || null,
    };
    const { data: created, error } = await supabase
      .from('club_school_courses')
      .insert(row)
      .select(COURSE_FIELDS)
      .single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    const daysRows = days.map((d) => ({
      course_id: created.id,
      weekday: d,
      start_time: String(start_time),
      end_time: String(end_time),
    }));
    const { data: createdDays, error: dayErr } = await supabase
      .from('club_school_course_days')
      .insert(daysRows)
      .select('id, course_id, weekday, start_time, end_time')
      .order('weekday')
      .order('start_time');
    if (dayErr) return res.status(500).json({ ok: false, error: dayErr.message });
    return res.status(201).json({ ok: true, course: { ...created, days: createdDays ?? [], enrolled_count: 0 } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /school-courses/{id}:
 *   put:
 *     tags: [School courses]
 *     summary: Editar curso de escuela
 *     description: Actualiza datos del curso y sus días/horarios de dictado.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           examples:
 *             body:
 *               value:
 *                 name: "Curso Intermedio Martes 19:30"
 *                 court_id: "uuid"
 *                 weekdays: [tue]
 *                 start_time: "19:30"
 *                 end_time: "20:30"
 *     responses:
 *       200: { description: Actualizado }
 *       400: { description: Validación }
 *       403: { description: Sin acceso al club }
 *       404: { description: No encontrado }
 */
router.put('/:id', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: existing, error: exErr } = await supabase
      .from('club_school_courses')
      .select('id, club_id, staff_id, court_id, starts_on, ends_on, is_active')
      .eq('id', id)
      .maybeSingle();
    if (exErr) return res.status(500).json({ ok: false, error: exErr.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Curso no encontrado' });
    const clubId = (existing as { club_id: string }).club_id;
    if (!canAccessClub(req, clubId)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este curso' });

    const {
      name,
      sport,
      level,
      staff_id,
      court_id,
      price_cents,
      capacity,
      weekdays,
      start_time,
      end_time,
      starts_on,
      ends_on,
      is_active,
    } = req.body ?? {};

    if (sport !== undefined && !SPORTS.includes(sport as Sport)) {
      return res.status(400).json({ ok: false, error: 'sport inválido' });
    }
    if (level !== undefined && !LEVELS.includes(level as Level)) {
      return res.status(400).json({ ok: false, error: 'level inválido' });
    }
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) update.name = String(name).trim();
    if (sport !== undefined) update.sport = sport;
    if (level !== undefined) update.level = level;
    if (staff_id !== undefined) update.staff_id = String(staff_id);
    if (court_id !== undefined) update.court_id = String(court_id);
    if (price_cents !== undefined) {
      const p = Number(price_cents);
      if (!Number.isFinite(p) || p < 0) return res.status(400).json({ ok: false, error: 'price_cents inválido' });
      update.price_cents = Math.round(p);
    }
    if (capacity !== undefined) {
      const c = Number(capacity);
      if (!Number.isFinite(c) || c <= 0) return res.status(400).json({ ok: false, error: 'capacity inválido' });
      update.capacity = Math.round(c);
    }
    if (starts_on !== undefined) update.starts_on = starts_on || null;
    if (ends_on !== undefined) update.ends_on = ends_on || null;
    if (is_active !== undefined) update.is_active = !!is_active;

    if ((start_time !== undefined && !validHHMM(String(start_time))) || (end_time !== undefined && !validHHMM(String(end_time)))) {
      return res.status(400).json({ ok: false, error: 'start_time/end_time deben ser HH:mm' });
    }
    const hasScheduleChange = weekdays !== undefined || start_time !== undefined || end_time !== undefined;

    const nextStaff = update.staff_id ?? req.body?.staff_id;
    const nextCourt = update.court_id ?? req.body?.court_id;
    if (nextStaff !== undefined || nextCourt !== undefined) {
      const { data: current } = await supabase
        .from('club_school_courses')
        .select('staff_id, court_id')
        .eq('id', id)
        .maybeSingle();
      const relErr = await ensureCourseRelations(
        req,
        clubId,
        String(nextStaff ?? (current as any)?.staff_id),
        String(nextCourt ?? (current as any)?.court_id)
      );
      if (relErr) return res.status(403).json({ ok: false, error: relErr });
    }

    let nextStart = '';
    let nextEnd = '';
    let nextWeekdays: Weekday[] = [];
    {
      const { data: dayRows, error: dErr } = await supabase
        .from('club_school_course_days')
        .select('weekday, start_time, end_time')
        .eq('course_id', id);
      if (dErr) return res.status(500).json({ ok: false, error: dErr.message });
      if (!dayRows?.length) return res.status(400).json({ ok: false, error: 'El curso no tiene días configurados' });
      const existingStart = String((dayRows[0] as any).start_time ?? '');
      const existingEnd = String((dayRows[0] as any).end_time ?? '');
      nextStart = String(start_time ?? existingStart);
      nextEnd = String(end_time ?? existingEnd);
      if (!validHHMM(nextStart) || !validHHMM(nextEnd) || minutes(nextStart) >= minutes(nextEnd)) {
        return res.status(400).json({ ok: false, error: 'Horario inválido' });
      }
      if (weekdays !== undefined) {
        try {
          nextWeekdays = parseWeekdays(weekdays);
        } catch (e) {
          return res.status(400).json({ ok: false, error: (e as Error).message });
        }
      } else {
        nextWeekdays = (dayRows ?? []).map((x: any) => x.weekday as Weekday);
      }
    }

    const conflict = await validateCourseSchedulingConflicts({
      clubId,
      staffId: String(update.staff_id ?? (existing as any).staff_id),
      courtId: String(update.court_id ?? (existing as any).court_id),
      weekdays: nextWeekdays,
      startTime: nextStart,
      endTime: nextEnd,
      startsOn: (starts_on !== undefined ? starts_on : (existing as any).starts_on) || null,
      endsOn: (ends_on !== undefined ? ends_on : (existing as any).ends_on) || null,
      excludeCourseId: id,
      isActive: is_active !== undefined ? !!is_active : !!(existing as any).is_active,
    });
    if (conflict) return res.status(409).json({ ok: false, error: conflict });

    if (Object.keys(update).length > 1) {
      const { error: updErr } = await supabase.from('club_school_courses').update(update).eq('id', id);
      if (updErr) return res.status(500).json({ ok: false, error: updErr.message });
    }

    if (hasScheduleChange) {
      await supabase.from('club_school_course_days').delete().eq('course_id', id);
      const { error: insErr } = await supabase.from('club_school_course_days').insert(
        nextWeekdays.map((wd) => ({
          course_id: id,
          weekday: wd,
          start_time: nextStart,
          end_time: nextEnd,
        }))
      );
      if (insErr) return res.status(500).json({ ok: false, error: insErr.message });
    }

    const { data: updated, error: getErr } = await supabase
      .from('club_school_courses')
      .select(COURSE_FIELDS)
      .eq('id', id)
      .maybeSingle();
    if (getErr) return res.status(500).json({ ok: false, error: getErr.message });
    const { data: days, error: daysErr } = await supabase
      .from('club_school_course_days')
      .select('id, course_id, weekday, start_time, end_time')
      .eq('course_id', id)
      .order('weekday')
      .order('start_time');
    if (daysErr) return res.status(500).json({ ok: false, error: daysErr.message });

    const { count: enrolledCount, error: countErr } = await supabase
      .from('club_school_course_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', id)
      .neq('status', 'cancelled');
    if (countErr) return res.status(500).json({ ok: false, error: countErr.message });

    return res.json({ ok: true, course: { ...updated, days: days ?? [], enrolled_count: enrolledCount ?? 0 } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /school-courses/slots:
 *   get:
 *     tags: [School courses]
 *     summary: Bloqueos de pista por cursos para la grilla
 *     description: Devuelve instancias de cursos para una fecha específica y así pintarlas como bloqueos en grilla.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: club_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: date
 *         required: true
 *         schema: { type: string, format: date }
 *         description: Fecha YYYY-MM-DD.
 *     responses:
 *       200:
 *         description: Bloqueos de cursos.
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value:
 *                   ok: true
 *                   slots:
 *                     - id: "course-slot-uuid"
 *                       course_id: "uuid"
 *                       court_id: "uuid"
 *                       start_time: "19:00"
 *                       end_time: "20:00"
 *                       course_name: "Curso Intermedio"
 *                       staff_name: "Juan Coach"
 *     400: { description: Validación }
 *     403: { description: Sin acceso al club }
 */
router.get('/slots', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const clubId = String(req.query.club_id ?? '').trim();
  const date = String(req.query.date ?? '').trim();
  if (!clubId || !date) return res.status(400).json({ ok: false, error: 'club_id y date son obligatorios' });
  if (!canAccessClub(req, clubId)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ ok: false, error: 'date debe ser YYYY-MM-DD' });

  const jsDate = new Date(`${date}T00:00:00Z`);
  const idx = jsDate.getUTCDay(); // 0 sun
  const weekday: Weekday = idx === 0 ? 'sun' : (WEEKDAYS[idx - 1] as Weekday);

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: courses, error } = await supabase
      .from('club_school_courses')
      .select('id, name, club_id, staff_id, court_id, starts_on, ends_on, is_active')
      .eq('club_id', clubId)
      .eq('is_active', true);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    const activeForDay = (courses ?? []).filter((c: any) => {
      if (c.starts_on && date < c.starts_on) return false;
      if (c.ends_on && date > c.ends_on) return false;
      return true;
    });
    const ids = activeForDay.map((x: any) => x.id);
    if (ids.length === 0) return res.json({ ok: true, slots: [] });

    const [daysRes, staffRes] = await Promise.all([
      supabase
        .from('club_school_course_days')
        .select('id, course_id, weekday, start_time, end_time')
        .in('course_id', ids)
        .eq('weekday', weekday),
      supabase.from('club_staff').select('id, name').eq('club_id', clubId),
    ]);
    if (daysRes.error) return res.status(500).json({ ok: false, error: daysRes.error.message });
    if (staffRes.error) return res.status(500).json({ ok: false, error: staffRes.error.message });

    const coursesById = new Map(activeForDay.map((c: any) => [c.id, c]));
    const staffById = new Map((staffRes.data ?? []).map((s: any) => [s.id, s.name]));
    const out = (daysRes.data ?? [])
      .map((d: any) => {
        const c = coursesById.get(d.course_id);
        if (!c) return null;
        return {
          id: `${d.course_id}:${d.id}:${date}`,
          course_id: d.course_id,
          date,
          court_id: c.court_id,
          start_time: d.start_time,
          end_time: d.end_time,
          course_name: c.name,
          staff_name: staffById.get(c.staff_id) ?? null,
        };
      })
      .filter(Boolean);
    return res.json({ ok: true, slots: out });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /school-courses/{id}:
 *   delete:
 *     tags: [School courses]
 *     summary: Eliminar curso de escuela
 *     description: Elimina curso y sus días de dictado.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Eliminado }
 *       403: { description: Sin acceso }
 *       404: { description: No encontrado }
 */
router.delete('/:id', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: existing, error: exErr } = await supabase
      .from('club_school_courses')
      .select('id, club_id')
      .eq('id', id)
      .maybeSingle();
    if (exErr) return res.status(500).json({ ok: false, error: exErr.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Curso no encontrado' });
    const clubId = (existing as { club_id: string }).club_id;
    if (!canAccessClub(req, clubId)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este curso' });
    await supabase.from('club_school_course_days').delete().eq('course_id', id);
    await supabase.from('club_school_course_enrollments').delete().eq('course_id', id);
    const { error: delErr } = await supabase.from('club_school_courses').delete().eq('id', id);
    if (delErr) return res.status(500).json({ ok: false, error: delErr.message });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /school-courses/{id}/enrollments:
 *   post:
 *     tags: [School courses]
 *     summary: Anotar alumno en curso
 *     description: Inserta inscripción para contar alumnos y controlar cupos.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               player_id: { type: string, format: uuid }
 *               student_name: { type: string }
 *               student_email: { type: string }
 *               student_phone: { type: string }
 *     responses:
 *       201: { description: Inscripción creada }
 *       400: { description: Validación }
 *       403: { description: Sin acceso }
 *       409: { description: Sin cupos o alumno duplicado }
 */
router.post('/:id/enrollments', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { player_id, student_name, student_email, student_phone } = req.body ?? {};
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: course, error: cErr } = await supabase
      .from('club_school_courses')
      .select('id, club_id, capacity')
      .eq('id', id)
      .maybeSingle();
    if (cErr) return res.status(500).json({ ok: false, error: cErr.message });
    if (!course) return res.status(404).json({ ok: false, error: 'Curso no encontrado' });
    if (!canAccessClub(req, (course as any).club_id)) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este curso' });
    }

    const { count, error: countErr } = await supabase
      .from('club_school_course_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', id)
      .neq('status', 'cancelled');
    if (countErr) return res.status(500).json({ ok: false, error: countErr.message });
    if ((count ?? 0) >= Number((course as any).capacity ?? 0)) {
      return res.status(409).json({ ok: false, error: 'El curso no tiene cupos disponibles' });
    }
    if (player_id) {
      const { data: dup } = await supabase
        .from('club_school_course_enrollments')
        .select('id')
        .eq('course_id', id)
        .eq('player_id', String(player_id))
        .neq('status', 'cancelled')
        .maybeSingle();
      if (dup) return res.status(409).json({ ok: false, error: 'Este jugador ya está anotado' });
    }
    const { data: created, error: insErr } = await supabase
      .from('club_school_course_enrollments')
      .insert({
        course_id: id,
        player_id: player_id ? String(player_id) : null,
        student_name: student_name ? String(student_name) : null,
        student_email: student_email ? String(student_email) : null,
        student_phone: student_phone ? String(student_phone) : null,
        status: 'active',
      })
      .select('id, course_id, player_id, student_name, student_email, student_phone, status, created_at, updated_at')
      .single();
    if (insErr) return res.status(500).json({ ok: false, error: insErr.message });
    return res.status(201).json({ ok: true, enrollment: created });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
