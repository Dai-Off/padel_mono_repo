import { API_URL } from '../config';

function headers(token: string | null | undefined) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export type DirectConversation = {
  peer_player_id: string;
  peer_first_name: string;
  peer_last_name: string;
  peer_avatar_url: string | null;
  last_message_at: string;
  last_message_preview: string;
  unread_count: number;
};

export type DirectThreadMessage = {
  id: string;
  created_at: string;
  body: string;
  read_at: string | null;
  mine: boolean;
};

export async function fetchDirectConversations(
  token: string | null | undefined
): Promise<{ ok: true; conversations: DirectConversation[] } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Inicia sesión para ver tus mensajes' };
  try {
    const res = await fetch(`${API_URL}/messages/conversations`, { headers: headers(token) });
    const json = (await res.json()) as { ok?: boolean; conversations?: DirectConversation[]; error?: string };
    if (!res.ok || !json.ok) return { ok: false, error: json.error ?? 'No se pudieron cargar las conversaciones' };
    return { ok: true, conversations: json.conversations ?? [] };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function fetchDirectThread(
  peerPlayerId: string,
  token: string | null | undefined,
  opts?: { limit?: number; before?: string }
): Promise<{ ok: true; messages: DirectThreadMessage[] } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Inicia sesión para ver el chat' };
  try {
    const url = new URL(`${API_URL}/messages/thread/${encodeURIComponent(peerPlayerId)}`);
    if (opts?.limit) url.searchParams.set('limit', String(opts.limit));
    if (opts?.before) url.searchParams.set('before', opts.before);
    const res = await fetch(url.toString(), { headers: headers(token) });
    const json = (await res.json()) as { ok?: boolean; messages?: DirectThreadMessage[]; error?: string };
    if (!res.ok || !json.ok) return { ok: false, error: json.error ?? 'No se pudieron cargar los mensajes' };
    return { ok: true, messages: json.messages ?? [] };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function sendDirectMessage(
  recipientPlayerId: string,
  body: string,
  token: string | null | undefined
): Promise<{ ok: true; message: DirectThreadMessage } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Inicia sesión para enviar mensajes' };
  try {
    const res = await fetch(`${API_URL}/messages`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({ recipient_player_id: recipientPlayerId, body }),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      message?: DirectThreadMessage;
      error?: string;
    };
    if (!res.ok || !json.ok || !json.message) return { ok: false, error: json.error ?? 'No se pudo enviar el mensaje' };
    return { ok: true, message: json.message };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function markDirectThreadRead(
  peerPlayerId: string,
  token: string | null | undefined
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Sesión requerida' };
  try {
    const res = await fetch(`${API_URL}/messages/read/${encodeURIComponent(peerPlayerId)}`, {
      method: 'POST',
      headers: headers(token),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) return { ok: false, error: json.error ?? 'No se pudo marcar como leído' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}
