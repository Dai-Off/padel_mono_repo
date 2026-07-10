import { useEffect, useRef } from 'react';
import { subscribeRealtimeHub, type RealtimeHubEvent } from './realtimeHub';
import type { RealtimeTopic } from './topics';

export type RealtimeInvalidationFilter = (
  event: RealtimeHubEvent,
  ctx: { playerId: string | null },
) => boolean;

type Options = {
  enabled?: boolean;
  debounceMs?: number;
  filter?: RealtimeInvalidationFilter;
  playerId?: string | null;
};

/**
 * Suscribe un callback a uno o más topics del hub central.
 * Toda la app invalida/refresca datos por aquí — si falla el realtime, se arregla en un solo lugar.
 */
export function useRealtimeInvalidation(
  topics: RealtimeTopic | RealtimeTopic[],
  onInvalidate: (event: RealtimeHubEvent) => void,
  opts?: Options,
): void {
  const enabled = opts?.enabled ?? true;
  const debounceMs = opts?.debounceMs ?? 350;
  const topicSet = useRef(new Set<RealtimeTopic>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEventRef = useRef<RealtimeHubEvent | null>(null);
  const onInvalidateRef = useRef(onInvalidate);
  const filterRef = useRef(opts?.filter);
  const playerIdRef = useRef(opts?.playerId ?? null);

  onInvalidateRef.current = onInvalidate;
  filterRef.current = opts?.filter;
  playerIdRef.current = opts?.playerId ?? null;

  useEffect(() => {
    topicSet.current = new Set(Array.isArray(topics) ? topics : [topics]);
  }, [topics]);

  useEffect(() => {
    if (!enabled) return;

    const flush = () => {
      timerRef.current = null;
      const ev = pendingEventRef.current;
      pendingEventRef.current = null;
      if (ev) onInvalidateRef.current(ev);
    };

    const schedule = (event: RealtimeHubEvent) => {
      pendingEventRef.current = event;
      if (timerRef.current) return;
      timerRef.current = setTimeout(flush, debounceMs);
    };

    const unsubscribe = subscribeRealtimeHub((event) => {
      if (!topicSet.current.has(event.topic)) return;
      const filter = filterRef.current;
      if (filter && !filter(event, { playerId: playerIdRef.current })) return;
      schedule(event);
    });

    return () => {
      unsubscribe();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pendingEventRef.current = null;
    };
  }, [enabled, debounceMs]);
}
