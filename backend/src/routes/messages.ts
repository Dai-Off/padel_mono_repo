import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { getPlayerIdFromBearer } from '../lib/authPlayer';
import { publishDirectMessage, publishThreadRead } from '../lib/messagesRealtime';

const router = Router();

const BODY_MAX = 2000;
const THREAD_PAGE = 50;
const CONVERSATIONS_FETCH = 800;

function peerIdForRow(me: string, row: { sender_player_id: string; recipient_player_id: string }): string {
  return row.sender_player_id === me ? row.recipient_player_id : row.sender_player_id;
}

/**
 * GET /messages/conversations
 * Lista conversaciones (último mensaje por pareja) + no leídos.
 */
router.get('/conversations', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr || !playerId) {
    return res.status(401).json({ ok: false, error: authErr ?? 'No autorizado' });
  }

  const supabase = getSupabaseServiceRoleClient();

  const { data: rows, error } = await supabase
    .from('player_direct_messages')
    .select('id, created_at, body, read_at, sender_player_id, recipient_player_id')
    .or(`sender_player_id.eq.${playerId},recipient_player_id.eq.${playerId}`)
    .order('created_at', { ascending: false })
    .limit(CONVERSATIONS_FETCH);

  if (error) return res.status(500).json({ ok: false, error: error.message });

  const peerOrder: string[] = [];
  const seen = new Set<string>();
  const lastByPeer = new Map<string, { created_at: string; body: string }>();

  for (const row of rows ?? []) {
    const peer = peerIdForRow(playerId, row);
    if (!seen.has(peer)) {
      seen.add(peer);
      peerOrder.push(peer);
      lastByPeer.set(peer, { created_at: row.created_at as string, body: String(row.body ?? '') });
    }
  }

  let peersMeta: { id: string; first_name: string; last_name: string; avatar_url: string | null }[] = [];
  if (peerOrder.length > 0) {
    const { data: players, error: ep } = await supabase
      .from('players')
      .select('id, first_name, last_name, avatar_url')
      .in('id', peerOrder);
    if (ep) return res.status(500).json({ ok: false, error: ep.message });
    peersMeta = (players ?? []) as typeof peersMeta;
  }
  const metaById = new Map(peersMeta.map((p) => [p.id, p]));

  const { data: unreadRows, error: uErr } = await supabase
    .from('player_direct_messages')
    .select('sender_player_id')
    .eq('recipient_player_id', playerId)
    .is('read_at', null);

  if (uErr) return res.status(500).json({ ok: false, error: uErr.message });

  const unreadByPeer = new Map<string, number>();
  for (const u of unreadRows ?? []) {
    const sid = u.sender_player_id as string;
    unreadByPeer.set(sid, (unreadByPeer.get(sid) ?? 0) + 1);
  }

  const conversations = peerOrder.map((peer) => {
    const meta = metaById.get(peer);
    const last = lastByPeer.get(peer)!;
    return {
      peer_player_id: peer,
      peer_first_name: meta?.first_name ?? '',
      peer_last_name: meta?.last_name ?? '',
      peer_avatar_url: meta?.avatar_url ?? null,
      last_message_at: last.created_at,
      last_message_preview: last.body.length > 120 ? `${last.body.slice(0, 117)}…` : last.body,
      unread_count: unreadByPeer.get(peer) ?? 0,
    };
  });

  return res.json({ ok: true, conversations });
});

/**
 * GET /messages/thread/:peerPlayerId?limit=&before=
 * Mensajes entre el jugador autenticado y otro jugador (más recientes primero).
 */
router.get('/thread/:peerPlayerId', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr || !playerId) {
    return res.status(401).json({ ok: false, error: authErr ?? 'No autorizado' });
  }

  const peerPlayerId = String(req.params.peerPlayerId ?? '').trim();
  if (!peerPlayerId || peerPlayerId === playerId) {
    return res.status(400).json({ ok: false, error: 'peer inválido' });
  }

  const limit = Math.min(
    THREAD_PAGE,
    Math.max(1, parseInt(String(req.query.limit ?? ''), 10) || THREAD_PAGE)
  );
  const before = typeof req.query.before === 'string' ? req.query.before.trim() : '';

  const supabase = getSupabaseServiceRoleClient();

  const { data: peerExists } = await supabase.from('players').select('id').eq('id', peerPlayerId).maybeSingle();
  if (!peerExists) return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });

  let q = supabase
    .from('player_direct_messages')
    .select('id, created_at, body, read_at, sender_player_id, recipient_player_id')
    .or(
      `and(sender_player_id.eq.${playerId},recipient_player_id.eq.${peerPlayerId}),and(sender_player_id.eq.${peerPlayerId},recipient_player_id.eq.${playerId})`
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) {
    q = q.lt('created_at', before);
  }

  const { data: rows, error } = await q;
  if (error) return res.status(500).json({ ok: false, error: error.message });

  const normalized = (rows ?? []).map((m) => ({
    id: m.id as string,
    created_at: m.created_at as string,
    body: String(m.body ?? ''),
    read_at: (m.read_at as string | null) ?? null,
    mine: m.sender_player_id === playerId,
  }));

  return res.json({ ok: true, messages: normalized });
});

/**
 * POST /messages
 * body: { recipient_player_id: string, body: string }
 */
router.post('/', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr || !playerId) {
    return res.status(401).json({ ok: false, error: authErr ?? 'No autorizado' });
  }

  const recipient = typeof req.body?.recipient_player_id === 'string' ? req.body.recipient_player_id.trim() : '';
  const bodyRaw = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!recipient || recipient === playerId) {
    return res.status(400).json({ ok: false, error: 'recipient_player_id inválido' });
  }
  if (!bodyRaw || bodyRaw.length > BODY_MAX) {
    return res.status(400).json({ ok: false, error: `El mensaje debe tener 1–${BODY_MAX} caracteres` });
  }

  const supabase = getSupabaseServiceRoleClient();
  const { data: recipientRow, error: rErr } = await supabase
    .from('players')
    .select('id, status')
    .eq('id', recipient)
    .maybeSingle();
  if (rErr) return res.status(500).json({ ok: false, error: rErr.message });
  if (!recipientRow || String((recipientRow as { status?: string }).status) !== 'active') {
    return res.status(404).json({ ok: false, error: 'Destinatario no encontrado' });
  }

  const { data: inserted, error: insErr } = await supabase
    .from('player_direct_messages')
    .insert({
      sender_player_id: playerId,
      recipient_player_id: recipient,
      body: bodyRaw,
    })
    .select('id, created_at, body, read_at, sender_player_id, recipient_player_id')
    .single();

  if (insErr) return res.status(500).json({ ok: false, error: insErr.message });

  publishDirectMessage({
    id: inserted.id as string,
    created_at: inserted.created_at as string,
    body: String(inserted.body ?? ''),
    read_at: (inserted.read_at as string | null) ?? null,
    sender_player_id: inserted.sender_player_id as string,
    recipient_player_id: inserted.recipient_player_id as string,
  });

  return res.status(201).json({
    ok: true,
    message: {
      id: inserted.id as string,
      created_at: inserted.created_at as string,
      body: String(inserted.body ?? ''),
      read_at: (inserted.read_at as string | null) ?? null,
      mine: true,
    },
  });
});

/**
 * POST /messages/read/:peerPlayerId
 * Marca como leídos los mensajes recibidos desde ese jugador.
 */
router.post('/read/:peerPlayerId', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr || !playerId) {
    return res.status(401).json({ ok: false, error: authErr ?? 'No autorizado' });
  }

  const peerPlayerId = String(req.params.peerPlayerId ?? '').trim();
  if (!peerPlayerId || peerPlayerId === playerId) {
    return res.status(400).json({ ok: false, error: 'peer inválido' });
  }

  const supabase = getSupabaseServiceRoleClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('player_direct_messages')
    .update({ read_at: now })
    .eq('recipient_player_id', playerId)
    .eq('sender_player_id', peerPlayerId)
    .is('read_at', null);

  if (error) return res.status(500).json({ ok: false, error: error.message });

  publishThreadRead({
    reader_player_id: playerId,
    peer_player_id: peerPlayerId,
    read_at: now,
  });

  return res.json({ ok: true });
});

export default router;
