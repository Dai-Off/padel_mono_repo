import { Router, Request, Response } from 'express';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdmin } from '../middleware/requireClubOwnerOrAdmin';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { findTournamentConflict } from '../lib/tournamentConflicts';
import { sendClubCrmEmail, sendInviteEmail } from '../lib/mailer';
import { cleanupExpiredTournamentInvites, getTournamentSlots, refreshTournamentStatus } from '../services/tournamentsService';
import { generateInviteToken } from '../lib/inviteToken';
import { getPlayerIdFromBearer } from '../lib/authPlayer';
import { playerMeetsTournamentGender, tournamentGenderFromBody } from '../lib/tournamentGender';
import { parsePrizesFromBody, sumPrizeCents, type TournamentPrizeEntry } from '../lib/tournamentPrizes';
import { getFrontendUrl } from '../lib/env';

const router = Router();
router.use(attachAuthContext);

/** Club embebido en torneos (listado y detalle público). */
const CLUB_EMBED_PUBLIC =
  'id, name, description, address, city, postal_code, lat, lng, logo_url';

/** Listados públicos (lista + me-list): torneo + club. */
const TOURNAMENT_PUBLIC_LIST_SELECT = [
  'id',
  'club_id',
  'created_at',
  'updated_at',
  'start_at',
  'end_at',
  'duration_min',
  'price_cents',
  'prize_total_cents',
  'prizes',
  'currency',
  'visibility',
  'gender',
  'max_players',
  'status',
  'description',
  'normas',
  'elo_min',
  'elo_max',
  'registration_mode',
  'registration_closed_at',
  'cancellation_cutoff_at',
  'invite_ttl_minutes',
  `clubs ( ${CLUB_EMBED_PUBLIC} )`,
].join(', ');

/** Detalle público: todo lo anterior + metadatos y pistas vinculadas. */
const TOURNAMENT_PUBLIC_DETAIL_SELECT = `${TOURNAMENT_PUBLIC_LIST_SELECT}, cancelled_at, cancelled_reason, closed_at, created_by_player_id, tournament_courts(court_id)`;

function canAccessClub(req: Request, clubId: string): boolean {
  if (req.authContext?.adminId) return true;
  return req.authContext?.allowedClubIds?.includes(clubId) ?? false;
}

function asIso(value: unknown): string {
  return new Date(String(value)).toISOString();
}

async function getPlayerDisplayName(playerId: string): Promise<string> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: pl } = await supabase
    .from('players')
    .select('first_name,last_name')
    .eq('id', playerId)
    .maybeSingle();
  return pl ? `${(pl as any).first_name ?? ''} ${(pl as any).last_name ?? ''}`.trim() || 'Un jugador' : 'Un jugador';
}

async function getTournamentForPlayer(
  tournamentId: string,
  playerId: string
): Promise<{ tournament: any; myInscription: any | null; error?: string }> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: tournament, error } = await supabase
    .from('tournaments')
    .select(TOURNAMENT_PUBLIC_DETAIL_SELECT)
    .eq('id', tournamentId)
    .maybeSingle();
  if (error) return { tournament: null, myInscription: null, error: error.message };
  if (!tournament) return { tournament: null, myInscription: null, error: 'Torneo no encontrado' };

  const { data: insRows, error: insErr } = await supabase
    .from('tournament_inscriptions')
    .select('id, status, invited_at, expires_at, confirmed_at, cancelled_at, cancelled_reason, player_id_1, player_id_2, created_at')
    .eq('tournament_id', tournamentId)
    .or(`player_id_1.eq.${playerId},player_id_2.eq.${playerId}`)
    .order('created_at', { ascending: false })
    .limit(1);
  if (insErr) return { tournament, myInscription: null, error: insErr.message };
  const myInscription = insRows?.[0] ?? null;
  return { tournament, myInscription };
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
      .select('id, created_at, updated_at, club_id, start_at, end_at, duration_min, price_cents, prize_total_cents, prizes, currency, visibility, gender, elo_min, elo_max, max_players, registration_mode, registration_closed_at, cancellation_cutoff_at, invite_ttl_minutes, status, description, normas, tournament_courts(court_id)')
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
      .select('id, created_at, updated_at, club_id, start_at, end_at, duration_min, price_cents, prize_total_cents, prizes, currency, visibility, gender, elo_min, elo_max, max_players, registration_mode, registration_closed_at, cancellation_cutoff_at, invite_ttl_minutes, status, description, normas, tournament_courts(court_id)')
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
 *               normas: { type: string, nullable: true, description: 'Reglas/normas del torneo visibles al jugador' }
 *               prize_total_cents:
 *                 type: integer
 *                 minimum: 0
 *                 description: 'Solo si no envías prizes; bolsa única legacy'
 *               prizes:
 *                 type: array
 *                 maxItems: 20
 *                 description: 'Premios por puesto; si se envía, prize_total_cents se guarda como suma de amount_cents'
 *                 items:
 *                   type: object
 *                   required: [label, amount_cents]
 *                   properties:
 *                     label: { type: string, example: Campeón }
 *                     amount_cents: { type: integer, minimum: 0, example: 50000 }
 *               gender:
 *                 type: string
 *                 nullable: true
 *                 enum: [male, female, mixed]
 *                 description: 'Opcional. Omitir o null = sin filtro por género (solo Elo). male/female/mixed restringe inscripción.'
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
 *                 prizes:
 *                   - { label: Campeón, amount_cents: 40000 }
 *                   - { label: Subcampeón, amount_cents: 20000 }
 *                   - { label: 3.er lugar, amount_cents: 10000 }
 *     responses:
 *       201: { description: Torneo creado }
 *       400: { description: prizes inválido }
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
  const genderParsed = tournamentGenderFromBody(body.gender);
  if (genderParsed === false) {
    return res.status(400).json({ ok: false, error: 'gender debe ser male, female, mixed, null u omitirse' });
  }
  let insertPrizes: TournamentPrizeEntry[] = [];
  let insertPrizeTotalCents = Math.max(0, Number(body.prize_total_cents ?? 0));
  if (Array.isArray(body.prizes)) {
    const parsed = parsePrizesFromBody(body.prizes);
    if (!parsed.ok) return res.status(400).json({ ok: false, error: parsed.error });
    insertPrizes = parsed.prizes;
    insertPrizeTotalCents = sumPrizeCents(parsed.prizes);
  }
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
        prize_total_cents: insertPrizeTotalCents,
        prizes: insertPrizes,
        currency: String(body.currency ?? 'EUR'),
        visibility: body.visibility === 'public' ? 'public' : 'private',
        gender: genderParsed ?? null,
        elo_min: body.elo_min != null ? Number(body.elo_min) : null,
        elo_max: body.elo_max != null ? Number(body.elo_max) : null,
        max_players: Math.max(2, Number(body.max_players)),
        registration_mode: body.registration_mode === 'pair' ? 'pair' : 'individual',
        registration_closed_at: body.registration_closed_at ? asIso(body.registration_closed_at) : null,
        cancellation_cutoff_at: body.cancellation_cutoff_at ? asIso(body.cancellation_cutoff_at) : null,
        invite_ttl_minutes: Math.max(1, Number(body.invite_ttl_minutes ?? 1440)),
        description: body.description != null ? String(body.description) : null,
        normas: body.normas != null ? String(body.normas) : null,
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
 *     description: Permite ajustar horario, precio, Elo, categoría de género (male/female/mixed) y cortes.
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
 *               gender:
 *                 type: string
 *                 nullable: true
 *                 enum: [male, female, mixed]
 *                 description: 'null o omitir mantiene sin restricción; use null para quitar categoría'
 *               prizes:
 *                 type: array
 *                 maxItems: 20
 *                 items:
 *                   type: object
 *                   required: [label, amount_cents]
 *                   properties:
 *                     label: { type: string }
 *                     amount_cents: { type: integer, minimum: 0 }
 *                 description: 'Si se envía, sustituye la lista y actualiza prize_total_cents a la suma'
 *               prize_total_cents:
 *                 type: integer
 *                 minimum: 0
 *                 description: 'Solo si no envías prizes en el mismo body'
 *               normas:
 *                 type: string
 *                 nullable: true
 *                 description: 'Reglas/normas del torneo. null para quitar'
 *     responses:
 *       200: { description: Torneo actualizado }
 *       400: { description: gender o prizes inválido }
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
    if (body.prizes !== undefined) {
      if (!Array.isArray(body.prizes)) {
        return res.status(400).json({ ok: false, error: 'prizes debe ser un array' });
      }
      const parsed = parsePrizesFromBody(body.prizes);
      if (!parsed.ok) return res.status(400).json({ ok: false, error: parsed.error });
      update.prizes = parsed.prizes;
      update.prize_total_cents = sumPrizeCents(parsed.prizes);
    } else if (body.prize_total_cents !== undefined) {
      update.prize_total_cents = Math.max(0, Number(body.prize_total_cents));
    }
    if (body.currency !== undefined) update.currency = String(body.currency ?? 'EUR');
    if (body.visibility !== undefined) update.visibility = body.visibility === 'public' ? 'public' : 'private';
    if (body.elo_min !== undefined) update.elo_min = body.elo_min != null ? Number(body.elo_min) : null;
    if (body.elo_max !== undefined) update.elo_max = body.elo_max != null ? Number(body.elo_max) : null;
    if (body.max_players !== undefined) update.max_players = Math.max(2, Number(body.max_players));
    if (body.registration_closed_at !== undefined) update.registration_closed_at = body.registration_closed_at ? asIso(body.registration_closed_at) : null;
    if (body.cancellation_cutoff_at !== undefined) update.cancellation_cutoff_at = body.cancellation_cutoff_at ? asIso(body.cancellation_cutoff_at) : null;
    if (body.invite_ttl_minutes !== undefined) update.invite_ttl_minutes = Math.max(1, Number(body.invite_ttl_minutes));
    if (body.description !== undefined) update.description = body.description != null ? String(body.description) : null;
    if (body.normas !== undefined) update.normas = body.normas != null ? String(body.normas) : null;
    if (body.registration_mode !== undefined) update.registration_mode = body.registration_mode === 'pair' ? 'pair' : 'individual';
    if (body.gender !== undefined) {
      const g = tournamentGenderFromBody(body.gender);
      if (g === false) return res.status(400).json({ ok: false, error: 'gender debe ser male, female, mixed, null u omitirse' });
      update.gender = g;
    }

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
      .select('id, club_id, status, max_players, invite_ttl_minutes, gender')
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

    const { data: joinPl } = await supabase.from('players').select('gender').eq('id', playerId).maybeSingle();
    if (
      !playerMeetsTournamentGender(
        (tournament as { gender?: string }).gender,
        (joinPl as { gender?: string } | null)?.gender
      )
    ) {
      return res.status(403).json({
        ok: false,
        error:
          'Tu género en el perfil no coincide con este torneo. Actualiza tu perfil o elige un torneo mixto.',
      });
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
 *                       prize_total_cents: 70000
 *                       prizes:
 *                         - { label: Campeón, amount_cents: 40000 }
 *                         - { label: Subcampeón, amount_cents: 20000 }
 *                         - { label: 3.er lugar, amount_cents: 10000 }
 *                       currency: "EUR"
 *                       visibility: "public"
 *                       gender: null
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
      .select(TOURNAMENT_PUBLIC_LIST_SELECT)
      .eq('visibility', 'public')
      .neq('status', 'cancelled')
      .order('start_at', { ascending: true });
    if (clubId) q = q.eq('club_id', clubId);
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    const tournaments = (data ?? []) as unknown as Array<{ id: string } & Record<string, unknown>>;
    const ids = tournaments.map((t) => t.id);
    const countsByTournament: Record<string, { confirmed: number; pending: number }> = {};
    if (ids.length > 0) {
      const { data: insRows } = await supabase
        .from('tournament_inscriptions')
        .select('tournament_id, status')
        .in('tournament_id', ids);
      for (const row of insRows ?? []) {
        const tid = String((row as { tournament_id: string }).tournament_id);
        if (!countsByTournament[tid]) countsByTournament[tid] = { confirmed: 0, pending: 0 };
        const st = String((row as { status: string }).status);
        if (st === 'confirmed') countsByTournament[tid].confirmed += 1;
        else if (st === 'pending') countsByTournament[tid].pending += 1;
      }
    }
    const enriched = tournaments.map((t) => ({
      ...t,
      confirmed_count: countsByTournament[t.id]?.confirmed ?? 0,
      pending_count: countsByTournament[t.id]?.pending ?? 0,
    }));
    return res.json({ ok: true, tournaments: enriched });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * Detalle público de un torneo (sin auth). Solo visibility=public y no cancelado.
 */
router.get('/public/:id', async (req: Request, res: Response) => {
  const tournamentId = String(req.params.id ?? '').trim();
  if (!tournamentId) return res.status(400).json({ ok: false, error: 'id requerido' });
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: tournament, error } = await supabase
      .from('tournaments')
      .select(TOURNAMENT_PUBLIC_DETAIL_SELECT)
      .eq('id', tournamentId)
      .eq('visibility', 'public')
      .neq('status', 'cancelled')
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!tournament) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    await cleanupExpiredTournamentInvites(tournamentId);
    await refreshTournamentStatus(tournamentId);
    const slots = await getTournamentSlots(tournamentId);
    return res.json({
      ok: true,
      tournament,
      counts: { confirmed: slots.confirmedPlayers, pending: slots.pendingPlayers },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * Torneos públicos en los que el jugador autenticado tiene inscripción pendiente o confirmada.
 */
router.get('/player/me-list', async (req: Request, res: Response) => {
  const auth = await getPlayerIdFromBearer(req);
  if (auth.error || !auth.playerId) {
    return res.status(401).json({ ok: false, error: auth.error ?? 'Token requerido' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const playerId = auth.playerId;
    const { data: insRows, error: insErr } = await supabase
      .from('tournament_inscriptions')
      .select('tournament_id')
      .or(`player_id_1.eq.${playerId},player_id_2.eq.${playerId}`)
      .in('status', ['confirmed', 'pending']);
    if (insErr) return res.status(500).json({ ok: false, error: insErr.message });

    const tournamentIds = [
      ...new Set((insRows ?? []).map((r) => String((r as { tournament_id: string }).tournament_id))),
    ];
    if (tournamentIds.length === 0) {
      return res.json({ ok: true, tournaments: [] });
    }

    const { data: tournaments, error: tErr } = await supabase
      .from('tournaments')
      .select(TOURNAMENT_PUBLIC_LIST_SELECT)
      .in('id', tournamentIds)
      .eq('visibility', 'public')
      .neq('status', 'cancelled');
    if (tErr) return res.status(500).json({ ok: false, error: tErr.message });

    const list = (tournaments ?? []) as unknown as Array<
      Record<string, unknown> & { id: string; start_at: string }
    >;
    const ids = list.map((t) => String(t.id));
    const countsByTournament: Record<string, { confirmed: number; pending: number }> = {};
    if (ids.length > 0) {
      const { data: countRows } = await supabase
        .from('tournament_inscriptions')
        .select('tournament_id, status')
        .in('tournament_id', ids);
      for (const ins of countRows ?? []) {
        const tid = String((ins as { tournament_id: string }).tournament_id);
        if (!countsByTournament[tid]) countsByTournament[tid] = { confirmed: 0, pending: 0 };
        const st = String((ins as { status: string }).status);
        if (st === 'confirmed') countsByTournament[tid].confirmed += 1;
        else if (st === 'pending') countsByTournament[tid].pending += 1;
      }
    }
    const enriched = list.map((t) => ({
      ...t,
      confirmed_count: countsByTournament[String(t.id)]?.confirmed ?? 0,
      pending_count: countsByTournament[String(t.id)]?.pending ?? 0,
    }));
    enriched.sort(
      (a, b) =>
        new Date(String(a.start_at)).getTime() - new Date(String(b.start_at)).getTime(),
    );
    return res.json({ ok: true, tournaments: enriched });
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
      .select('id, visibility, status, max_players, invite_ttl_minutes, gender, price_cents')
      .eq('id', tournamentId)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!tournament) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (Number((tournament as { price_cents?: number }).price_cents ?? 0) > 0) {
      return res.status(400).json({
        ok: false,
        error: 'Este torneo requiere pago. Completa la inscripción con tarjeta desde el botón Inscribirme.',
      });
    }
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

    const { data: joinPlayer } = await supabase.from('players').select('gender').eq('id', auth.playerId).maybeSingle();
    if (
      !playerMeetsTournamentGender(
        (tournament as { gender?: string }).gender,
        (joinPlayer as { gender?: string } | null)?.gender
      )
    ) {
      return res.status(403).json({
        ok: false,
        error:
          'Tu género en el perfil no coincide con este torneo. Actualiza tu perfil o elige un torneo mixto.',
      });
    }

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

/**
 * @openapi
 * /tournaments/{id}/player-detail:
 *   get:
 *     tags: [Tournaments]
 *     summary: Detalle de torneo para jugador autenticado
 *     description: Devuelve detalle del torneo y el estado de inscripción del jugador. En torneos privados exige estar inscrito.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Detalle accesible para el jugador
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value: { ok: true, tournament: {}, counts: { confirmed: 0, pending: 0 }, my_inscription: null }
 *       401: { description: Token requerido/expirado }
 *       403: { description: Torneo privado sin acceso }
 *       404: { description: Torneo no encontrado }
 */
router.get('/:id/player-detail', async (req: Request, res: Response) => {
  const tournamentId = req.params.id;
  const auth = await getPlayerIdFromBearer(req);
  if (auth.error || !auth.playerId) return res.status(401).json({ ok: false, error: auth.error ?? 'Token requerido' });
  try {
    const ctx = await getTournamentForPlayer(tournamentId, auth.playerId);
    if (ctx.error) return res.status(ctx.error === 'Torneo no encontrado' ? 404 : 500).json({ ok: false, error: ctx.error });
    const visibility = String((ctx.tournament as { visibility?: string }).visibility ?? 'private');
    if (visibility !== 'public' && !ctx.myInscription) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este torneo privado' });
    }
    await cleanupExpiredTournamentInvites(tournamentId);
    await refreshTournamentStatus(tournamentId);
    const slots = await getTournamentSlots(tournamentId);
    return res.json({
      ok: true,
      tournament: ctx.tournament,
      counts: { confirmed: slots.confirmedPlayers, pending: slots.pendingPlayers },
      my_inscription: ctx.myInscription,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments/{id}/join-pair:
 *   post:
 *     tags: [Tournaments]
 *     summary: Unirse a torneo público en modo pareja
 *     description: Inscribe al jugador autenticado y envía invitación al compañero por email para confirmar la pareja.
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
 *             required: [teammate_email]
 *             properties:
 *               teammate_email: { type: string, format: email }
 *           examples:
 *             sample:
 *               value: { teammate_email: "pareja@padel.local" }
 *     responses:
 *       200:
 *         description: Invitación de pareja creada
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value: { ok: true, status: pending, invite_url: "https://.../torneos/invite?..." }
 *       400: { description: Torneo no apto para pareja o email inválido }
 *       401: { description: Token requerido/expirado }
 *       403: { description: Torneo privado o restricción de género/elo }
 *       404: { description: Torneo no encontrado }
 *       409: { description: Sin cupos o ya inscrito }
 */
router.post('/:id/join-pair', async (req: Request, res: Response) => {
  const tournamentId = req.params.id;
  const teammateEmail = String(req.body?.teammate_email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(teammateEmail)) {
    return res.status(400).json({ ok: false, error: 'teammate_email válido es obligatorio' });
  }
  const auth = await getPlayerIdFromBearer(req);
  if (auth.error || !auth.playerId) return res.status(401).json({ ok: false, error: auth.error ?? 'Token requerido' });
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: tournament, error } = await supabase
      .from('tournaments')
      .select('id, visibility, status, max_players, invite_ttl_minutes, registration_mode, elo_min, elo_max, gender')
      .eq('id', tournamentId)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!tournament) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (String((tournament as any).visibility) !== 'public') {
      return res.status(403).json({ ok: false, error: 'Solo torneos públicos permiten unión directa por parejas' });
    }
    if (String((tournament as any).registration_mode) !== 'pair') {
      return res.status(400).json({ ok: false, error: 'Este torneo no admite inscripción por parejas' });
    }
    if (String((tournament as any).status) !== 'open') {
      return res.status(400).json({ ok: false, error: 'El torneo no está abierto' });
    }
    await cleanupExpiredTournamentInvites(tournamentId);
    const slots = await getTournamentSlots(tournamentId);
    if (slots.confirmedPlayers + slots.pendingPlayers + 2 > Number((tournament as any).max_players)) {
      return res.status(409).json({ ok: false, error: 'No hay cupos para inscribir una pareja' });
    }
    const { data: existingIns } = await supabase
      .from('tournament_inscriptions')
      .select('id')
      .eq('tournament_id', tournamentId)
      .or(`player_id_1.eq.${auth.playerId},player_id_2.eq.${auth.playerId}`)
      .maybeSingle();
    if (existingIns) return res.status(409).json({ ok: false, error: 'Ya estás inscrito en este torneo' });

    const { data: me } = await supabase.from('players').select('email, elo_rating, gender').eq('id', auth.playerId).maybeSingle();
    if (String((me as { email?: string } | null)?.email ?? '').toLowerCase() === teammateEmail) {
      return res.status(400).json({ ok: false, error: 'No puedes invitarte a ti mismo como pareja' });
    }
    const elo = Number((me as { elo_rating?: number } | null)?.elo_rating ?? 1200);
    const eloMin = (tournament as any).elo_min;
    const eloMax = (tournament as any).elo_max;
    if (eloMin != null && eloMax != null && (elo < eloMin || elo > eloMax)) {
      return res.status(403).json({ ok: false, error: 'Tu nivel Elo no está en el rango permitido' });
    }
    if (!playerMeetsTournamentGender((tournament as { gender?: string }).gender, (me as { gender?: string } | null)?.gender)) {
      return res.status(403).json({
        ok: false,
        error: 'Tu género en el perfil no coincide con la categoría del torneo. Actualiza tu perfil o elige un torneo mixto.',
      });
    }

    const { token, tokenHash } = generateInviteToken();
    const inviteUrl = `${getFrontendUrl()}/torneos/invite?tournament_id=${tournamentId}&token=${token}`;
    const expiresAt = new Date(Date.now() + Number((tournament as any).invite_ttl_minutes) * 60000).toISOString();
    const { error: insErr } = await supabase.from('tournament_inscriptions').insert({
      tournament_id: tournamentId,
      status: 'pending',
      invited_at: new Date().toISOString(),
      expires_at: expiresAt,
      player_id_1: auth.playerId,
      invite_email_2: teammateEmail,
      token_hash: tokenHash,
      invite_url: inviteUrl,
    });
    if (insErr) return res.status(500).json({ ok: false, error: insErr.message });

    await sendInviteEmail(teammateEmail, inviteUrl, 'Tu club');
    await refreshTournamentStatus(tournamentId);
    return res.json({ ok: true, status: 'pending', invite_url: inviteUrl });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments/{id}/leave:
 *   post:
 *     tags: [Tournaments]
 *     summary: Darse de baja del torneo como jugador
 *     description: Cancela la inscripción del jugador autenticado. Si pasó la fecha `cancellation_cutoff_at` (o ya empezó), no permite baja.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Baja procesada
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value: { ok: true, left: true }
 *       400: { description: No hay inscripción activa del jugador }
 *       401: { description: Token requerido/expirado }
 *       403: { description: No permitido por reglas de cancelación/tiempo }
 *       404: { description: Torneo no encontrado }
 */
router.post('/:id/leave', async (req: Request, res: Response) => {
  const tournamentId = req.params.id;
  const auth = await getPlayerIdFromBearer(req);
  if (auth.error || !auth.playerId) return res.status(401).json({ ok: false, error: auth.error ?? 'Token requerido' });
  try {
    const supabase = getSupabaseServiceRoleClient();
    const ctx = await getTournamentForPlayer(tournamentId, auth.playerId);
    if (ctx.error) return res.status(ctx.error === 'Torneo no encontrado' ? 404 : 500).json({ ok: false, error: ctx.error });
    if (!ctx.myInscription || !['pending', 'confirmed'].includes(String(ctx.myInscription.status))) {
      return res.status(400).json({ ok: false, error: 'No tienes una inscripción activa en este torneo' });
    }
    const nowMs = Date.now();
    const cutoffAt = (ctx.tournament as { cancellation_cutoff_at?: string | null }).cancellation_cutoff_at;
    const startAt = (ctx.tournament as { start_at?: string | null }).start_at;
    if (cutoffAt && nowMs > new Date(cutoffAt).getTime()) {
      return res.status(403).json({ ok: false, error: 'Ya pasó el plazo de cancelación para darse de baja' });
    }
    if (startAt && nowMs >= new Date(startAt).getTime()) {
      return res.status(403).json({ ok: false, error: 'El torneo ya comenzó y no permite baja' });
    }

    const { error: upErr } = await supabase
      .from('tournament_inscriptions')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
        cancelled_at: new Date().toISOString(),
        cancelled_reason: 'Baja solicitada por jugador',
      })
      .eq('id', ctx.myInscription.id);
    if (upErr) return res.status(500).json({ ok: false, error: upErr.message });

    const name = await getPlayerDisplayName(auth.playerId);
    await supabase.from('tournament_chat_messages').insert({
      tournament_id: tournamentId,
      author_user_id: '00000000-0000-0000-0000-000000000000',
      author_name: 'Sistema',
      message: `${name} se ha dado de baja del torneo.`,
    });
    await refreshTournamentStatus(tournamentId);
    return res.json({ ok: true, left: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments/{id}/chat/player:
 *   get:
 *     tags: [Tournaments]
 *     summary: Listar chat del torneo para jugador
 *     description: Permite leer chat si el torneo es público o si el jugador participa en el torneo.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Mensajes listados }
 *       401: { description: Token requerido/expirado }
 *       403: { description: Torneo privado sin acceso }
 *       404: { description: Torneo no encontrado }
 */
router.get('/:id/chat/player', async (req: Request, res: Response) => {
  const tournamentId = req.params.id;
  const auth = await getPlayerIdFromBearer(req);
  if (auth.error || !auth.playerId) return res.status(401).json({ ok: false, error: auth.error ?? 'Token requerido' });
  try {
    const supabase = getSupabaseServiceRoleClient();
    const ctx = await getTournamentForPlayer(tournamentId, auth.playerId);
    if (ctx.error) return res.status(ctx.error === 'Torneo no encontrado' ? 404 : 500).json({ ok: false, error: ctx.error });
    const visibility = String((ctx.tournament as { visibility?: string }).visibility ?? 'private');
    if (visibility !== 'public' && !ctx.myInscription) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso al chat de este torneo' });
    }
    const { data, error } = await supabase
      .from('tournament_chat_messages')
      .select('id, created_at, author_user_id, author_name, message')
      .eq('tournament_id', tournamentId)
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
 * /tournaments/{id}/chat/player:
 *   post:
 *     tags: [Tournaments]
 *     summary: Enviar mensaje al chat como jugador
 *     description: Permite escribir chat si el torneo es público o si el jugador participa en el torneo.
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
 *             required: [message]
 *             properties:
 *               message: { type: string, example: "Nos vemos 15 min antes" }
 *     responses:
 *       200: { description: Mensaje enviado }
 *       400: { description: message vacío }
 *       401: { description: Token requerido/expirado }
 *       403: { description: Torneo privado sin acceso }
 *       404: { description: Torneo no encontrado }
 */
router.post('/:id/chat/player', async (req: Request, res: Response) => {
  const tournamentId = req.params.id;
  const message = String(req.body?.message ?? '').trim();
  if (!message) return res.status(400).json({ ok: false, error: 'message es obligatorio' });
  const auth = await getPlayerIdFromBearer(req);
  if (auth.error || !auth.playerId) return res.status(401).json({ ok: false, error: auth.error ?? 'Token requerido' });
  try {
    const supabase = getSupabaseServiceRoleClient();
    const ctx = await getTournamentForPlayer(tournamentId, auth.playerId);
    if (ctx.error) return res.status(ctx.error === 'Torneo no encontrado' ? 404 : 500).json({ ok: false, error: ctx.error });
    const visibility = String((ctx.tournament as { visibility?: string }).visibility ?? 'private');
    if (visibility !== 'public' && !ctx.myInscription) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso al chat de este torneo' });
    }
    const authorName = await getPlayerDisplayName(auth.playerId);
    const { data, error } = await supabase
      .from('tournament_chat_messages')
      .insert({
        tournament_id: tournamentId,
        author_user_id: auth.playerId,
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

export default router;
