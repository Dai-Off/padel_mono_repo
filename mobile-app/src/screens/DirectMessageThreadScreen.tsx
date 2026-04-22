import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchDirectThread,
  markDirectThreadRead,
  sendDirectMessage,
  type DirectThreadMessage,
} from '../api/messages';
import { subscribeMessagesSocket } from '../realtime/messagesSocket';
import type { MessagePeerNav } from './MessagesScreen';
import { theme } from '../theme';

const ACCENT = '#F18F34';
const BG = '#0A0A0A';

function formatShortTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

type DirectMessageThreadScreenProps = {
  peer: MessagePeerNav;
  onBack: () => void;
};

export function DirectMessageThreadScreen({ peer, onBack }: DirectMessageThreadScreenProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token;

  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<DirectThreadMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetchDirectThread(peer.id, token);
    if (!res.ok) {
      Alert.alert('Mensajes', res.error);
      setLoading(false);
      return;
    }
    setMessages(res.messages);
    setLoading(false);
  }, [peer.id, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token) return;
    void markDirectThreadRead(peer.id, token);
  }, [peer.id, token]);

  useEffect(() => {
    if (!token) return;
    const unsubscribe = subscribeMessagesSocket(token, (event) => {
      if (event.type === 'direct_message') {
        const isFromPeer =
          event.message.sender_player_id === peer.id || event.message.recipient_player_id === peer.id;
        if (!isFromPeer) return;

        const mine = event.message.sender_player_id !== peer.id;
        const next: DirectThreadMessage = {
          id: event.message.id,
          created_at: event.message.created_at,
          body: event.message.body,
          read_at: event.message.read_at,
          mine,
        };

        setMessages((prev) => {
          if (prev.some((m) => m.id === next.id)) return prev;
          return [next, ...prev];
        });

        if (!mine) {
          void markDirectThreadRead(peer.id, token);
        }
      }

      if (event.type === 'thread_read' && event.reader_player_id === peer.id) {
        setMessages((prev) =>
          prev.map((m) => (m.mine && m.read_at == null ? { ...m, read_at: event.read_at } : m))
        );
      }
    });
    return unsubscribe;
  }, [peer.id, token]);

  const handleSend = async () => {
    if (!token || sending) return;
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    const res = await sendDirectMessage(peer.id, text, token);
    if (!res.ok) {
      Alert.alert('Mensajes', res.error);
      setSending(false);
      return;
    }
    setDraft('');
    setMessages((prev) => {
      if (prev.some((m) => m.id === res.message.id)) return prev;
      return [res.message, ...prev];
    });
    setSending(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={theme.headerHeight}
    >
      <View style={styles.toolbar}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {peer.displayName}
        </Text>
        <View style={styles.toolbarRight} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={ACCENT} />
        </View>
      ) : (
        <FlatList
          data={messages}
          inverted
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <View style={[styles.bubbleWrap, item.mine ? styles.bubbleWrapMine : styles.bubbleWrapTheirs]}>
              <View style={[styles.bubble, item.mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                <Text style={[styles.bubbleText, item.mine && styles.bubbleTextMine]}>{item.body}</Text>
                <Text style={[styles.time, item.mine && styles.timeMine]}>
                  {formatShortTime(item.created_at)}
                </Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>Escribe el primer mensaje para {peer.displayName}.</Text>
          }
        />
      )}

      <View style={[styles.inputRow, { paddingBottom: theme.spacing.md + insets.bottom }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Escribe un mensaje…"
          placeholderTextColor="rgba(255,255,255,0.45)"
          style={styles.input}
          editable={!sending && !!token}
          multiline
          maxLength={2000}
        />
        <Pressable
          onPress={() => void handleSend()}
          style={({ pressed }) => [
            styles.sendBtn,
            pressed && styles.pressed,
            (!draft.trim() || sending || !token) && { opacity: 0.45 },
          ]}
          disabled={sending || !draft.trim() || !token}
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="send" size={18} color="#fff" />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
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
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: '#fff',
    marginHorizontal: 8,
  },
  toolbarRight: { width: 40 },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    flexGrow: 1,
  },
  bubbleWrap: {
    marginBottom: 10,
    maxWidth: '100%',
  },
  bubbleWrapMine: { alignSelf: 'flex-end' },
  bubbleWrapTheirs: { alignSelf: 'flex-start' },
  bubble: {
    maxWidth: '92%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleMine: {
    backgroundColor: ACCENT,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    color: '#fff',
    fontSize: theme.fontSize.base,
    lineHeight: theme.lineHeightFor(theme.fontSize.base),
  },
  bubbleTextMine: { color: '#0A0A0A' },
  time: {
    marginTop: 6,
    fontSize: theme.fontSize.xs,
    color: 'rgba(255,255,255,0.45)',
  },
  timeMine: { color: 'rgba(10,10,10,0.55)' },
  empty: {
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    marginTop: theme.spacing.xl,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: theme.spacing.md,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0F0F0F',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontSize: theme.fontSize.base,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
