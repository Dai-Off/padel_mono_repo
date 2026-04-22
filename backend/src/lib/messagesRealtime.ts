import { IncomingMessage } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { getSupabaseServiceRoleClient } from './supabase';

type WireMessage =
  | {
      type: 'connected';
      player_id: string;
    }
  | {
      type: 'direct_message';
      message: {
        id: string;
        created_at: string;
        body: string;
        read_at: string | null;
        sender_player_id: string;
        recipient_player_id: string;
      };
    }
  | {
      type: 'thread_read';
      reader_player_id: string;
      peer_player_id: string;
      read_at: string;
    }
  | {
      type: 'error';
      error: string;
    };

type DirectMessagePayload = {
  id: string;
  created_at: string;
  body: string;
  read_at: string | null;
  sender_player_id: string;
  recipient_player_id: string;
};

type ThreadReadPayload = {
  reader_player_id: string;
  peer_player_id: string;
  read_at: string;
};

type RealtimeHub = {
  publishDirectMessage: (payload: DirectMessagePayload) => void;
  publishThreadRead: (payload: ThreadReadPayload) => void;
};

let hub: RealtimeHub | null = null;

function sendSocketJson(ws: WebSocket, payload: WireMessage) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function parseTokenFromRequest(req: IncomingMessage): string {
  try {
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url || '/', `http://${host}`);
    return String(url.searchParams.get('token') || '').trim();
  } catch {
    return '';
  }
}

async function resolvePlayerIdFromToken(token: string): Promise<string | null> {
  if (!token) return null;
  const supabase = getSupabaseServiceRoleClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user?.email) return null;

  const email = String(user.email).trim().toLowerCase();
  const { data: player, error: ePlayer } = await supabase
    .from('players')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (ePlayer || !player?.id) return null;

  return String(player.id);
}

export function initMessagesRealtime(wss: WebSocketServer): void {
  const socketsByPlayer = new Map<string, Set<WebSocket>>();
  const playerBySocket = new Map<WebSocket, string>();

  wss.on('connection', async (ws, req) => {
    const token = parseTokenFromRequest(req);
    const playerId = await resolvePlayerIdFromToken(token);
    if (!playerId) {
      sendSocketJson(ws, { type: 'error', error: 'Sesión inválida' });
      ws.close(4001, 'unauthorized');
      return;
    }

    let playerSockets = socketsByPlayer.get(playerId);
    if (!playerSockets) {
      playerSockets = new Set<WebSocket>();
      socketsByPlayer.set(playerId, playerSockets);
    }
    playerSockets.add(ws);
    playerBySocket.set(ws, playerId);

    sendSocketJson(ws, { type: 'connected', player_id: playerId });

    ws.on('close', () => {
      const pid = playerBySocket.get(ws);
      if (!pid) return;
      playerBySocket.delete(ws);
      const set = socketsByPlayer.get(pid);
      if (!set) return;
      set.delete(ws);
      if (set.size === 0) socketsByPlayer.delete(pid);
    });
  });

  hub = {
    publishDirectMessage(payload) {
      const recipients = [payload.sender_player_id, payload.recipient_player_id];
      for (const pid of recipients) {
        const set = socketsByPlayer.get(pid);
        if (!set || set.size === 0) continue;
        for (const ws of set) {
          sendSocketJson(ws, { type: 'direct_message', message: payload });
        }
      }
    },
    publishThreadRead(payload) {
      const recipients = [payload.reader_player_id, payload.peer_player_id];
      for (const pid of recipients) {
        const set = socketsByPlayer.get(pid);
        if (!set || set.size === 0) continue;
        for (const ws of set) {
          sendSocketJson(ws, { type: 'thread_read', ...payload });
        }
      }
    },
  };
}

export function publishDirectMessage(payload: DirectMessagePayload): void {
  hub?.publishDirectMessage(payload);
}

export function publishThreadRead(payload: ThreadReadPayload): void {
  hub?.publishThreadRead(payload);
}
