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

function playerParticipatesInPartido(partido: PartidoItem, playerId: string): boolean {
  if (partido.organizerPlayerId === playerId) return true;
  if ((partido.playerIds ?? []).includes(playerId)) return true;
  if ((partido.playerIdsBySlot ?? []).some((id) => id === playerId)) return true;
  return partido.players.some(
    (p, index) => p.id === playerId || partido.playerIdsBySlot?.[index] === playerId,
  );
}

function shouldEnrichSlot(
  partido: PartidoItem,
  index: number,
  player: PartidoItem['players'][number],
  playerId: string,
  forceSlotIndex?: number,
): boolean {
  if (forceSlotIndex === index) return true;
  return slotBelongsToPlayer(partido, index, player, playerId);
}

export type EnrichPartidoOptions = {
  /** Tras unirse: rellena la plaza aunque la API aún no devolvió al jugador. */
  forceSlotIndex?: number;
};

/** Rellena nombre, iniciales y avatar del jugador actual desde el perfil cacheado. */
export function enrichPartidoWithProfileAvatar(
  partido: PartidoItem,
  profile: ProfileForPartidoEnrich | null | undefined,
  opts?: EnrichPartidoOptions,
): PartidoItem {
  const pid = profile?.id?.trim();
  if (!pid || !profile) return partido;

  const forceSlotIndex = opts?.forceSlotIndex;
  const participates =
    forceSlotIndex != null ||
    playerParticipatesInPartido(partido, pid);
  if (!participates) return partido;

  const first = profile.firstName?.trim() ?? '';
  const last = profile.lastName?.trim() ?? '';
  const fullName = `${first} ${last}`.trim();
  const initial = fullName ? buildInitial(first, last) : '?';
  const uri = profile.avatarUrl?.trim();

  let changed = false;
  const players = partido.players.map((p, index) => {
    if (!shouldEnrichSlot(partido, index, p, pid, forceSlotIndex)) return p;

    const next = { ...p, id: p.id ?? pid };
    if (next.isFree) {
      next.isFree = false;
      changed = true;
    }
    if (uri && !next.avatar?.trim()) {
      next.avatar = uri;
      changed = true;
    } else if (uri && next.id === pid && next.avatar !== uri) {
      next.avatar = uri;
      changed = true;
    }
    if (fullName && (!next.name?.trim() || next.name === 'Jugador')) {
      next.name = fullName;
      changed = true;
    }
    if (!next.initial?.trim() || next.initial === '?') {
      next.initial = initial;
      changed = true;
    }
    if (next.id !== pid) {
      next.id = pid;
      changed = true;
    }
    return next;
  });

  const playerIdsBySlot = [...(partido.playerIdsBySlot ?? [null, null, null, null])];
  while (playerIdsBySlot.length < 4) playerIdsBySlot.push(null);
  if (forceSlotIndex != null && forceSlotIndex >= 0 && forceSlotIndex <= 3) {
    if (playerIdsBySlot[forceSlotIndex] !== pid) {
      playerIdsBySlot[forceSlotIndex] = pid;
      changed = true;
    }
  }

  const playerIds = [...new Set([...(partido.playerIds ?? []), pid])];
  const idsChanged = playerIds.length !== (partido.playerIds ?? []).length;
  const slotsChanged =
    forceSlotIndex != null &&
    playerIdsBySlot.some((id, i) => id !== (partido.playerIdsBySlot ?? [])[i]);

  return changed || idsChanged || slotsChanged
    ? { ...partido, players, playerIds, playerIdsBySlot }
    : partido;
}

/** Enriquece una lista de partidos con el perfil del jugador actual. */
export function enrichPartidosWithProfileAvatar(
  items: PartidoItem[],
  profile: ProfileForPartidoEnrich | null | undefined,
): PartidoItem[] {
  if (!profile?.id?.trim()) return items;
  return items.map((p) => enrichPartidoWithProfileAvatar(p, profile));
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
 * Tras /matches/mine, conserva partidos locales que la API aún no devolvió
 * (desfase tras crear/unirse/pago). `previous` solo contiene partidos del usuario.
 */
export function mergeMisPartidosFromServer(
  previous: PartidoItem[],
  fromServer: PartidoItem[],
): PartidoItem[] {
  const serverIds = new Set(fromServer.map((p) => p.id));
  let merged = fromServer;
  for (const p of previous) {
    if (serverIds.has(p.id) || p.matchPhase === 'past') continue;
    merged = upsertMisPartidosList(merged, p);
  }
  return merged;
}
