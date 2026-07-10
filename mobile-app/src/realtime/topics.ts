/** Tablas Supabase → topics de invalidación en la app (un solo mapa para mantener). */
export const REALTIME_TABLE_TOPICS = {
  bookings: 'bookings',
  matches: 'matches',
  match_players: 'match_players',
  match_invites: 'match_invites',
  matchmaking_pool: 'matchmaking',
  matchmaking_pair_invites: 'matchmaking_pair_invites',
  tournament_inscriptions: 'tournaments',
  tournament_chat_messages: 'tournament_chat',
  player_unlockables: 'unlockables',
} as const;

export type RealtimeTable = keyof typeof REALTIME_TABLE_TOPICS;
export type RealtimeTopic = (typeof REALTIME_TABLE_TOPICS)[RealtimeTable];

export const REALTIME_TABLES = Object.keys(REALTIME_TABLE_TOPICS) as RealtimeTable[];

export function topicForTable(table: string): RealtimeTopic | null {
  if (table in REALTIME_TABLE_TOPICS) {
    return REALTIME_TABLE_TOPICS[table as RealtimeTable];
  }
  return null;
}
