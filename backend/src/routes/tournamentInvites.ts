import { Router, Request, Response } from 'express';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdmin } from '../middleware/requireClubOwnerOrAdmin';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { generateInviteToken, hashInviteToken } from '../lib/inviteToken';
import { getFrontendUrl } from '../lib/env';
import { sendInviteEmail } from '../lib/mailer';
import { cleanupExpiredTournamentInvites, getTournamentSlots, refreshTournamentStatus } from '../services/tournamentsService';

const router = Router();
router.use(attachAuthContext);

function canAccessClub(req: Request, clubId: string): boolean {
  if (req.authContext?.adminId) return true;
  return req.authContext?.allowedClubIds?.includes(clubId) ?? false;
}

function validEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim());
}

/**
 * @openapi
 * /tournaments/{id}/invites:
 *   post:
 *     tags: [Tournaments]
 *     summary: Invitar participantes por email
 *     description: Crea inscripciones pendientes con `invited_at`, reserva cupo temporal (TTL) y env?a email.
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
 *             required: [invites]
 *             properties:
 *               invites:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [email_1]
 *                   properties:
 *                     email_1: { type: string, format: email }
 *                     email_2: { type: string, format: email, nullable: true }
 *           examples:
 *             sample:
 *               value:
 *                 invites:
 *                   - email_1: "jugador1@padel.local"
 *                   - email_1: "jugador2@padel.local"
 *                     email_2: "jugador3@padel.local"
 *     responses:
 *       200: { description: Invitaciones creadas }
 *       409: { description: Sin cupos disponibles }
 */
router.post('/:id/invites', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const tournamentId = req.params.id;
  const invites = Array.isArray(req.body?.invites) ? req.body.invites : [];
  if (!invites.length) return res.status(400).json({ ok: false, error: 'invites es obligatorio' });
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: tournament, error } = await supabase
      .from('tournaments')
      .select('id, club_id, max_players, invite_ttl_minutes, registration_mode, status')
      .eq('id', tournamentId)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!tournament) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (!canAccessClub(req, String((tournament as { club_id: string }).club_id))) {
      return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
    }
    if (String((tournament as { status: string }).status) !== 'open') {
      return res.status(400).json({ ok: false, error: 'El torneo no est? abierto para invitaciones' });
    }

    await cleanupExpiredTournamentInvites(tournamentId);
    const slots = await getTournamentSlots(tournamentId);
    const currentPlayers = slots.confirmedPlayers + slots.pendingPlayers;
    const incomingPlayers = invites.reduce((acc: number, it: any) => acc + (it.email_2 ? 2 : 1), 0);
    if (currentPlayers + incomingPlayers > Number((tournament as { max_players: number }).max_players)) {
      return res.status(409).json({ ok: false, error: 'No hay cupos suficientes para esas invitaciones' });
    }

    const now = Date.now();
    const ttlMs = Number((tournament as { invite_ttl_minutes: number }).invite_ttl_minutes) * 60 * 1000;
    let sent = 0;
    let failed = 0;
    const rows: Record<string, unknown>[] = [];
    for (const item of invites) {
      const email1 = String(item.email_1 ?? '').trim().toLowerCase();
      const email2 = item.email_2 ? String(item.email_2).trim().toLowerCase() : null;
      if (!validEmail(email1) || (email2 && !validEmail(email2))) {
        return res.status(400).json({ ok: false, error: 'Email inv?lido en invites' });
      }
      const { token, tokenHash } = generateInviteToken();
      const inviteUrl = `${getFrontendUrl()}/torneos/invite?tournament_id=${tournamentId}&token=${token}`;
      rows.push({
        tournament_id: tournamentId,
        status: 'pending',
        invited_at: new Date(now).toISOString(),
        expires_at: new Date(now + ttlMs).toISOString(),
        invite_email_1: email1,
        invite_email_2: email2,
        token_hash: tokenHash,
        invite_url: inviteUrl,
      });
    }
    const { error: insErr } = await supabase.from('tournament_inscriptions').insert(rows);
    if (insErr) return res.status(500).json({ ok: false, error: insErr.message });

    for (const row of rows) {
      const clubName = 'Tu club';
      const to1 = String(row.invite_email_1 ?? '');
      const send1 = await sendInviteEmail(to1, String(row.invite_url), clubName);
      if (send1.sent) sent += 1;
      else failed += 1;
      if (row.invite_email_2) {
        const send2 = await sendInviteEmail(String(row.invite_email_2), String(row.invite_url), clubName);
        if (send2.sent) sent += 1;
        else failed += 1;
      }
    }
    await refreshTournamentStatus(tournamentId);
    return res.json({
      ok: true,
      created: rows.length,
      email_sent: sent,
      email_failed: failed,
      invite_urls: rows.map((r) => String(r.invite_url)),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * @openapi
 * /tournaments/invites/{token}/accept:
 *   post:
 *     tags: [Tournaments]
 *     summary: Aceptar invitaci?n de torneo
 *     description: Confirma una invitaci?n por token. Si no existe jugador, se crea registro temporal en players.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *               first_name: { type: string, nullable: true }
 *               last_name: { type: string, nullable: true }
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Invitaci?n confirmada }
 *       400: { description: Token inv?lido o expirado }
 */
router.post('/invites/:token/accept', async (req: Request, res: Response) => {
  const token = String(req.params.token ?? '').trim();
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!token || !validEmail(email)) return res.status(400).json({ ok: false, error: 'token y email v?lidos son obligatorios' });
  try {
    const supabase = getSupabaseServiceRoleClient();
    const tokenHash = hashInviteToken(token);
    const { data: inscription, error } = await supabase
      .from('tournament_inscriptions')
      .select('id, tournament_id, status, expires_at, invite_email_1, invite_email_2, player_id_1, player_id_2')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!inscription) return res.status(400).json({ ok: false, error: 'Invitaci?n inv?lida' });
    if (new Date(String((inscription as { expires_at: string }).expires_at)).getTime() <= Date.now()) {
      return res.status(400).json({ ok: false, error: 'Invitaci?n expirada' });
    }
    if (String((inscription as { status: string }).status) === 'confirmed') {
      return res.json({ ok: true, already_confirmed: true });
    }

    const { data: tournament } = await supabase
      .from('tournaments')
      .select('id, status, max_players, elo_min, elo_max')
      .eq('id', (inscription as { tournament_id: string }).tournament_id)
      .maybeSingle();
    if (!tournament) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    if (String((tournament as { status: string }).status) !== 'open') {
      return res.status(400).json({ ok: false, error: 'El torneo no est? abierto' });
    }

    await cleanupExpiredTournamentInvites((inscription as { tournament_id: string }).tournament_id);
    const slots = await getTournamentSlots((inscription as { tournament_id: string }).tournament_id);
    const currentPlayers = slots.confirmedPlayers + slots.pendingPlayers;
    const thisPlayers = (inscription as { invite_email_2?: string | null }).invite_email_2 ? 2 : 1;
    if (currentPlayers - thisPlayers + thisPlayers > Number((tournament as { max_players: number }).max_players)) {
      return res.status(409).json({ ok: false, error: 'No hay cupos disponibles' });
    }

    const { data: existingPlayer } = await supabase.from('players').select('id, elo_rating').eq('email', email).maybeSingle();
    let player1Id = (inscription as any).player_id_1 ?? null;
    let player2Id = (inscription as any).player_id_2 ?? null;
    if (!existingPlayer) {
      const firstName = req.body?.first_name ? String(req.body.first_name) : 'Invitado';
      const lastName = req.body?.last_name ? String(req.body.last_name) : 'Torneo';
      const { data: newPlayer, error: plErr } = await supabase
        .from('players')
        .insert({ first_name: firstName, last_name: lastName, email, status: 'active' })
        .select('id, elo_rating')
        .single();
      if (plErr) return res.status(500).json({ ok: false, error: plErr.message });
      if (
        String((inscription as any).invite_email_1 ?? '').toLowerCase() === email &&
        !player1Id
      ) player1Id = newPlayer.id;
      if (
        String((inscription as any).invite_email_2 ?? '').toLowerCase() === email &&
        !player2Id
      ) player2Id = newPlayer.id;
    } else {
      if (
        String((inscription as any).invite_email_1 ?? '').toLowerCase() === email &&
        !player1Id
      ) player1Id = existingPlayer.id;
      if (
        String((inscription as any).invite_email_2 ?? '').toLowerCase() === email &&
        !player2Id
      ) player2Id = existingPlayer.id;
      const elo = Number(existingPlayer.elo_rating ?? 1200);
      const eloMin = (tournament as any).elo_min;
      const eloMax = (tournament as any).elo_max;
      if (eloMin != null && eloMax != null && (elo < eloMin || elo > eloMax)) {
        return res.status(403).json({ ok: false, error: 'Tu nivel Elo no est? en el rango permitido' });
      }
    }

    const status = player1Id && ((inscription as any).invite_email_2 ? player2Id : true) ? 'confirmed' : 'pending';
    let joinedNames: string[] = [];
    if (status === 'confirmed') {
      if (player1Id) {
        const { data: p1 } = await supabase.from('players').select('first_name,last_name').eq('id', player1Id).maybeSingle();
        if (p1) joinedNames.push(`${(p1 as any).first_name ?? ''} ${(p1 as any).last_name ?? ''}`.trim());
      }
      if ((inscription as any).invite_email_2 && player2Id) {
        const { data: p2 } = await supabase.from('players').select('first_name,last_name').eq('id', player2Id).maybeSingle();
        if (p2) joinedNames.push(`${(p2 as any).first_name ?? ''} ${(p2 as any).last_name ?? ''}`.trim());
      }
      joinedNames = joinedNames.filter(Boolean);
    }
    const { error: upErr } = await supabase
      .from('tournament_inscriptions')
      .update({
        updated_at: new Date().toISOString(),
        status,
        player_id_1: player1Id,
        player_id_2: player2Id,
        confirmed_at: status === 'confirmed' ? new Date().toISOString() : null,
      })
      .eq('id', (inscription as any).id);
    if (upErr) return res.status(500).json({ ok: false, error: upErr.message });

    if (status === 'confirmed' && joinedNames.length > 0) {
      await supabase.from('tournament_chat_messages').insert({
        tournament_id: (inscription as any).tournament_id,
        author_user_id: '00000000-0000-0000-0000-000000000000',
        author_name: 'Sistema',
        message: `${joinedNames.join(' y ')} se ha unido al torneo.`,
      });
    }

    await refreshTournamentStatus((inscription as any).tournament_id);
    return res.json({ ok: true, status });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
