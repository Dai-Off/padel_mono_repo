import { Router, Request, Response } from 'express';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdmin } from '../middleware/requireClubOwnerOrAdmin';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { generateInviteToken, hashInviteToken } from '../lib/inviteToken';
import { buildTournamentInviteUrl } from '../lib/env';
import { sendInviteEmail } from '../lib/mailer';
import { cleanupExpiredTournamentInvites, getTournamentSlots, refreshTournamentStatus } from '../services/tournamentsService';
import { playerMeetsTournamentGender } from '../lib/tournamentGender';

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

    const now = Date.now();
    const ttlMs = Number((tournament as { invite_ttl_minutes: number }).invite_ttl_minutes) * 60 * 1000;
    let sent = 0;
    let failed = 0;
    const rows: Record<string, unknown>[] = [];
    const skipped: Array<{ invite: { email_1: string; email_2?: string | null }; reason: string }> = [];

    // Dedup dentro del payload.
    const normalizedInvites: Array<{ email_1: string; email_2: string | null }> = [];
    const payloadEmails = new Set<string>();
    for (const item of invites) {
      const email1 = String(item.email_1 ?? '').trim().toLowerCase();
      const email2 = item.email_2 ? String(item.email_2).trim().toLowerCase() : null;
      if (!validEmail(email1) || (email2 && !validEmail(email2))) {
        return res.status(400).json({ ok: false, error: 'Email inv?lido en invites' });
      }
      if (email2 && email1 === email2) {
        return res.status(400).json({ ok: false, error: 'email_1 y email_2 deben ser distintos' });
      }
      if (payloadEmails.has(email1) || (email2 && payloadEmails.has(email2))) {
        skipped.push({ invite: { email_1: email1, email_2: email2 }, reason: 'duplicado_en_payload' });
        continue;
      }
      payloadEmails.add(email1);
      if (email2) payloadEmails.add(email2);
      normalizedInvites.push({ email_1: email1, email_2: email2 });
    }

    // Dedup contra inscripciones activas ya existentes (pending/confirmed).
    const { data: activeIns, error: activeErr } = await supabase
      .from('tournament_inscriptions')
      .select('invite_email_1, invite_email_2, player_id_1, player_id_2, status')
      .eq('tournament_id', tournamentId)
      .in('status', ['pending', 'confirmed']);
    if (activeErr) return res.status(500).json({ ok: false, error: activeErr.message });

    const activePlayerIds = new Set<string>();
    const activeEmails = new Set<string>();
    for (const r of activeIns ?? []) {
      const em1 = String((r as { invite_email_1?: string | null }).invite_email_1 ?? '').trim().toLowerCase();
      const em2 = String((r as { invite_email_2?: string | null }).invite_email_2 ?? '').trim().toLowerCase();
      if (em1) activeEmails.add(em1);
      if (em2) activeEmails.add(em2);
      const p1 = (r as { player_id_1?: string | null }).player_id_1;
      const p2 = (r as { player_id_2?: string | null }).player_id_2;
      if (p1) activePlayerIds.add(p1);
      if (p2) activePlayerIds.add(p2);
    }

    if (activePlayerIds.size > 0) {
      const ids = [...activePlayerIds];
      const { data: existingPlayers, error: epErr } = await supabase.from('players').select('id,email').in('id', ids);
      if (epErr) return res.status(500).json({ ok: false, error: epErr.message });
      for (const p of existingPlayers ?? []) {
        const em = String((p as { email?: string | null }).email ?? '').trim().toLowerCase();
        if (em) activeEmails.add(em);
      }
    }

    const toCreate: Array<{ email_1: string; email_2: string | null }> = [];
    for (const item of normalizedInvites) {
      if (activeEmails.has(item.email_1) || (item.email_2 && activeEmails.has(item.email_2))) {
        skipped.push({ invite: item, reason: 'ya_invitado_o_inscripto' });
        continue;
      }
      toCreate.push(item);
      activeEmails.add(item.email_1);
      if (item.email_2) activeEmails.add(item.email_2);
    }

    const incomingPlayers = toCreate.reduce((acc, it) => acc + (it.email_2 ? 2 : 1), 0);
    if (currentPlayers + incomingPlayers > Number((tournament as { max_players: number }).max_players)) {
      return res.status(409).json({
        ok: false,
        error: 'No hay cupos suficientes para esas invitaciones',
        skipped,
      });
    }

    for (const item of toCreate) {
      const email1 = item.email_1;
      const email2 = item.email_2;
      const { token, tokenHash } = generateInviteToken();
      const inviteUrl = buildTournamentInviteUrl(tournamentId, token);
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

    const clubName = 'Tu club';
    const emailJobs = rows.flatMap((row) => {
      const url = String(row.invite_url);
      const jobs = [sendInviteEmail(String(row.invite_email_1 ?? ''), url, clubName)];
      if (row.invite_email_2) jobs.push(sendInviteEmail(String(row.invite_email_2), url, clubName));
      return jobs;
    });
    const emailResults = await Promise.all(emailJobs);
    for (const r of emailResults) {
      if (r.sent) sent += 1;
      else failed += 1;
    }
    await refreshTournamentStatus(tournamentId, { force: true, skipInviteCleanup: true });
    return res.json({
      ok: true,
      created: rows.length,
      skipped,
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
  let email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!token) return res.status(400).json({ ok: false, error: 'token es obligatorio' });
  try {
    const supabase = getSupabaseServiceRoleClient();
    if (!validEmail(email)) {
      const authHeader = req.headers.authorization;
      const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (bearer) {
        const {
          data: { user },
          error: uErr,
        } = await supabase.auth.getUser(bearer);
        if (!uErr && user?.email) email = String(user.email).trim().toLowerCase();
      }
    }
    if (!validEmail(email)) {
      return res.status(400).json({
        ok: false,
        error: 'Debes enviar email válido en body o Authorization: Bearer con un usuario autenticado',
      });
    }

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
    const invitedEmail1 = String((inscription as { invite_email_1?: string | null }).invite_email_1 ?? '').toLowerCase();
    const invitedEmail2 = String((inscription as { invite_email_2?: string | null }).invite_email_2 ?? '').toLowerCase();
    if (email !== invitedEmail1 && email !== invitedEmail2) {
      return res.status(403).json({ ok: false, error: 'Este email no corresponde a la invitación' });
    }

    const { data: tournament } = await supabase
      .from('tournaments')
      .select('id, status, max_players, elo_min, elo_max, gender')
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

    const { data: existingPlayer } = await supabase.from('players').select('id, elo_rating, gender').eq('email', email).maybeSingle();
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

    let acceptingPlayerId: string | null = null;
    const em1 = String((inscription as { invite_email_1?: string | null }).invite_email_1 ?? '').toLowerCase();
    const em2 = String((inscription as { invite_email_2?: string | null }).invite_email_2 ?? '').toLowerCase();
    if (em1 === email) acceptingPlayerId = player1Id;
    else if (em2 === email) acceptingPlayerId = player2Id;
    if (acceptingPlayerId) {
      const { data: plG } = await supabase.from('players').select('gender').eq('id', acceptingPlayerId).maybeSingle();
      if (!playerMeetsTournamentGender((tournament as { gender?: string }).gender, (plG as { gender?: string } | null)?.gender)) {
        return res.status(403).json({
          ok: false,
          error:
            'Tu género en el perfil no coincide con la categoría del torneo. Actualiza tu perfil o contacta al club.',
        });
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

    await refreshTournamentStatus((inscription as any).tournament_id, { force: true, skipInviteCleanup: true });
    return res.json({ ok: true, status });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
