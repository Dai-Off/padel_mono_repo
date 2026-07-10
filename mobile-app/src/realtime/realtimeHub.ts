import type { RealtimeTopic } from './topics';

export type RealtimeEventSource = 'supabase' | 'fallback';

export type RealtimeChangePayload = {
  table: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
};

export type RealtimeHubEvent = {
  topic: RealtimeTopic;
  source: RealtimeEventSource;
  payload: RealtimeChangePayload;
};

type Listener = (event: RealtimeHubEvent) => void;

const listeners = new Set<Listener>();

export function subscribeRealtimeHub(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitRealtimeHub(event: RealtimeHubEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}
