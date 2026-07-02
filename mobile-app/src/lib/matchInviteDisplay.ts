import type { MatchInviteRow } from '../api/matchInvites';
import type { ReceivedMatchInvite } from '../api/matchInvites';
import type { PlayerSearchHit } from '../api/players';

export type EnrichedMatchInvite = MatchInviteRow & {
  joined_slot_index?: number | null;
  can_resend?: boolean;
  can_revoke?: boolean;
  can_dismiss?: boolean;
};

function inviteEffectiveStatus(inv: MatchInviteRow): string {
  if (
    inv.status === 'pending' &&
    inv.expires_at &&
    new Date(inv.expires_at).getTime() <= Date.now()
  ) {
    return 'expired';
  }
  return inv.status;
}

/** Normaliza flags de acción; respeta los del servidor cuando vienen definidos. */
export function normalizeInviteRow(inv: MatchInviteRow): MatchInviteRow {
  const status = inviteEffectiveStatus(inv);
  const inMatch = inv.joined_slot_index != null;

  const fromServer = (key: 'can_resend' | 'can_revoke' | 'can_dismiss') =>
    typeof inv[key] === 'boolean' ? inv[key]! : undefined;

  return {
    ...inv,
    status,
    can_resend:
      fromServer('can_resend') ?? (!inMatch && (status === 'rejected' || status === 'expired')),
    can_revoke: fromServer('can_revoke') ?? (!inMatch && status === 'pending'),
    can_dismiss:
      fromServer('can_dismiss') ??
      (!inMatch && (status === 'rejected' || status === 'expired' || status === 'accepted')),
  };
}

export function optimisticInviteFromPlayer(
  matchId: string,
  player: PlayerSearchHit,
): MatchInviteRow {
  return normalizeInviteRow({
    id: `pending-${player.id}`,
    match_id: matchId,
    slot_index: null,
    invite_email: '',
    invited_player_id: player.id,
    status: 'pending',
    invited_at: new Date().toISOString(),
    players: {
      id: player.id,
      first_name: player.first_name ?? undefined,
      last_name: player.last_name ?? undefined,
      username: player.username ?? undefined,
      avatar_url: player.avatar_url ?? undefined,
    },
  });
}

function inviteRowKey(inv: MatchInviteRow): string {
  return inv.invited_player_id ?? inv.id;
}

function mergeInvitePlayerProfiles(
  incoming: MatchInviteRow['players'],
  previous: MatchInviteRow['players'],
): MatchInviteRow['players'] | null | undefined {
  if (!incoming && !previous) return null;
  if (!incoming) return previous ?? null;
  if (!previous) return incoming;
  return {
    id: incoming.id ?? previous.id,
    first_name: incoming.first_name?.trim() ? incoming.first_name : previous.first_name,
    last_name: incoming.last_name?.trim() ? incoming.last_name : previous.last_name,
    username: incoming.username?.trim() ? incoming.username : previous.username,
    avatar_url: incoming.avatar_url ?? previous.avatar_url,
  };
}

/** Fusiona filas por jugador invitado; las entrantes sustituyen optimistas o previas. */
export function mergeInviteLists(
  prev: MatchInviteRow[],
  incoming: MatchInviteRow[],
): MatchInviteRow[] {
  const map = new Map<string, MatchInviteRow>();
  for (const inv of prev) {
    const key = inviteRowKey(inv);
    if (key) map.set(key, inv);
  }
  for (const raw of incoming) {
    const key = inviteRowKey(raw);
    if (!key) continue;
    const previous = map.get(key);
    map.set(
      key,
      normalizeInviteRow({
        ...raw,
        players: mergeInvitePlayerProfiles(raw.players, previous?.players),
      }),
    );
  }
  return [...map.values()].sort(
    (a, b) =>
      new Date(b.invited_at ?? 0).getTime() - new Date(a.invited_at ?? 0).getTime(),
  );
}

/** Lista del servidor + filas optimistas aún no confirmadas (p. ej. envío en curso). */
export function mergeServerInvitesWithOptimistic(
  prev: MatchInviteRow[],
  serverInvites: MatchInviteRow[],
): MatchInviteRow[] {
  const optimistic = prev.filter((inv) => inv.id.startsWith('pending-'));
  return mergeInviteLists(optimistic, serverInvites);
}

/** Plazas que consume una invitación activa en pipeline (pendiente o aceptada sin pagar). */
export function inviteOccupiesGuestSlot(inv: MatchInviteRow): boolean {
  if (inv.joined_slot_index != null) return false;
  const status = inviteEffectiveStatus(inv);
  return status === 'pending' || status === 'accepted';
}

export function invitePlayerLabel(inv: MatchInviteRow): string {
  const p = inv.players;
  if (p) {
    const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    if (name && p.username) return `${name} (@${p.username})`;
    if (name) return name;
    if (p.username) return `@${p.username}`;
  }
  // Jugador registrado: no usar email como etiqueta (evita parpadeo tras enviar).
  if (inv.invited_player_id) return 'Jugador';
  return inv.invite_email;
}

export function inviteStatusMeta(
  inv: EnrichedMatchInvite,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (inv.joined_slot_index != null && inv.joined_slot_index >= 0) {
    return t('partidos.privateInviteMetaJoined', { n: inv.joined_slot_index + 1 });
  }
  if (inv.status === 'pending') {
    if (new Date(inv.expires_at ?? 0).getTime() <= Date.now()) {
      return t('partidos.privateInviteMetaExpired');
    }
    return t('partidos.privateInviteMetaPending');
  }
  if (inv.status === 'accepted') {
    return t('partidos.privateInviteMetaAcceptedUnpaid');
  }
  if (inv.status === 'rejected') {
    return t('partidos.privateInviteMetaRejected');
  }
  if (inv.status === 'expired') {
    return t('partidos.privateInviteMetaExpired');
  }
  if (inv.status === 'cancelled') {
    return t('partidos.privateInviteMetaCancelled');
  }
  return inv.status;
}

export function receivedMatchInviteBannerTitle(
  invite: ReceivedMatchInvite,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const name = invite.inviter_name;
  if (invite.match_competitive) {
    return t('partidos.matchInviteBannerTitleCompetitive', { name });
  }
  const visibility = invite.match_visibility?.toLowerCase();
  // Las invitaciones in-app solo aplican a partidos privados; si el backend
  // aún no envía visibility, asumimos privado (no confundir con competitivo).
  if (!visibility || visibility === 'private') {
    return t('partidos.matchInviteBannerTitlePrivate', { name });
  }
  return t('partidos.matchInviteBannerTitle', { name });
}
