import type { CourtReservation } from '../../../api/bookings';
import { isPartidoCancelled } from '../../../domain/matchLifecycle';
import type { PartidoItem } from '../../../screens/PartidosScreen';

export type HomeActivityType = 'open' | 'closed' | 'reservation';

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

export function buildHomeActivityItems(
  partidos: PartidoItem[],
  reservations: CourtReservation[],
): HomeActivityItem[] {
  const items: HomeActivityItem[] = [];
  for (const p of partidos) {
    if (isPartidoCancelled(p)) continue;
    items.push({ kind: 'partido', data: p });
  }
  for (const r of reservations) {
    if (String(r.status ?? '').toLowerCase() === 'cancelled') continue;
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
    const finished = isActivityFinished(item, nowMs);
    if (opts.showFinished !== finished) return false;

    if (activeTypes.size === 0) return true;

    if (item.kind === 'reservation') return activeTypes.has('reservation');
    const t = classifyPartidoActivityType(item.data);
    return activeTypes.has(t);
  });

  return filtered.sort((a, b) => {
    const diff = activityStartMs(a) - activityStartMs(b);
    return opts.showFinished ? -diff : diff;
  });
}
