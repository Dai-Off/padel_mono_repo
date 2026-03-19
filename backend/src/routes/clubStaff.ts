import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdmin } from '../middleware/requireClubOwnerOrAdmin';
import { hashStaffPassword } from '../lib/staffPassword';
import { sendStaffAccountEmail } from '../lib/mailer';
import { getFrontendUrl } from '../lib/env';

const router = Router();
router.use(attachAuthContext);

const FIELDS =
  'id, club_id, name, role, email, phone, schedule, schedule_blocks, status, created_at, updated_at';

type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

type ScheduleBlock = {
  days: Weekday[];
  from: string; // HH:mm
  to: string; // HH:mm
};

const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABEL: Record<Weekday, string> = {
  mon: 'L',
  tue: 'M',
  wed: 'X',
  thu: 'J',
  fri: 'V',
  sat: 'S',
  sun: 'D',
};

function isValidTimeHHMM(v: string): boolean {
  return /^\d{2}:\d{2}$/.test(v) && Number(v.slice(0, 2)) <= 23 && Number(v.slice(3, 5)) <= 59;
}

function timeToMinutes(v: string): number {
  return Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
}

function normalizeScheduleBlocks(input: unknown): ScheduleBlock[] {
  if (input == null) return [];
  if (!Array.isArray(input)) throw new Error('schedule_blocks debe ser un array');

  const blocks: ScheduleBlock[] = input.map((raw) => {
    if (raw == null || typeof raw !== 'object') throw new Error('Bloque de horario inválido');
    const r = raw as Record<string, unknown>;
    const daysRaw = r.days;
    const from = String(r.from ?? '');
    const to = String(r.to ?? '');
    if (!Array.isArray(daysRaw) || daysRaw.length === 0) throw new Error('days es obligatorio');
    const days = Array.from(new Set(daysRaw.map((d) => String(d)))) as Weekday[];
    if (!days.every((d) => WEEKDAYS.includes(d))) throw new Error('days contiene valores inválidos');
    if (!isValidTimeHHMM(from) || !isValidTimeHHMM(to)) throw new Error('from/to deben ser HH:mm');
    if (timeToMinutes(from) >= timeToMinutes(to)) throw new Error('from debe ser menor que to');
    return { days, from, to };
  });

  return blocks;
}

function blocksToDisplay(blocks: ScheduleBlock[]): string | null {
  if (!blocks.length) return null;

  const order = (d: Weekday) => WEEKDAYS.indexOf(d);
  const norm = blocks.map((b) => ({
    days: [...new Set(b.days)].sort((a, b2) => order(a) - order(b2)),
    from: b.from,
    to: b.to,
  }));

  const byDaysKey = new Map<string, { days: Weekday[]; ranges: { from: string; to: string }[] }>();
  for (const b of norm) {
    const key = b.days.join(',');
    const cur = byDaysKey.get(key);
    if (!cur) byDaysKey.set(key, { days: b.days, ranges: [{ from: b.from, to: b.to }] });
    else cur.ranges.push({ from: b.from, to: b.to });
  }

  const groups = Array.from(byDaysKey.values()).sort((a, b) => order(a.days[0] ?? 'mon') - order(b.days[0] ?? 'mon'));
  return groups
    .map((g) => {
      const days = g.days.map((d) => DAY_LABEL[d]).join('');
      const ranges = g.ranges
        .sort((a, b) => timeToMinutes(a.from) - timeToMinutes(b.from))
        .map((r) => `${r.from}-${r.to}`)
        .join(', ');
      return `${days} ${ranges}`;
    })
    .join(' · ');
}

function canAccessClub(req: Request, clubId: string): boolean {
  if (req.authContext?.adminId) return true;
  return req.authContext?.allowedClubIds?.includes(clubId) ?? false;
}

/**
 * @openapi
 * /club-staff:
 *   get:
 *     tags: [Club staff]
 *     summary: Listar personal del club
 *     description: Devuelve solo miembros del club indicado. Requiere ser admin o dueño con acceso a ese club.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: club_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: ID del club
 *     responses:
 *       200:
 *         description: Lista de personal
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value: { ok: true, staff: [{ id: "…", club_id: "…", name: "Ana", role: "Recepción", status: "active" }] }
 *       400: { description: Falta club_id }
 *       401: { description: Sin token }
 *       403: { description: Sin acceso al club }
 */
router.get('/', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const club_id = req.query.club_id as string | undefined;
  if (!club_id?.trim()) {
    return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  }
  if (!canAccessClub(req, club_id)) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('club_staff')
      .select(FIELDS)
      .eq('club_id', club_id)
      .order('created_at', { ascending: false });
    if (error) {
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        return res.status(503).json({
          ok: false,
          error: 'Tabla club_staff no existe. Aplica la migración en Supabase.',
        });
      }
      return res.status(500).json({ ok: false, error: error.message });
    }
    return res.json({ ok: true, staff: data ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /club-staff:
 *   post:
 *     tags: [Club staff]
 *     summary: Alta de personal
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [club_id, name]
 *             properties:
 *               club_id: { type: string, format: uuid }
 *               name: { type: string }
 *               role: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               schedule: { type: string, description: "Texto libre (legado). Preferir schedule_blocks." }
 *               schedule_blocks:
 *                 type: array
 *                 description: Horario por bloques (días + hora desde/hasta). Permite múltiples bloques.
 *                 items:
 *                   type: object
 *                   required: [days, from, to]
 *                   properties:
 *                     days:
 *                       type: array
 *                       items: { type: string, enum: [mon, tue, wed, thu, fri, sat, sun] }
 *                       example: [mon, tue, wed, thu, fri]
 *                     from: { type: string, example: "09:00" }
 *                     to: { type: string, example: "12:00" }
 *               status: { enum: [active, inactive] }
 *           examples:
 *             body:
 *               value:
 *                 club_id: "uuid"
 *                 name: "María López"
 *                 role: "Entrenadora"
 *                 email: "m@club.com"
 *                 phone: "+34 600 000 000"
 *                 schedule_blocks:
 *                   - { days: [mon, tue, wed, thu, fri], from: "09:00", to: "12:00" }
 *                   - { days: [mon, tue, wed, thu, fri], from: "17:00", to: "19:00" }
 *                 status: "active"
 *     responses:
 *       201: { description: Creado }
 *       400: { description: Validación }
 *       403: { description: Sin acceso al club }
 */
router.post('/', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const { club_id, name, role, email, phone, schedule, schedule_blocks, status, password } = req.body ?? {};
  if (!club_id || !String(name ?? '').trim()) {
    return res.status(400).json({ ok: false, error: 'club_id y name son obligatorios' });
  }
  const pwd = String(password ?? '');
  if (pwd.length < 6) {
    return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  const emailStr = email != null && String(email).trim() ? String(email).trim().toLowerCase() : null;
  if (!emailStr) {
    return res.status(400).json({ ok: false, error: 'El email es obligatorio para dar de alta al personal' });
  }
  if (!canAccessClub(req, club_id)) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }

  let blocks: ScheduleBlock[] | null = null;
  try {
    if (schedule_blocks !== undefined) {
      const parsed = normalizeScheduleBlocks(schedule_blocks);
      blocks = parsed.length ? parsed : [];
    }
  } catch (e) {
    return res.status(400).json({ ok: false, error: (e as Error).message });
  }

  const scheduleText =
    blocks != null
      ? blocksToDisplay(blocks)
      : schedule != null && String(schedule).trim()
        ? String(schedule).trim()
        : null;

  const row = {
    club_id,
    name: String(name).trim(),
    role: String(role ?? '').trim(),
    email: emailStr,
    phone: phone != null && String(phone).trim() ? String(phone).trim() : null,
    schedule: scheduleText,
    schedule_blocks: blocks,
    status: status === 'inactive' ? 'inactive' : 'active',
    password_hash: hashStaffPassword(pwd),
  };
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('club_staff')
      .insert(row)
      .select(FIELDS)
      .single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    const { data: clubRow } = await supabase.from('clubs').select('name').eq('id', club_id).maybeSingle();
    const clubName = (clubRow as { name?: string } | null)?.name ?? 'Tu club';
    const loginUrl = `${getFrontendUrl()}/login`;
    const mail = await sendStaffAccountEmail(emailStr, String(name).trim(), clubName, pwd, loginUrl);
    return res.status(201).json({
      ok: true,
      member: data,
      email_sent: mail.sent,
      email_error: mail.error,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /club-staff/{id}:
 *   put:
 *     tags: [Club staff]
 *     summary: Actualizar personal
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { name: "María L.", role: "Admin pista", status: "inactive" }
 *     responses:
 *       200: { description: OK }
 *       403: { description: Sin acceso }
 *       404: { description: No encontrado }
 */
router.put('/:id', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: existing } = await supabase
      .from('club_staff')
      .select('club_id')
      .eq('id', id)
      .maybeSingle();
    if (!existing || !canAccessClub(req, (existing as { club_id: string }).club_id)) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este registro' });
    }
  } catch {
    return res.status(500).json({ ok: false, error: 'Error al verificar registro' });
  }
  const { name, role, email, phone, schedule, schedule_blocks, status, password } = req.body ?? {};
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) update.name = String(name).trim();
  if (role !== undefined) update.role = String(role ?? '').trim();
  if (email !== undefined) update.email = email != null && String(email).trim() ? String(email).trim().toLowerCase() : null;
  if (phone !== undefined) update.phone = phone != null && String(phone).trim() ? String(phone).trim() : null;
  if (schedule_blocks !== undefined) {
    try {
      if (schedule_blocks == null) {
        update.schedule_blocks = null;
        update.schedule = null;
      } else {
        const parsed = normalizeScheduleBlocks(schedule_blocks);
        update.schedule_blocks = parsed.length ? parsed : [];
        update.schedule = blocksToDisplay(parsed);
      }
    } catch (e) {
      return res.status(400).json({ ok: false, error: (e as Error).message });
    }
  } else if (schedule !== undefined) {
    update.schedule = schedule != null && String(schedule).trim() ? String(schedule).trim() : null;
    update.schedule_blocks = null;
  }
  if (status !== undefined) update.status = status === 'inactive' ? 'inactive' : 'active';
  if (password !== undefined && String(password).trim()) {
    const pwd = String(password);
    if (pwd.length < 6) {
      return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    update.password_hash = hashStaffPassword(pwd);
  }
  if (Object.keys(update).length <= 1) {
    return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('club_staff')
      .update(update)
      .eq('id', id)
      .select(FIELDS)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
    return res.json({ ok: true, member: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /club-staff/{id}:
 *   delete:
 *     tags: [Club staff]
 *     summary: Eliminar personal
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
    const { data: existing } = await supabase
      .from('club_staff')
      .select('club_id')
      .eq('id', id)
      .maybeSingle();
    if (!existing || !canAccessClub(req, (existing as { club_id: string }).club_id)) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este registro' });
    }
    const { error } = await supabase.from('club_staff').delete().eq('id', id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
