import type { PartidoItem } from '../screens/PartidosScreen';
import { normalizePlayerAvatarUrl } from '../api/playerAvatar';

/** Avatares ya vistos en pantalla — sobreviven a refetch sin URL en la API. */
const knownPlayerAvatars = new Map<string, string>();

/** ELO formateado por jugador — evita badge amarillo vacío tras unirse. */
const knownPlayerLevels = new Map<string, string>();

export function cachePlayerAvatar(playerId: string | null | undefined, url: string | null | undefined): void {
  const id = playerId?.trim();
  const uri = normalizePlayerAvatarUrl(url);
  if (id && uri) knownPlayerAvatars.set(id, uri);
}

export function getCachedPlayerAvatar(playerId: string | null | undefined): string | null {
  const id = playerId?.trim();
  if (!id) return null;
  return knownPlayerAvatars.get(id) ?? null;
}

export function cachePlayerLevel(playerId: string | null | undefined, level: string | null | undefined): void {
  const id = playerId?.trim();
  const lv = normalizeLevelDisplay(level ?? undefined);
  if (id && lv && lv !== '—') knownPlayerLevels.set(id, lv);
}

export function getCachedPlayerLevel(playerId: string | null | undefined): string | null {
  const id = playerId?.trim();
  if (!id) return null;
  return knownPlayerLevels.get(id) ?? null;
}

function rememberPartidoLevels(partido: PartidoItem): void {
  partido.players.forEach((p, index) => {
    const lv = normalizeLevelDisplay(p.level);
    const pid = playerIdAtSlot(partido, index, p);
    if (pid && lv && lv !== '—') knownPlayerLevels.set(pid, lv);
  });
}

function playerIdAtSlot(
  partido: PartidoItem,
  index: number,
  player: PartidoItem['players'][number],
): string | null {
  return player.id?.trim() ?? partido.playerIdsBySlot?.[index]?.trim() ?? null;
}

function collectAvatarsByPlayerId(partido: PartidoItem): Map<string, string> {
  const map = new Map<string, string>();
  partido.players.forEach((p, index) => {
    const uri = normalizePlayerAvatarUrl(p.avatar);
    const pid = playerIdAtSlot(partido, index, p);
    if (uri && pid) map.set(pid, uri);
  });
  return map;
}

function rememberPartidoAvatars(partido: PartidoItem): void {
  for (const [pid, uri] of collectAvatarsByPlayerId(partido)) {
    knownPlayerAvatars.set(pid, uri);
  }
}

export type ProfileForPartidoEnrich = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  eloRating?: number | null;
};

/** Mismo formato que las tarjetas de partido (mapMatchToPartido). */
export function formatPlayerLevelFromElo(rating: number | null | undefined): string {
  if (rating == null || !Number.isFinite(Number(rating))) return '—';
  return Number(rating).toFixed(2).replace('.', ',');
}

function profileDisplayName(profile: ProfileForPartidoEnrich): string {
  const first = profile.firstName?.trim() ?? '';
  const last = profile.lastName?.trim() ?? '';
  const full = `${first} ${last}`.trim();
  if (full) return full;
  return profile.username?.trim() ?? '';
}

function buildInitial(firstName: string, lastName: string, username?: string | null): string {
  const full = `${firstName} ${lastName}`.trim();
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  if (full) return full[0]?.toUpperCase() ?? '?';
  const u = username?.trim();
  if (u) return u.slice(0, 2).toUpperCase();
  return '?';
}

export type ResolvePlayerDisplayOpts = {
  slotIndex?: number;
  playerIdsBySlot?: Array<string | null>;
};

function slotIsCurrentPlayer(
  player: PartidoItem['players'][number],
  profileId: string,
  opts?: ResolvePlayerDisplayOpts,
): boolean {
  if (player.id === profileId) return true;
  const idx = opts?.slotIndex;
  if (idx != null && opts?.playerIdsBySlot?.[idx] === profileId) return true;
  return false;
}

/** Incluye fallback por username cuando la API aún no devolvió el id del jugador. */
function playerMatchesCurrentProfile(
  player: PartidoItem['players'][number],
  profile: ProfileForPartidoEnrich,
  opts?: ResolvePlayerDisplayOpts,
): boolean {
  const pid = profile.id.trim();
  if (slotIsCurrentPlayer(player, pid, opts)) return true;
  if (player.isFree) return false;
  const un = profile.username?.trim().toLowerCase();
  const pn = player.name?.trim().toLowerCase();
  if (un && pn && pn === un) return true;
  const full = profileDisplayName(profile).toLowerCase();
  if (full && pn === full) return true;
  return false;
}

/** Misma fuente que Perfil: si es el jugador logueado, usa su avatarUrl del contexto. */
export function resolvePlayerDisplayAvatar(
  player: PartidoItem['players'][number],
  currentProfile: ProfileForPartidoEnrich | null | undefined,
  opts?: ResolvePlayerDisplayOpts,
): string | null {
  const pid = currentProfile?.id?.trim();
  const isMe = pid && currentProfile && playerMatchesCurrentProfile(player, currentProfile, opts);
  const profileUri = isMe
    ? normalizePlayerAvatarUrl(currentProfile?.avatarUrl) ?? getCachedPlayerAvatar(pid)
    : null;
  const playerUri = normalizePlayerAvatarUrl(player.avatar);
  const slotId =
    opts?.slotIndex != null ? opts.playerIdsBySlot?.[opts.slotIndex]?.trim() : null;
  const cachedUri = getCachedPlayerAvatar(player.id ?? slotId);
  return profileUri ?? playerUri ?? cachedUri ?? null;
}

export function resolvePlayerDisplayInitials(
  player: PartidoItem['players'][number],
  currentProfile: ProfileForPartidoEnrich | null | undefined,
  opts?: ResolvePlayerDisplayOpts,
): string {
  const pid = currentProfile?.id?.trim();
  if (pid && currentProfile && playerMatchesCurrentProfile(player, currentProfile, opts)) {
    const name = profileDisplayName(currentProfile!);
    if (name) {
      return buildInitial(
        currentProfile!.firstName?.trim() ?? '',
        currentProfile!.lastName?.trim() ?? '',
        currentProfile!.username,
      );
    }
  }
  const fromPlayer = player.initial?.trim() || player.name?.slice(0, 2)?.trim();
  return fromPlayer || '?';
}

/** Misma fuente que Perfil: si es el jugador logueado, usa eloRating del contexto. */
export function resolvePlayerDisplayLevel(
  player: PartidoItem['players'][number],
  currentProfile: ProfileForPartidoEnrich | null | undefined,
  opts?: ResolvePlayerDisplayOpts,
): string | null {
  const stored = normalizeLevelDisplay(player.level);
  if (stored && stored !== '—') return stored;

  const pid = currentProfile?.id?.trim();
  if (pid && currentProfile && playerMatchesCurrentProfile(player, currentProfile, opts)) {
    const fromProfile = formatPlayerLevelFromElo(currentProfile.eloRating);
    if (fromProfile !== '—') return fromProfile;
  }

  const slotId =
    opts?.slotIndex != null ? opts.playerIdsBySlot?.[opts.slotIndex]?.trim() : null;
  return getCachedPlayerLevel(player.id ?? slotId);
}

/** Combina ELO del fetch reciente con el perfil ya cargado en contexto. */
export function pickProfileEloRating(
  ...sources: Array<{ eloRating?: number | null } | null | undefined>
): number | null {
  for (const s of sources) {
    const v = s?.eloRating;
    if (v != null && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

/** Tras refetch del servidor, no pisar avatares que ya teníamos en pantalla. */
export function preservePartidoPlayerAvatars(
  previous: PartidoItem,
  incoming: PartidoItem,
): PartidoItem {
  const prevById = collectAvatarsByPlayerId(previous);
  const players = incoming.players.map((p, index) => {
    const nextUri = normalizePlayerAvatarUrl(p.avatar);
    if (nextUri) return p;

    const pid = playerIdAtSlot(incoming, index, p) ?? playerIdAtSlot(previous, index, p);
    const prevUri =
      (pid ? prevById.get(pid) : null) ??
      normalizePlayerAvatarUrl(previous.players[index]?.avatar) ??
      (pid ? getCachedPlayerAvatar(pid) : null);
    if (prevUri) return { ...p, avatar: prevUri };
    return p;
  });
  const changed = players.some((p, i) => p.avatar !== incoming.players[i]?.avatar);
  const result = changed ? { ...incoming, players } : incoming;
  rememberPartidoAvatars(result);
  return result;
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
  const fullName = profileDisplayName(profile);
  const initial = buildInitial(first, last, profile.username);
  const uri =
    normalizePlayerAvatarUrl(profile.avatarUrl) ?? getCachedPlayerAvatar(pid) ?? undefined;
  const levelLine = formatPlayerLevelFromElo(profile.eloRating);

  let changed = false;
  const players = partido.players.map((p, index) => {
    if (!shouldEnrichSlot(partido, index, p, pid, forceSlotIndex)) return p;

    const next = { ...p, id: p.id ?? pid };
    if (next.isFree) {
      next.isFree = false;
      changed = true;
    }
    if (uri) {
      next.avatar = uri;
      changed = true;
    }
    let levelToApply = levelLine;
    if (levelToApply === '—' && forceSlotIndex === index) {
      const cached = getCachedPlayerLevel(pid);
      if (cached) levelToApply = cached;
    }
    if (levelToApply !== '—' && normalizeLevelDisplay(next.level) !== levelToApply) {
      next.level = levelToApply;
      cachePlayerLevel(pid, levelToApply);
      changed = true;
    }
    if (fullName && (!next.name?.trim() || next.name === 'Jugador')) {
      next.name = fullName;
      changed = true;
    } else if (!next.name?.trim() && profile.username?.trim()) {
      next.name = profile.username.trim();
      changed = true;
    }
    if (!next.initial?.trim() || next.initial === '?') {
      next.initial = initial;
      changed = true;
    }
    // Tras unirse: asegurar iniciales aunque el nombre ya venga de la API.
    if (forceSlotIndex === index && initial && next.initial !== initial) {
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

  const result =
    changed || idsChanged || slotsChanged
      ? { ...partido, players, playerIds, playerIdsBySlot }
      : partido;
  if (uri) cachePlayerAvatar(pid, uri);
  rememberPartidoAvatars(result);
  rememberPartidoLevels(result);
  return result;
}

function normalizeLevelDisplay(level: string | undefined): string {
  return (level ?? '').trim().replace(/\./g, ',');
}

function levelDisplayIsEmpty(level: string | undefined): boolean {
  const n = normalizeLevelDisplay(level);
  return !n || n === '—';
}

/** Evita parpadeo de ELO cuando el refetch llega tarde con el mismo jugador en la plaza. */
export function preservePartidoPlayerLevels(
  previous: PartidoItem,
  incoming: PartidoItem,
): PartidoItem {
  const players = incoming.players.map((p, index) => {
    const prev = previous.players[index];
    const pid =
      playerIdAtSlot(incoming, index, p) ?? playerIdAtSlot(previous, index, prev ?? p);
    const prevPid = prev ? playerIdAtSlot(previous, index, prev) : null;
    if (!pid || !prevPid || pid !== prevPid) return p;

    const prevLevel = prev?.level?.trim();
    if (!prevLevel || prevLevel === '—') return p;

    const nextLevel = p.level?.trim();
    if (levelDisplayIsEmpty(nextLevel)) return { ...p, level: prevLevel };
    if (normalizeLevelDisplay(nextLevel) === normalizeLevelDisplay(prevLevel)) return p;
    return { ...p, level: prevLevel };
  });
  const changed = players.some((p, i) => p.level !== incoming.players[i]?.level);
  return changed ? { ...incoming, players } : incoming;
}

/** True si la UI de jugadores (avatar, nombre, ELO) no cambiaría visiblemente. */
export function partidoPlayersDisplayEqual(a: PartidoItem, b: PartidoItem): boolean {
  if (a.players.length !== b.players.length) return false;
  return a.players.every((pa, i) => {
    const pb = b.players[i];
    if (!pa || !pb) return false;
    if (pa.isFree !== pb.isFree) return false;
    if ((pa.id ?? '') !== (pb.id ?? '')) return false;
    if ((pa.name ?? '') !== (pb.name ?? '')) return false;
    if (normalizeLevelDisplay(pa.level) !== normalizeLevelDisplay(pb.level)) return false;
    if ((pa.initial ?? '') !== (pb.initial ?? '')) return false;
    const avA = normalizePlayerAvatarUrl(pa.avatar);
    const avB = normalizePlayerAvatarUrl(pb.avatar);
    return avA === avB;
  });
}

/** Fusiona respuesta del servidor con el estado local (avatares + perfil del jugador actual). */
export function mergePartidoWithServer(
  previous: PartidoItem,
  fromServer: PartidoItem,
  profile: ProfileForPartidoEnrich | null | undefined,
  opts?: EnrichPartidoOptions,
): PartidoItem {
  const base = preservePartidoPlayerAvatars(previous, fromServer);
  let next = enrichPartidoWithProfileAvatar(base, profile, opts);
  next = preservePartidoPlayerAvatars(previous, next);
  next = preservePartidoPlayerLevels(previous, next);
  return {
    ...next,
    organizerPlayerId: next.organizerPlayerId ?? previous.organizerPlayerId,
    matchType: next.matchType ?? previous.matchType,
    matchStatus: next.matchStatus ?? previous.matchStatus,
    bookingStatus: next.bookingStatus ?? previous.bookingStatus,
    hasMyFeedback: next.hasMyFeedback === true || previous.hasMyFeedback === true,
    venueImage: next.venueImage ?? previous.venueImage,
    venueAddress: next.venueAddress ?? previous.venueAddress,
  };
}

/** Fallback: catálogo de clubes (`/search/courts`) cuando la API de matches aún no trae imagen. */
export function enrichPartidosWithClubImages(
  items: PartidoItem[],
  clubs: Array<{ id: string; imageUrl: string | null }>,
): PartidoItem[] {
  if (clubs.length === 0) return items;
  const byId = new Map(clubs.map((c) => [c.id, c.imageUrl]));
  return items.map((p) => {
    if (p.venueImage?.trim() || !p.clubId) return p;
    const img = byId.get(p.clubId);
    return img?.trim() ? { ...p, venueImage: img.trim() } : p;
  });
}

/** Enriquece una lista de partidos con el perfil del jugador actual. */
export function enrichPartidosWithProfileAvatar(
  items: PartidoItem[],
  profile: ProfileForPartidoEnrich | null | undefined,
): PartidoItem[] {
  if (!profile?.id?.trim()) return items;
  cachePlayerAvatar(profile.id, profile.avatarUrl);
  return items.map((p) => enrichPartidoWithProfileAvatar(p, profile));
}

/** Inserta o actualiza un partido en la lista "Mis partidos" (orden por startAt). */
export function upsertMisPartidosList(items: PartidoItem[], next: PartidoItem): PartidoItem[] {
  const idx = items.findIndex((p) => p.id === next.id);
  const mergedItem = idx >= 0 ? preservePartidoPlayerAvatars(items[idx], next) : next;
  rememberPartidoAvatars(mergedItem);
  const merged =
    idx >= 0 ? items.map((p, i) => (i === idx ? mergedItem : p)) : [mergedItem, ...items];
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
  const prevById = new Map(previous.map((p) => [p.id, p]));
  let merged = fromServer.map((incoming) => {
    const prev = prevById.get(incoming.id);
    return prev ? preservePartidoPlayerAvatars(prev, incoming) : incoming;
  });
  const serverIds = new Set(fromServer.map((p) => p.id));
  for (const p of previous) {
    if (serverIds.has(p.id) || p.matchPhase === 'past') continue;
    merged = upsertMisPartidosList(merged, p);
  }
  merged.forEach(rememberPartidoAvatars);
  return merged;
}
