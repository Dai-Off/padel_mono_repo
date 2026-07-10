import { emitRealtimeHub } from './realtimeHub';
import { REALTIME_TABLE_TOPICS, type RealtimeTable } from './topics';

/** Intervalos de respaldo cuando Supabase Realtime no está conectado. */
const FALLBACK_INTERVAL_MS: Partial<Record<RealtimeTable, number>> = {
  bookings: 15_000,
  matches: 8_000,
  match_players: 4_000,
  match_invites: 8_000,
  matchmaking_pool: 5_000,
  matchmaking_pair_invites: 5_000,
  tournament_inscriptions: 15_000,
  tournament_chat_messages: 5_000,
  player_unlockables: 60_000,
};

let active = false;
const timers = new Map<RealtimeTable, ReturnType<typeof setInterval>>();

function emitFallback(table: RealtimeTable): void {
  const topic = REALTIME_TABLE_TOPICS[table];
  emitRealtimeHub({
    topic,
    source: 'fallback',
    payload: {
      table,
      eventType: 'UPDATE',
      new: null,
      old: null,
    },
  });
}

export function startFallbackPolling(): void {
  if (active) return;
  active = true;
  for (const [table, ms] of Object.entries(FALLBACK_INTERVAL_MS) as [RealtimeTable, number][]) {
    if (timers.has(table)) continue;
    timers.set(
      table,
      setInterval(() => emitFallback(table), ms),
    );
  }
}

export function stopFallbackPolling(): void {
  active = false;
  for (const timer of timers.values()) {
    clearInterval(timer);
  }
  timers.clear();
}
