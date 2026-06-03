import type { PartidoItem } from '../screens/PartidosScreen';

/** Rellena avatar del jugador actual desde el perfil cacheado (evita iniciales tras unirse). */
export function enrichPartidoWithProfileAvatar(
  partido: PartidoItem,
  playerId: string | null | undefined,
  avatarUrl: string | null | undefined,
): PartidoItem {
  const pid = playerId?.trim();
  const uri = avatarUrl?.trim();
  if (!pid || !uri) return partido;
  let changed = false;
  const players = partido.players.map((p) => {
    if (p.isFree || p.id !== pid || p.avatar === uri) return p;
    changed = true;
    return { ...p, avatar: uri };
  });
  return changed ? { ...partido, players } : partido;
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
