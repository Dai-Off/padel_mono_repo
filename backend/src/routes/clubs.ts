import { Router, Request, Response } from 'express';
import { resolveClubLogoUrlForClient } from '../lib/clubLogoUrl';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdmin } from '../middleware/requireClubOwnerOrAdmin';
import { requireClubOwnerOrAdminOrPortalStaff } from '../middleware/requireClubOwnerOrAdminOrPortalStaff';
import { requireAuthUser } from '../middleware/requireAuthUser';
import { allPortalClubIds, canAccessClub, canAccessClubAsPortalMember, isClubOwnerOrAdmin } from '../lib/clubAccess';

const router = Router();
router.use(attachAuthContext);

const SELECT_LIST =
  'id, created_at, owner_id, fiscal_tax_id, fiscal_legal_name, name, description, address, city, postal_code, lat, lng, base_currency, logo_url, photo_urls, contact_phone, contact_email, notify_new_bookings, notify_cancellations, notify_maintenance_reminders, notify_daily_email_summary';
const SELECT_ONE =
  'id, created_at, updated_at, owner_id, fiscal_tax_id, fiscal_legal_name, name, description, address, city, postal_code, lat, lng, base_currency, weekly_schedule, schedule_exceptions, logo_url, photo_urls, contact_phone, contact_email, notify_new_bookings, notify_cancellations, notify_maintenance_reminders, notify_daily_email_summary';

router.get('/', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const owner_id = req.query.owner_id as string | undefined;
  try {
    const supabase = getSupabaseServiceRoleClient();
    let q = supabase
      .from('clubs')
      .select(SELECT_LIST)
      .order('created_at', { ascending: false })
      .limit(50);
    if (req.authContext?.adminId) {
      if (owner_id) q = q.eq('owner_id', owner_id);
    } else if (req.authContext?.clubOwnerId && req.authContext?.allowedClubIds?.length) {
      q = q.in('id', req.authContext.allowedClubIds);
    } else {
      const portalIds = allPortalClubIds(req);
      if (!portalIds.length) {
        return res.json({ ok: true, clubs: [] });
      }
      q = q.in('id', portalIds);
    }
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const clubs = await Promise.all(
      (data ?? []).map(async (club) => {
        const firstPhoto = Array.isArray(club.photo_urls) && club.photo_urls.length > 0 ? club.photo_urls[0] : null;
        const urlToResolve = firstPhoto || club.logo_url;
        const resolvedImage = await resolveClubLogoUrlForClient(supabase, urlToResolve);
        return { ...club, logo_url: resolvedImage };
      })
    );

    return res.json({ ok: true, clubs });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /clubs/{id}/chat-mentions:
 *   get:
 *     tags: [Clubs]
 *     summary: Notificaciones por mención @club en chats
 *     description: |
 *       Lista menciones `@club` registradas desde el chat de canchas o de torneos del club.
 *       Orden: más recientes primero (máx. 200).
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: ID del club
 *     responses:
 *       200:
 *         description: Lista de menciones
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value:
 *                   ok: true
 *                   mentions:
 *                     - id: "…"
 *                       created_at: "2026-05-10T12:00:00Z"
 *                       source_type: "tournament"
 *                       court_id: null
 *                       tournament_id: "…"
 *                       source_message_id: "…"
 *                       author_name: "María"
 *                       message: "¿Horario de la final? @club"
 *       401: { description: Token requerido }
 *       403: { description: Sin acceso al club }
 */
router.get('/:id/chat-mentions', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const clubId = req.params.id;
  if (!canAccessClubAsPortalMember(req, clubId)) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('club_chat_mentions')
      .select(
        'id, created_at, source_type, booking_id, court_id, tournament_id, source_message_id, author_user_id, author_name, message'
      )
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, mentions: data ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /clubs/{id}/chat-summary:
 *   get:
 *     tags: [Clubs]
 *     summary: Resumen de chats del club (turnos + torneos + menciones)
 *     description: |
 *       Devuelve en una sola llamada la lista de canales de chat del club:
 *       un canal por turno (booking) con su `last_message` previa, otro por torneo,
 *       y las menciones `@club` recientes. Pensado para cargar el centro de chats en un único request.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: ID del club
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value:
 *                   ok: true
 *                   bookings:
 *                     - id: "…"
 *                       court_id: "…"
 *                       court_name: "Pista 1"
 *                       start_at: "2026-05-10T17:30:00Z"
 *                       end_at: "2026-05-10T19:00:00Z"
 *                       last_message: "Hola"
 *                       last_message_at: "2026-05-10T18:00:00Z"
 *                       last_message_author: "Ana"
 *                   tournaments:
 *                     - id: "…"
 *                       name: "Open Mayo"
 *                       last_message: null
 *                       last_message_at: null
 *                       last_message_author: null
 *                   mentions: []
 *       401: { description: Token requerido }
 *       403: { description: Sin acceso al club }
 */
router.get('/:id/chat-summary', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const clubId = req.params.id;
  if (!canAccessClubAsPortalMember(req, clubId)) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();

    const [courtsRes, tournamentsRes, mentionsRes] = await Promise.all([
      supabase.from('courts').select('id, name').eq('club_id', clubId),
      supabase
        .from('tournaments')
        .select('id, name, description')
        .eq('club_id', clubId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('club_chat_mentions')
        .select(
          'id, created_at, source_type, booking_id, court_id, tournament_id, source_message_id, author_user_id, author_name, message',
        )
        .eq('club_id', clubId)
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    if (courtsRes.error) return res.status(500).json({ ok: false, error: courtsRes.error.message });
    if (tournamentsRes.error) return res.status(500).json({ ok: false, error: tournamentsRes.error.message });
    if (mentionsRes.error) return res.status(500).json({ ok: false, error: mentionsRes.error.message });

    const courts = (courtsRes.data ?? []) as Array<{ id: string; name: string }>;
    const courtIds = courts.map((c) => c.id);
    const courtNames = new Map(courts.map((c) => [c.id, c.name]));
    const tournaments = (tournamentsRes.data ?? []) as Array<{ id: string; name: string | null; description: string | null }>;
    const tournamentIds = tournaments.map((t) => t.id);

    // Bookings + last message — paralelo. Solo turnos no cancelados y no de tipo "blocked".
    const [bookingsRes, bookingMessagesRes, tournamentMessagesRes] = await Promise.all([
      courtIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .from('bookings')
            .select('id, court_id, start_at, end_at, reservation_type, status')
            .in('court_id', courtIds)
            .neq('status', 'cancelled')
            .is('deleted_at', null)
            .order('start_at', { ascending: false })
            .limit(300),
      // Trae los mensajes recientes; calculamos "last per booking" en memoria para evitar N requests.
      supabase
        .from('booking_chat_messages')
        .select('booking_id, message, author_name, created_at')
        .order('created_at', { ascending: false })
        .limit(1000),
      tournamentIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .from('tournament_chat_messages')
            .select('tournament_id, message, author_name, created_at')
            .in('tournament_id', tournamentIds)
            .order('created_at', { ascending: false })
            .limit(500),
    ]);

    if (bookingsRes.error) return res.status(500).json({ ok: false, error: bookingsRes.error.message });
    if (bookingMessagesRes.error) return res.status(500).json({ ok: false, error: bookingMessagesRes.error.message });
    if (tournamentMessagesRes.error) return res.status(500).json({ ok: false, error: tournamentMessagesRes.error.message });

    const rawBookings = (bookingsRes.data ?? []) as Array<{
      id: string;
      court_id: string;
      start_at: string;
      end_at: string;
      reservation_type: string | null;
      status: string;
    }>;
    const bookings = rawBookings.filter((b) => b.reservation_type !== 'blocked');
    const bookingIdSet = new Set(bookings.map((b) => b.id));

    const lastByBooking = new Map<string, { message: string; author_name: string; created_at: string }>();
    for (const row of (bookingMessagesRes.data ?? []) as Array<{
      booking_id: string;
      message: string;
      author_name: string;
      created_at: string;
    }>) {
      if (!bookingIdSet.has(row.booking_id)) continue;
      if (!lastByBooking.has(row.booking_id)) {
        lastByBooking.set(row.booking_id, {
          message: row.message,
          author_name: row.author_name,
          created_at: row.created_at,
        });
      }
    }

    const lastByTournament = new Map<string, { message: string; author_name: string; created_at: string }>();
    for (const row of (tournamentMessagesRes.data ?? []) as Array<{
      tournament_id: string;
      message: string;
      author_name: string;
      created_at: string;
    }>) {
      if (!lastByTournament.has(row.tournament_id)) {
        lastByTournament.set(row.tournament_id, {
          message: row.message,
          author_name: row.author_name,
          created_at: row.created_at,
        });
      }
    }

    const bookingsOut = bookings.map((b) => {
      const last = lastByBooking.get(b.id) ?? null;
      return {
        id: b.id,
        court_id: b.court_id,
        court_name: courtNames.get(b.court_id) ?? 'Pista',
        start_at: b.start_at,
        end_at: b.end_at,
        reservation_type: b.reservation_type,
        last_message: last?.message ?? null,
        last_message_at: last?.created_at ?? null,
        last_message_author: last?.author_name ?? null,
      };
    });

    const tournamentsOut = tournaments.map((t) => {
      const last = lastByTournament.get(t.id) ?? null;
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        last_message: last?.message ?? null,
        last_message_at: last?.created_at ?? null,
        last_message_author: last?.author_name ?? null,
      };
    });

    return res.json({
      ok: true,
      bookings: bookingsOut,
      tournaments: tournamentsOut,
      mentions: mentionsRes.data ?? [],
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * GET /clubs/:id/public
 * Public endpoint for the MiniApp — returns non-sensitive club info without auth.
 */
router.get('/:id/public', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('clubs')
      .select('id, name, address, city, postal_code, lat, lng, weekly_schedule, logo_url, photo_urls')
      .eq('id', id)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Club no encontrado' });
    const firstPhoto = Array.isArray(data.photo_urls) && data.photo_urls.length > 0 ? data.photo_urls[0] : null;
    const resolvedImage = await resolveClubLogoUrlForClient(supabase, firstPhoto || data.logo_url);
    return res.json({ ok: true, club: { ...data, logo_url: resolvedImage } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.get('/:id', requireClubOwnerOrAdminOrPortalStaff, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('clubs')
      .select(SELECT_ONE)
      .eq('id', id)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Club not found' });
    if (!canAccessClubAsPortalMember(req, id)) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }

    const firstPhoto = Array.isArray(data.photo_urls) && data.photo_urls.length > 0 ? data.photo_urls[0] : null;
    const urlToResolve = firstPhoto || data.logo_url;
    const resolvedImage = await resolveClubLogoUrlForClient(supabase, urlToResolve);

    return res.json({ ok: true, club: { ...data, logo_url: resolvedImage } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.post('/', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const {
    owner_id,
    fiscal_tax_id,
    fiscal_legal_name,
    name,
    description,
    address,
    city,
    postal_code,
    lat,
    lng,
    base_currency,
    weekly_schedule,
    schedule_exceptions,
    logo_url,
    contact_phone,
    contact_email,
    notify_new_bookings,
    notify_cancellations,
    notify_maintenance_reminders,
    notify_daily_email_summary,
  } = req.body ?? {};
  if (!owner_id || !fiscal_tax_id || !fiscal_legal_name || !name || !address || !city || !postal_code) {
    return res.status(400).json({
      ok: false,
      error: 'owner_id, fiscal_tax_id, fiscal_legal_name, name, address, city, postal_code son obligatorios',
    });
  }
  if (!req.authContext?.adminId && req.authContext?.clubOwnerId !== owner_id) {
    return res.status(403).json({ ok: false, error: 'Solo puedes crear clubs con tu owner_id' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('clubs')
      .insert([
        {
          owner_id,
          fiscal_tax_id,
          fiscal_legal_name,
          name,
          description: description ?? null,
          address,
          city,
          postal_code,
          lat: lat != null ? Number(lat) : null,
          lng: lng != null ? Number(lng) : null,
          base_currency: base_currency ?? 'EUR',
          weekly_schedule: weekly_schedule ?? {},
          schedule_exceptions: schedule_exceptions ?? [],
          logo_url: logo_url ?? null,
          contact_phone: typeof contact_phone === 'string' ? contact_phone.trim() || null : contact_phone ?? null,
          contact_email: typeof contact_email === 'string' ? contact_email.trim() || null : contact_email ?? null,
          notify_new_bookings: notify_new_bookings !== false,
          notify_cancellations: notify_cancellations !== false,
          notify_maintenance_reminders: notify_maintenance_reminders !== false,
          notify_daily_email_summary: notify_daily_email_summary === true,
        },
      ])
      .select(SELECT_ONE)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(201).json({ ok: true, club: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.put('/:id', requireAuthUser, async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isClubOwnerOrAdmin(req, id) && !canAccessClub(req, id, 'configuracion')) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }
  const body = req.body ?? {};
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const allowed = [
    'fiscal_tax_id',
    'fiscal_legal_name',
    'name',
    'description',
    'address',
    'city',
    'postal_code',
    'lat',
    'lng',
    'base_currency',
    'weekly_schedule',
    'schedule_exceptions',
    'logo_url',
    'photo_urls',
    'contact_phone',
    'contact_email',
    'notify_new_bookings',
    'notify_cancellations',
    'notify_maintenance_reminders',
    'notify_daily_email_summary',
  ];
  for (const key of allowed) {
    if (body[key] === undefined) continue;
    if ((key === 'contact_phone' || key === 'contact_email') && typeof body[key] === 'string') {
      const s = body[key].trim();
      update[key] = s || null;
      continue;
    }
    update[key] = body[key];
  }
  if (Object.keys(update).length === 1) {
    return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('clubs')
      .update(update)
      .eq('id', id)
      .select(SELECT_ONE)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Club not found' });
    return res.json({ ok: true, club: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

router.delete('/:id', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!req.authContext?.adminId && !req.authContext?.allowedClubIds?.includes(id)) {
    return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { error } = await supabase.from('clubs').delete().eq('id', id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, deleted: id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
