import type { PartidoItem } from '../screens/PartidosScreen';

export type ProfileForPartidoEnrich = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
};

function buildInitial(firstName: string, lastName: string): string {
  const full = `${firstName} ${lastName}`.trim();
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return full[0]?.toUpperCase() ?? '?';
}

function slotBelongsToPlayer(
  partido: PartidoItem,
  index: number,
  player: PartidoItem['players'][number],
  playerId: string,
): boolean {
  if (player.id === playerId) return true;
  const slotId = partido.playerIdsBySlot?.[index];
  return slotId === playerId;
}

/** Rellena nombre, iniciales y avatar del jugador actual desde el perfil cacheado. */
export function enrichPartidoWithProfileAvatar(
  partido: PartidoItem,
  profile: ProfileForPartidoEnrich | null | undefined,
): PartidoItem {
  const pid = profile?.id?.trim();
  if (!pid || !profile) return partido;

  const inMatch =
    (partido.playerIds ?? []).includes(pid) ||
    (partido.playerIdsBySlot ?? []).some((id) => id === pid);
  if (!inMatch) return partido;

  const first = profile.firstName?.trim() ?? '';
  const last = profile.lastName?.trim() ?? '';
  const fullName = `${first} ${last}`.trim();
  const initial = fullName ? buildInitial(first, last) : '';
  const uri = profile.avatarUrl?.trim();

  let changed = false;
  const players = partido.players.map((p, index) => {
    if (p.isFree && !slotBelongsToPlayer(partido, index, p, pid)) return p;
    if (!p.isFree && !slotBelongsToPlayer(partido, index, p, pid)) return p;

    const next = { ...p, id: p.id ?? pid };
    if (next.isFree) {
      next.isFree = false;
      changed = true;
    }
    if (uri && next.avatar !== uri) {
      next.avatar = uri;
      changed = true;
    }
    if (fullName && (!next.name || next.name === 'Jugador')) {
      next.name = fullName;
      changed = true;
    }
    if (initial && (!next.initial || next.initial === '?')) {
      next.initial = initial;
      changed = true;
    }
    if (!next.isFree && next.id !== pid) {
      next.id = pid;
      changed = true;
    }
    return next;
  });

  const playerIds = [...new Set([...(partido.playerIds ?? []), pid])];
  const idsChanged = playerIds.length !== (partido.playerIds ?? []).length;

  return changed || idsChanged
    ? { ...partido, players, playerIds }
    : partido;
}

/** Inserta o actualiza un partido en la lista "Mis partidos" (orden por startAt). */
export function upsertMisPartidosList(items: PartidoItem[], next: PartidoItem): PartidoItem[] {
  const idx = items.findIndex((p) => p.id === next.id);
  const merged = idx >= 0 ? items.map((p, i) => (i === idx ? next : p)) : [next, ...items];
  const upcoming = merged.filter((p) => p.matchPhase !== 'past');
  const past = merged.filter((p) => p.matchPhase === 'past');
  const byStart = (a: PartidoItem, b: PartidoItem) => {
    const ta = a.startAt ? new Date(a.startAt).getTime() : 0;
    const tb = b.startAt ? new Date(b.startAt).getTime() : 0;
    return ta - tb;
  };
  return [
    ...upcoming.sort(byStart),
    ...past.sort((a, b) => byStart(b, a)),
  ];
}

/**
 * Partidos de otros para unirse (pestaña Partidos → "Para tu nivel").
 * Excluye los que organizaste o en los que ya estás — esos van en "Mis partidos" / Home.
 */
export function isPartidoOpenForDiscovery(
  partido: PartidoItem,
  playerId: string | null | undefined,
): boolean {
  const pid = playerId?.trim();
  if (!pid) return true;
  if (partido.organizerPlayerId === pid) return false;
  if ((partido.playerIds ?? []).includes(pid)) return false;
  if ((partido.playerIdsBySlot ?? []).some((id) => id === pid)) return false;
  return true;
}

/** True si el jugador participa en el partido (no es un partido ajeno para unirse). */
export function isPartidoMine(
  partido: PartidoItem,
  playerId: string | null | undefined,
): boolean {
  const pid = playerId?.trim();
  if (!pid) return false;
  if ((partido.playerIds ?? []).includes(pid)) return true;
  if (partido.organizerPlayerId === pid) return true;
  return (partido.playerIdsBySlot ?? []).some((id) => id === pid);
}

/**
 * Tras /matches/mine, conserva solo partidos locales del jugador que la API
 * aún no devolvió (desfase tras join/pago). Nunca mezcla partidos abiertos ajenos.
 */
export function mergeMisPartidosFromServer(
  previous: PartidoItem[],
  fromServer: PartidoItem[],
  playerId: string | null | undefined,
): PartidoItem[] {
  const serverIds = new Set(fromServer.map((p) => p.id));
  let merged = fromServer;
  for (const p of previous) {
    if (serverIds.has(p.id) || p.matchPhase === 'past') continue;
    if (!isPartidoMine(p, playerId)) continue;
    merged = upsertMisPartidosList(merged, p);
  }
  return merged;
}
