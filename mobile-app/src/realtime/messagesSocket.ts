import { API_URL } from '../config';

type DirectMessageEvent = {
  type: 'direct_message';
  message: {
    id: string;
    created_at: string;
    body: string;
    read_at: string | null;
    sender_player_id: string;
    recipient_player_id: string;
  };
};

type ThreadReadEvent = {
  type: 'thread_read';
  reader_player_id: string;
  peer_player_id: string;
  read_at: string;
};

type ConnectedEvent = {
  type: 'connected';
  player_id: string;
};

type ErrorEvent = {
  type: 'error';
  error: string;
};

export type MessagesSocketEvent = DirectMessageEvent | ThreadReadEvent | ConnectedEvent | ErrorEvent;

type Listener = (event: MessagesSocketEvent) => void;

let socket: WebSocket | null = null;
let socketToken: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function getMessagesWsUrl(token: string): string {
  const url = new URL(API_URL);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/messages/ws';
  url.search = '';
  url.searchParams.set('token', token);
  return url.toString();
}

function emit(event: MessagesSocketEvent) {
  for (const listener of listeners) {
    listener(event);
  }
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function closeCurrentSocket() {
  if (!socket) return;
  try {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    socket.close();
  } catch {
    // no-op
  }
  socket = null;
}

function scheduleReconnect(token: string) {
  if (reconnectTimer || listeners.size === 0) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (listeners.size > 0) {
      connectMessagesSocket(token);
    }
  }, 1200);
}

export function connectMessagesSocket(token: string | null | undefined): void {
  const normalized = typeof token === 'string' ? token.trim() : '';
  if (!normalized) {
    socketToken = null;
    clearReconnect();
    closeCurrentSocket();
    return;
  }

  if (socket && socket.readyState === WebSocket.OPEN && socketToken === normalized) {
    return;
  }

  if (socket && socketToken !== normalized) {
    closeCurrentSocket();
  }
  socketToken = normalized;
  clearReconnect();

  const ws = new WebSocket(getMessagesWsUrl(normalized));
  socket = ws;

  ws.onmessage = (event) => {
    try {
      const payload = JSON.parse(String(event.data)) as MessagesSocketEvent;
      emit(payload);
    } catch {
      // ignore invalid frames
    }
  };

  ws.onerror = () => {
    // reconnect handled in close
  };

  ws.onclose = () => {
    if (socket === ws) {
      socket = null;
      if (socketToken) scheduleReconnect(socketToken);
    }
  };
}

export function subscribeMessagesSocket(
  token: string | null | undefined,
  listener: Listener
): () => void {
  listeners.add(listener);
  connectMessagesSocket(token);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearReconnect();
      closeCurrentSocket();
    }
  };
}
