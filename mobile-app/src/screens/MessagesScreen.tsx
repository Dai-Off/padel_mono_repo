import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { fetchDirectConversations, type DirectConversation } from '../api/messages';
import { fetchMyPlayerId, searchPlayers, type PlayerSearchHit } from '../api/players';
import { subscribeMessagesSocket } from '../realtime/messagesSocket';
import { theme } from '../theme';

const ACCENT = '#F18F34';
const BG = '#0A0A0A';
const SURFACE = 'rgba(255,255,255,0.06)';
const OUTLINE = 'rgba(255,255,255,0.1)';

export type MessagePeerNav = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

type MessagesScreenProps = {
  onBack: () => void;
  onSelectPeer: (peer: MessagePeerNav) => void;
};

function peerDisplayName(c: DirectConversation): string {
  return [c.peer_first_name, c.peer_last_name].filter(Boolean).join(' ').trim() || 'Jugador';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function MessagesScreen({ onBack, onSelectPeer }: MessagesScreenProps) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const [newChatOpen, setNewChatOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchHits, setSearchHits] = useState<PlayerSearchHit[]>([]);

  useEffect(() => {
    if (!token) return;
    fetchMyPlayerId(token).then(setMyPlayerId);
  }, [token]);

  const load = useCallback(async () => {
    if (!token) {
      setError('Inicia sesión para ver tus mensajes');
      setLoading(false);
      return;
    }
    setError(null);
    const res = await fetchDirectConversations(token);
    if (!res.ok) {
      setError(res.error);
    } else {
      setConversations(res.conversations);
    }
    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (!token) return;
    const unsubscribe = subscribeMessagesSocket(token, (event) => {
      if (event.type === 'direct_message' || event.type === 'thread_read') {
        void load();
      }
    });
    return unsubscribe;
  }, [token, load]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => peerDisplayName(c).toLowerCase().includes(q));
  }, [conversations, filter]);

  useEffect(() => {
    if (!newChatOpen || !token) {
      setSearchHits([]);
      return;
    }
    const q = searchQ.trim();
    if (q.length < 2) {
      setSearchHits([]);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    const t = setTimeout(async () => {
      const res = await searchPlayers(q, token);
      if (cancelled) return;
      setSearchLoading(false);
      if (res.ok) {
        setSearchHits(res.players.filter((p) => p.id !== myPlayerId));
      } else {
        setSearchHits([]);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [newChatOpen, searchQ, token, myPlayerId]);

  const openThread = (peer: MessagePeerNav) => {
    setNewChatOpen(false);
    setSearchQ('');
    onSelectPeer(peer);
  };

  const renderItem = ({ item }: { item: DirectConversation }) => {
    const name = peerDisplayName(item);
    return (
      <Pressable
        onPress={() =>
          openThread({
            id: item.peer_player_id,
            displayName: name,
            avatarUrl: item.peer_avatar_url,
          })
        }
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(name)}</Text>
        </View>
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={styles.peerName} numberOfLines={1}>
              {name}
            </Text>
            {item.unread_count > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {item.unread_count > 99 ? '99+' : String(item.unread_count)}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.preview} numberOfLines={1}>
            {item.last_message_preview}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.35)" />
      </Pressable>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.title}>Mensajes</Text>
        <Pressable
          onPress={() => setNewChatOpen(true)}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Nueva conversación"
        >
          <Ionicons name="create-outline" size={22} color={ACCENT} />
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color="rgba(255,255,255,0.4)" style={styles.searchIcon} />
        <TextInput
          value={filter}
          onChangeText={setFilter}
          placeholder="Buscar conversaciones"
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={styles.searchInput}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={ACCENT} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.peer_player_id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={ACCENT}
              colors={[ACCENT]}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              No hay conversaciones todavía. Pulsa el lápiz para buscar un jugador y empezar a chatear.
            </Text>
          }
        />
      )}

      <Modal visible={newChatOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nueva conversación</Text>
              <Pressable onPress={() => setNewChatOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color="#fff" />
              </Pressable>
            </View>
            <TextInput
              value={searchQ}
              onChangeText={setSearchQ}
              placeholder="Nombre o apellido (mín. 2 caracteres)"
              placeholderTextColor="rgba(255,255,255,0.35)"
              style={styles.modalInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searchLoading ? (
              <ActivityIndicator color={ACCENT} style={{ marginVertical: 12 }} />
            ) : (
              <FlatList
                data={searchHits}
                keyExtractor={(p) => p.id}
                keyboardShouldPersistTaps="handled"
                style={styles.modalList}
                renderItem={({ item }) => {
                  const dn = [item.first_name, item.last_name].filter(Boolean).join(' ').trim() || 'Jugador';
                  return (
                    <Pressable
                      style={({ pressed }) => [styles.searchRow, pressed && styles.rowPressed]}
                      onPress={() =>
                        openThread({
                          id: item.id,
                          displayName: dn,
                          avatarUrl: null,
                        })
                      }
                    >
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initials(dn)}</Text>
                      </View>
                      <Text style={styles.peerName}>{dn}</Text>
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  searchQ.trim().length >= 2 && !searchLoading ? (
                    <Text style={styles.empty}>Sin resultados</Text>
                  ) : (
                    <Text style={styles.emptyMuted}>Escribe al menos 2 caracteres</Text>
                  )
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    ...theme.headerPadding,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: OUTLINE,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: '#fff',
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: SURFACE,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: OUTLINE,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: theme.fontSize.base,
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.scrollBottomPadding,
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.04)' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(241,143,52,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: ACCENT, fontWeight: '700', fontSize: 14 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  peerName: { flex: 1, color: '#fff', fontSize: theme.fontSize.base, fontWeight: '600' },
  badge: {
    backgroundColor: ACCENT,
    minWidth: 22,
    paddingHorizontal: 6,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#0A0A0A', fontSize: 12, fontWeight: '700' },
  preview: { color: 'rgba(255,255,255,0.5)', fontSize: theme.fontSize.sm, marginTop: 4 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  errorText: { color: theme.auth.error, textAlign: 'center', marginBottom: theme.spacing.md },
  retryBtn: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    backgroundColor: SURFACE,
    borderRadius: 10,
  },
  retryText: { color: ACCENT, fontWeight: '600' },
  empty: {
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    marginTop: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
    lineHeight: theme.lineHeightFor(theme.fontSize.base),
  },
  emptyMuted: {
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    marginTop: theme.spacing.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: theme.spacing.md,
    maxHeight: '88%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: OUTLINE,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  modalTitle: { color: '#fff', fontSize: theme.fontSize.lg, fontWeight: '700' },
  modalInput: {
    backgroundColor: SURFACE,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: OUTLINE,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: theme.fontSize.base,
  },
  modalList: { marginTop: theme.spacing.sm, maxHeight: 320 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
});
