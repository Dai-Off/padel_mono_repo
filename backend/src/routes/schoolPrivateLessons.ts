import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdminOrPortalStaff } from '../middleware/requireClubOwnerOrAdminOrPortalStaff';
import { canAccessClub, isOnlyTeacher, getStaffIdForUser } from '../lib/clubAccess';
import { lookupFeeRulePriceCents, type SchoolWeekday } from '../lib/schoolPricing';
import { assertSchoolCoachStaff } from '../lib/schoolStaffRoles';

const router = Router();
router.use(attachAuthContext);

type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function validHHMM(v: string): boolean {
  return /^\d{2}:\d{2}$/.test(v) && Number(v.slice(0, 2)) <= 23 && Number(v.slice(3, 5)) <= 59;
}

async function validatePrivateLessonPriceCents(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  clubId: string,
  staffId: string,
  studentCount: number,
  priceCents: number,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('club_school_fee_rules')
    .select('price_cents, staff_id')
    .eq('club_id', clubId)
    .eq('is_active', true)
    .eq('group_size', studentCount)
    .eq('price_cents', priceCents);
  if (error || !data?.length) return false;
  return data.some((r) => !(r as { staff_id?: string | null }).staff_id || (r as { staff_id: string }).staff_id === staffId);
}

async function resolvePrivateLessonPriceCents(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  req: Request,
  clubId: string,
  staffId: string,
  studentCount: 1 | 2 | 3,
  weekday: Weekday,
  startTime: string,
): Promise<number | { error: string }> {
  if (req.body?.price_cents !== undefined && req.body?.price_cents !== null) {
    const priceCents = Math.trunc(Number(req.body.price_cents));
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      return { error: 'price_cents inválido' };
    }
    const valid = await validatePrivateLessonPriceCents(supabase, clubId, staffId, studentCount, priceCents);
    if (!valid) {
      return { error: 'La tarifa seleccionada no es válida para este profesor y número de alumnos' };
    }
    return priceCents;
  }

  const feePrice = await lookupFeeRulePriceCents(supabase, clubId, studentCount, weekday, startTime, staffId);
  if (feePrice == null) {
    return { error: 'Indica una tarifa válida o configúrala en Cuotas particulares' };
  }
  return feePrice;
}

router.get('/', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const clubId = String(req.query.club_id ?? '').trim();
  if (!clubId) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, clubId, 'escuela')) return res.status(403).json({ ok: false, error: 'Sin acceso al club' });
  const supabase = getSupabaseServiceRoleClient();
  let q = supabase
    .from('club_school_private_lessons')
    .select('id, club_id, student_player_id, student_name, student_email, student_phone, staff_id, court_id, price_cents, student_count, weekday, start_time, end_time, starts_on, ends_on, is_active, created_at, updated_at')
    .eq('club_id', clubId);

  if (isOnlyTeacher(req, clubId)) {
    const staffId = await getStaffIdForUser(req, clubId);
    if (staffId) {
      q = q.eq('staff_id', staffId);
    } else {
      return res.json({ ok: true, lessons: [] });
    }
  }

  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, lessons: data ?? [] });
});

router.post('/', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const clubId = String(req.body?.club_id ?? '').trim();
  if (!clubId) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, clubId, 'escuela')) return res.status(403).json({ ok: false, error: 'Sin acceso al club' });
  const weekday = String(req.body?.weekday ?? '').trim() as Weekday;
  const startTime = String(req.body?.start_time ?? '');
  const endTime = String(req.body?.end_time ?? '');
  if (!WEEKDAYS.includes(weekday)) return res.status(400).json({ ok: false, error: 'weekday inválido' });
  if (!validHHMM(startTime) || !validHHMM(endTime) || startTime >= endTime) {
    return res.status(400).json({ ok: false, error: 'Horario inválido' });
  }
  const studentCount = Math.trunc(Number(req.body?.student_count ?? 1));
  if (![1, 2, 3].includes(studentCount)) {
    return res.status(400).json({ ok: false, error: 'student_count debe ser 1, 2 o 3' });
  }
  const staffId = String(req.body?.staff_id ?? '').trim();
  const courtId = String(req.body?.court_id ?? '').trim();
  if (!staffId || !courtId) return res.status(400).json({ ok: false, error: 'staff_id y court_id son obligatorios' });

  const supabase = getSupabaseServiceRoleClient();
  const coachErr = await assertSchoolCoachStaff(supabase, clubId, staffId);
  if (coachErr) return res.status(400).json({ ok: false, error: coachErr });

  const feePrice = await resolvePrivateLessonPriceCents(
    supabase,
    req,
    clubId,
    staffId,
    studentCount as 1 | 2 | 3,
    weekday,
    startTime,
  );
  if (typeof feePrice === 'object') {
    return res.status(400).json({ ok: false, error: feePrice.error });
  }

  const { data, error } = await supabase
    .from('club_school_private_lessons')
    .insert({
      club_id: clubId,
      student_player_id: req.body?.student_player_id || null,
      student_name: req.body?.student_name || null,
      student_email: req.body?.student_email || null,
      student_phone: req.body?.student_phone || null,
      staff_id: staffId,
      court_id: courtId,
      student_count: studentCount,
      price_cents: feePrice,
      weekday,
      start_time: startTime,
      end_time: endTime,
      starts_on: req.body?.starts_on || null,
      ends_on: req.body?.ends_on || null,
      is_active: req.body?.is_active !== false,
    })
    .select('id, club_id, student_player_id, student_name, student_email, student_phone, staff_id, court_id, price_cents, student_count, weekday, start_time, end_time, starts_on, ends_on, is_active, created_at, updated_at')
    .single();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.status(201).json({ ok: true, lesson: data });
});

router.put('/:id', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const { id } = req.params;
  const supabase = getSupabaseServiceRoleClient();
  const { data: existing, error: exErr } = await supabase
    .from('club_school_private_lessons')
    .select('id, club_id, staff_id')
    .eq('id', id)
    .maybeSingle();
  if (exErr) return res.status(500).json({ ok: false, error: exErr.message });
  if (!existing) return res.status(404).json({ ok: false, error: 'Clase no encontrada' });
  const clubId = (existing as { club_id: string }).club_id;
  if (!canAccessClub(req, clubId, 'escuela')) return res.status(403).json({ ok: false, error: 'Sin acceso al club' });

  if (isOnlyTeacher(req, clubId)) {
    const staffId = await getStaffIdForUser(req, clubId);
    if ((existing as any).staff_id !== staffId) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para editar esta clase' });
    }
  }

  const update: Record<string, unknown> = {};
  const keys = [
    'student_player_id',
    'student_name',
    'student_email',
    'student_phone',
    'staff_id',
    'court_id',
    'starts_on',
    'ends_on',
    'is_active',
  ] as const;
  for (const k of keys) {
    if (req.body?.[k] !== undefined) update[k] = req.body[k] || null;
  }
  if (req.body?.weekday !== undefined) {
    const wd = String(req.body.weekday) as Weekday;
    if (!WEEKDAYS.includes(wd)) return res.status(400).json({ ok: false, error: 'weekday inválido' });
    update.weekday = wd;
  }
  if (req.body?.start_time !== undefined || req.body?.end_time !== undefined) {
    const startTime = String(req.body?.start_time ?? '');
    const endTime = String(req.body?.end_time ?? '');
    if (!validHHMM(startTime) || !validHHMM(endTime) || startTime >= endTime) {
      return res.status(400).json({ ok: false, error: 'Horario inválido' });
    }
    update.start_time = startTime;
    update.end_time = endTime;
  }
  if (req.body?.student_count !== undefined) {
    const sc = Math.trunc(Number(req.body.student_count));
    if (![1, 2, 3].includes(sc)) return res.status(400).json({ ok: false, error: 'student_count debe ser 1, 2 o 3' });
    update.student_count = sc;
  }

  const { data: currentLesson } = await supabase
    .from('club_school_private_lessons')
    .select('weekday, start_time, student_count')
    .eq('id', id)
    .maybeSingle();

  const nextWeekday = (update.weekday ?? (currentLesson as any)?.weekday) as Weekday;
  const nextStart = String(update.start_time ?? (currentLesson as any)?.start_time ?? '');
  const nextStudentCount = Math.trunc(Number(update.student_count ?? (currentLesson as any)?.student_count ?? 1)) as 1 | 2 | 3;
  const nextStaffId = String(update.staff_id ?? (existing as { staff_id?: string }).staff_id ?? '').trim();
  if (!nextStaffId) return res.status(400).json({ ok: false, error: 'staff_id es obligatorio' });

  const coachErr = await assertSchoolCoachStaff(supabase, clubId, nextStaffId);
  if (coachErr) return res.status(400).json({ ok: false, error: coachErr });

  const pricingFieldsTouched =
    req.body?.price_cents !== undefined ||
    req.body?.staff_id !== undefined ||
    req.body?.student_count !== undefined ||
    req.body?.weekday !== undefined ||
    req.body?.start_time !== undefined;

  if (pricingFieldsTouched) {
    const feePrice = await resolvePrivateLessonPriceCents(
      supabase,
      req,
      clubId,
      nextStaffId,
      nextStudentCount,
      nextWeekday,
      nextStart,
    );
    if (typeof feePrice === 'object') {
      return res.status(400).json({ ok: false, error: feePrice.error });
    }
    update.price_cents = feePrice;
  }

  const { data, error } = await supabase
    .from('club_school_private_lessons')
    .update(update)
    .eq('id', id)
    .select('id, club_id, student_player_id, student_name, student_email, student_phone, staff_id, court_id, price_cents, student_count, weekday, start_time, end_time, starts_on, ends_on, is_active, created_at, updated_at')
    .single();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, lesson: data });
});

router.delete('/:id', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const { id } = req.params;
  const supabase = getSupabaseServiceRoleClient();
  const { data: existing, error: exErr } = await supabase
    .from('club_school_private_lessons')
    .select('id, club_id, staff_id')
    .eq('id', id)
    .maybeSingle();
  if (exErr) return res.status(500).json({ ok: false, error: exErr.message });
  if (!existing) return res.status(404).json({ ok: false, error: 'Clase no encontrada' });
  const clubId = (existing as { club_id: string }).club_id;
  if (!canAccessClub(req, clubId, 'escuela')) return res.status(403).json({ ok: false, error: 'Sin acceso al club' });

  if (isOnlyTeacher(req, clubId)) {
    const staffId = await getStaffIdForUser(req, clubId);
    if ((existing as any).staff_id !== staffId) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para eliminar esta clase' });
    }
  }

  const { error } = await supabase.from('club_school_private_lessons').delete().eq('id', id);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true });
});

router.get('/slots', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const clubId = String(req.query.club_id ?? '').trim();
  const date = String(req.query.date ?? '').trim();
  if (!clubId || !date) return res.status(400).json({ ok: false, error: 'club_id y date son obligatorios' });
  if (!canAccessClub(req, clubId, 'escuela')) return res.status(403).json({ ok: false, error: 'Sin acceso al club' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ ok: false, error: 'date debe ser YYYY-MM-DD' });
  const jsDate = new Date(`${date}T00:00:00Z`);
  const idx = jsDate.getUTCDay();
  const weekday: Weekday = idx === 0 ? 'sun' : WEEKDAYS[idx - 1];

  const supabase = getSupabaseServiceRoleClient();
  let q = supabase
    .from('club_school_private_lessons')
    .select('id, student_name, student_player_id, staff_id, court_id, price_cents, weekday, start_time, end_time, starts_on, ends_on, is_active')
    .eq('club_id', clubId)
    .eq('is_active', true)
    .eq('weekday', weekday);

  if (isOnlyTeacher(req, clubId)) {
    const staffId = await getStaffIdForUser(req, clubId);
    if (staffId) {
      q = q.eq('staff_id', staffId);
    } else {
      return res.json({ ok: true, slots: [] });
    }
  }

  const { data, error } = await q;
  if (error) return res.status(500).json({ ok: false, error: error.message });
  const out = (data ?? [])
    .filter((x: any) => (!x.starts_on || date >= x.starts_on) && (!x.ends_on || date <= x.ends_on))
    .map((x: any) => ({
      id: `${x.id}:${date}`,
      private_lesson_id: x.id,
      date,
      court_id: x.court_id,
      start_time: x.start_time,
      end_time: x.end_time,
      student_name: x.student_name ?? null,
      price_cents: x.price_cents ?? 0,
    }));
  return res.json({ ok: true, slots: out });
});

export default router;
