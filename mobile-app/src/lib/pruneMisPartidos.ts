import { fetchMatchById } from '../api/matches';
import { getMatchBooking, isPartidoCancelled } from '../domain/matchLifecycle';
import type { PartidoItem } from '../screens/PartidosScreen';

/** Partidos locales que ya no están en /matches/mine — verificar si el partido sigue activo. */
export async function findMisPartidoIdsToRemove(
  items: PartidoItem[],
  serverIds: ReadonlySet<string>,
  token: string,
): Promise<Set<string>> {
  const remove = new Set<string>();
  const orphans = items.filter((p) => !serverIds.has(p.id));

  await Promise.all(
    orphans.map(async (p) => {
      if (isPartidoCancelled(p)) {
        remove.add(p.id);
        return;
      }
      const m = await fetchMatchById(p.id, token);
      if (!m) {
        remove.add(p.id);
        return;
      }
      if (String(m.status ?? '').toLowerCase() === 'cancelled') {
        remove.add(p.id);
        return;
      }
      const b = getMatchBooking(m) as {
        deleted_at?: string | null;
        status?: string | null;
      } | null;
      if (b?.deleted_at != null || String(b?.status ?? '').toLowerCase() === 'cancelled') {
        remove.add(p.id);
      }
    }),
  );

  return remove;
}
