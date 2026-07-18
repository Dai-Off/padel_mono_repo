import type { CourtReservation } from '../../../api/bookings';
import {
  canRecordMatchScore,
  isPartidoCancelled,
  isPostMatchActionWindowOpen,
  isPostMatchFlowOpen,
} from '../../../domain/matchLifecycle';
import type { PartidoItem } from '../../../screens/PartidosScreen';

export type HomeActivityType = 'open' | 'closed' | 'reservation';

/** Estado por defecto de los filtros: todo activo (tipos + finalizados). */
export const HOME_ACTIVITY_ALL_TYPES: HomeActivityType[] = ['open', 'closed', 'reservation'];
export const HOME_ACTIVITY_DEFAULT_SHOW_FINISHED = true;

export type HomeActivityItem =
  | { kind: 'partido'; data: PartidoItem }
  | { kind: 'reservation'; data: CourtReservation };

export function classifyPartidoActivityType(item: PartidoItem): 'open' | 'closed' {
  return item.visibility === 'private' ? 'closed' : 'open';
}

export function isPartidoFinished(item: PartidoItem, nowMs = Date.now()): boolean {
  if (isPartidoCancelled(item)) return false;
  if ((item.matchPhase ?? 'upcoming') === 'past') return true;
  const endMs = item.endAt ? new Date(item.endAt).getTime() : NaN;
  return Number.isFinite(endMs) && nowMs >= endMs;
}

export function isReservationFinished(item: CourtReservation, nowMs = Date.now()): boolean {
  const endMs = new Date(item.end_at).getTime();
  return Number.isFinite(endMs) && nowMs >= endMs;
}

export function isActivityFinished(item: HomeActivityItem, nowMs = Date.now()): boolean {
  return item.kind === 'partido'
    ? isPartidoFinished(item.data, nowMs)
    : isReservationFinished(item.data, nowMs);
}

export function activityStartMs(item: HomeActivityItem): number {
  if (item.kind === 'partido') {
    const iso = item.data.startAtIso ?? item.data.startAt;
    const ms = iso ? new Date(iso).getTime() : NaN;
    return Number.isFinite(ms) ? ms : 0;
  }
  const ms = new Date(item.data.start_at).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Un partido finalizado solo permanece en el home mientras el flujo post-partido
 * sigue abierto para mí (ver isPostMatchFlowOpen) y el partido llegó a 4 jugadores.
 */
function isFinishedPartidoActionable(item: PartidoItem, nowMs: number): boolean {
  const filled = item.players.filter((p) => !p.isFree).length;
  if (!canRecordMatchScore(item.matchStatus, filled)) return false;
  return isPostMatchFlowOpen(item, nowMs);
}

export function buildHomeActivityItems(
  partidos: PartidoItem[],
  reservations: CourtReservation[],
  nowMs = Date.now(),
): HomeActivityItem[] {
  const items: HomeActivityItem[] = [];
  for (const p of partidos) {
    if (isPartidoCancelled(p)) continue;
    if (isPartidoFinished(p, nowMs) && !isFinishedPartidoActionable(p, nowMs)) continue;
    items.push({ kind: 'partido', data: p });
  }
  for (const r of reservations) {
    if (String(r.status ?? '').toLowerCase() === 'cancelled') continue;
    if (isReservationFinished(r, nowMs) && !isPostMatchActionWindowOpen(r.end_at, nowMs)) continue;
    items.push({ kind: 'reservation', data: r });
  }
  return items;
}

export function filterHomeActivityItems(
  items: HomeActivityItem[],
  opts: {
    typeFilters: HomeActivityType[];
    showFinished: boolean;
    nowMs?: number;
  },
): HomeActivityItem[] {
  const nowMs = opts.nowMs ?? Date.now();
  const activeTypes = new Set(opts.typeFilters);

  const filtered = items.filter((item) => {
    if (!opts.showFinished && isActivityFinished(item, nowMs)) return false;

    if (item.kind === 'reservation') return activeTypes.has('reservation');
    const t = classifyPartidoActivityType(item.data);
    return activeTypes.has(t);
  });

  // Próximos/en curso primero (el más inminente antes); finalizados al final (el más reciente antes).
  return filtered.sort((a, b) => {
    const aFinished = isActivityFinished(a, nowMs);
    const bFinished = isActivityFinished(b, nowMs);
    if (aFinished !== bFinished) return aFinished ? 1 : -1;
    const diff = activityStartMs(a) - activityStartMs(b);
    return aFinished ? -diff : diff;
  });
}
