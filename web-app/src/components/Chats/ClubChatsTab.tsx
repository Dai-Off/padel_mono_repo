import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bell, MessageSquare, Send, Trophy } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { tournamentsService, type TournamentChatMessage } from '../../services/tournaments';
import { authService } from '../../services/auth';
import {
  clubChatsService,
  type ChatSummary,
  type BookingChatMessageRow,
} from '../../services/clubChats';
import { notifyClubChatMentionsChanged } from '../../hooks/useClubChatMentionsCount';

type Props = {
  clubId: string | null;
  clubResolved: boolean;
};

type ChatFilter = 'turnos' | 'torneos' | 'notificaciones';
type ChatListSort = 'recent' | 'oldest';
type ChannelType = 'booking' | 'tournament';
type AuthorRole = 'me' | 'other';

type ChannelMessage = {
  id: string;
  created_at: string;
  author_name: string;
  text: string;
  role: AuthorRole;
};

type Channel = {
  id: string;
  type: ChannelType;
  title: string;
  subtitle: string | null;
  /** Fecha de referencia para ordenar/filtrar (última actividad o inicio del turno). */
  reference_at: string | null;
  /** Preview del último mensaje (texto + autor + fecha). */
  last_preview: string | null;
  /** Lleno solo si ya se cargaron los mensajes del canal. */
  messages: ChannelMessage[] | null;
};

type ClubNotification = {
  id: string;
  created_at: string;
  channel_id: string;
  channel_title: string;
  channel_type: ChannelType | 'court';
  message: string;
  author_name: string;
};

type MeIds = { authUserId: string | null; playerId: string | null };

const CLUB_MENTION_REGEX = /(^|\s)@club\b/i;

function isMine(authorUserId: string, me: MeIds): boolean {
  if (me.authUserId && authorUserId === me.authUserId) return true;
  if (me.playerId && authorUserId === me.playerId) return true;
  return false;
}

function normalizeBookingMessage(msg: BookingChatMessageRow, me: MeIds): ChannelMessage {
  return {
    id: msg.id,
    created_at: msg.created_at,
    author_name: msg.author_name || 'Usuario',
    text: msg.message,
    role: isMine(msg.author_user_id, me) ? 'me' : 'other',
  };
}

function normalizeTournamentMessage(msg: TournamentChatMessage, me: MeIds): ChannelMessage {
  return {
    id: msg.id,
    created_at: msg.created_at,
    author_name: msg.author_name || 'Usuario',
    text: msg.message,
    role: isMine(msg.author_user_id, me) ? 'me' : 'other',
  };
}

function formatBookingLabel(startAt: string, endAt: string): string {
  try {
    const start = new Date(startAt);
    const end = new Date(endAt);
    const date = start.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const sh = start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const eh = end.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    return `${date} · ${sh}–${eh}`;
  } catch {
    return '';
  }
}

function mapSummaryToChannels(summary: ChatSummary): Channel[] {
  const out: Channel[] = [];
  for (const b of summary.bookings) {
    out.push({
      id: `booking:${b.id}`,
      type: 'booking',
      title: `${b.court_name} · ${formatBookingLabel(b.start_at, b.end_at)}`,
      subtitle: b.last_message_author
        ? `${b.last_message_author}: ${b.last_message ?? ''}`
        : 'Sin mensajes aún',
      reference_at: b.last_message_at ?? b.start_at,
      last_preview: b.last_message,
      messages: null,
    });
  }
  for (const t of summary.tournaments) {
    out.push({
      id: `tournament:${t.id}`,
      type: 'tournament',
      title: `Torneo · ${t.name || t.description || 'Sin nombre'}`,
      subtitle: t.last_message_author
        ? `${t.last_message_author}: ${t.last_message ?? ''}`
        : 'Sin mensajes aún',
      reference_at: t.last_message_at,
      last_preview: t.last_message,
      messages: null,
    });
  }
  return out;
}

function mapMentions(summary: ChatSummary, channels: Channel[]): ClubNotification[] {
  const titleByChannelId = new Map(channels.map((c) => [c.id, c.title]));
  return summary.mentions.map((m) => {
    if (m.source_type === 'booking' && m.booking_id) {
      const cid = `booking:${m.booking_id}`;
      return {
        id: m.id,
        created_at: m.created_at,
        channel_id: cid,
        channel_title: titleByChannelId.get(cid) ?? 'Turno',
        channel_type: 'booking',
        message: m.message,
        author_name: m.author_name,
      };
    }
    if (m.source_type === 'tournament' && m.tournament_id) {
      const cid = `tournament:${m.tournament_id}`;
      return {
        id: m.id,
        created_at: m.created_at,
        channel_id: cid,
        channel_title: titleByChannelId.get(cid) ?? 'Torneo',
        channel_type: 'tournament',
        message: m.message,
        author_name: m.author_name,
      };
    }
    return {
      id: m.id,
      created_at: m.created_at,
      channel_id: `court:${m.court_id ?? ''}`,
      channel_title: 'Cancha',
      channel_type: 'court',
      message: m.message,
      author_name: m.author_name,
    };
  });
}

export function ClubChatsTab({ clubId, clubResolved }: Props) {
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [notifications, setNotifications] = useState<ClubNotification[]>([]);
  const [me, setMe] = useState<MeIds>({ authUserId: null, playerId: null });
  const [filter, setFilter] = useState<ChatFilter>('turnos');
  const [listSort, setListSort] = useState<ChatListSort>('recent');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  /** Caché en memoria para evitar recargar mensajes de un canal ya visitado. */
  const messagesCacheRef = useRef<Map<string, ChannelMessage[]>>(new Map());

  useEffect(() => {
    setSelectedChannelId(null);
    messagesCacheRef.current = new Map();
  }, [clubId]);

  useEffect(() => {
    if (!clubResolved) return;
    if (!clubId) {
      setLoading(false);
      setChannels([]);
      setNotifications([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [meRes, summary] = await Promise.all([
          authService.getMe(),
          clubChatsService.getSummary(clubId),
        ]);
        if (cancelled) return;
        const meIds: MeIds = {
          authUserId: meRes.user?.id ?? null,
          playerId: meRes.roles?.player_id ?? null,
        };
        setMe(meIds);
        const ch = mapSummaryToChannels(summary);
        setChannels(ch);
        setNotifications(mapMentions(summary, ch));
      } catch (e) {
        console.error(e);
        if (!cancelled) toast.error('No se pudieron cargar los chats');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clubId, clubResolved]);

  const filteredChannels = useMemo(() => {
    if (filter === 'turnos') return channels.filter((c) => c.type === 'booking');
    if (filter === 'torneos') return channels.filter((c) => c.type === 'tournament');
    return [];
  }, [channels, filter]);

  const sidebarChannels = useMemo(() => {
    let list = [...filteredChannels];
    const hasDateFilter = Boolean(dateFrom.trim() || dateTo.trim());
    if (hasDateFilter) {
      const fromMs = dateFrom.trim() ? startOfDayMs(dateFrom.trim()) : null;
      const toMs = dateTo.trim() ? endOfDayMs(dateTo.trim()) : null;
      list = list.filter((ch) => {
        const t = ch.reference_at ? new Date(ch.reference_at).getTime() : 0;
        if (!t) return false;
        if (fromMs != null && t < fromMs) return false;
        if (toMs != null && t > toMs) return false;
        return true;
      });
    }
    list.sort((a, b) => {
      const ta = a.reference_at ? new Date(a.reference_at).getTime() : 0;
      const tb = b.reference_at ? new Date(b.reference_at).getTime() : 0;
      return listSort === 'recent' ? tb - ta : ta - tb;
    });
    return list;
  }, [filteredChannels, listSort, dateFrom, dateTo]);

  useEffect(() => {
    if (filter === 'notificaciones') return;
    if (sidebarChannels.length === 0) {
      setSelectedChannelId(null);
      return;
    }
    if (!selectedChannelId || !sidebarChannels.some((c) => c.id === selectedChannelId)) {
      setSelectedChannelId(sidebarChannels[0].id);
    }
  }, [filter, sidebarChannels, selectedChannelId]);

  const selectedChannel = useMemo(
    () => sidebarChannels.find((c) => c.id === selectedChannelId) ?? sidebarChannels[0] ?? null,
    [sidebarChannels, selectedChannelId],
  );

  // Carga mensajes del canal seleccionado bajo demanda (caché en memoria).
  useEffect(() => {
    if (!selectedChannel) return;
    if (selectedChannel.messages != null) return;
    const cached = messagesCacheRef.current.get(selectedChannel.id);
    if (cached) {
      setChannels((prev) => prev.map((c) => (c.id === selectedChannel.id ? { ...c, messages: cached } : c)));
      return;
    }
    let cancelled = false;
    setLoadingMessages(true);
    void (async () => {
      try {
        let normalized: ChannelMessage[] = [];
        if (selectedChannel.type === 'booking') {
          const bookingId = selectedChannel.id.replace('booking:', '');
          const rows = await clubChatsService.listBookingChat(bookingId);
          normalized = rows.map((m) => normalizeBookingMessage(m, me));
        } else {
          const tournamentId = selectedChannel.id.replace('tournament:', '');
          const rows = await tournamentsService.listChat(tournamentId);
          normalized = rows.map((m) => normalizeTournamentMessage(m, me));
        }
        if (cancelled) return;
        messagesCacheRef.current.set(selectedChannel.id, normalized);
        setChannels((prev) => prev.map((c) => (c.id === selectedChannel.id ? { ...c, messages: normalized } : c)));
      } catch (e) {
        console.error(e);
        if (!cancelled) toast.error('No se pudieron cargar los mensajes');
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedChannel, me]);

  async function refreshMentions() {
    if (!clubId) return;
    try {
      const rows = await clubChatsService.listMentions(clubId);
      setNotifications(
        rows.map((m) => ({
          id: m.id,
          created_at: m.created_at,
          channel_id: m.source_type === 'booking' && m.booking_id
            ? `booking:${m.booking_id}`
            : m.source_type === 'tournament' && m.tournament_id
              ? `tournament:${m.tournament_id}`
              : `court:${m.court_id ?? ''}`,
          channel_title: channels.find((c) =>
            (m.source_type === 'booking' && c.id === `booking:${m.booking_id}`) ||
            (m.source_type === 'tournament' && c.id === `tournament:${m.tournament_id}`)
          )?.title ?? (m.source_type === 'tournament' ? 'Torneo' : 'Turno'),
          channel_type: m.source_type === 'booking' ? 'booking' : m.source_type === 'tournament' ? 'tournament' : 'court',
          message: m.message,
          author_name: m.author_name,
        })),
      );
    } catch {
      /* ignore */
    }
  }

  async function handleSendMessage() {
    if (!clubId || !selectedChannel || !draft.trim()) return;
    const message = draft.trim();
    setSending(true);
    try {
      let normalized: ChannelMessage[] = [];
      if (selectedChannel.type === 'tournament') {
        const tournamentId = selectedChannel.id.replace('tournament:', '');
        await tournamentsService.sendChat(tournamentId, message);
        const fresh = await tournamentsService.listChat(tournamentId);
        normalized = fresh.map((m) => normalizeTournamentMessage(m, me));
      } else {
        const bookingId = selectedChannel.id.replace('booking:', '');
        await clubChatsService.sendBookingChat(bookingId, message);
        const rows = await clubChatsService.listBookingChat(bookingId);
        normalized = rows.map((m) => normalizeBookingMessage(m, me));
      }
      messagesCacheRef.current.set(selectedChannel.id, normalized);
      setChannels((prev) =>
        prev.map((c) =>
          c.id === selectedChannel.id
            ? {
                ...c,
                messages: normalized,
                reference_at: normalized.at(-1)?.created_at ?? c.reference_at,
                last_preview: normalized.at(-1)?.text ?? c.last_preview,
                subtitle: normalized.at(-1)
                  ? `${normalized.at(-1)!.author_name}: ${normalized.at(-1)!.text}`
                  : c.subtitle,
              }
            : c,
        ),
      );

      if (CLUB_MENTION_REGEX.test(message)) {
        await refreshMentions();
        notifyClubChatMentionsChanged();
        toast.success('Mención @club registrada');
      }

      setDraft('');
    } catch (e) {
      console.error(e);
      toast.error('No se pudo enviar el mensaje');
    } finally {
      setSending(false);
    }
  }

  if (!clubResolved || loading) {
    return <div className="rounded-2xl border border-gray-100 bg-white p-5 text-sm text-gray-500">Cargando chats...</div>;
  }

  if (!clubId) {
    return <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 text-sm text-amber-900">No hay club seleccionado.</div>;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-[#1A1A1A]">Centro de chats</h2>
        <p className="text-[11px] text-gray-400">Usa @club para notificar al club</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-y-2">
        <div className="flex flex-wrap gap-2">
          <FilterButton active={filter === 'turnos'} onClick={() => setFilter('turnos')} icon={<MessageSquare className="h-3.5 w-3.5" />} label="Turnos" />
          <FilterButton active={filter === 'torneos'} onClick={() => setFilter('torneos')} icon={<Trophy className="h-3.5 w-3.5" />} label="Torneos" />
          <FilterButton active={filter === 'notificaciones'} onClick={() => setFilter('notificaciones')} icon={<Bell className="h-3.5 w-3.5" />} label={`Notificaciones (${notifications.length})`} />
        </div>
        {filter !== 'notificaciones' && (
          <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto sm:justify-end">
            <label className="sr-only" htmlFor="chat-list-sort">
              Orden
            </label>
            <select
              id="chat-list-sort"
              value={listSort}
              onChange={(e) => setListSort(e.target.value as ChatListSort)}
              className="max-w-[140px] rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-[#1A1A1A]"
            >
              <option value="recent">Más recientes</option>
              <option value="oldest">Más antiguos</option>
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-[118px] rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-[#1A1A1A]"
              aria-label="Actividad desde"
              title="Último mensaje desde"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-[118px] rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-[#1A1A1A]"
              aria-label="Actividad hasta"
              title="Último mensaje hasta"
            />
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                }}
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-[10px] font-semibold text-gray-600 hover:bg-gray-50"
              >
                Limpiar fechas
              </button>
            )}
          </div>
        )}
      </div>

      {filter === 'notificaciones' ? (
        <div className="rounded-2xl border border-gray-100 bg-white">
          <div className="border-b border-gray-50 px-4 py-3 text-xs font-semibold text-[#1A1A1A]">Menciones @club</div>
          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-gray-500">Aún no hay notificaciones de @club.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {notifications.map((n) => (
                <div key={n.id} className="px-4 py-3">
                  <p className="text-xs font-semibold text-[#1A1A1A]">{n.channel_title}</p>
                  <p className="text-[11px] text-gray-600">{n.message}</p>
                  <p className="mt-1 text-[10px] text-gray-400">{new Date(n.created_at).toLocaleString('es-ES')}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-gray-100 bg-white">
            <div className="border-b border-gray-50 px-4 py-3 text-xs font-semibold text-[#1A1A1A]">Chats</div>
            {sidebarChannels.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-gray-500">No hay chats disponibles para este filtro.</p>
            ) : (
              <div className="max-h-[480px] divide-y divide-gray-50 overflow-y-auto">
                {sidebarChannels.map((ch) => {
                  const isActive = selectedChannel?.id === ch.id;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => setSelectedChannelId(ch.id)}
                      className={`w-full px-4 py-3 text-left ${isActive ? 'bg-gray-50' : 'hover:bg-gray-50/60'}`}
                    >
                      <p className="text-xs font-semibold text-[#1A1A1A]">{ch.title}</p>
                      <p className="mt-0.5 truncate text-[11px] text-gray-500">{ch.subtitle ?? 'Sin mensajes aún'}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white">
            <div className="border-b border-gray-50 px-4 py-3 text-xs font-semibold text-[#1A1A1A]">
              {selectedChannel?.title ?? 'Selecciona un chat'}
            </div>
            <div className="max-h-[420px] space-y-2 overflow-y-auto px-4 py-3">
              {!selectedChannel ? (
                <p className="text-xs text-gray-500">Selecciona un chat para ver mensajes.</p>
              ) : selectedChannel.messages == null || loadingMessages ? (
                <p className="text-xs text-gray-500">Cargando mensajes...</p>
              ) : selectedChannel.messages.length === 0 ? (
                <p className="text-xs text-gray-500">Aún no hay mensajes.</p>
              ) : (
                selectedChannel.messages.map((m) => (
                  <div key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${m.role === 'me' ? 'ml-auto bg-[#1A1A1A] text-white' : 'bg-gray-100 text-[#1A1A1A]'}`}>
                    <p className="mb-0.5 text-[10px] opacity-70">{m.author_name}</p>
                    <p>{m.text}</p>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-gray-50 p-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Escribe un mensaje... (usa @club para notificar)"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs text-[#1A1A1A] focus:ring-2 focus:ring-[#E31E24]/20"
                />
                <button
                  type="button"
                  disabled={sending || !selectedChannel || !draft.trim()}
                  onClick={() => {
                    void handleSendMessage();
                  }}
                  className="rounded-xl bg-[#E31E24] px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function FilterButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-semibold ${
        active ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white' : 'border-gray-200 bg-white text-[#1A1A1A]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function startOfDayMs(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00`);
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

function endOfDayMs(dateStr: string): number {
  const d = new Date(`${dateStr}T23:59:59.999`);
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}
