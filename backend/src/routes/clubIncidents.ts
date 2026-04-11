import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdmin } from '../middleware/requireClubOwnerOrAdmin';
import { getClubClientPlayerIds } from '../lib/clubClientPlayers';

const router = Router();
router.use(attachAuthContext);

const INCIDENT_TYPES = new Set(['late_cancel', 'no_show', 'damage', 'complaint']);
const SEVERITIES = new Set(['low', 'medium', 'high']);

function canAccessClub(req: Request, clubId: string): boolean {
  if (req.authContext?.adminId) return true;
  return req.authContext?.allowedClubIds?.includes(clubId) ?? false;
}

function monthRangeUTC(year: number, month0: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, month0, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month0 + 1, 1, 0, 0, 0, 0));
  return { start: start.toISOString(), end: end.toISOString() };
}

async function assertPlayerAllowedForIncident(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  clubId: string,
  subjectPlayerId: string,
  bookingId: string | null,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (bookingId) {
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select('id, organizer_player_id, court_id, deleted_at, courts!inner(club_id)')
      .eq('id', bookingId)
      .maybeSingle();
    if (bErr) return { ok: false, status: 500, error: bErr.message };
    if (!booking || (booking as { deleted_at?: string | null }).deleted_at) {
      return { ok: false, status: 400, error: 'Reserva no encontrada' };
    }
    const courtRow = (booking as { courts?: { club_id: string } | { club_id: string }[] }).courts;
    const clubIdCourt = Array.isArray(courtRow) ? courtRow[0]?.club_id : courtRow?.club_id;
    if (clubIdCourt !== clubId) {
      return { ok: false, status: 400, error: 'La reserva no pertenece a este club' };
    }
    const org = (booking as { organizer_player_id: string }).organizer_player_id;
    const allowed = new Set<string>([org]);
    const { data: parts, error: pErr } = await supabase
      .from('booking_participants')
      .select('player_id')
      .eq('booking_id', bookingId);
    if (pErr) return { ok: false, status: 500, error: pErr.message };
    for (const p of parts ?? []) allowed.add((p as { player_id: string }).player_id);
    if (!allowed.has(subjectPlayerId)) {
      return { ok: false, status: 400, error: 'El jugador no figura en esa reserva' };
    }
    return { ok: true };
  }

  const clientIds = await getClubClientPlayerIds(supabase, clubId);
  if (!clientIds.includes(subjectPlayerId)) {
    return {
      ok: false,
      status: 400,
      error: 'El jugador debe ser cliente del club o indica una reserva donde participe',
    };
  }
  return { ok: true };
}

async function countBookingsPerPlayer(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  clubId: string,
): Promise<Map<string, number>> {
  const { data: courts, error: cErr } = await supabase.from('courts').select('id').eq('club_id', clubId);
  if (cErr) throw new Error(cErr.message);
  const courtIds = (courts ?? []).map((c: { id: string }) => c.id);
  if (courtIds.length === 0) return new Map();

  const { data: bookings, error: bErr } = await supabase
    .from('bookings')
    .select('id, organizer_player_id')
    .in('court_id', courtIds)
    .is('deleted_at', null)
    .neq('status', 'cancelled');
  if (bErr) throw new Error(bErr.message);

  const perPlayer = new Map<string, Set<string>>();
  const add = (pid: string, bid: string) => {
    if (!pid) return;
    let s = perPlayer.get(pid);
    if (!s) {
      s = new Set();
      perPlayer.set(pid, s);
    }
    s.add(bid);
  };

  const bookingIds: string[] = [];
  for (const b of bookings ?? []) {
    const row = b as { id: string; organizer_player_id: string };
    bookingIds.push(row.id);
    add(row.organizer_player_id, row.id);
  }
  if (bookingIds.length) {
    const { data: parts, error: pErr } = await supabase
      .from('booking_participants')
      .select('booking_id, player_id')
      .in('booking_id', bookingIds);
    if (pErr) throw new Error(pErr.message);
    for (const p of parts ?? []) {
      const row = p as { booking_id: string; player_id: string };
      add(row.player_id, row.booking_id);
    }
  }

  const out = new Map<string, number>();
  for (const [pid, set] of perPlayer) out.set(pid, set.size);
  return out;
}

type IncidentRow = {
  id: string;
  created_at: string;
  club_id: string;
  subject_player_id: string;
  booking_id: string | null;
  incident_type: string;
  severity: string;
  description: string;
  resolution: string | null;
  cost_cents: number | null;
  created_by_auth_user_id: string | null;
};

/**
 * @openapi
 * /club-incidents/summary:
 *   get:
 *     tags: [Club incidents]
 *     summary: Resumen para dashboard de incidencias
 *     description: |
 *       Estadísticas del mes en curso (UTC), distribución por tipo, últimas incidencias
 *       y lista de jugadores con riesgo (derivado de conteos recientes).
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: club_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 month: { type: object }
 *                 distribution: { type: object }
 *                 recent: { type: array }
 *                 players: { type: array }
 *       400: { description: Falta club_id }
 *       401: { description: Sin token }
 *       403: { description: Sin acceso al club }
 */
router.get('/summary', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const club_id = String(req.query.club_id ?? '').trim();
  if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, club_id)) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const now = new Date();
    const { start: monthStart, end: monthEnd } = monthRangeUTC(now.getUTCFullYear(), now.getUTCMonth());

    const { data: monthRows, error: mErr } = await supabase
      .from('club_incidents')
      .select(
        'id, created_at, subject_player_id, incident_type, severity, description, resolution, cost_cents, booking_id',
      )
      .eq('club_id', club_id)
      .gte('created_at', monthStart)
      .lt('created_at', monthEnd)
      .order('created_at', { ascending: false });

    if (mErr) return res.status(500).json({ ok: false, error: mErr.message });

    const rows = (monthRows ?? []) as IncidentRow[];
    const dist = { no_show: 0, late_cancel: 0, damage: 0, complaint: 0 };
    for (const r of rows) {
      const k = r.incident_type as keyof typeof dist;
      if (k in dist) dist[k] += 1;
    }

    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data: recent90, error: rErr } = await supabase
      .from('club_incidents')
      .select('subject_player_id, incident_type')
      .eq('club_id', club_id)
      .gte('created_at', ninetyDaysAgo);
    if (rErr) return res.status(500).json({ ok: false, error: rErr.message });

    const byPlayer = new Map<string, { no_show: number; late_cancel: number; damage: number; complaint: number }>();
    for (const raw of recent90 ?? []) {
      const r = raw as { subject_player_id: string; incident_type: string };
      let agg = byPlayer.get(r.subject_player_id);
      if (!agg) {
        agg = { no_show: 0, late_cancel: 0, damage: 0, complaint: 0 };
        byPlayer.set(r.subject_player_id, agg);
      }
      if (r.incident_type === 'no_show') agg.no_show += 1;
      else if (r.incident_type === 'late_cancel') agg.late_cancel += 1;
      else if (r.incident_type === 'damage') agg.damage += 1;
      else if (r.incident_type === 'complaint') agg.complaint += 1;
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: last30, error: lErr } = await supabase
      .from('club_incidents')
      .select('subject_player_id')
      .eq('club_id', club_id)
      .gte('created_at', thirtyDaysAgo);
    if (lErr) return res.status(500).json({ ok: false, error: lErr.message });
    const playersWithRecent = new Set((last30 ?? []).map((x: { subject_player_id: string }) => x.subject_player_id));

    function riskLevel(agg: { no_show: number; late_cancel: number; damage: number; complaint: number }): string {
      if (agg.no_show >= 2 || agg.late_cancel + agg.no_show >= 5) return 'high';
      if (agg.no_show >= 1 || agg.late_cancel >= 2) return 'medium';
      return 'low';
    }

    function statusFor(agg: { no_show: number; late_cancel: number }, recent: boolean): string {
      if (agg.no_show >= 3) return 'blocked';
      if (agg.no_show >= 2) return 'restricted';
      if (recent || agg.no_show >= 1 || agg.late_cancel >= 2) return 'warning';
      return 'active';
    }

    const bookingCounts = await countBookingsPerPlayer(supabase, club_id);

    const { data: recentFull, error: rfErr } = await supabase
      .from('club_incidents')
      .select(
        'id, created_at, subject_player_id, booking_id, incident_type, severity, description, resolution, cost_cents',
      )
      .eq('club_id', club_id)
      .order('created_at', { ascending: false })
      .limit(4);
    if (rfErr) return res.status(500).json({ ok: false, error: rfErr.message });

    const idsForPlayers = new Set<string>();
    for (const r of recentFull ?? []) {
      idsForPlayers.add((r as { subject_player_id: string }).subject_player_id);
    }
    for (const pid of byPlayer.keys()) idsForPlayers.add(pid);

    const playerMap = new Map<string, any>();
    if (idsForPlayers.size > 0) {
      const { data: playersData, error: plErr } = await supabase
        .from('players')
        .select('id, first_name, last_name, email, phone, created_at')
        .in('id', [...idsForPlayers]);
      if (plErr) return res.status(500).json({ ok: false, error: plErr.message });
      for (const p of playersData ?? []) playerMap.set((p as any).id, p);
    }

    const bookingIds = [...new Set((recentFull ?? []).map((x: any) => x.booking_id).filter(Boolean))];
    let bookingMap = new Map<string, { start_at: string; end_at: string; court_name: string | null }>();
    if (bookingIds.length) {
      const { data: bks, error: bkErr } = await supabase
        .from('bookings')
        .select('id, start_at, end_at, courts(name)')
        .in('id', bookingIds);
      if (bkErr) return res.status(500).json({ ok: false, error: bkErr.message });
      for (const b of bks ?? []) {
        const row = b as {
          id: string;
          start_at: string;
          end_at: string;
          courts?: { name: string } | { name: string }[] | null;
        };
        const c = row.courts;
        const name = Array.isArray(c) ? c[0]?.name ?? null : c?.name ?? null;
        bookingMap.set(row.id, { start_at: row.start_at, end_at: row.end_at, court_name: name });
      }
    }

    const recent = (recentFull ?? []).map((raw: any) => {
      const p = playerMap.get(raw.subject_player_id);
      const bk = raw.booking_id ? bookingMap.get(raw.booking_id) : null;
      return {
        id: raw.id,
        created_at: raw.created_at,
        incident_type: raw.incident_type,
        severity: raw.severity,
        description: raw.description,
        resolution: raw.resolution,
        cost_cents: raw.cost_cents,
        booking_id: raw.booking_id,
        subject_player: p
          ? {
              id: p.id,
              first_name: p.first_name,
              last_name: p.last_name,
              email: p.email,
              phone: p.phone,
            }
          : null,
        booking: bk
          ? { start_at: bk.start_at, end_at: bk.end_at, court_name: bk.court_name }
          : null,
      };
    });

    const { data: clubCourts, error: ccErr } = await supabase.from('courts').select('id').eq('club_id', club_id);
    if (ccErr) return res.status(500).json({ ok: false, error: ccErr.message });
    const clubCourtIds = (clubCourts ?? []).map((c: { id: string }) => c.id);
    let bookingsMonthCount = 0;
    if (clubCourtIds.length) {
      const { count, error: bmErr } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .in('court_id', clubCourtIds)
        .gte('start_at', monthStart)
        .lt('start_at', monthEnd)
        .is('deleted_at', null)
        .neq('status', 'cancelled');
      if (bmErr) return res.status(500).json({ ok: false, error: bmErr.message });
      bookingsMonthCount = count ?? 0;
    }

    const noShowsMonth = dist.no_show;
    const attendancePct =
      bookingsMonthCount > 0
        ? Math.max(0, Math.min(100, Math.round((1 - noShowsMonth / bookingsMonthCount) * 100)))
        : 100;

    let playersInAlert = 0;
    const playersOut: any[] = [];
    for (const [pid, agg] of byPlayer) {
      const rk = riskLevel(agg);
      if (rk !== 'low') playersInAlert += 1;
      const pl = playerMap.get(pid);
      const totalBookings = bookingCounts.get(pid) ?? 0;
      const totalInc = agg.no_show + agg.late_cancel + agg.damage + agg.complaint;
      if (totalInc === 0) continue;
      const attendance =
        totalBookings > 0 ? Math.round(((totalBookings - agg.no_show) / totalBookings) * 100) : 100;
      playersOut.push({
        player_id: pid,
        player_name: pl ? `${pl.first_name} ${pl.last_name}`.trim() : pid,
        player_phone: pl?.phone ?? '',
        player_email: pl?.email ?? '',
        join_date: pl?.created_at ?? null,
        total_bookings: totalBookings,
        incidents: {
          late_cancel: agg.late_cancel,
          no_show: agg.no_show,
          damage: agg.damage,
          complaint: agg.complaint,
        },
        risk_level: rk,
        status: statusFor(agg, playersWithRecent.has(pid)),
      });
    }
    playersOut.sort((a, b) => {
      const score = (x: typeof a) => x.incidents.no_show * 3 + x.incidents.late_cancel * 2 + x.incidents.damage + x.incidents.complaint;
      return score(b) - score(a);
    });

    let totalIncidentsAll = 0;
    const { count: totalCount, error: tcErr } = await supabase
      .from('club_incidents')
      .select('id', { count: 'exact', head: true })
      .eq('club_id', club_id);
    if (!tcErr) totalIncidentsAll = totalCount ?? 0;

    return res.json({
      ok: true,
      month: {
        year: now.getUTCFullYear(),
        month: now.getUTCMonth() + 1,
        total: rows.length,
        no_shows: dist.no_show,
        late_cancels: dist.late_cancel,
        players_in_alert: playersInAlert,
        attendance_rate_pct: attendancePct,
        bookings_in_month: bookingsMonthCount,
        total_all_time: totalIncidentsAll,
      },
      distribution: dist,
      recent,
      players: playersOut.slice(0, 80),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /club-incidents:
 *   get:
 *     tags: [Club incidents]
 *     summary: Listar incidencias del club
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: club_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: incident_type
 *         schema: { type: string, enum: [late_cancel, no_show, damage, complaint] }
 *       - in: query
 *         name: severity
 *         schema: { type: string, enum: [low, medium, high] }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Busca en nombre, teléfono o id de jugador / reserva
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 200, maximum: 500 }
 *     responses:
 *       200: { description: OK }
 *       400: { description: Parámetros inválidos }
 *       401: { description: Sin token }
 *       403: { description: Sin acceso }
 */
router.get('/', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const club_id = String(req.query.club_id ?? '').trim();
  const incident_type = typeof req.query.incident_type === 'string' ? req.query.incident_type.trim() : '';
  const severity = typeof req.query.severity === 'string' ? req.query.severity.trim() : '';
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  let limit = Number(req.query.limit);
  if (!Number.isFinite(limit) || limit < 1) limit = 200;
  if (limit > 500) limit = 500;

  if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, club_id)) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }
  if (incident_type && !INCIDENT_TYPES.has(incident_type)) {
    return res.status(400).json({ ok: false, error: 'incident_type inválido' });
  }
  if (severity && !SEVERITIES.has(severity)) {
    return res.status(400).json({ ok: false, error: 'severity inválido' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    let query = supabase
      .from('club_incidents')
      .select(
        'id, created_at, club_id, subject_player_id, booking_id, incident_type, severity, description, resolution, cost_cents, created_by_auth_user_id',
      )
      .eq('club_id', club_id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (incident_type) query = query.eq('incident_type', incident_type);
    if (severity) query = query.eq('severity', severity);

    const { data: incidents, error } = await query;
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const list = (incidents ?? []) as IncidentRow[];
    const playerIds = [...new Set(list.map((i) => i.subject_player_id))];
    const bookingIds = [...new Set(list.map((i) => i.booking_id).filter(Boolean))] as string[];

    const playerMap = new Map<string, any>();
    if (playerIds.length) {
      const { data: players, error: pe } = await supabase
        .from('players')
        .select('id, first_name, last_name, email, phone, created_at')
        .in('id', playerIds);
      if (pe) return res.status(500).json({ ok: false, error: pe.message });
      for (const p of players ?? []) playerMap.set((p as any).id, p);
    }

    const bookingMap = new Map<string, { start_at: string; end_at: string; court_name: string | null }>();
    if (bookingIds.length) {
      const { data: bks, error: bkErr } = await supabase
        .from('bookings')
        .select('id, start_at, end_at, courts(name)')
        .in('id', bookingIds);
      if (bkErr) return res.status(500).json({ ok: false, error: bkErr.message });
      for (const b of bks ?? []) {
        const row = b as {
          id: string;
          start_at: string;
          end_at: string;
          courts?: { name: string } | { name: string }[] | null;
        };
        const c = row.courts;
        const name = Array.isArray(c) ? c[0]?.name ?? null : c?.name ?? null;
        bookingMap.set(row.id, { start_at: row.start_at, end_at: row.end_at, court_name: name });
      }
    }

    let out = list.map((row) => {
      const p = playerMap.get(row.subject_player_id);
      const bk = row.booking_id ? bookingMap.get(row.booking_id) : null;
      return {
        id: row.id,
        created_at: row.created_at,
        incident_type: row.incident_type,
        severity: row.severity,
        description: row.description,
        resolution: row.resolution,
        cost_cents: row.cost_cents,
        booking_id: row.booking_id,
        subject_player: p
          ? {
              id: p.id,
              first_name: p.first_name,
              last_name: p.last_name,
              email: p.email,
              phone: p.phone,
            }
          : {
              id: row.subject_player_id,
              first_name: '',
              last_name: '',
              email: '',
              phone: '',
            },
        booking: bk
          ? { start_at: bk.start_at, end_at: bk.end_at, court_name: bk.court_name }
          : null,
      };
    });

    if (q) {
      out = out.filter((item) => {
        const name = `${item.subject_player.first_name} ${item.subject_player.last_name}`.toLowerCase();
        const phone = (item.subject_player.phone ?? '').toLowerCase();
        const bid = (item.booking_id ?? '').toLowerCase();
        const pid = item.subject_player.id.toLowerCase();
        return name.includes(q) || phone.includes(q) || bid.includes(q) || pid.includes(q);
      });
    }

    return res.json({ ok: true, incidents: out });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /club-incidents:
 *   post:
 *     tags: [Club incidents]
 *     summary: Registrar una incidencia
 *     description: |
 *       El jugador debe ser cliente del club (reservas o CRM) salvo que se indique `booking_id`
 *       y el jugador figure como organizador o participante en esa reserva del club.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [club_id, subject_player_id, incident_type, severity, description]
 *             properties:
 *               club_id: { type: string, format: uuid }
 *               subject_player_id: { type: string, format: uuid }
 *               booking_id: { type: string, format: uuid, nullable: true }
 *               incident_type: { type: string, enum: [late_cancel, no_show, damage, complaint] }
 *               severity: { type: string, enum: [low, medium, high] }
 *               description: { type: string }
 *               cost_cents: { type: integer, minimum: 0, nullable: true }
 *               resolution: { type: string, nullable: true }
 *           example:
 *             club_id: "11111111-1111-1111-1111-111111111111"
 *             subject_player_id: "22222222-2222-2222-2222-222222222222"
 *             incident_type: "no_show"
 *             severity: "high"
 *             description: "No se presentó a la reserva."
 *             booking_id: "33333333-3333-3333-3333-333333333333"
 *     responses:
 *       200:
 *         description: Creada
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               incident: { id: "uuid", created_at: "2026-04-09T12:00:00Z" }
 *       400: { description: Validación fallida }
 *       401: { description: Sin token }
 *       403: { description: Sin permisos o acceso al club }
 */
router.post('/', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  if (!req.authContext) {
    return res.status(401).json({ ok: false, error: 'Token requerido' });
  }

  const club_id = typeof req.body?.club_id === 'string' ? req.body.club_id.trim() : '';
  const subject_player_id =
    typeof req.body?.subject_player_id === 'string' ? req.body.subject_player_id.trim() : '';
  const booking_id =
    typeof req.body?.booking_id === 'string' && req.body.booking_id.trim()
      ? req.body.booking_id.trim()
      : null;
  const incident_type =
    typeof req.body?.incident_type === 'string' ? req.body.incident_type.trim() : '';
  const severity = typeof req.body?.severity === 'string' ? req.body.severity.trim() : '';
  const description =
    typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, 8000) : '';
  const resolution =
    typeof req.body?.resolution === 'string' ? req.body.resolution.trim().slice(0, 4000) : null;
  const cost_cents =
    req.body?.cost_cents != null && req.body.cost_cents !== ''
      ? Number(req.body.cost_cents)
      : null;

  if (!club_id) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!subject_player_id) {
    return res.status(400).json({ ok: false, error: 'subject_player_id es obligatorio' });
  }
  if (!description) return res.status(400).json({ ok: false, error: 'description es obligatoria' });
  if (!INCIDENT_TYPES.has(incident_type)) {
    return res.status(400).json({ ok: false, error: 'incident_type inválido' });
  }
  if (!SEVERITIES.has(severity)) {
    return res.status(400).json({ ok: false, error: 'severity inválido' });
  }
  if (cost_cents != null && (!Number.isFinite(cost_cents) || cost_cents < 0 || !Number.isInteger(cost_cents))) {
    return res.status(400).json({ ok: false, error: 'cost_cents debe ser un entero >= 0' });
  }

  if (!canAccessClub(req, club_id)) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data: player, error: plErr } = await supabase
      .from('players')
      .select('id')
      .eq('id', subject_player_id)
      .neq('status', 'deleted')
      .maybeSingle();
    if (plErr) return res.status(500).json({ ok: false, error: plErr.message });
    if (!player) return res.status(400).json({ ok: false, error: 'Jugador no encontrado' });

    const allowed = await assertPlayerAllowedForIncident(supabase, club_id, subject_player_id, booking_id);
    if (!allowed.ok) {
      return res.status(allowed.status).json({ ok: false, error: allowed.error });
    }

    const created_by = req.authContext.userId;
    const { data: inserted, error: insErr } = await supabase
      .from('club_incidents')
      .insert({
        club_id,
        subject_player_id,
        booking_id,
        incident_type,
        severity,
        description,
        cost_cents: cost_cents ?? null,
        resolution: resolution || null,
        created_by_auth_user_id: created_by,
      })
      .select('id, created_at')
      .maybeSingle();

    if (insErr) return res.status(500).json({ ok: false, error: insErr.message });
    if (!inserted) return res.status(500).json({ ok: false, error: 'No se pudo crear la incidencia' });

    return res.json({ ok: true, incident: inserted });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
