import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase';
import { emitRealtimeHub } from './realtimeHub';
import { REALTIME_TABLES, topicForTable } from './topics';

const CHANNEL_NAME = 'padel-mobile-global';

let channel: RealtimeChannel | null = null;
let boundClient: SupabaseClient | null = null;

export type RealtimeConnectionStatus = 'disabled' | 'connecting' | 'connected' | 'error';

type StatusListener = (status: RealtimeConnectionStatus) => void;
const statusListeners = new Set<StatusListener>();

let currentStatus: RealtimeConnectionStatus = 'disabled';

function setStatus(status: RealtimeConnectionStatus): void {
  if (currentStatus === status) return;
  currentStatus = status;
  for (const listener of statusListeners) {
    listener(status);
  }
}

export function getRealtimeConnectionStatus(): RealtimeConnectionStatus {
  return currentStatus;
}

export function subscribeRealtimeStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  listener(currentStatus);
  return () => statusListeners.delete(listener);
}

function teardownChannel(): void {
  if (channel && boundClient) {
    void boundClient.removeChannel(channel);
  }
  channel = null;
  boundClient = null;
}

export async function connectSupabaseRealtime(
  session: { access_token: string; refresh_token: string } | null,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !session?.access_token) {
    teardownChannel();
    setStatus('disabled');
    return;
  }

  if (boundClient === client && channel && currentStatus === 'connected') {
    await client.realtime.setAuth(session.access_token);
    return;
  }

  teardownChannel();
  boundClient = client;
  setStatus('connecting');

  const { error: authError } = await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (authError) {
    setStatus('error');
    return;
  }

  await client.realtime.setAuth(session.access_token);

  const ch = client.channel(CHANNEL_NAME);
  for (const table of REALTIME_TABLES) {
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload) => {
        const topic = topicForTable(table);
        if (!topic) return;
        emitRealtimeHub({
          topic,
          source: 'supabase',
          payload: {
            table,
            eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            new: (payload.new as Record<string, unknown> | null) ?? null,
            old: (payload.old as Record<string, unknown> | null) ?? null,
          },
        });
      },
    );
  }

  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      setStatus('connected');
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      setStatus('error');
    } else if (status === 'CLOSED') {
      setStatus('disabled');
    }
  });

  channel = ch;
}

export function disconnectSupabaseRealtime(): void {
  teardownChannel();
  setStatus('disabled');
}
