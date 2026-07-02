import { Router, Request, Response } from 'express';
import { getPlayerIdFromBearer } from '../lib/authPlayer';
import { buildMatchInviteUrl } from '../lib/env';
import { generateInviteToken, getInviteExpiresAt, hashInviteToken } from '../lib/inviteToken';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import {
  getPlayerActiveMatchTimeWindows,
  playerHasMatchScheduleConflict,
  timeRangesOverlap,
} from '../lib/guestJoinEligibility';

const router = Router();

const MATCH_INVITE_SELECT =
  'id, match_id, slot_index, invite_email, invited_player_id, status, invited_at, expires_at, accepted_at';

const MATCH_INVITE_SELECT_WITH_PLAYER = `${MATCH_INVITE_SELECT}, players:invited_player_id ( id, first_name, last_name, username, avatar_url )`;

const PLAYER_LOOKUP_SELECT = 'id, email, username, first_name, last_name, avatar_url';

function validEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim());
}

type InviteInput = {
  player_id?: string;
  email?: string;
  username?: string;
  slot_index?: number;
};

async function loadMatchForInvites(matchId: string) {
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('matches')
    .select(
      `id, visibility, status,
       bookings (
         id, organizer_player_id, start_at, end_at,
         courts ( name, clubs ( name ) )
       )`,
    )
    .eq('id', matchId)
    .maybeSingle();
  if (error) throw error;
  return data as {
    id: string;
    visibility?: string | null;
    status?: string | null;
    bookings?:
      | {
          id?: string;
          organizer_player_id?: string | null;
          start_at?: string | null;
          end_at?: string | null;
          courts?:
            | { name?: string | null; clubs?: { name?: string | null } | { name?: string | null }[] | null }
            | { name?: string | null; clubs?: { name?: string | null } | { name?: string | null }[] | null }[]
            | null;
        }
      | {
          id?: string;
          organizer_player_id?: string | null;
          start_at?: string | null;
          end_at?: string | null;
          courts?: unknown;
        }[]
      | null;
  } | null;
}

function flattenBooking(match: NonNullable<Awaited<ReturnType<typeof loadMatchForInvites>>>) {
  const raw = match.bookings;
  const b = Array.isArray(raw) ? raw[0] : raw;
  const rawCourt = b?.courts;
  const court = Array.isArray(rawCourt) ? rawCourt[0] : rawCourt;
  const rawClub = court?.clubs;
  const club = Array.isArray(rawClub) ? rawClub[0] : rawClub;
  return {
    bookingId: b?.id ?? null,
    organizerId: b?.organizer_player_id ?? null,
    startAt: b?.start_at ?? null,
    endAt: b?.end_at ?? null,
    clubName: club?.name ?? 'WeMatch',
    courtName: court?.name ?? null,
  };
}

/** Plazas de invitado (1–3) aún disponibles para nuevas invitaciones activas. */
async function guestInviteCapacityRemaining(matchId: string): Promise<number> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: players } = await supabase
    .from('match_players')
    .select('slot_index')
    .eq('match_id', matchId);
  let filled = 0;
  for (const row of players ?? []) {
    const s = Number((row as { slot_index?: number | null }).slot_index);
    if (Number.isFinite(s) && s >= 1 && s <= 3) filled += 1;
  }

  const { data: playerIds } = await supabase
    .from('match_players')
    .select('player_id')
    .eq('match_id', matchId);
  const inMatch = new Set(
    (playerIds ?? []).map((r) => String((r as { player_id?: string }).player_id ?? '')),
  );

  const { data: activeInvites } = await supabase
    .from('match_invites')
    .select('invited_player_id, status')
    .eq('match_id', matchId)
    .in('status', ['pending', 'accepted']);

  let pipeline = 0;
  for (const inv of activeInvites ?? []) {
    const pid = String((inv as { invited_player_id?: string | null }).invited_player_id ?? '');
    if (pid && !inMatch.has(pid)) pipeline += 1;
  }

  return Math.max(0, 3 - filled - pipeline);
}

async function assertOrganizerForMatch(matchId: string, organizerId: string) {
  const match = await loadMatchForInvites(matchId);
  if (!match) return { ok: false as const, status: 404, error: 'Partido no encontrado' };
  const meta = flattenBooking(match);
  if (meta.organizerId !== organizerId) {
    return { ok: false as const, status: 403, error: 'Solo el organizador puede gestionar las invitaciones' };
  }
  return { ok: true as const, match, meta };
}

async function enrichInvitesForOrganizer(
  matchId: string,
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const supabase = getSupabaseServiceRoleClient();
  const now = Date.now();
  const { data: mps } = await supabase
    .from('match_players')
    .select('player_id, slot_index')
    .eq('match_id', matchId);
  const slotByPlayer = new Map<string, number>();
  for (const mp of mps ?? []) {
    const pid = String((mp as { player_id?: string }).player_id ?? '');
    const slot = Number((mp as { slot_index?: number | null }).slot_index);
    if (pid && Number.isFinite(slot)) slotByPlayer.set(pid, slot);
  }

  return (rows ?? [])
    .map((row) => {
      const inv = row as {
        id: string;
        status: string;
        expires_at?: string;
        invited_player_id?: string | null;
        slot_index?: number | null;
      };
      const pid = inv.invited_player_id ? String(inv.invited_player_id) : '';
      const joinedSlot = pid && slotByPlayer.has(pid) ? slotByPlayer.get(pid)! : null;
      const expired =
        inv.status === 'pending' && inv.expires_at
          ? new Date(inv.expires_at).getTime() <= now
          : false;
      const effectiveStatus = expired ? 'expired' : inv.status;
      const inMatch = joinedSlot != null;

      let can_resend = false;
      let can_revoke = false;
      let can_dismiss = false;

      if (inMatch) {
        can_resend = false;
        can_revoke = false;
        can_dismiss = false;
      } else if (effectiveStatus === 'pending') {
        can_revoke = true;
      } else if (effectiveStatus === 'rejected' || effectiveStatus === 'expired') {
        can_resend = true;
        can_dismiss = true;
      } else if (effectiveStatus === 'accepted') {
        can_revoke = false;
        can_dismiss = true;
      }

      return {
        ...row,
        status: effectiveStatus,
        joined_slot_index: joinedSlot,
        can_resend,
        can_revoke,
        can_dismiss,
      };
    })
    .filter((row) => (row as { status: string }).status !== 'cancelled');
}

function formatMatchWhen(startAt: string | null): string {
  if (!startAt) return 'próximamente';
  try {
    return new Date(startAt).toLocaleString('es-ES', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return startAt;
  }
}

function playerLabel(p: {
  id: string;
  email?: string | null;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  return name || p.username || p.email || p.id;
}

async function resolvePlayerForInvite(
  item: InviteInput,
): Promise<{ ok: true; player: { id: string; email: string; username?: string | null } } | { ok: false; reason: string }> {
  const supabase = getSupabaseServiceRoleClient();
  const playerId = String(item.player_id ?? '').trim();
  if (playerId) {
    const { data, error } = await supabase
      .from('players')
      .select(PLAYER_LOOKUP_SELECT)
      .eq('id', playerId)
      .maybeSingle();
    if (error) return { ok: false, reason: 'db_error' };
    if (!data) return { ok: false, reason: 'player_not_found' };
    return {
      ok: true,
      player: {
        id: data.id,
        email: String(data.email ?? '').toLowerCase(),
        username: data.username,
      },
    };
  }

  const username = String(item.username ?? '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
  if (username) {
    const { data, error } = await supabase
      .from('players')
      .select(PLAYER_LOOKUP_SELECT)
      .eq('username', username)
      .maybeSingle();
    if (error) return { ok: false, reason: 'db_error' };
    if (!data) return { ok: false, reason: 'player_not_found' };
    return {
      ok: true,
      player: {
        id: data.id,
        email: String(data.email ?? '').toLowerCase(),
        username: data.username,
      },
    };
  }

  const email = String(item.email ?? '').trim().toLowerCase();
  if (validEmail(email)) {
    const { data, error } = await supabase
      .from('players')
      .select(PLAYER_LOOKUP_SELECT)
      .eq('email', email)
      .maybeSingle();
    if (error) return { ok: false, reason: 'db_error' };
    if (!data) return { ok: false, reason: 'player_not_found' };
    return {
      ok: true,
      player: {
        id: data.id,
        email: String(data.email ?? '').toLowerCase(),
        username: data.username,
      },
    };
  }

  return { ok: false, reason: 'invalid_target' };
}

/** GET /matches/invites/received — invitaciones pendientes del jugador autenticado */
router.get('/invites/received', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (!playerId) return res.status(401).json({ ok: false, error: authErr ?? 'Token requerido' });

  try {
    const supabase = getSupabaseServiceRoleClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('match_invites')
      .select(
        `${MATCH_INVITE_SELECT},
         inviter:invited_by_player_id ( id, first_name, last_name, username, avatar_url ),
         matches (
           id, status, visibility, competitive,
           bookings ( start_at, end_at, status, deleted_at, courts ( name, clubs ( name ) ) )
         )`,
      )
      .eq('invited_player_id', playerId)
      .eq('status', 'pending')
      .gt('expires_at', now)
      .order('invited_at', { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const playerWindows = await getPlayerActiveMatchTimeWindows(supabase, playerId);

    const invites = (data ?? [])
      .map((row) => {
      const r = row as {
        id: string;
        match_id: string;
        slot_index: number;
        status: string;
        invited_at?: string;
        expires_at?: string;
        inviter?:
          | { first_name?: string; last_name?: string; username?: string; avatar_url?: string }
          | { first_name?: string; last_name?: string; username?: string; avatar_url?: string }[]
          | null;
        matches?: unknown;
      };
      const inviterRaw = r.inviter;
      const inviter = Array.isArray(inviterRaw) ? inviterRaw[0] : inviterRaw;
      const inviterName =
        [inviter?.first_name, inviter?.last_name].filter(Boolean).join(' ').trim() ||
        inviter?.username ||
        'Un jugador';
      const matchRaw = r.matches;
      const match = Array.isArray(matchRaw) ? matchRaw[0] : matchRaw;
      const bookingsRaw = (match as { bookings?: unknown } | null)?.bookings;
      const booking = Array.isArray(bookingsRaw) ? bookingsRaw[0] : bookingsRaw;
      const courtsRaw = (booking as { courts?: unknown } | null)?.courts;
      const court = Array.isArray(courtsRaw) ? courtsRaw[0] : courtsRaw;
      const clubsRaw = (court as { clubs?: unknown } | null)?.clubs;
      const club = Array.isArray(clubsRaw) ? clubsRaw[0] : clubsRaw;
      const startAt = (booking as { start_at?: string } | null)?.start_at ?? null;
      const endAt = (booking as { end_at?: string } | null)?.end_at ?? null;
      const has_schedule_conflict =
        startAt && endAt
          ? playerWindows.some(
              (w) =>
                w.matchId !== r.match_id && timeRangesOverlap(startAt, endAt, w.startAt, w.endAt),
            )
          : false;
      const matchStatus = String((match as { status?: string } | null)?.status ?? '').toLowerCase();
      const bookingStatus = String((booking as { status?: string } | null)?.status ?? '').toLowerCase();
      const bookingDeleted = (booking as { deleted_at?: string | null } | null)?.deleted_at != null;
      if (
        matchStatus === 'cancelled' ||
        matchStatus === 'finished' ||
        bookingDeleted ||
        bookingStatus === 'cancelled'
      ) {
        return null;
      }
      return {
        id: r.id,
        match_id: r.match_id,
        slot_index: r.slot_index,
        status: r.status,
        invited_at: r.invited_at,
        expires_at: r.expires_at,
        inviter_name: inviterName,
        inviter_avatar_url: inviter?.avatar_url ?? null,
        club_name: (club as { name?: string } | null)?.name ?? 'WeMatch',
        court_name: (court as { name?: string } | null)?.name ?? null,
        start_at: startAt,
        end_at: endAt,
        has_schedule_conflict,
        match_when: formatMatchWhen(startAt),
        match_visibility: String((match as { visibility?: string } | null)?.visibility ?? 'public').toLowerCase(),
        match_competitive: (match as { competitive?: boolean } | null)?.competitive === true,
      };
    })
      .filter((inv): inv is NonNullable<typeof inv> => inv != null);

    return res.json({ ok: true, invites });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/** POST /matches/invites/inbox/:inviteId/accept */
router.post('/invites/inbox/:inviteId/accept', async (req: Request, res: Response) => {
  const inviteId = String(req.params.inviteId ?? '').trim();
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (!playerId) return res.status(401).json({ ok: false, error: authErr ?? 'Token requerido' });
  if (!inviteId) return res.status(400).json({ ok: false, error: 'inviteId es obligatorio' });

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: invite, error } = await supabase
      .from('match_invites')
      .select(`${MATCH_INVITE_SELECT}, matches ( id, status, visibility )`)
      .eq('id', inviteId)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!invite) return res.status(404).json({ ok: false, error: 'Invitación no encontrada' });

    const row = invite as {
      id: string;
      match_id: string;
      slot_index: number;
      invited_player_id?: string | null;
      status: string;
      expires_at: string;
      matches?: { status?: string; visibility?: string } | { status?: string; visibility?: string }[] | null;
    };

    if (row.invited_player_id !== playerId) {
      return res.status(403).json({ ok: false, error: 'No puedes aceptar esta invitación' });
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return res.status(400).json({ ok: false, error: 'Invitación expirada' });
    }

    const matchMeta = Array.isArray(row.matches) ? row.matches[0] : row.matches;
    if (String(matchMeta?.visibility ?? '').toLowerCase() !== 'private') {
      return res.status(400).json({ ok: false, error: 'No es un partido privado' });
    }
    if (matchMeta?.status === 'cancelled' || matchMeta?.status === 'finished') {
      return res.status(400).json({ ok: false, error: 'El partido ya no está disponible' });
    }

    if (row.status === 'accepted') {
      return res.json({ ok: true, already_accepted: true, match_id: row.match_id, slot_index: row.slot_index });
    }
    if (row.status !== 'pending') {
      return res.status(400).json({ ok: false, error: 'La invitación ya no está pendiente' });
    }

    const { data: existingMp } = await supabase
      .from('match_players')
      .select('id')
      .eq('match_id', row.match_id)
      .eq('player_id', playerId)
      .maybeSingle();
    if (existingMp) {
      return res.json({ ok: true, already_in_match: true, match_id: row.match_id });
    }

    const { error: upErr } = await supabase
      .from('match_invites')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    if (upErr) return res.status(500).json({ ok: false, error: upErr.message });

    return res.json({
      ok: true,
      status: 'accepted',
      match_id: row.match_id,
      slot_index: row.slot_index,
      player_id: playerId,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/** POST /matches/invites/inbox/:inviteId/reject */
router.post('/invites/inbox/:inviteId/reject', async (req: Request, res: Response) => {
  const inviteId = String(req.params.inviteId ?? '').trim();
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (!playerId) return res.status(401).json({ ok: false, error: authErr ?? 'Token requerido' });
  if (!inviteId) return res.status(400).json({ ok: false, error: 'inviteId es obligatorio' });

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: invite, error } = await supabase
      .from('match_invites')
      .select('id, invited_player_id, status')
      .eq('id', inviteId)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!invite) return res.status(404).json({ ok: false, error: 'Invitación no encontrada' });

    const row = invite as { id: string; invited_player_id?: string | null; status: string };
    if (row.invited_player_id !== playerId) {
      return res.status(403).json({ ok: false, error: 'No puedes rechazar esta invitación' });
    }
    if (row.status !== 'pending') {
      return res.status(400).json({ ok: false, error: 'La invitación ya no está pendiente' });
    }

    const { error: upErr } = await supabase
      .from('match_invites')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (upErr) return res.status(500).json({ ok: false, error: upErr.message });

    return res.json({ ok: true, status: 'rejected' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/** GET /matches/invites/:token/accept — landing HTML (legacy email links) */
router.get('/invites/:token/accept', (req: Request, res: Response) => {
  const token = String(req.params.token ?? '').trim();
  const matchId = String(req.query.match_id ?? '').trim();
  if (!token || token === 'received' || token === 'inbox') {
    return res.status(400).type('text/html').send('<h1>Invitación inválida</h1>');
  }
  const appUrl = `wematch://match-invite?token=${encodeURIComponent(token)}&match_id=${encodeURIComponent(matchId)}`;
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Invitación al partido</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 420px; margin: 48px auto; padding: 0 16px; text-align: center; color: #1a1a1a; }
    a.btn { display: inline-block; margin-top: 24px; padding: 14px 28px; background: #E31E24; color: #fff; text-decoration: none; border-radius: 12px; font-weight: 700; }
    p { color: #555; line-height: 1.5; }
  </style>
</head>
<body>
  <h1>Invitación al partido</h1>
  <p>Abre la app WeMatch para ver y responder la invitación.</p>
  <a class="btn" href="${appUrl}">Abrir en la app</a>
</body>
</html>`;
  return res.status(200).type('text/html').send(html);
});

/** POST /matches/invites/:token/accept — legacy token accept */
router.post('/invites/:token/accept', async (req: Request, res: Response) => {
  const token = String(req.params.token ?? '').trim();
  if (!token || token === 'received' || token === 'inbox') {
    return res.status(400).json({ ok: false, error: 'token es obligatorio' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    let email = String(req.body?.email ?? '').trim().toLowerCase();
    if (!validEmail(email)) {
      const authHeader = req.headers.authorization;
      const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (bearer) {
        const {
          data: { user },
        } = await supabase.auth.getUser(bearer);
        if (user?.email) email = String(user.email).trim().toLowerCase();
      }
    }
    if (!validEmail(email)) {
      return res.status(400).json({ ok: false, error: 'Debes iniciar sesión' });
    }

    const tokenHash = hashInviteToken(token);
    const { data: invite, error } = await supabase
      .from('match_invites')
      .select(`${MATCH_INVITE_SELECT}, matches ( id, status, visibility )`)
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!invite) return res.status(400).json({ ok: false, error: 'Invitación inválida' });

    const row = invite as {
      id: string;
      match_id: string;
      slot_index: number;
      invite_email: string;
      invited_player_id?: string | null;
      status: string;
      expires_at: string;
      matches?: { status?: string; visibility?: string } | { status?: string; visibility?: string }[] | null;
    };

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return res.status(400).json({ ok: false, error: 'Invitación expirada' });
    }
    if (row.invite_email.toLowerCase() !== email) {
      return res.status(403).json({ ok: false, error: 'Este email no corresponde a la invitación' });
    }

    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (!player) return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });

    if (row.status === 'accepted' && row.invited_player_id === player.id) {
      return res.json({ ok: true, already_accepted: true, match_id: row.match_id, slot_index: row.slot_index });
    }

    const { error: upErr } = await supabase
      .from('match_invites')
      .update({
        status: 'accepted',
        invited_player_id: player.id,
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    if (upErr) return res.status(500).json({ ok: false, error: upErr.message });

    return res.json({
      ok: true,
      status: 'accepted',
      match_id: row.match_id,
      slot_index: row.slot_index,
      player_id: player.id,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/** GET /matches/:matchId/invites — listar invitaciones (organizador) */
router.get('/:matchId/invites', async (req: Request, res: Response) => {
  const matchId = String(req.params.matchId ?? '').trim();
  const { playerId: organizerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (!organizerId) return res.status(401).json({ ok: false, error: authErr ?? 'Token requerido' });

  try {
    const auth = await assertOrganizerForMatch(matchId, organizerId);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('match_invites')
      .select(
        `${MATCH_INVITE_SELECT}, players:invited_player_id ( id, first_name, last_name, username, avatar_url )`,
      )
      .eq('match_id', matchId)
      .order('invited_at', { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const invites = await enrichInvitesForOrganizer(matchId, (data ?? []) as Record<string, unknown>[]);
    const capacity_remaining = await guestInviteCapacityRemaining(matchId);

    return res.json({ ok: true, invites, capacity_remaining });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/** POST /matches/:matchId/invites — invitar jugadores registrados (in-app, sin email) */
router.post('/:matchId/invites', async (req: Request, res: Response) => {
  const matchId = String(req.params.matchId ?? '').trim();
  const { playerId: organizerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (!organizerId) return res.status(401).json({ ok: false, error: authErr ?? 'Token requerido' });

  const invitesIn = Array.isArray(req.body?.invites) ? (req.body.invites as InviteInput[]) : [];
  if (!invitesIn.length) {
    return res.status(400).json({ ok: false, error: 'invites es obligatorio' });
  }

  try {
    const match = await loadMatchForInvites(matchId);
    if (!match) return res.status(404).json({ ok: false, error: 'Partido no encontrado' });
    if (String(match.visibility ?? '').toLowerCase() !== 'private') {
      return res.status(400).json({ ok: false, error: 'Solo los partidos privados admiten invitaciones' });
    }
    if (match.status === 'cancelled' || match.status === 'finished') {
      return res.status(400).json({ ok: false, error: 'El partido ya no admite invitaciones' });
    }

    const meta = flattenBooking(match);
    if (meta.organizerId !== organizerId) {
      return res.status(403).json({ ok: false, error: 'Solo el organizador puede invitar jugadores' });
    }

    const inviteStartAt = meta.startAt;
    const inviteEndAt = meta.endAt;

    const supabase = getSupabaseServiceRoleClient();
    let capacityRemaining = await guestInviteCapacityRemaining(matchId);
    const payloadPlayerIds = new Set<string>();
    const skipped: Array<{ target: string; reason: string }> = [];
    const toCreate: Array<{ email: string; player_id: string }> = [];
    const toReactivate: string[] = [];

    for (const item of invitesIn) {
      const resolved = await resolvePlayerForInvite(item);
      if (!resolved.ok) {
        const target =
          String(item.player_id ?? item.username ?? item.email ?? '').trim() || 'jugador';
        skipped.push({ target, reason: resolved.reason });
        continue;
      }
      const player = resolved.player;
      const label = playerLabel(player);

      if (player.id === organizerId) {
        skipped.push({ target: label, reason: 'organizador' });
        continue;
      }
      if (payloadPlayerIds.has(player.id)) {
        skipped.push({ target: label, reason: 'duplicado_en_payload' });
        continue;
      }
      payloadPlayerIds.add(player.id);

      const { data: existingInvite } = await supabase
        .from('match_invites')
        .select('id, status')
        .eq('match_id', matchId)
        .eq('invited_player_id', player.id)
        .maybeSingle();

      if (existingInvite) {
        const st = String((existingInvite as { status?: string }).status ?? '');
        if (st === 'pending' || st === 'accepted') {
          skipped.push({ target: label, reason: 'ya_invitado' });
          continue;
        }
        if (st === 'rejected' || st === 'expired' || st === 'cancelled') {
          if (capacityRemaining < 1) {
            skipped.push({ target: label, reason: 'sin_plazas' });
            continue;
          }
          toReactivate.push(String((existingInvite as { id: string }).id));
          capacityRemaining -= 1;
          continue;
        }
      }

      const { data: alreadyIn } = await supabase
        .from('match_players')
        .select('id')
        .eq('match_id', matchId)
        .eq('player_id', player.id)
        .maybeSingle();
      if (alreadyIn) {
        skipped.push({ target: label, reason: 'ya_en_partido' });
        continue;
      }

      if (inviteStartAt && inviteEndAt) {
        const busy = await playerHasMatchScheduleConflict(supabase, {
          playerId: player.id,
          excludeMatchId: matchId,
          startAt: inviteStartAt,
          endAt: inviteEndAt,
        });
        if (busy) {
          skipped.push({ target: label, reason: 'horario_ocupado' });
          continue;
        }
      }

      if (capacityRemaining < 1) {
        skipped.push({ target: label, reason: 'sin_plazas' });
        continue;
      }
      capacityRemaining -= 1;
      toCreate.push({ email: player.email, player_id: player.id });
    }

    const expiresAt = getInviteExpiresAt().toISOString();
    const now = new Date().toISOString();
    const reactivatedRows: Record<string, unknown>[] = [];

    for (const inviteId of toReactivate) {
      const { token, tokenHash } = generateInviteToken();
      const inviteUrl = buildMatchInviteUrl(matchId, token);
      const { data: updated, error: upErr } = await supabase
        .from('match_invites')
        .update({
          status: 'pending',
          slot_index: null,
          token_hash: tokenHash,
          invite_url: inviteUrl,
          expires_at: expiresAt,
          invited_at: now,
          accepted_at: null,
          updated_at: now,
        })
        .eq('id', inviteId)
        .select(MATCH_INVITE_SELECT_WITH_PLAYER);
      if (upErr) return res.status(500).json({ ok: false, error: upErr.message });
      if (updated?.[0]) reactivatedRows.push(updated[0] as Record<string, unknown>);
    }

    if (!toCreate.length && !reactivatedRows.length) {
      return res.status(409).json({ ok: false, error: 'No se pudo crear ninguna invitación', skipped });
    }

    const rows: Record<string, unknown>[] = [];
    for (const item of toCreate) {
      const { token, tokenHash } = generateInviteToken();
      const inviteUrl = buildMatchInviteUrl(matchId, token);
      rows.push({
        match_id: matchId,
        slot_index: null,
        invite_email: item.email,
        invited_player_id: item.player_id,
        invited_by_player_id: organizerId,
        status: 'pending',
        token_hash: tokenHash,
        invite_url: inviteUrl,
        expires_at: expiresAt,
      });
    }

    let inserted: Record<string, unknown>[] = [];
    if (rows.length) {
      const { data, error: insErr } = await supabase
        .from('match_invites')
        .insert(rows)
        .select(MATCH_INVITE_SELECT_WITH_PLAYER);
      if (insErr) return res.status(500).json({ ok: false, error: insErr.message });
      inserted = (data ?? []) as Record<string, unknown>[];
    }

    const allInvites = [...reactivatedRows, ...inserted];

    return res.json({
      ok: true,
      created: inserted.length,
      reactivated: reactivatedRows.length,
      skipped,
      invites: allInvites,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/** POST /matches/:matchId/invites/:inviteId/resend — reenviar tras rechazo o expiración */
router.post('/:matchId/invites/:inviteId/resend', async (req: Request, res: Response) => {
  const matchId = String(req.params.matchId ?? '').trim();
  const inviteId = String(req.params.inviteId ?? '').trim();
  const { playerId: organizerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (!organizerId) return res.status(401).json({ ok: false, error: authErr ?? 'Token requerido' });

  try {
    const auth = await assertOrganizerForMatch(matchId, organizerId);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const remaining = await guestInviteCapacityRemaining(matchId);
    if (remaining < 1) {
      return res.status(409).json({ ok: false, error: 'No quedan plazas para invitar' });
    }

    const supabase = getSupabaseServiceRoleClient();
    const { data: invite, error } = await supabase
      .from('match_invites')
      .select(MATCH_INVITE_SELECT)
      .eq('id', inviteId)
      .eq('match_id', matchId)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!invite) return res.status(404).json({ ok: false, error: 'Invitación no encontrada' });

    const row = invite as { status: string; invited_player_id?: string | null };
    const st = row.status === 'pending' && (invite as { expires_at?: string }).expires_at
      ? new Date((invite as { expires_at: string }).expires_at).getTime() <= Date.now()
        ? 'expired'
        : row.status
      : row.status;

    if (!['rejected', 'expired', 'cancelled'].includes(st)) {
      return res.status(400).json({ ok: false, error: 'Solo puedes reenviar invitaciones rechazadas o expiradas' });
    }

    if (row.invited_player_id) {
      const { data: inMatch } = await supabase
        .from('match_players')
        .select('id')
        .eq('match_id', matchId)
        .eq('player_id', row.invited_player_id)
        .maybeSingle();
      if (inMatch) {
        return res.status(400).json({ ok: false, error: 'Este jugador ya está en el partido' });
      }
    }

    const { token, tokenHash } = generateInviteToken();
    const inviteUrl = buildMatchInviteUrl(matchId, token);
    const now = new Date().toISOString();
    const { data: updated, error: upErr } = await supabase
      .from('match_invites')
      .update({
        status: 'pending',
        slot_index: null,
        token_hash: tokenHash,
        invite_url: inviteUrl,
        expires_at: getInviteExpiresAt().toISOString(),
        invited_at: now,
        accepted_at: null,
        updated_at: now,
      })
      .eq('id', inviteId)
      .select(MATCH_INVITE_SELECT);
    if (upErr) return res.status(500).json({ ok: false, error: upErr.message });

    return res.json({ ok: true, invite: updated?.[0] ?? null });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/** DELETE /matches/:matchId/invites/:inviteId — revocar pendiente o quitar del listado */
router.delete('/:matchId/invites/:inviteId', async (req: Request, res: Response) => {
  const matchId = String(req.params.matchId ?? '').trim();
  const inviteId = String(req.params.inviteId ?? '').trim();
  const { playerId: organizerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (!organizerId) return res.status(401).json({ ok: false, error: authErr ?? 'Token requerido' });

  try {
    const auth = await assertOrganizerForMatch(matchId, organizerId);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const supabase = getSupabaseServiceRoleClient();
    const { data: invite, error } = await supabase
      .from('match_invites')
      .select('id, status, expires_at, invited_player_id')
      .eq('id', inviteId)
      .eq('match_id', matchId)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!invite) return res.status(404).json({ ok: false, error: 'Invitación no encontrada' });

    const row = invite as { status: string; expires_at?: string; invited_player_id?: string | null };
    const expired =
      row.status === 'pending' && row.expires_at
        ? new Date(row.expires_at).getTime() <= Date.now()
        : false;
    const effective = expired ? 'expired' : row.status;

    if (effective === 'accepted' && row.invited_player_id) {
      const { data: inMatch } = await supabase
        .from('match_players')
        .select('id')
        .eq('match_id', matchId)
        .eq('player_id', row.invited_player_id)
        .maybeSingle();
      if (inMatch) {
        return res.status(400).json({ ok: false, error: 'No puedes quitar a un jugador que ya está en el partido' });
      }
    }

    if (!['pending', 'accepted', 'rejected', 'expired', 'cancelled'].includes(effective)) {
      return res.status(400).json({ ok: false, error: 'No se puede retirar esta invitación' });
    }

    const { error: upErr } = await supabase
      .from('match_invites')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', inviteId);
    if (upErr) return res.status(500).json({ ok: false, error: upErr.message });

    return res.json({ ok: true, status: 'cancelled' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
