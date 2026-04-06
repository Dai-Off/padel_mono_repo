import { Router, Request, Response } from 'express';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdmin } from '../middleware/requireClubOwnerOrAdmin';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { findTournamentConflict } from '../lib/tournamentConflicts';
import { sendClubCrmEmail, sendInviteEmail } from '../lib/mailer';
import {
  aggregateSlotsByTournamentId,
  cleanupExpiredTournamentInvites,
  cleanupExpiredTournamentInvitesGloballyIfStale,
  getTournamentSlots,
  refreshTournamentStatus,
  slotsFromInscriptionRows,
} from '../services/tournamentsService';
import { generateInviteToken } from '../lib/inviteToken';
import { getPlayerIdFromBearer } from '../lib/authPlayer';
import { playerMeetsTournamentGender, tournamentGenderFromBody } from '../lib/tournamentGender';
import { parsePrizesFromBody, sumPrizeCents, type TournamentPrizeEntry } from '../lib/tournamentPrizes';
import { buildTournamentInviteUrl } from '../lib/env';
import { normalizePosterUrl } from '../lib/tournamentPosterUrl';
import {
  computeStandings,
  generateTournamentFixtures,
  generateTournamentFixturesManual,
  getCompetitionView,
  saveManualPodium,
  saveMatchResult,
  setupTournamentCompetition,
  type CompetitionFormat,
} from '../services/tournamentCompetitionService';

const router = Router();
router.use(attachAuthContext);

function canAccessClub(req: Request, clubId: string): boolean {
  if (req.authContext?.adminId) return true;
  return req.authContext?.allowedClubIds?.includes(clubId) ?? false;
}

type DivisionInputRow = {
  code: string;
  label: string;
  elo_min: number | null;
  elo_max: number | null;
  sort_order: number;
};

function parseDivisionsInput(raw: unknown): { ok: true; rows: DivisionInputRow[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, rows: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'divisions debe ser un array' };
  const rows: DivisionInputRow[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || !item) return { ok: false, error: 'Cada división debe ser un objeto' };
    const o = item as Record<string, unknown>;
    const code = String(o.code ?? '').trim();
    const label = String(o.label ?? '').trim();
    if (!code || !label) return { ok: false, error: 'Cada división requiere code y label' };
    rows.push({
      code,
      label,
      elo_min: o.elo_min != null ? Number(o.elo_min) : null,
      elo_max: o.elo_max != null ? Number(o.elo_max) : null,
      sort_order: Number.isFinite(Number(o.sort_order)) ? Number(o.sort_order) : rows.length,
    });
  }
  const codes = new Set(rows.map((r) => r.code));
  if (codes.size !== rows.length) return { ok: false, error: 'code de división duplicado' };
  return { ok: true, rows };
}

async function replaceTournamentDivisions(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  tournamentId: string,
  rows: DivisionInputRow[]
): Promise<void> {
  const { error: delErr } = await supabase.from('tournament_divisions').delete().eq('tournament_id', tournamentId);
  if (delErr) throw new Error(delErr.message);
  if (!rows.length) return;
  const ins = rows.map((r) => ({
    tournament_id: tournamentId,
    code: r.code,
    label: r.label,
    elo_min: r.elo_min,
    elo_max: r.elo_max,
    sort_order: r.sort_order,
  }));
  const { error } = await supabase.from('tournament_divisions').insert(ins);
  if (error) throw new Error(error.message);
}

async function pickDivisionIdForElo(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  tournamentId: string,
  playerElo: number
): Promise<string | null> {
  const { data: divs } = await supabase
    .from('tournament_divisions')
    .select('id,elo_min,elo_max,sort_order')
    .eq('tournament_id', tournamentId)
    .order('sort_order', { ascending: true });
  for (const d of divs ?? []) {
    const min = (d as any).elo_min != null ? Number((d as any).elo_min) : null;
    const max = (d as any).elo_max != null ? Number((d as any).elo_max) : null;
    if (min != null && playerElo < min) continue;
    if (max != null && playerElo > max) continue;
    return String((d as any).id);
  }
  return null;
}

function asIso(value: unknown): string {
  return new Date(String(value)).toISOString();
}

function isHalfHourStart(iso: string): boolean {
  const d = new Date(iso);
  const mins = d.getUTCMinutes();
  return mins === 0 || mins === 30;
}

function isDurationAllowed(durationMin: number): boolean {
  return Number.isInteger(durationMin) && durationMin >= 30 && durationMin % 30 === 0;
}

function normalizeRegistrationMode(value: unknown): 'individual' | 'pair' | 'both' {
  const mode = String(value ?? '').trim();
  if (mode === 'pair' || mode === 'both') return mode;
  return 'individual';
}

function asYmd(value: unknown): string | null {
  const s = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function asHm(value: unknown): string | null {
  const s = String(value ?? '').trim();
  if (!/^\d{2}:\d{2}$/.test(s)) return null;
  const hh = Number(s.slice(0, 2));
  const mm = Number(s.slice(3, 5));
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23) return null;
  if (!(mm === 0 || mm === 30)) return null;
  return s;
}

function parseWeekdays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<number>();
  for (const item of raw) {
    const n = Number(item);
    if (Number.isInteger(n) && n >= 0 && n <= 6) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

function buildUtcIsoFromYmdHm(ymd: string, hm: string): string {
  return `${ymd}T${hm}:00.000Z`;
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
    .select(
      'id, club_id, name, start_at, end_at, duration_min, price_cents, prize_total_cents, prizes, currency, visibility, gender, elo_min, elo_max, max_players, registration_mode, registration_closed_at, cancellation_cutoff_at, invite_ttl_minutes, status, description, normas, poster_url, level_mode'
    )
    .eq('id', tournamentId)
    .maybeSingle();
  if (error) return { tournament: null, myInscription: null, error: error.message };
  if (!tournament) return { tournament: null, myInscription: null, error: 'Torneo no encontrado' };

  const { data: myInscription, error: insErr } = await supabase
    .from('tournament_inscriptions')
    .select('id, status, invited_at, expires_at, confirmed_at, cancelled_at, cancelled_reason, player_id_1, player_id_2')
    .eq('tournament_id', tournamentId)
    .or(`player_id_1.eq.${playerId},player_id_2.eq.${playerId}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (insErr) return { tournament, myInscription: null, error: insErr.message };
  return { tournament, myInscription: myInscription ?? null };
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
      .select('id, created_at, updated_at, club_id, name, start_at, end_at, duration_min, price_cents, prize_total_cents, prizes, currency, visibility, gender, elo_min, elo_max, max_players, registration_mode, registration_closed_at, cancellation_cutoff_at, invite_ttl_minutes, status, description, normas, poster_url, level_mode, tournament_courts(court_id)')
      .eq('club_id', clubId)
      .order('start_at', { ascending: true });
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const rows = data ?? [];
    await cleanupExpiredTournamentInvitesGloballyIfStale();

    const ids = rows.map((r: { id: string }) => r.id);
    let slotsMap = new Map<string, { confirmedPlayers: number; pendingPlayers: number }>();
    if (ids.length) {
      const { data: insRows, error: insErr } = await supabase
        .from('tournament_inscriptions')
        .select('tournament_id, status, player_id_2')
        .in('tournament_id', ids);
      if (insErr) return res.status(500).json({ ok: false, error: insErr.message });
      slotsMap = aggregateSlotsByTournamentId((insRows ?? []) as any[]);
    }

    const out = rows.map((row) => {
      const sid = (row as { id: string }).id;
      const slots = slotsMap.get(sid) ?? { confirmedPlayers: 0, pendingPlayers: 0 };
      return {
        ...row,
        confirmed_count: slots.confirmedPlayers,
        pending_count: slots.pendingPlayers,
      };
    });
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
      .select('id, created_at, updated_at, club_id, name, start_at, end_at, duration_min, price_cents, prize_total_cents, prizes, currency, visibility, gender, elo_min, elo_max, max_players, registration_mode, registration_closed_at, cancellation_cutoff_at, invite_ttl_minutes, status, description, normas, poster_url, level_mode, tournament_courts(court_id)')
      .eq('id', id)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!tournament) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (!canAccessClub(req, String((tournament as { club_id: string }).club_id))) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }

    await cleanupExpiredTournamentInvitesGloballyIfStale();
    await refreshTournamentStatus(id, { skipInviteCleanup: true });

    const inscriptionSelect =
      'id, status, invited_at, expires_at, confirmed_at, invite_email_1, invite_email_2, player_id_1, player_id_2, division_id, players_1:players!tournament_inscriptions_player_id_1_fkey(id, first_name, last_name, email, avatar_url, elo_rating), players_2:players!tournament_inscriptions_player_id_2_fkey(id, first_name, last_name, email, avatar_url, elo_rating)';
    const fullTournamentSelect =
      'id, created_at, updated_at, club_id, name, start_at, end_at, duration_min, price_cents, prize_total_cents, prizes, currency, visibility, gender, elo_min, elo_max, max_players, registration_mode, registration_closed_at, cancellation_cutoff_at, invite_ttl_minutes, status, description, normas, poster_url, level_mode, tournament_courts(court_id)';

    const [{ data: tournamentFresh, error: t2Err }, { data: inscriptions, error: iErr }, { data: divisions, error: divErr }] = await Promise.all([
      supabase.from('tournaments').select(fullTournamentSelect).eq('id', id).maybeSingle(),
      supabase.from('tournament_inscriptions').select(inscriptionSelect).eq('tournament_id', id).order('invited_at', { ascending: true }),
      supabase.from('tournament_divisions').select('id,code,label,elo_min,elo_max,sort_order').eq('tournament_id', id).order('sort_order', { ascending: true }),
    ]);
    if (t2Err) return res.status(500).json({ ok: false, error: t2Err.message });
    if (!tournamentFresh) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (iErr) return res.status(500).json({ ok: false, error: iErr.message });
    if (divErr) return res.status(500).json({ ok: false, error: divErr.message });

    const sorted = [...(inscriptions ?? [])].sort((a: any, b: any) => {
      const pa = a.status === 'confirmed' ? 0 : 1;
      const pb = b.status === 'confirmed' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return new Date(a.invited_at).getTime() - new Date(b.invited_at).getTime();
    });
    const slots = slotsFromInscriptionRows(
      sorted.map((r: any) => ({ status: r.status, player_id_2: r.player_id_2 }))
    );
    return res.json({
      ok: true,
      tournament: tournamentFresh,
      inscriptions: sorted,
      divisions: divisions ?? [],
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
 *               name: { type: string, nullable: true, description: 'Nombre visible del torneo (opcional)' }
 *               start_at: { type: string, format: date-time }
 *               duration_min: { type: integer, minimum: 30 }
 *               price_cents: { type: integer, minimum: 0 }
 *               currency: { type: string, example: EUR }
 *               elo_min: { type: integer, nullable: true }
 *               elo_max: { type: integer, nullable: true }
 *               max_players: { type: integer, minimum: 2 }
 *               registration_mode: { type: string, enum: [individual, pair, both], description: 'individual, pair o both (sin restricción)' }
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
 *                 name: "Copa Primavera"
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
    if (!isHalfHourStart(startAt)) {
      return res.status(400).json({ ok: false, error: 'start_at debe estar en bloques de 30 min (ej: 09:00, 09:30)' });
    }
    if (!isDurationAllowed(duration)) {
      return res.status(400).json({ ok: false, error: 'duration_min debe ser múltiplo de 30 (30, 60, 90, 120...)' });
    }
    const endAt = new Date(new Date(startAt).getTime() + duration * 60000).toISOString();
    const conflict = await findTournamentConflict({ clubId, courtIds, startAt, endAt });
    if (conflict) return res.status(409).json({ ok: false, error: conflict });

    const levelMode = body.level_mode === 'multi_division' ? 'multi_division' : 'single_band';
    const divParsed = parseDivisionsInput(body.divisions);
    if (!divParsed.ok) return res.status(400).json({ ok: false, error: divParsed.error });
    if (levelMode === 'multi_division' && divParsed.rows.length === 0) {
      return res.status(400).json({ ok: false, error: 'Torneo multi-división requiere al menos una categoría en divisions' });
    }
    const posterNorm = normalizePosterUrl(body as Record<string, unknown>, 'poster_url');
    if (!posterNorm.ok) return res.status(400).json({ ok: false, error: posterNorm.error });

    const supabase = getSupabaseServiceRoleClient();
    const organizerPlayerId = await resolveOrganizerPlayerId(req, clubId);
    const insertRow: Record<string, unknown> = {
      club_id: clubId,
      name: body.name != null ? String(body.name).trim() || null : null,
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
      registration_mode: normalizeRegistrationMode(body.registration_mode),
      registration_closed_at: body.registration_closed_at ? asIso(body.registration_closed_at) : null,
      cancellation_cutoff_at: body.cancellation_cutoff_at ? asIso(body.cancellation_cutoff_at) : null,
      invite_ttl_minutes: Math.max(1, Number(body.invite_ttl_minutes ?? 1440)),
      description: body.description != null ? String(body.description) : null,
      normas: body.normas != null ? String(body.normas) : null,
      level_mode: levelMode,
    };
    if (posterNorm.mode === 'set') insertRow.poster_url = posterNorm.value;

    const { data: tournament, error } = await supabase.from('tournaments').insert(insertRow).select('*').single();
    if (error) return res.status(500).json({ ok: false, error: error.message });

    if (levelMode === 'multi_division') {
      try {
        await replaceTournamentDivisions(supabase, tournament.id, divParsed.rows);
      } catch (e) {
        return res.status(500).json({ ok: false, error: (e as Error).message });
      }
    }

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
 * /tournaments/recurring:
 *   post:
 *     tags: [Tournaments]
 *     summary: Crear torneos recurrentes semanales
 *     description: |
 *       Genera múltiples torneos semanales (por días seleccionados) dentro de un rango de fechas.
 *       Reutiliza la configuración del torneo (precio, reglas, Elo, género, visibilidad, etc.).
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [club_id, start_date, end_date, start_time, duration_min, max_players, court_ids, weekdays]
 *             properties:
 *               club_id: { type: string, format: uuid, description: Club dueño de la serie }
 *               name: { type: string, nullable: true, description: Nombre base de cada torneo }
 *               start_date: { type: string, format: date, example: '2026-04-06' }
 *               end_date: { type: string, format: date, example: '2026-06-30' }
 *               start_time: { type: string, example: '19:30', description: 'Hora fija en formato HH:mm (solo :00 o :30)' }
 *               weekdays:
 *                 type: array
 *                 description: 'Días de la semana a crear (0=domingo ... 6=sábado)'
 *                 items: { type: integer, minimum: 0, maximum: 6 }
 *                 example: [1]
 *               duration_min: { type: integer, minimum: 30 }
 *               price_cents: { type: integer, minimum: 0 }
 *               prize_total_cents: { type: integer, minimum: 0 }
 *               prizes:
 *                 type: array
 *                 maxItems: 20
 *                 items:
 *                   type: object
 *                   required: [label, amount_cents]
 *                   properties:
 *                     label: { type: string }
 *                     amount_cents: { type: integer, minimum: 0 }
 *               currency: { type: string, example: EUR }
 *               visibility: { type: string, enum: [private, public] }
 *               gender:
 *                 type: string
 *                 nullable: true
 *                 enum: [male, female, mixed]
 *               elo_min: { type: integer, nullable: true }
 *               elo_max: { type: integer, nullable: true }
 *               max_players: { type: integer, minimum: 2 }
 *               registration_mode: { type: string, enum: [individual, pair, both] }
 *               registration_close_hours_before_start:
 *                 type: number
 *                 minimum: 0
 *                 nullable: true
 *                 description: Horas antes del inicio para cerrar inscripción en cada ocurrencia
 *               cancellation_hours_before_start:
 *                 type: number
 *                 minimum: 0
 *                 nullable: true
 *                 description: Horas antes del inicio para cutoff de cancelación en cada ocurrencia
 *               invite_ttl_minutes: { type: integer, minimum: 1 }
 *               description: { type: string, nullable: true }
 *               normas: { type: string, nullable: true }
 *               poster_url: { type: string, nullable: true }
 *               level_mode: { type: string, enum: [single_band, multi_division] }
 *               divisions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     code: { type: string }
 *                     label: { type: string }
 *                     elo_min: { type: integer, nullable: true }
 *                     elo_max: { type: integer, nullable: true }
 *                     sort_order: { type: integer }
 *               court_ids:
 *                 type: array
 *                 items: { type: string, format: uuid }
 *           examples:
 *             monday_american:
 *               value:
 *                 club_id: "11111111-1111-1111-1111-111111111111"
 *                 name: "Americano Lunes"
 *                 start_date: "2026-04-06"
 *                 end_date: "2026-06-29"
 *                 start_time: "20:00"
 *                 weekdays: [1]
 *                 duration_min: 120
 *                 max_players: 12
 *                 registration_mode: "both"
 *                 price_cents: 1500
 *                 cancellation_hours_before_start: 24
 *                 registration_close_hours_before_start: 12
 *                 normas: "Formato americano, 1 set por rotación."
 *                 court_ids: ["22222222-2222-2222-2222-222222222222"]
 *     responses:
 *       201:
 *         description: Serie creada (con detalle de creados y omitidos)
 *       400:
 *         description: Validación de datos (fechas/horas/semana/divisiones)
 *       403:
 *         description: Sin acceso al club
 *       409:
 *         description: Todos los horarios entran en conflicto
 */
router.post('/recurring', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const clubId = String(body.club_id ?? '').trim();
  const courtIds = Array.isArray(body.court_ids) ? body.court_ids.map(String) : [];
  const startDate = asYmd(body.start_date);
  const endDate = asYmd(body.end_date);
  const startTime = asHm(body.start_time);
  const weekdays = parseWeekdays(body.weekdays);
  if (!clubId || !startDate || !endDate || !startTime || !body.duration_min || !body.max_players || !courtIds.length || !weekdays.length) {
    return res.status(400).json({
      ok: false,
      error: 'club_id, start_date, end_date, start_time, weekdays, duration_min, max_players y court_ids son obligatorios',
    });
  }
  if (startDate > endDate) {
    return res.status(400).json({ ok: false, error: 'start_date no puede ser mayor a end_date' });
  }
  if (!canAccessClub(req, clubId)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  const genderParsed = tournamentGenderFromBody(body.gender);
  if (genderParsed === false) {
    return res.status(400).json({ ok: false, error: 'gender debe ser male, female, mixed, null u omitirse' });
  }
  const duration = Number(body.duration_min);
  if (!isDurationAllowed(duration)) {
    return res.status(400).json({ ok: false, error: 'duration_min debe ser múltiplo de 30 (30, 60, 90, 120...)' });
  }

  let insertPrizes: TournamentPrizeEntry[] = [];
  let insertPrizeTotalCents = Math.max(0, Number(body.prize_total_cents ?? 0));
  if (Array.isArray(body.prizes)) {
    const parsed = parsePrizesFromBody(body.prizes);
    if (!parsed.ok) return res.status(400).json({ ok: false, error: parsed.error });
    insertPrizes = parsed.prizes;
    insertPrizeTotalCents = sumPrizeCents(parsed.prizes);
  }
  const levelMode = body.level_mode === 'multi_division' ? 'multi_division' : 'single_band';
  const divParsed = parseDivisionsInput(body.divisions);
  if (!divParsed.ok) return res.status(400).json({ ok: false, error: divParsed.error });
  if (levelMode === 'multi_division' && divParsed.rows.length === 0) {
    return res.status(400).json({ ok: false, error: 'Torneo multi-división requiere al menos una categoría en divisions' });
  }
  const posterNorm = normalizePosterUrl(body as Record<string, unknown>, 'poster_url');
  if (!posterNorm.ok) return res.status(400).json({ ok: false, error: posterNorm.error });

  const registrationCloseHours =
    body.registration_close_hours_before_start != null ? Math.max(0, Number(body.registration_close_hours_before_start)) : null;
  const cancellationHours =
    body.cancellation_hours_before_start != null ? Math.max(0, Number(body.cancellation_hours_before_start)) : null;

  try {
    const supabase = getSupabaseServiceRoleClient();
    const organizerPlayerId = await resolveOrganizerPlayerId(req, clubId);
    const created: Array<{ id: string; start_at: string }> = [];
    const skipped: Array<{ start_at: string; reason: string }> = [];
    let cursor = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    while (cursor.getTime() <= end.getTime()) {
      const wd = cursor.getUTCDay();
      if (weekdays.includes(wd)) {
        const ymd = cursor.toISOString().slice(0, 10);
        const startAt = buildUtcIsoFromYmdHm(ymd, startTime);
        const endAt = new Date(new Date(startAt).getTime() + duration * 60000).toISOString();
        const conflict = await findTournamentConflict({ clubId, courtIds, startAt, endAt });
        if (conflict) {
          skipped.push({ start_at: startAt, reason: conflict });
        } else {
          const startMs = new Date(startAt).getTime();
          const insertRow: Record<string, unknown> = {
            club_id: clubId,
            name: body.name != null ? String(body.name).trim() || null : null,
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
            registration_mode: normalizeRegistrationMode(body.registration_mode),
            registration_closed_at: registrationCloseHours != null ? new Date(startMs - registrationCloseHours * 60 * 60 * 1000).toISOString() : null,
            cancellation_cutoff_at: cancellationHours != null ? new Date(startMs - cancellationHours * 60 * 60 * 1000).toISOString() : null,
            invite_ttl_minutes: Math.max(1, Number(body.invite_ttl_minutes ?? 1440)),
            description: body.description != null ? String(body.description) : null,
            normas: body.normas != null ? String(body.normas) : null,
            level_mode: levelMode,
          };
          if (posterNorm.mode === 'set') insertRow.poster_url = posterNorm.value;
          const { data: tournament, error } = await supabase.from('tournaments').insert(insertRow).select('*').single();
          if (error) {
            skipped.push({ start_at: startAt, reason: error.message });
          } else {
            if (levelMode === 'multi_division') {
              try {
                await replaceTournamentDivisions(supabase, tournament.id, divParsed.rows);
              } catch (e) {
                skipped.push({ start_at: startAt, reason: (e as Error).message });
                cursor.setUTCDate(cursor.getUTCDate() + 1);
                continue;
              }
            }
            const rows = courtIds.map((courtId: string) => ({ tournament_id: tournament.id, court_id: courtId }));
            const { error: cErr } = await supabase.from('tournament_courts').insert(rows);
            if (cErr) {
              skipped.push({ start_at: startAt, reason: cErr.message });
              cursor.setUTCDate(cursor.getUTCDate() + 1);
              continue;
            }
            await syncTournamentBookings({
              tournamentId: tournament.id,
              courtIds,
              startAt,
              endAt,
              organizerPlayerId,
              notes: body.description != null ? String(body.description) : null,
            });
            created.push({ id: String(tournament.id), start_at: startAt });
          }
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    if (!created.length) {
      return res.status(409).json({ ok: false, error: 'No se pudo crear ninguna ocurrencia', skipped });
    }
    return res.status(201).json({ ok: true, created_count: created.length, skipped_count: skipped.length, created, skipped });
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
 *               name:
 *                 type: string
 *                 nullable: true
 *                 description: 'Nombre visible del torneo. null para limpiar'
 *               registration_mode:
 *                 type: string
 *                 enum: [individual, pair, both]
 *                 description: 'Modo de inscripción: individual, parejas o ambos'
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
    if (!isHalfHourStart(startAt)) {
      return res.status(400).json({ ok: false, error: 'start_at debe estar en bloques de 30 min (ej: 09:00, 09:30)' });
    }
    if (!isDurationAllowed(durationMin)) {
      return res.status(400).json({ ok: false, error: 'duration_min debe ser múltiplo de 30 (30, 60, 90, 120...)' });
    }
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
    if (body.name !== undefined) update.name = body.name != null ? String(body.name).trim() || null : null;
    if (body.normas !== undefined) update.normas = body.normas != null ? String(body.normas) : null;
    if (body.registration_mode !== undefined) update.registration_mode = normalizeRegistrationMode(body.registration_mode);
    if (body.gender !== undefined) {
      const g = tournamentGenderFromBody(body.gender);
      if (g === false) return res.status(400).json({ ok: false, error: 'gender debe ser male, female, mixed, null u omitirse' });
      update.gender = g;
    }
    if (body.level_mode !== undefined) {
      update.level_mode = body.level_mode === 'multi_division' ? 'multi_division' : 'single_band';
    }
    const posterUp = normalizePosterUrl(body as Record<string, unknown>, 'poster_url');
    if (!posterUp.ok) return res.status(400).json({ ok: false, error: posterUp.error });
    if (posterUp.mode === 'set') update.poster_url = posterUp.value;

    const { data: tournament, error: upErr } = await supabase.from('tournaments').update(update).eq('id', id).select('*').single();
    if (upErr) return res.status(500).json({ ok: false, error: upErr.message });

    if (body.divisions !== undefined) {
      const { count, error: tcErr } = await supabase
        .from('tournament_teams')
        .select('id', { head: true, count: 'exact' })
        .eq('tournament_id', id);
      if (tcErr) return res.status(500).json({ ok: false, error: tcErr.message });
      if ((count ?? 0) > 0) {
        return res.status(400).json({ ok: false, error: 'No se pueden cambiar categorías si ya hay equipos generados' });
      }
      const d = parseDivisionsInput(body.divisions);
      if (!d.ok) return res.status(400).json({ ok: false, error: d.error });
      const lm = String((tournament as { level_mode?: string }).level_mode ?? 'single_band');
      if (lm === 'multi_division' && d.rows.length === 0) {
        return res.status(400).json({ ok: false, error: 'Torneo multi-división requiere al menos una categoría' });
      }
      try {
        await replaceTournamentDivisions(supabase, id, d.rows);
      } catch (e) {
        return res.status(500).json({ ok: false, error: (e as Error).message });
      }
    }

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

    await refreshTournamentStatus(id, { force: true });
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

    await refreshTournamentStatus(tournamentId, { force: true, skipInviteCleanup: true });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments/{id}/participants:
 *   post:
 *     tags: [Tournaments]
 *     summary: Agregar jugador existente como participante confirmado
 *     description: Permite al organizador sumar un jugador ya registrado y dejarlo confirmado directamente (sin invitación pendiente).
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
 *             required: [player_id]
 *             properties:
 *               player_id: { type: string, format: uuid }
 *     responses:
 *       200: { description: Jugador agregado }
 *       400: { description: Datos inválidos o torneo no apto }
 *       403: { description: Sin acceso al club o restricciones de género/elo }
 *       404: { description: Torneo o jugador no encontrado }
 *       409: { description: Sin cupo o jugador ya inscripto }
 */
router.post('/:id/participants', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const tournamentId = req.params.id;
  const playerId = String(req.body?.player_id ?? '').trim();
  if (!playerId) return res.status(400).json({ ok: false, error: 'player_id es obligatorio' });
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .select('id, club_id, status, max_players, invite_ttl_minutes, registration_mode, elo_min, elo_max, gender, level_mode')
      .eq('id', tournamentId)
      .maybeSingle();
    if (tErr) return res.status(500).json({ ok: false, error: tErr.message });
    if (!tournament) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (!canAccessClub(req, String((tournament as { club_id: string }).club_id))) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }
    if (String((tournament as { status: string }).status) !== 'open') {
      return res.status(400).json({ ok: false, error: 'El torneo no está abierto' });
    }
    if (!['individual', 'both'].includes(String((tournament as { registration_mode?: string }).registration_mode ?? 'individual'))) {
      return res.status(400).json({ ok: false, error: 'Este torneo no admite alta individual confirmada' });
    }

    const { data: player, error: pErr } = await supabase
      .from('players')
      .select('id, first_name, last_name, elo_rating, gender')
      .eq('id', playerId)
      .maybeSingle();
    if (pErr) return res.status(500).json({ ok: false, error: pErr.message });
    if (!player) return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });

    await cleanupExpiredTournamentInvites(tournamentId);
    const slots = await getTournamentSlots(tournamentId);
    if (slots.confirmedPlayers >= Number((tournament as { max_players: number }).max_players)) {
      return res.status(409).json({ ok: false, error: 'No hay cupos disponibles' });
    }

    const { data: existingIns } = await supabase
      .from('tournament_inscriptions')
      .select('id')
      .eq('tournament_id', tournamentId)
      .or(`player_id_1.eq.${playerId},player_id_2.eq.${playerId}`)
      .maybeSingle();
    if (existingIns) return res.status(409).json({ ok: false, error: 'El jugador ya está inscripto en este torneo' });

    const elo = Number((player as { elo_rating?: number }).elo_rating ?? 3.5);
    const levelModePart = String((tournament as any).level_mode ?? 'single_band');
    if (levelModePart === 'single_band') {
      const eloMin = (tournament as any).elo_min;
      const eloMax = (tournament as any).elo_max;
      if (eloMin != null && eloMax != null && (elo < eloMin || elo > eloMax)) {
        return res.status(403).json({ ok: false, error: 'El nivel Elo del jugador no está en el rango permitido' });
      }
    }
    let divisionIdPart: string | null = null;
    if (levelModePart === 'multi_division') {
      const manualDiv = req.body?.division_id != null ? String(req.body.division_id).trim() : '';
      if (manualDiv) {
        const { data: divRow } = await supabase
          .from('tournament_divisions')
          .select('id')
          .eq('id', manualDiv)
          .eq('tournament_id', tournamentId)
          .maybeSingle();
        if (!divRow) return res.status(400).json({ ok: false, error: 'division_id no válido para este torneo' });
        divisionIdPart = manualDiv;
      } else {
        divisionIdPart = await pickDivisionIdForElo(supabase, tournamentId, elo);
        if (!divisionIdPart) {
          return res.status(400).json({ ok: false, error: 'No hay categoría que encaje con el Elo del jugador; asigna division_id manualmente' });
        }
      }
    }
    if (!playerMeetsTournamentGender((tournament as { gender?: string }).gender, (player as { gender?: string }).gender)) {
      return res.status(403).json({
        ok: false,
        error: 'El género del jugador no coincide con la categoría del torneo.',
      });
    }

    const { tokenHash } = generateInviteToken();
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + Number((tournament as { invite_ttl_minutes: number }).invite_ttl_minutes) * 60000).toISOString();
    const { error: insErr } = await supabase.from('tournament_inscriptions').insert({
      tournament_id: tournamentId,
      status: 'confirmed',
      invited_at: nowIso,
      expires_at: expiresAt,
      confirmed_at: nowIso,
      player_id_1: playerId,
      token_hash: tokenHash,
      ...(divisionIdPart ? { division_id: divisionIdPart } : {}),
    });
    if (insErr) return res.status(500).json({ ok: false, error: insErr.message });

    const joinedName = `${(player as any).first_name ?? ''} ${(player as any).last_name ?? ''}`.trim() || 'Un jugador';
    await supabase.from('tournament_chat_messages').insert({
      tournament_id: tournamentId,
      author_user_id: '00000000-0000-0000-0000-000000000000',
      author_name: 'Sistema',
      message: `${joinedName} se ha unido al torneo.`,
    });
    await refreshTournamentStatus(tournamentId, { force: true, skipInviteCleanup: true });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments/{id}/inscriptions/{inscriptionId}/division:
 *   put:
 *     tags: [Tournaments]
 *     summary: Asignar categoría a una inscripción (torneo multi-división)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: inscriptionId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               division_id: { type: string, format: uuid, nullable: true, description: 'null para quitar asignación' }
 *     responses:
 *       200: { description: Actualizado }
 *       400: { description: División no pertenece al torneo }
 *       404: { description: No encontrado }
 */
router.put('/:id/inscriptions/:inscriptionId/division', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const tournamentId = req.params.id;
  const inscriptionId = req.params.inscriptionId;
  const divisionIdRaw = req.body?.division_id;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .select('id, club_id, level_mode')
      .eq('id', tournamentId)
      .maybeSingle();
    if (tErr) return res.status(500).json({ ok: false, error: tErr.message });
    if (!tournament) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (!canAccessClub(req, String((tournament as { club_id: string }).club_id))) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }
    if (String((tournament as { level_mode?: string }).level_mode ?? 'single_band') !== 'multi_division') {
      return res.status(400).json({ ok: false, error: 'Solo aplica a torneos multi-división' });
    }
    let divisionId: string | null = null;
    if (divisionIdRaw != null) {
      divisionId = String(divisionIdRaw).trim();
      const { data: div, error: dErr } = await supabase
        .from('tournament_divisions')
        .select('id')
        .eq('id', divisionId)
        .eq('tournament_id', tournamentId)
        .maybeSingle();
      if (dErr) return res.status(500).json({ ok: false, error: dErr.message });
      if (!div) return res.status(400).json({ ok: false, error: 'Categoría no válida para este torneo' });
    }
    const { data: ins, error: iErr } = await supabase
      .from('tournament_inscriptions')
      .select('id')
      .eq('id', inscriptionId)
      .eq('tournament_id', tournamentId)
      .maybeSingle();
    if (iErr) return res.status(500).json({ ok: false, error: iErr.message });
    if (!ins) return res.status(404).json({ ok: false, error: 'Inscripción no encontrada' });
    const { error: uErr } = await supabase
      .from('tournament_inscriptions')
      .update({ division_id: divisionId, updated_at: new Date().toISOString() })
      .eq('id', inscriptionId)
      .eq('tournament_id', tournamentId);
    if (uErr) return res.status(500).json({ ok: false, error: uErr.message });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments/{id}/inscriptions/{inscriptionId}:
 *   delete:
 *     tags: [Tournaments]
 *     summary: Quitar participante invitado/inscripto desde panel de club
 *     description: Elimina una inscripción del torneo (pending o confirmed) para liberar cupo y permitir invitar a otro jugador.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: inscriptionId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Participante removido }
 *       404: { description: Torneo o inscripción no encontrados }
 *       403: { description: Sin acceso al club }
 */
router.delete('/:id/inscriptions/:inscriptionId', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const tournamentId = req.params.id;
  const inscriptionId = req.params.inscriptionId;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .select('id, club_id')
      .eq('id', tournamentId)
      .maybeSingle();
    if (tErr) return res.status(500).json({ ok: false, error: tErr.message });
    if (!tournament) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (!canAccessClub(req, String((tournament as { club_id: string }).club_id))) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }

    const { data: inscription, error: iErr } = await supabase
      .from('tournament_inscriptions')
      .select(
        'id, tournament_id, status, invite_email_1, invite_email_2, players_1:players!tournament_inscriptions_player_id_1_fkey(first_name,last_name,email), players_2:players!tournament_inscriptions_player_id_2_fkey(first_name,last_name,email)'
      )
      .eq('id', inscriptionId)
      .eq('tournament_id', tournamentId)
      .maybeSingle();
    if (iErr) return res.status(500).json({ ok: false, error: iErr.message });
    if (!inscription) return res.status(404).json({ ok: false, error: 'Inscripción no encontrada' });

    const { error: delErr } = await supabase.from('tournament_inscriptions').delete().eq('id', inscriptionId).eq('tournament_id', tournamentId);
    if (delErr) return res.status(500).json({ ok: false, error: delErr.message });

    const p1 = (inscription as any).players_1;
    const p2 = (inscription as any).players_2;
    const n1 = p1 ? `${p1.first_name ?? ''} ${p1.last_name ?? ''}`.trim() : String((inscription as any).invite_email_1 ?? '').trim();
    const n2 = p2 ? `${p2.first_name ?? ''} ${p2.last_name ?? ''}`.trim() : String((inscription as any).invite_email_2 ?? '').trim();
    const removedLabel = [n1, n2].filter(Boolean).join(' / ') || 'Participante';
    await supabase.from('tournament_chat_messages').insert({
      tournament_id: tournamentId,
      author_user_id: '00000000-0000-0000-0000-000000000000',
      author_name: 'Sistema',
      message: `${removedLabel} fue removido del torneo por el organizador.`,
    });

    await refreshTournamentStatus(tournamentId, { force: true });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments/{id}/inscriptions/swap-singles:
 *   post:
 *     tags: [Tournaments]
 *     summary: Intercambiar jugadores entre dos inscripciones (modo individual)
 *     description: |
 *       Solo torneos `registration_mode = individual|both`. Intercambia `player_id_1` e `invite_email_1`
 *       entre dos filas confirmadas (cambia con quien queda emparejado al generar equipos).
 *       Si ya existía fixture generado, conviene volver a generar competición.
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
 *             required: [inscription_id_a, inscription_id_b]
 *             properties:
 *               inscription_id_a: { type: string, format: uuid }
 *               inscription_id_b: { type: string, format: uuid }
 *     responses:
 *       200: { description: Intercambio aplicado }
 *       400: { description: Modo torneo o inscripciones no válidas }
 *       403: { description: Sin acceso al club }
 *       404: { description: Torneo o inscripción no encontrada }
 */
router.post('/:id/inscriptions/swap-singles', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const tournamentId = req.params.id;
  const aId = String(req.body?.inscription_id_a ?? '').trim();
  const bId = String(req.body?.inscription_id_b ?? '').trim();
  if (!aId || !bId || aId === bId) {
    return res.status(400).json({ ok: false, error: 'inscription_id_a e inscription_id_b distintos son obligatorios' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .select('id, club_id, registration_mode, status')
      .eq('id', tournamentId)
      .maybeSingle();
    if (tErr) return res.status(500).json({ ok: false, error: tErr.message });
    if (!tournament) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (!canAccessClub(req, String((tournament as { club_id: string }).club_id))) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }
    if (!['individual', 'both'].includes(String((tournament as { registration_mode?: string }).registration_mode ?? 'individual'))) {
      return res.status(400).json({ ok: false, error: 'Solo disponible en torneos modo individual o ambos' });
    }
    if (String((tournament as { status: string }).status) === 'cancelled') {
      return res.status(400).json({ ok: false, error: 'Torneo cancelado' });
    }

    const { data: rows, error: qErr } = await supabase
      .from('tournament_inscriptions')
      .select('id, status, player_id_1, player_id_2, invite_email_1')
      .eq('tournament_id', tournamentId)
      .in('id', [aId, bId]);
    if (qErr) return res.status(500).json({ ok: false, error: qErr.message });
    if (!rows || rows.length !== 2) {
      return res.status(404).json({ ok: false, error: 'No se encontraron las dos inscripciones en este torneo' });
    }
    const rowA = rows.find((r: any) => r.id === aId) as any;
    const rowB = rows.find((r: any) => r.id === bId) as any;
    if (String(rowA.status) !== 'confirmed' || String(rowB.status) !== 'confirmed') {
      return res.status(400).json({ ok: false, error: 'Ambas inscripciones deben estar confirmadas' });
    }
    if (!rowA.player_id_1 || !rowB.player_id_1) {
      return res.status(400).json({ ok: false, error: 'Ambas inscripciones deben tener jugador asignado' });
    }
    if (rowA.player_id_2 != null || rowB.player_id_2 != null) {
      return res.status(400).json({ ok: false, error: 'Intercambio solo aplica a inscripciones de un jugador (modo individual)' });
    }

    const now = new Date().toISOString();
    const p1a = rowA.player_id_1;
    const e1a = rowA.invite_email_1;
    const p1b = rowB.player_id_1;
    const e1b = rowB.invite_email_1;

    const { error: u1 } = await supabase
      .from('tournament_inscriptions')
      .update({
        player_id_1: p1b,
        invite_email_1: e1b != null ? String(e1b).trim().toLowerCase() : null,
        updated_at: now,
      })
      .eq('id', aId)
      .eq('tournament_id', tournamentId);
    if (u1) return res.status(500).json({ ok: false, error: u1.message });
    const { error: u2 } = await supabase
      .from('tournament_inscriptions')
      .update({
        player_id_1: p1a,
        invite_email_1: e1a != null ? String(e1a).trim().toLowerCase() : null,
        updated_at: now,
      })
      .eq('id', bId)
      .eq('tournament_id', tournamentId);
    if (u2) return res.status(500).json({ ok: false, error: u2.message });

    await supabase.from('tournament_chat_messages').insert({
      tournament_id: tournamentId,
      author_user_id: '00000000-0000-0000-0000-000000000000',
      author_name: 'Sistema',
      message: 'El organizador ha ajustado emparejamientos entre jugadores (inscripciones actualizadas).',
    });
    await refreshTournamentStatus(tournamentId, { force: true });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments/{id}/inscriptions/singles-pairing:
 *   put:
 *     tags: [Tournaments]
 *     summary: Aplicar distribución de jugadores en inscripciones (modo individual)
 *     description: |
 *       Reasigna qué jugador ocupa cada inscripción confirmada (una plaza por fila, sin `player_id_2`).
 *       Debe ser una permutación del estado actual: mismas inscripciones y mismos jugadores.
 *       Útil para definir parejas de forma explícita antes de generar el cuadro.
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
 *             required: [assignments]
 *             properties:
 *               assignments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [inscription_id, player_id]
 *                   properties:
 *                     inscription_id: { type: string, format: uuid }
 *                     player_id: { type: string, format: uuid }
 *     responses:
 *       200: { description: Distribución guardada }
 *       400: { description: Datos inválidos o no es permutación válida }
 *       403: { description: Sin acceso al club }
 *       404: { description: Torneo no encontrado }
 */
router.put('/:id/inscriptions/singles-pairing', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const tournamentId = req.params.id;
  const raw = req.body?.assignments;
  if (!Array.isArray(raw) || raw.length === 0) {
    return res.status(400).json({ ok: false, error: 'assignments debe ser un array no vacío' });
  }
  const assignments = raw.map((x: { inscription_id?: string; player_id?: string }) => ({
    inscription_id: String(x?.inscription_id ?? '').trim(),
    player_id: String(x?.player_id ?? '').trim(),
  }));
  if (assignments.some((a) => !a.inscription_id || !a.player_id)) {
    return res.status(400).json({ ok: false, error: 'Cada elemento requiere inscription_id y player_id' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .select('id, club_id, registration_mode, status')
      .eq('id', tournamentId)
      .maybeSingle();
    if (tErr) return res.status(500).json({ ok: false, error: tErr.message });
    if (!tournament) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (!canAccessClub(req, String((tournament as { club_id: string }).club_id))) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }
    if (!['individual', 'both'].includes(String((tournament as { registration_mode?: string }).registration_mode ?? 'individual'))) {
      return res.status(400).json({ ok: false, error: 'Solo disponible en torneos modo individual o ambos' });
    }
    if (String((tournament as { status: string }).status) === 'cancelled') {
      return res.status(400).json({ ok: false, error: 'Torneo cancelado' });
    }

    const { data: rows, error: qErr } = await supabase
      .from('tournament_inscriptions')
      .select('id, player_id_1, player_id_2, status, invite_email_1')
      .eq('tournament_id', tournamentId)
      .eq('status', 'confirmed');
    if (qErr) return res.status(500).json({ ok: false, error: qErr.message });

    const singles = (rows ?? []).filter((r: any) => r.player_id_2 == null && r.player_id_1);
    const expectedIds = new Set(singles.map((r: any) => String(r.id)));
    const incomingIds = new Set(assignments.map((a) => a.inscription_id));
    if (incomingIds.size !== assignments.length) {
      return res.status(400).json({ ok: false, error: 'inscription_id duplicados en el cuerpo' });
    }
    if (new Set(assignments.map((a) => a.player_id)).size !== assignments.length) {
      return res.status(400).json({ ok: false, error: 'player_id duplicados en el cuerpo' });
    }
    if (expectedIds.size !== incomingIds.size || [...expectedIds].some((id) => !incomingIds.has(id))) {
      return res.status(400).json({ ok: false, error: 'Debes incluir exactamente cada inscripción confirmada (modo individual, una plaza)' });
    }

    const currentPlayers = singles.map((r: any) => String(r.player_id_1)).filter(Boolean).sort();
    const newPlayers = assignments.map((a) => a.player_id).sort();
    if (currentPlayers.length !== newPlayers.length || currentPlayers.join(',') !== newPlayers.join(',')) {
      return res.status(400).json({ ok: false, error: 'El conjunto de jugadores debe coincidir con las inscripciones actuales' });
    }

    const now = new Date().toISOString();

    for (const a of assignments) {
      const row = singles.find((r: any) => String(r.id) === a.inscription_id) as
        | { player_id_1?: string | null; invite_email_1?: string | null }
        | undefined;
      const currentPid = row ? (row as any).player_id_1 : null;
      let emailForClear: string | null = null;
      if (currentPid) {
        const { data: pl } = await supabase.from('players').select('email').eq('id', currentPid).maybeSingle();
        const em = (pl as { email?: string } | null)?.email;
        emailForClear = em && String(em).trim() ? String(em).trim().toLowerCase() : null;
      }
      if (!emailForClear && row?.invite_email_1) {
        const em = (row as any).invite_email_1;
        emailForClear = em && String(em).trim() ? String(em).trim().toLowerCase() : null;
      }
      if (!emailForClear) {
        return res.status(400).json({
          ok: false,
          error: 'Falta email de invitación en una inscripción; no se puede reasignar de forma segura',
        });
      }

      const { error: u1 } = await supabase
        .from('tournament_inscriptions')
        .update({
          player_id_1: null,
          invite_email_1: emailForClear,
          updated_at: now,
        })
        .eq('id', a.inscription_id)
        .eq('tournament_id', tournamentId);
      if (u1) return res.status(500).json({ ok: false, error: u1.message });
    }

    for (const a of assignments) {
      const { data: pl } = await supabase.from('players').select('email').eq('id', a.player_id).maybeSingle();
      const em = (pl as { email?: string } | null)?.email;
      const inviteEmail = em && String(em).trim() ? String(em).trim().toLowerCase() : null;
      const { error: u2 } = await supabase
        .from('tournament_inscriptions')
        .update({
          player_id_1: a.player_id,
          invite_email_1: inviteEmail,
          updated_at: now,
        })
        .eq('id', a.inscription_id)
        .eq('tournament_id', tournamentId);
      if (u2) return res.status(500).json({ ok: false, error: u2.message });
    }

    await supabase.from('tournament_chat_messages').insert({
      tournament_id: tournamentId,
      author_user_id: '00000000-0000-0000-0000-000000000000',
      author_name: 'Sistema',
      message: 'El organizador ha redefinido la distribución de jugadores en las inscripciones (modo individual).',
    });
    await refreshTournamentStatus(tournamentId, { force: true });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments/{id}/inscriptions/{inscriptionId}/assign-partner:
 *   post:
 *     tags: [Tournaments]
 *     summary: Asignar segundo jugador a una pareja (modo parejas)
 *     description: Completa `player_id_2` cuando la pareja estaba incompleta. El jugador no debe estar ya inscrito en el torneo.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: inscriptionId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [player_id]
 *             properties:
 *               player_id: { type: string, format: uuid }
 *     responses:
 *       200: { description: Compañero asignado }
 *       400: { description: Datos inválidos }
 *       403: { description: Sin acceso }
 *       404: { description: No encontrado }
 *       409: { description: Jugador ya inscrito }
 */
router.post('/:id/inscriptions/:inscriptionId/assign-partner', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const tournamentId = req.params.id;
  const inscriptionId = req.params.inscriptionId;
  const partnerId = String(req.body?.player_id ?? '').trim();
  if (!partnerId) return res.status(400).json({ ok: false, error: 'player_id es obligatorio' });
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .select('id, club_id, registration_mode, status, elo_min, elo_max, gender, max_players')
      .eq('id', tournamentId)
      .maybeSingle();
    if (tErr) return res.status(500).json({ ok: false, error: tErr.message });
    if (!tournament) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (!canAccessClub(req, String((tournament as { club_id: string }).club_id))) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }
    if (!['pair', 'both'].includes(String((tournament as { registration_mode?: string }).registration_mode))) {
      return res.status(400).json({ ok: false, error: 'Solo en torneos modo parejas o ambos' });
    }
    if (String((tournament as { status: string }).status) !== 'open') {
      return res.status(400).json({ ok: false, error: 'El torneo no está abierto' });
    }

    const { data: ins, error: iErr } = await supabase
      .from('tournament_inscriptions')
      .select('id, status, player_id_1, player_id_2')
      .eq('id', inscriptionId)
      .eq('tournament_id', tournamentId)
      .maybeSingle();
    if (iErr) return res.status(500).json({ ok: false, error: iErr.message });
    if (!ins) return res.status(404).json({ ok: false, error: 'Inscripción no encontrada' });
    const st = String((ins as any).status);
    if (!['pending', 'confirmed'].includes(st)) {
      return res.status(400).json({ ok: false, error: 'Inscripción no editable' });
    }
    if (!(ins as any).player_id_1) {
      return res.status(400).json({ ok: false, error: 'La inscripción debe tener primer jugador' });
    }
    if ((ins as any).player_id_2) {
      return res.status(400).json({ ok: false, error: 'La pareja ya está completa' });
    }
    if (String((ins as any).player_id_1) === partnerId) {
      return res.status(400).json({ ok: false, error: 'El compañero debe ser distinto al primer jugador' });
    }

    const { data: dup1 } = await supabase
      .from('tournament_inscriptions')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('player_id_1', partnerId)
      .maybeSingle();
    const { data: dup2 } = await supabase
      .from('tournament_inscriptions')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('player_id_2', partnerId)
      .maybeSingle();
    if (dup1 || dup2) {
      return res.status(409).json({ ok: false, error: 'Ese jugador ya está inscrito en el torneo' });
    }

    const { data: partner, error: pErr } = await supabase
      .from('players')
      .select('id, email, elo_rating, gender, first_name, last_name')
      .eq('id', partnerId)
      .maybeSingle();
    if (pErr) return res.status(500).json({ ok: false, error: pErr.message });
    if (!partner) return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });

    const elo = Number((partner as any).elo_rating ?? 3.5);
    const eloMin = (tournament as any).elo_min;
    const eloMax = (tournament as any).elo_max;
    if (eloMin != null && eloMax != null && (elo < eloMin || elo > eloMax)) {
      return res.status(403).json({ ok: false, error: 'El Elo del jugador no está en el rango del torneo' });
    }
    if (
      !playerMeetsTournamentGender(
        (tournament as { gender?: string }).gender,
        (partner as { gender?: string }).gender
      )
    ) {
      return res.status(403).json({ ok: false, error: 'El género del jugador no coincide con la categoría del torneo' });
    }

    await cleanupExpiredTournamentInvites(tournamentId);
    const slots = await getTournamentSlots(tournamentId);
    if (slots.confirmedPlayers >= Number((tournament as { max_players: number }).max_players)) {
      return res.status(409).json({ ok: false, error: 'No hay cupos disponibles' });
    }

    const email = String((partner as any).email ?? '').trim().toLowerCase();
    const now = new Date().toISOString();
    const { error: upErr } = await supabase
      .from('tournament_inscriptions')
      .update({
        player_id_2: partnerId,
        invite_email_2: email || null,
        status: 'confirmed',
        confirmed_at: now,
        updated_at: now,
      })
      .eq('id', inscriptionId)
      .eq('tournament_id', tournamentId);
    if (upErr) return res.status(500).json({ ok: false, error: upErr.message });

    const name = `${(partner as any).first_name ?? ''} ${(partner as any).last_name ?? ''}`.trim() || 'Jugador';
    await supabase.from('tournament_chat_messages').insert({
      tournament_id: tournamentId,
      author_user_id: '00000000-0000-0000-0000-000000000000',
      author_name: 'Sistema',
      message: `${name} se ha unido como compañero de pareja en el torneo.`,
    });
    await refreshTournamentStatus(tournamentId, { force: true, skipInviteCleanup: true });
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
      .select('id, club_id, name, start_at, end_at, duration_min, price_cents, prize_total_cents, prizes, currency, visibility, gender, max_players, status, description, normas, poster_url, level_mode')
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
      .select('id, visibility, status, max_players, invite_ttl_minutes, gender, elo_min, elo_max, level_mode')
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

    const { data: joinPlayer } = await supabase.from('players').select('gender, elo_rating').eq('id', auth.playerId).maybeSingle();
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

    const playerElo = Number((joinPlayer as { elo_rating?: number } | null)?.elo_rating ?? 0);
    const levelMode = String((tournament as any).level_mode ?? 'single_band');
    if (levelMode === 'single_band') {
      const emin = (tournament as any).elo_min != null ? Number((tournament as any).elo_min) : null;
      const emax = (tournament as any).elo_max != null ? Number((tournament as any).elo_max) : null;
      if (emin != null && playerElo < emin) {
        return res.status(400).json({ ok: false, error: 'Tu Elo está por debajo del mínimo de este torneo' });
      }
      if (emax != null && playerElo > emax) {
        return res.status(400).json({ ok: false, error: 'Tu Elo supera el máximo de este torneo' });
      }
    }
    let divisionId: string | null = null;
    if (levelMode === 'multi_division') {
      divisionId = await pickDivisionIdForElo(supabase, tournamentId, playerElo);
      if (!divisionId) {
        return res.status(400).json({ ok: false, error: 'No hay una categoría definida para tu nivel (Elo)' });
      }
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
      ...(divisionId ? { division_id: divisionId } : {}),
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
    await refreshTournamentStatus(tournamentId, { force: true, skipInviteCleanup: true });
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
    await refreshTournamentStatus(tournamentId, { force: true, skipInviteCleanup: true });
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
      .select('id, visibility, status, max_players, invite_ttl_minutes, registration_mode, elo_min, elo_max, gender, level_mode')
      .eq('id', tournamentId)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!tournament) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (String((tournament as any).visibility) !== 'public') {
      return res.status(403).json({ ok: false, error: 'Solo torneos públicos permiten unión directa por parejas' });
    }
    if (!['pair', 'both'].includes(String((tournament as any).registration_mode))) {
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
    const levelModePair = String((tournament as any).level_mode ?? 'single_band');
    if (levelModePair === 'single_band') {
      const eloMin = (tournament as any).elo_min;
      const eloMax = (tournament as any).elo_max;
      if (eloMin != null && eloMax != null && (elo < eloMin || elo > eloMax)) {
        return res.status(403).json({ ok: false, error: 'Tu nivel Elo no está en el rango permitido' });
      }
    }
    let divisionIdPair: string | null = null;
    if (levelModePair === 'multi_division') {
      divisionIdPair = await pickDivisionIdForElo(supabase, tournamentId, elo);
      if (!divisionIdPair) {
        return res.status(400).json({ ok: false, error: 'No hay una categoría definida para tu nivel (Elo)' });
      }
    }
    if (!playerMeetsTournamentGender((tournament as { gender?: string }).gender, (me as { gender?: string } | null)?.gender)) {
      return res.status(403).json({
        ok: false,
        error: 'Tu género en el perfil no coincide con la categoría del torneo. Actualiza tu perfil o elige un torneo mixto.',
      });
    }

    const { token, tokenHash } = generateInviteToken();
    const inviteUrl = buildTournamentInviteUrl(tournamentId, token);
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
      ...(divisionIdPair ? { division_id: divisionIdPair } : {}),
    });
    if (insErr) return res.status(500).json({ ok: false, error: insErr.message });

    await sendInviteEmail(teammateEmail, inviteUrl, 'Tu club');
    await refreshTournamentStatus(tournamentId, { force: true, skipInviteCleanup: true });
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
    await refreshTournamentStatus(tournamentId, { force: true });
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

/**
 * @openapi
 * /tournaments/{id}/competition/setup:
 *   post:
 *     tags: [TournamentsCompetition]
 *     summary: Configurar formato competitivo del torneo
 *     description: Define formato, reglas de partido (sets) y reglas de tabla para el motor competitivo.
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
 *             required: [format]
 *             properties:
 *               format:
 *                 type: string
 *                 enum: [single_elim, group_playoff, round_robin]
 *               match_rules:
 *                 type: object
 *                 properties:
 *                   best_of_sets: { type: integer, example: 3 }
 *                   allow_draws: { type: boolean, example: false }
 *                   bracket_seed_strategy:
 *                     type: string
 *                     enum: [registration_order, random, elo_snake, elo_top_vs_bottom, elo_tier_mid]
 *                     description: Orden de equipos al generar el cuadro automático
 *               standings_rules:
 *                 type: object
 *                 properties:
 *                   group_size: { type: integer, example: 4 }
 *                   qualifiers_per_group: { type: integer, example: 2 }
 *           examples:
 *             sample:
 *               value:
 *                 format: group_playoff
 *                 match_rules: { best_of_sets: 3, allow_draws: false }
 *                 standings_rules: { group_size: 4, qualifiers_per_group: 2 }
 *     responses:
 *       200: { description: Configuración guardada }
 *       400: { description: Formato inválido }
 *       403: { description: Sin permisos sobre el club }
 *       404: { description: Torneo no encontrado }
 */
router.post('/:id/competition/setup', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const tournamentId = req.params.id;
  const body = req.body ?? {};
  const format = String(body.format ?? '').trim() as CompetitionFormat;
  if (!['single_elim', 'group_playoff', 'round_robin'].includes(format)) {
    return res.status(400).json({ ok: false, error: 'format debe ser single_elim, group_playoff o round_robin' });
  }
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: t } = await supabase.from('tournaments').select('id,club_id').eq('id', tournamentId).maybeSingle();
    if (!t) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (!canAccessClub(req, String((t as any).club_id))) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    await setupTournamentCompetition({
      tournamentId,
      format,
      matchRules: body.match_rules ?? {},
      standingsRules: body.standings_rules ?? {},
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments/{id}/competition/generate:
 *   post:
 *     tags: [TournamentsCompetition]
 *     summary: Generar fixtures de competencia
 *     description: Crea equipos desde inscripciones confirmadas y genera partidos según formato configurado.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Fixtures generados
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value: { ok: true, teams_count: 8, matches_count: 7 }
 *       400: { description: No hay parejas suficientes o configuración inválida }
 *       403: { description: Sin permisos }
 *       404: { description: Torneo no encontrado }
 */
router.post('/:id/competition/generate', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const tournamentId = req.params.id;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: t } = await supabase.from('tournaments').select('id,club_id').eq('id', tournamentId).maybeSingle();
    if (!t) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (!canAccessClub(req, String((t as any).club_id))) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    const data = await generateTournamentFixtures(tournamentId);
    return res.json({ ok: true, ...data });
  } catch (err) {
    return res.status(400).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments/{id}/competition/generate-manual:
 *   post:
 *     tags: [TournamentsCompetition]
 *     summary: Generar cuadro en orden manual (eliminación directa)
 *     description: |
 *       Construye equipos y el cuadro según el orden indicado en `team_keys` (primera ronda: parejas consecutivas).
 *       Claves: `pair:{inscription_id}` o `ind:{inscription_id}:{inscription_id}` (modo individual), o UUID de `tournament_teams` si ya existía un cuadro.
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
 *             required: [team_keys]
 *             properties:
 *               team_keys:
 *                 type: array
 *                 items: { type: string }
 *                 description: Orden de equipos en el bracket (cada dos forman un cruce de R1)
 *           examples:
 *             sample:
 *               value:
 *                 team_keys: ['pair:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ind:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb:cccccccc-cccc-cccc-cccc-cccccccccccc']
 *     responses:
 *       200:
 *         description: Cuadro generado
 *         content:
 *           application/json:
 *             examples:
 *               ok:
 *                 value: { ok: true, teams_count: 4, matches_count: 3 }
 *       400: { description: Formato no compatible o datos inválidos }
 *       403: { description: Sin permisos }
 *       404: { description: Torneo no encontrado }
 */
router.post('/:id/competition/generate-manual', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const tournamentId = req.params.id;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: t } = await supabase.from('tournaments').select('id,club_id').eq('id', tournamentId).maybeSingle();
    if (!t) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (!canAccessClub(req, String((t as any).club_id))) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    const teamKeys = Array.isArray(req.body?.team_keys) ? req.body.team_keys.map((x: unknown) => String(x)) : [];
    const data = await generateTournamentFixturesManual(tournamentId, teamKeys);
    return res.json({ ok: true, ...data });
  } catch (err) {
    return res.status(400).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments/{id}/competition/admin-view:
 *   get:
 *     tags: [TournamentsCompetition]
 *     summary: Vista completa de competencia para administración
 *     description: Devuelve equipos, fases, grupos, partidos con resultados y tabla/standings.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Vista de competencia }
 *       403: { description: Sin permisos }
 *       404: { description: Torneo no encontrado }
 */
router.get('/:id/competition/admin-view', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const tournamentId = req.params.id;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: t } = await supabase.from('tournaments').select('id,club_id').eq('id', tournamentId).maybeSingle();
    if (!t) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (!canAccessClub(req, String((t as any).club_id))) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    const view = await getCompetitionView(tournamentId);
    return res.json({ ok: true, ...view });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments/{id}/matches/{matchId}/result:
 *   post:
 *     tags: [TournamentsCompetition]
 *     summary: Cargar o corregir resultado de un partido
 *     description: Registra sets y ganador del partido. Si override=true permite corregir resultados ya finalizados.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: matchId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sets]
 *             properties:
 *               sets:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [games_a, games_b]
 *                   properties:
 *                     games_a: { type: integer, minimum: 0, example: 6 }
 *                     games_b: { type: integer, minimum: 0, example: 4 }
 *               override:
 *                 type: boolean
 *                 description: true para corregir resultado finalizado
 *           examples:
 *             sample:
 *               value:
 *                 sets:
 *                   - { games_a: 6, games_b: 3 }
 *                   - { games_a: 4, games_b: 6 }
 *                   - { games_a: 6, games_b: 2 }
 *                 override: false
 *     responses:
 *       200: { description: Resultado guardado }
 *       400: { description: Resultado inválido o partido no editable }
 *       403: { description: Sin permisos }
 *       404: { description: Torneo no encontrado }
 */
router.post('/:id/matches/:matchId/result', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const tournamentId = req.params.id;
  const matchId = req.params.matchId;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: t } = await supabase.from('tournaments').select('id,club_id').eq('id', tournamentId).maybeSingle();
    if (!t) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (!canAccessClub(req, String((t as any).club_id))) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    const result = await saveMatchResult({
      tournamentId,
      matchId,
      sets: Array.isArray(req.body?.sets) ? req.body.sets : [],
      override: Boolean(req.body?.override),
      submittedByUserId: req.authContext?.userId ?? null,
    });
    const standings = await computeStandings(tournamentId);
    return res.json({ ok: true, ...result, standings });
  } catch (err) {
    return res.status(400).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments/{id}/podium:
 *   put:
 *     tags: [TournamentsCompetition]
 *     summary: Definir podio manual del torneo
 *     description: |
 *       Guarda equipos por puesto (1 = mejor). Hasta 3 puestos; en la UI el club puede usar solo el 1.er
 *       o añadir 2.º y 3.er de forma opcional. No depende del array `prizes`.
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
 *             required: [podium]
 *             properties:
 *               podium:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [position, team_id]
 *                   properties:
 *                     position: { type: integer, minimum: 1, maximum: 3 }
 *                     team_id: { type: string, format: uuid }
 *                     note: { type: string, nullable: true }
 *           examples:
 *             sample:
 *               value:
 *                 podium:
 *                   - { position: 1, team_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", note: "Campeón" }
 *                   - { position: 2, team_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", note: "Subcampeón" }
 *                   - { position: 3, team_id: "cccccccc-cccc-cccc-cccc-cccccccccccc", note: "3.er puesto" }
 *     responses:
 *       200: { description: Podio guardado }
 *       400: { description: Podio inválido }
 *       403: { description: Sin permisos }
 *       404: { description: Torneo no encontrado }
 */
router.put('/:id/podium', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const tournamentId = req.params.id;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: t } = await supabase.from('tournaments').select('id,club_id').eq('id', tournamentId).maybeSingle();
    if (!t) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (!canAccessClub(req, String((t as any).club_id))) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    const podiumRows = Array.isArray(req.body?.podium) ? req.body.podium : [];
    await saveManualPodium({
      tournamentId,
      rows: podiumRows,
      createdByUserId: req.authContext?.userId ?? null,
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments/{id}/competition/public-view:
 *   get:
 *     tags: [TournamentsCompetition]
 *     summary: Vista read-only de competencia para jugador
 *     description: Devuelve cuadro/grupos/liga, resultados, tabla y podio para el jugador autenticado.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Vista pública de competencia }
 *       401: { description: Token requerido/expirado }
 *       403: { description: Torneo privado sin acceso }
 *       404: { description: Torneo no encontrado }
 */
router.get('/:id/competition/public-view', async (req: Request, res: Response) => {
  const tournamentId = req.params.id;
  const auth = await getPlayerIdFromBearer(req);
  if (auth.error || !auth.playerId) return res.status(401).json({ ok: false, error: auth.error ?? 'Token requerido' });
  try {
    const ctx = await getTournamentForPlayer(tournamentId, auth.playerId);
    if (ctx.error) return res.status(ctx.error === 'Torneo no encontrado' ? 404 : 500).json({ ok: false, error: ctx.error });
    const visibility = String((ctx.tournament as { visibility?: string }).visibility ?? 'private');
    if (visibility !== 'public' && !ctx.myInscription) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a la competencia de este torneo' });
    }
    const view = await getCompetitionView(tournamentId);
    return res.json({ ok: true, ...view });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
