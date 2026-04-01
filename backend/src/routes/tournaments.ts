import { Router, Request, Response } from 'express';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdmin } from '../middleware/requireClubOwnerOrAdmin';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { findTournamentConflict } from '../lib/tournamentConflicts';
import { sendClubCrmEmail } from '../lib/mailer';
import { cleanupExpiredTournamentInvites, getTournamentSlots, refreshTournamentStatus } from '../services/tournamentsService';
import { generateInviteToken } from '../lib/inviteToken';
import { getPlayerIdFromBearer } from '../lib/authPlayer';

const router = Router();
router.use(attachAuthContext);

function canAccessClub(req: Request, clubId: string): boolean {
  if (req.authContext?.adminId) return true;
  return req.authContext?.allowedClubIds?.includes(clubId) ?? false;
}

function asIso(value: unknown): string {
  return new Date(String(value)).toISOString();
}

async function cancelLinkedTournamentBookings(tournamentId: string): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: links } = await supabase
    .from('tournament_booking_links')
    .select('booking_id')
    .eq('tournament_id', tournamentId);
  const bookingIds = (links ?? []).map((x: any) => x.booking_id).filter(Boolean);
  if (!bookingIds.length) return;
  await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
      cancelled_at: new Date().toISOString(),
      cancelled_by: 'owner',
      cancellation_reason: 'Torneo actualizado/cancelado',
    })
    .in('id', bookingIds);
}

async function syncTournamentBookings(params: {
  tournamentId: string;
  courtIds: string[];
  startAt: string;
  endAt: string;
  organizerPlayerId: string;
  notes?: string | null;
}): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  await cancelLinkedTournamentBookings(params.tournamentId);
  await supabase.from('tournament_booking_links').delete().eq('tournament_id', params.tournamentId);
  if (!params.courtIds.length) return;

  const rows = params.courtIds.map((courtId) => ({
    court_id: courtId,
    organizer_player_id: params.organizerPlayerId,
    start_at: params.startAt,
    end_at: params.endAt,
    timezone: 'Europe/Madrid',
    total_price_cents: 0,
    currency: 'EUR',
    status: 'confirmed',
    reservation_type: 'tournament',
    source_channel: 'manual',
    notes: params.notes ?? null,
  }));
  const { data: bookings, error: bErr } = await supabase
    .from('bookings')
    .insert(rows)
    .select('id, court_id');
  if (bErr) throw new Error(bErr.message);
  const linkRows = (bookings ?? []).map((b: any) => ({
    tournament_id: params.tournamentId,
    booking_id: b.id,
    court_id: b.court_id,
  }));
  const { error: lErr } = await supabase.from('tournament_booking_links').insert(linkRows);
  if (lErr) throw new Error(lErr.message);
}

async function resolveOrganizerPlayerId(req: Request, clubId: string): Promise<string> {
  const supabase = getSupabaseServiceRoleClient();
  const authUserId = req.authContext?.userId ?? null;

  if (authUserId) {
    const { data: plByAuth } = await supabase
      .from('players')
      .select('id')
      .eq('auth_user_id', authUserId)
      .maybeSingle();
    if (plByAuth?.id) return plByAuth.id as string;

    const { data: owner } = await supabase
      .from('club_owners')
      .select('name, email')
      .eq('auth_user_id', authUserId)
      .maybeSingle();
    if (owner?.email) {
      const ownerEmail = String(owner.email).trim().toLowerCase();
      const { data: plByEmail } = await supabase.from('players').select('id').eq('email', ownerEmail).maybeSingle();
      if (plByEmail?.id) return plByEmail.id as string;

      const nameParts = String(owner.name || 'Organizador Club').trim().split(/\s+/);
      const firstName = nameParts[0] || 'Organizador';
      const lastName = nameParts.slice(1).join(' ') || 'Club';
      const { data: created, error } = await supabase
        .from('players')
        .insert({
          first_name: firstName,
          last_name: lastName,
          email: ownerEmail,
          auth_user_id: authUserId,
          status: 'active',
        })
        .select('id')
        .single();
      if (!error && created?.id) return created.id as string;
    }
  }

  const { data: clubOwner } = await supabase
    .from('clubs')
    .select('owner_id, club_owners(name, email)')
    .eq('id', clubId)
    .maybeSingle();
  const ownerEmail = String((clubOwner as any)?.club_owners?.email ?? '').trim().toLowerCase();
  if (ownerEmail) {
    const { data: pl } = await supabase.from('players').select('id').eq('email', ownerEmail).maybeSingle();
    if (pl?.id) return pl.id as string;
  }

  const { data: anyPlayer } = await supabase.from('players').select('id').limit(1).maybeSingle();
  if (anyPlayer?.id) return anyPlayer.id as string;
  throw new Error('No se pudo resolver organizer_player_id para crear booking de torneo');
}

/**
 * @openapi
 * /tournaments:
 *   get:
 *     tags: [Tournaments]
 *     summary: Listar torneos de un club
 *     description: Devuelve la grilla principal de torneos con contador X/Y por torneo.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: club_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Lista de torneos
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value: { ok: true, tournaments: [] }
 *       403: { description: Sin acceso al club }
 */
router.get('/', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const clubId = String(req.query.club_id ?? '').trim();
  if (!clubId) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, clubId)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('tournaments')
      .select('id, created_at, updated_at, club_id, start_at, end_at, duration_min, price_cents, prize_total_cents, currency, visibility, elo_min, elo_max, max_players, registration_mode, registration_closed_at, cancellation_cutoff_at, invite_ttl_minutes, status, description, tournament_courts(court_id)')
      .eq('club_id', clubId)
      .order('start_at', { ascending: true });
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const out: Record<string, unknown>[] = [];
    for (const row of data ?? []) {
      await cleanupExpiredTournamentInvites((row as { id: string }).id);
      await refreshTournamentStatus((row as { id: string }).id);
      const slots = await getTournamentSlots((row as { id: string }).id);
      out.push({
        ...row,
        confirmed_count: slots.confirmedPlayers,
        pending_count: slots.pendingPlayers,
      });
    }
    return res.json({ ok: true, tournaments: out });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments/{id}:
 *   get:
 *     tags: [Tournaments]
 *     summary: Detalle de torneo
 *     description: Incluye jugadores ordenados por estado (confirmados primero).
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Detalle encontrado }
 *       404: { description: Torneo no encontrado }
 */
router.get('/:id', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const id = req.params.id;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: tournament, error } = await supabase
      .from('tournaments')
      .select('id, created_at, updated_at, club_id, start_at, end_at, duration_min, price_cents, prize_total_cents, currency, visibility, elo_min, elo_max, max_players, registration_mode, registration_closed_at, cancellation_cutoff_at, invite_ttl_minutes, status, description, tournament_courts(court_id)')
      .eq('id', id)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!tournament) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (!canAccessClub(req, String((tournament as { club_id: string }).club_id))) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }
    await cleanupExpiredTournamentInvites(id);
    await refreshTournamentStatus(id);

    const { data: inscriptions, error: iErr } = await supabase
      .from('tournament_inscriptions')
      .select('id, status, invited_at, expires_at, confirmed_at, invite_email_1, invite_email_2, player_id_1, player_id_2, players_1:players!tournament_inscriptions_player_id_1_fkey(id, first_name, last_name, email), players_2:players!tournament_inscriptions_player_id_2_fkey(id, first_name, last_name, email)')
      .eq('tournament_id', id)
      .order('invited_at', { ascending: true });
    if (iErr) return res.status(500).json({ ok: false, error: iErr.message });

    const sorted = [...(inscriptions ?? [])].sort((a: any, b: any) => {
      const pa = a.status === 'confirmed' ? 0 : 1;
      const pb = b.status === 'confirmed' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return new Date(a.invited_at).getTime() - new Date(b.invited_at).getTime();
    });
    const slots = await getTournamentSlots(id);
    return res.json({
      ok: true,
      tournament,
      inscriptions: sorted,
      counts: {
        confirmed: slots.confirmedPlayers,
        pending: slots.pendingPlayers,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments:
 *   post:
 *     tags: [Tournaments]
 *     summary: Crear torneo
 *     description: Crea torneo con validaciones de conflicto de canchas y rango de Elo opcional.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [club_id, start_at, duration_min, max_players, court_ids]
 *             properties:
 *               club_id: { type: string, format: uuid }
 *               start_at: { type: string, format: date-time }
 *               duration_min: { type: integer, minimum: 30 }
 *               price_cents: { type: integer, minimum: 0 }
 *               currency: { type: string, example: EUR }
 *               elo_min: { type: integer, nullable: true }
 *               elo_max: { type: integer, nullable: true }
 *               max_players: { type: integer, minimum: 2 }
 *               registration_mode: { type: string, enum: [individual, pair] }
 *               registration_closed_at: { type: string, format: date-time, nullable: true }
 *               cancellation_cutoff_at: { type: string, format: date-time, nullable: true }
 *               invite_ttl_minutes: { type: integer, minimum: 1 }
 *               description: { type: string, nullable: true }
 *               court_ids:
 *                 type: array
 *                 items: { type: string, format: uuid }
 *           examples:
 *             sample:
 *               value:
 *                 club_id: "11111111-1111-1111-1111-111111111111"
 *                 start_at: "2026-04-02T18:00:00Z"
 *                 duration_min: 120
 *                 max_players: 12
 *                 registration_mode: "individual"
 *                 court_ids: ["22222222-2222-2222-2222-222222222222"]
 *     responses:
 *       201: { description: Torneo creado }
 *       409: { description: Conflicto de canchas/horario }
 */
router.post('/', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const clubId = String(body.club_id ?? '').trim();
  const courtIds = Array.isArray(body.court_ids) ? body.court_ids.map(String) : [];
  if (!clubId || !body.start_at || !body.duration_min || !body.max_players || !courtIds.length) {
    return res.status(400).json({ ok: false, error: 'club_id, start_at, duration_min, max_players y court_ids son obligatorios' });
  }
  if (!canAccessClub(req, clubId)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  try {
    const startAt = asIso(body.start_at);
    const duration = Number(body.duration_min);
    const endAt = new Date(new Date(startAt).getTime() + duration * 60000).toISOString();
    const conflict = await findTournamentConflict({ clubId, courtIds, startAt, endAt });
    if (conflict) return res.status(409).json({ ok: false, error: conflict });

    const supabase = getSupabaseServiceRoleClient();
    const organizerPlayerId = await resolveOrganizerPlayerId(req, clubId);
    const { data: tournament, error } = await supabase
      .from('tournaments')
      .insert({
        club_id: clubId,
        start_at: startAt,
        end_at: endAt,
        duration_min: duration,
        price_cents: Math.max(0, Number(body.price_cents ?? 0)),
        prize_total_cents: Math.max(0, Number(body.prize_total_cents ?? 0)),
        currency: String(body.currency ?? 'EUR'),
        visibility: body.visibility === 'public' ? 'public' : 'private',
        elo_min: body.elo_min != null ? Number(body.elo_min) : null,
        elo_max: body.elo_max != null ? Number(body.elo_max) : null,
        max_players: Math.max(2, Number(body.max_players)),
        registration_mode: body.registration_mode === 'pair' ? 'pair' : 'individual',
        registration_closed_at: body.registration_closed_at ? asIso(body.registration_closed_at) : null,
        cancellation_cutoff_at: body.cancellation_cutoff_at ? asIso(body.cancellation_cutoff_at) : null,
        invite_ttl_minutes: Math.max(1, Number(body.invite_ttl_minutes ?? 1440)),
        description: body.description != null ? String(body.description) : null,
      })
      .select('*')
      .single();
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const rows = courtIds.map((courtId: string) => ({ tournament_id: tournament.id, court_id: courtId }));
    const { error: cErr } = await supabase.from('tournament_courts').insert(rows);
    if (cErr) return res.status(500).json({ ok: false, error: cErr.message });

    await syncTournamentBookings({
      tournamentId: tournament.id,
      courtIds,
      startAt,
      endAt,
      organizerPlayerId,
      notes: body.description != null ? String(body.description) : null,
    });

    return res.status(201).json({ ok: true, tournament });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments/{id}:
 *   put:
 *     tags: [Tournaments]
 *     summary: Editar torneo
 *     description: Permite ajustar horario, precio, Elo y cortes.
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
 *     responses:
 *       200: { description: Torneo actualizado }
 *       409: { description: Conflicto de canchas/horario }
 */
router.put('/:id', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const id = req.params.id;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: existing, error: exErr } = await supabase
      .from('tournaments')
      .select('id, club_id, start_at, duration_min, status')
      .eq('id', id)
      .maybeSingle();
    if (exErr) return res.status(500).json({ ok: false, error: exErr.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    const clubId = String((existing as { club_id: string }).club_id);
    if (!canAccessClub(req, clubId)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    if (String((existing as { status: string }).status) === 'cancelled') {
      return res.status(400).json({ ok: false, error: 'No se puede editar un torneo cancelado' });
    }

    const body = req.body ?? {};
    const organizerPlayerId = await resolveOrganizerPlayerId(req, clubId);
    const startAt = body.start_at ? asIso(body.start_at) : String((existing as { start_at: string }).start_at);
    const durationMin = body.duration_min != null ? Number(body.duration_min) : Number((existing as { duration_min: number }).duration_min);
    const endAt = new Date(new Date(startAt).getTime() + durationMin * 60000).toISOString();
    const courtIds = Array.isArray(body.court_ids)
      ? body.court_ids.map(String)
      : (
        (await supabase.from('tournament_courts').select('court_id').eq('tournament_id', id)).data ?? []
      ).map((x: any) => x.court_id);
    const conflict = await findTournamentConflict({ clubId, courtIds, startAt, endAt, excludeTournamentId: id });
    if (conflict) return res.status(409).json({ ok: false, error: conflict });

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      start_at: startAt,
      end_at: endAt,
      duration_min: durationMin,
    };
    if (body.price_cents !== undefined) update.price_cents = Math.max(0, Number(body.price_cents));
    if (body.prize_total_cents !== undefined) update.prize_total_cents = Math.max(0, Number(body.prize_total_cents));
    if (body.currency !== undefined) update.currency = String(body.currency ?? 'EUR');
    if (body.visibility !== undefined) update.visibility = body.visibility === 'public' ? 'public' : 'private';
    if (body.elo_min !== undefined) update.elo_min = body.elo_min != null ? Number(body.elo_min) : null;
    if (body.elo_max !== undefined) update.elo_max = body.elo_max != null ? Number(body.elo_max) : null;
    if (body.max_players !== undefined) update.max_players = Math.max(2, Number(body.max_players));
    if (body.registration_closed_at !== undefined) update.registration_closed_at = body.registration_closed_at ? asIso(body.registration_closed_at) : null;
    if (body.cancellation_cutoff_at !== undefined) update.cancellation_cutoff_at = body.cancellation_cutoff_at ? asIso(body.cancellation_cutoff_at) : null;
    if (body.invite_ttl_minutes !== undefined) update.invite_ttl_minutes = Math.max(1, Number(body.invite_ttl_minutes));
    if (body.description !== undefined) update.description = body.description != null ? String(body.description) : null;
    if (body.registration_mode !== undefined) update.registration_mode = body.registration_mode === 'pair' ? 'pair' : 'individual';

    const { data: tournament, error: upErr } = await supabase.from('tournaments').update(update).eq('id', id).select('*').single();
    if (upErr) return res.status(500).json({ ok: false, error: upErr.message });

    if (Array.isArray(body.court_ids)) {
      await supabase.from('tournament_courts').delete().eq('tournament_id', id);
      const rows = body.court_ids.map((courtId: unknown) => ({ tournament_id: id, court_id: String(courtId) }));
      if (rows.length) {
        const { error: cErr } = await supabase.from('tournament_courts').insert(rows);
        if (cErr) return res.status(500).json({ ok: false, error: cErr.message });
      }
    }

    await syncTournamentBookings({
      tournamentId: id,
      courtIds,
      startAt,
      endAt,
      organizerPlayerId,
      notes: body.description !== undefined ? (body.description != null ? String(body.description) : null) : null,
    });

    await refreshTournamentStatus(id);
    return res.json({ ok: true, tournament });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments/{id}/cancel:
 *   post:
 *     tags: [Tournaments]
 *     summary: Cancelar torneo
 *     description: Marca el torneo como cancelado y envía notificación por email a todos los inscritos.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       200: { description: Torneo cancelado }
 */
router.post('/:id/cancel', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const id = req.params.id;
  const reason = req.body?.reason != null ? String(req.body.reason) : null;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: tournament, error } = await supabase
      .from('tournaments')
      .select('id, club_id, status')
      .eq('id', id)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!tournament) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (!canAccessClub(req, String((tournament as { club_id: string }).club_id))) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }
    if (String((tournament as { status: string }).status) === 'cancelled') {
      return res.json({ ok: true, tournament, email_sent: 0, email_failed: 0 });
    }

    const { error: upErr } = await supabase
      .from('tournaments')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
        cancelled_at: new Date().toISOString(),
        cancelled_reason: reason,
      })
      .eq('id', id);
    if (upErr) return res.status(500).json({ ok: false, error: upErr.message });

    await cancelLinkedTournamentBookings(id);

    const { data: inscriptions } = await supabase
      .from('tournament_inscriptions')
      .select('invite_email_1, invite_email_2, players_1:players!tournament_inscriptions_player_id_1_fkey(email), players_2:players!tournament_inscriptions_player_id_2_fkey(email)')
      .eq('tournament_id', id);

    const recipients = new Set<string>();
    for (const row of inscriptions ?? []) {
      const emails = [
        (row as any).invite_email_1,
        (row as any).invite_email_2,
        (row as any).players_1?.email,
        (row as any).players_2?.email,
      ].filter(Boolean).map((x) => String(x).trim().toLowerCase());
      for (const email of emails) recipients.add(email);
    }

    let sent = 0;
    let failed = 0;
    for (const to of recipients) {
      const result = await sendClubCrmEmail(
        to,
        'Torneo cancelado',
        `<p>El torneo fue cancelado por el club.</p>${reason ? `<p>Motivo: ${reason}</p>` : ''}`
      );
      if (result.sent) sent += 1;
      else failed += 1;
    }

    return res.json({ ok: true, email_sent: sent, email_failed: failed });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments/{id}/join-owner:
 *   post:
 *     tags: [Tournaments]
 *     summary: Unir al dueño/organizador al torneo
 *     description: Permite al dueño del club participar como jugador confirmado.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Participación confirmada }
 */
router.post('/:id/join-owner', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const tournamentId = req.params.id;
  if (!req.authContext?.userId) return res.status(401).json({ ok: false, error: 'Token requerido' });
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('id, club_id, status, max_players, invite_ttl_minutes')
      .eq('id', tournamentId)
      .maybeSingle();
    if (!tournament) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (!canAccessClub(req, String((tournament as { club_id: string }).club_id))) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }

    await cleanupExpiredTournamentInvites(tournamentId);
    const slots = await getTournamentSlots(tournamentId);
    if (slots.confirmedPlayers >= Number((tournament as { max_players: number }).max_players)) {
      return res.status(409).json({ ok: false, error: 'No hay cupos disponibles' });
    }

    const authUserId = req.authContext.userId;
    let playerId: string | null = null;
    const { data: existingPlayer } = await supabase.from('players').select('id').eq('auth_user_id', authUserId).maybeSingle();
    if (existingPlayer) playerId = existingPlayer.id as string;
    if (!playerId) {
      const { data: owner } = await supabase
        .from('club_owners')
        .select('name, email')
        .eq('auth_user_id', authUserId)
        .maybeSingle();
      if (!owner) return res.status(400).json({ ok: false, error: 'No se encontró perfil de dueño para participar' });
      const names = String((owner as { name: string }).name || 'Owner').trim().split(/\s+/);
      const firstName = names[0] || 'Owner';
      const lastName = names.slice(1).join(' ') || 'Club';
      const email = String((owner as { email?: string }).email || `owner-${authUserId}@padel.local`).trim().toLowerCase();
      const { data: created, error: cErr } = await supabase
        .from('players')
        .insert({
          first_name: firstName,
          last_name: lastName,
          email,
          auth_user_id: authUserId,
          status: 'active',
        })
        .select('id')
        .single();
      if (cErr) return res.status(500).json({ ok: false, error: cErr.message });
      playerId = created.id as string;
    }

    const { data: existingIns } = await supabase
      .from('tournament_inscriptions')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('player_id_1', playerId)
      .maybeSingle();
    if (existingIns) return res.json({ ok: true, already_joined: true });

    const { tokenHash } = generateInviteToken();
    const expiresAt = new Date(Date.now() + Number((tournament as { invite_ttl_minutes: number }).invite_ttl_minutes) * 60000).toISOString();
    const { error: insErr } = await supabase.from('tournament_inscriptions').insert({
      tournament_id: tournamentId,
      status: 'confirmed',
      invited_at: new Date().toISOString(),
      expires_at: expiresAt,
      confirmed_at: new Date().toISOString(),
      player_id_1: playerId,
      token_hash: tokenHash,
    });
    if (insErr) return res.status(500).json({ ok: false, error: insErr.message });

    const { data: plName } = await supabase
      .from('players')
      .select('first_name,last_name')
      .eq('id', playerId)
      .maybeSingle();
    const joinedName = plName ? `${(plName as any).first_name ?? ''} ${(plName as any).last_name ?? ''}`.trim() : 'Un jugador';
    await supabase.from('tournament_chat_messages').insert({
      tournament_id: tournamentId,
      author_user_id: '00000000-0000-0000-0000-000000000000',
      author_name: 'Sistema',
      message: `${joinedName} se ha unido al torneo.`,
    });

    await refreshTournamentStatus(tournamentId);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments/{id}/chat:
 *   get:
 *     tags: [Tournaments]
 *     summary: Mensajes del chat del torneo
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Mensajes }
 */
router.get('/:id/chat', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const id = req.params.id;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: tournament } = await supabase.from('tournaments').select('club_id').eq('id', id).maybeSingle();
    if (!tournament) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (!canAccessClub(req, String((tournament as { club_id: string }).club_id))) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }
    const { data, error } = await supabase
      .from('tournament_chat_messages')
      .select('id, created_at, author_user_id, author_name, message')
      .eq('tournament_id', id)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, messages: data ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments/{id}/chat:
 *   post:
 *     tags: [Tournaments]
 *     summary: Enviar mensaje al chat del torneo
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message: { type: string }
 *     responses:
 *       200: { description: Mensaje enviado }
 */
router.post('/:id/chat', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const id = req.params.id;
  const message = String(req.body?.message ?? '').trim();
  if (!message) return res.status(400).json({ ok: false, error: 'message es obligatorio' });
  if (!req.authContext?.userId) return res.status(401).json({ ok: false, error: 'Token requerido' });
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: tournament } = await supabase.from('tournaments').select('club_id').eq('id', id).maybeSingle();
    if (!tournament) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (!canAccessClub(req, String((tournament as { club_id: string }).club_id))) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }

    let authorName = 'Organizador';
    const { data: owner } = await supabase.from('club_owners').select('name').eq('auth_user_id', req.authContext.userId).maybeSingle();
    if (owner?.name) authorName = owner.name as string;
    const { data: player } = await supabase.from('players').select('first_name, last_name').eq('auth_user_id', req.authContext.userId).maybeSingle();
    if (player) {
      const fn = String((player as { first_name?: string }).first_name || '').trim();
      const ln = String((player as { last_name?: string }).last_name || '').trim();
      authorName = `${fn} ${ln}`.trim() || authorName;
    }

    const { data, error } = await supabase
      .from('tournament_chat_messages')
      .insert({
        tournament_id: id,
        author_user_id: req.authContext.userId,
        author_name: authorName,
        message,
      })
      .select('id, created_at, author_user_id, author_name, message')
      .single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, message: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments/public/list:
 *   get:
 *     tags: [Tournaments]
 *     summary: Listar torneos públicos
 *     description: Retorna torneos visibles para cualquier usuario. Si se envia club_id, filtra por club.
 *     parameters:
 *       - in: query
 *         name: club_id
 *         required: false
 *         schema: { type: string, format: uuid }
 *         description: Club para filtrar torneos publicos
 *     responses:
 *       200:
 *         description: Torneos publicos listados correctamente
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value:
 *                   ok: true
 *                   tournaments:
 *                     - id: "9f7ca8ec-0000-4ef2-9f63-111111111111"
 *                       club_id: "4f08f5d7-0000-4f63-8cf0-222222222222"
 *                       start_at: "2026-04-10T18:00:00.000Z"
 *                       end_at: "2026-04-10T20:00:00.000Z"
 *                       duration_min: 120
 *                       price_cents: 1500
 *                       prize_total_cents: 10000
 *                       currency: "EUR"
 *                       visibility: "public"
 *                       max_players: 12
 *                       status: "open"
 *                       description: "Torneo mixto intermedio"
 *       500:
 *         description: Error interno al consultar torneos publicos
 */
router.get('/public/list', async (req: Request, res: Response) => {
  try {
    const clubId = String(req.query.club_id ?? '').trim();
    const supabase = getSupabaseServiceRoleClient();
    let q = supabase
      .from('tournaments')
      .select('id, club_id, start_at, end_at, duration_min, price_cents, prize_total_cents, currency, visibility, max_players, status, description')
      .eq('visibility', 'public')
      .neq('status', 'cancelled')
      .order('start_at', { ascending: true });
    if (clubId) q = q.eq('club_id', clubId);
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, tournaments: data ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments/{id}/join:
 *   post:
 *     tags: [Tournaments]
 *     summary: Unirse a torneo publico como jugador autenticado
 *     description: Permite a un jugador autenticado unirse directamente solo si el torneo es publico y esta abierto.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: ID del torneo
 *     responses:
 *       200:
 *         description: Jugador unido al torneo
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value: { ok: true }
 *               alreadyJoined:
 *                 value: { ok: true, already_joined: true }
 *       400:
 *         description: Torneo cerrado o no disponible para unirse
 *       401:
 *         description: Token invalido o ausente
 *       403:
 *         description: El torneo es privado y requiere invitacion/enlace
 *       404:
 *         description: Torneo no encontrado
 *       409:
 *         description: No hay cupos disponibles
 *       500:
 *         description: Error interno al unir jugador
 */
router.post('/:id/join', async (req: Request, res: Response) => {
  const tournamentId = req.params.id;
  const auth = await getPlayerIdFromBearer(req);
  if (auth.error || !auth.playerId) return res.status(401).json({ ok: false, error: auth.error ?? 'Token requerido' });
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: tournament, error } = await supabase
      .from('tournaments')
      .select('id, visibility, status, max_players, invite_ttl_minutes')
      .eq('id', tournamentId)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!tournament) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (String((tournament as any).visibility) !== 'public') {
      return res.status(403).json({ ok: false, error: 'Solo torneos públicos permiten unión directa' });
    }
    if (String((tournament as any).status) !== 'open') {
      return res.status(400).json({ ok: false, error: 'El torneo no está abierto' });
    }

    await cleanupExpiredTournamentInvites(tournamentId);
    const slots = await getTournamentSlots(tournamentId);
    if (slots.confirmedPlayers >= Number((tournament as any).max_players)) {
      return res.status(409).json({ ok: false, error: 'No hay cupos disponibles' });
    }
    const { data: existingIns } = await supabase
      .from('tournament_inscriptions')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('player_id_1', auth.playerId)
      .maybeSingle();
    if (existingIns) return res.json({ ok: true, already_joined: true });

    const { tokenHash } = generateInviteToken();
    const expiresAt = new Date(Date.now() + Number((tournament as any).invite_ttl_minutes) * 60000).toISOString();
    const { error: insErr } = await supabase.from('tournament_inscriptions').insert({
      tournament_id: tournamentId,
      status: 'confirmed',
      invited_at: new Date().toISOString(),
      expires_at: expiresAt,
      confirmed_at: new Date().toISOString(),
      player_id_1: auth.playerId,
      token_hash: tokenHash,
    });
    if (insErr) return res.status(500).json({ ok: false, error: insErr.message });
    const { data: pl } = await supabase.from('players').select('first_name,last_name').eq('id', auth.playerId).maybeSingle();
    const joinedName = pl ? `${(pl as any).first_name ?? ''} ${(pl as any).last_name ?? ''}`.trim() : 'Un jugador';
    await supabase.from('tournament_chat_messages').insert({
      tournament_id: tournamentId,
      author_user_id: '00000000-0000-0000-0000-000000000000',
      author_name: 'Sistema',
      message: `${joinedName} se ha unido al torneo.`,
    });
    await refreshTournamentStatus(tournamentId);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
