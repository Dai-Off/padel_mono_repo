import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { searchPlayers, type PlayerSearchHit } from '../../api/players';
import { fetchMatchmakingStatus, type PairInvite } from '../../api/matchmaking';

const BG = '#0F0F0F';
const ACCENT = theme.auth.accent;

export function playerDisplayName(p: PlayerSearchHit): string {
  const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  return name || p.username || 'Jugador';
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (player: PlayerSearchHit) => void;
  /** Tocar un compañero que ya aceptó tu invitación: busca partido directamente con él. */
  onSelectAccepted?: (invite: PairInvite) => void;
  /** Ids a ocultar de los resultados (ej. uno mismo). */
  excludeIds?: string[];
};

export function PlayerSelectModal({ visible, onClose, onSelect, onSelectAccepted, excludeIds }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token ?? null;
  const [query, setQuery] = useState('');
  const [players, setPlayers] = useState<PlayerSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<PairInvite[]>([]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      const res = await searchPlayers(query, token);
      if (cancelled) return;
      setLoading(false);
      if (res.ok) setPlayers(res.players);
      else setError(res.error);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, token, visible]);

  // Compañeros que ya aceptaron mi invitación (listos para buscar directamente).
  useEffect(() => {
    if (!visible) {
      setAccepted([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const st = await fetchMatchmakingStatus(token);
      if (cancelled) return;
      setAccepted((st?.pair_invites ?? []).filter((i) => i.role === 'inviter' && i.status === 'accepted'));
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, token]);

  const exclude = new Set(excludeIds ?? []);
  const list = players.filter((p) => !exclude.has(p.id));

  const acceptedHeader =
    onSelectAccepted && accepted.length > 0 ? (
      <View style={styles.acceptedBlock}>
        <Text style={styles.sectionLabel}>Listos para jugar</Text>
        {accepted.map((inv) => (
          <Pressable
            key={inv.id}
            onPress={() => {
              onSelectAccepted(inv);
              onClose();
            }}
            style={({ pressed }) => [styles.row, styles.acceptedRow, pressed && { opacity: 0.85 }]}
          >
            <View style={styles.avatar}>
              <Ionicons name="checkmark-circle" size={18} color={ACCENT} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name}>{inv.other_player_name}</Text>
              <Text style={styles.meta}>Aceptó tu invitación · tocá para buscar</Text>
            </View>
            <Ionicons name="flash" size={18} color={ACCENT} />
          </Pressable>
        ))}
        <Text style={[styles.sectionLabel, { marginTop: 12 }]}>O invitá a otro jugador</Text>
      </View>
    ) : null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: Math.max(insets.top, 8) }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.iconBtn} accessibilityLabel="Cerrar">
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title}>Invitar compañero</Text>
            <Text style={styles.subtitle}>Buscá al jugador con el que querés jugar</Text>
          </View>
        </View>

        <View style={styles.topRow}>
          <View style={styles.searchShell}>
            <Ionicons name="search" size={16} color="#737373" style={{ marginLeft: 12 }} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar jugador..."
              placeholderTextColor="#737373"
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={ACCENT} />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 16 }}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={acceptedHeader}
            ListEmptyComponent={<Text style={styles.emptyText}>No se encontraron jugadores.</Text>}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
              >
                <View style={styles.avatar}>
                  <Ionicons name="person" size={18} color="#9CA3AF" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name}>{playerDisplayName(item)}</Text>
                  {item.username ? <Text style={styles.meta}>@{item.username}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color="#6B7280" />
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 16, paddingBottom: 8 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#9CA3AF', fontSize: 13, marginTop: 2 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  searchShell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    minHeight: 44,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 15, paddingHorizontal: 10, paddingVertical: 10 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  errorText: { color: '#F87171', fontSize: 14, textAlign: 'center', paddingHorizontal: 24 },
  emptyText: { color: '#9CA3AF', textAlign: 'center', marginTop: 32, fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#141414',
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#262626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { color: '#fff', fontSize: 15, fontWeight: '600' },
  meta: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
  acceptedBlock: { marginBottom: 4 },
  sectionLabel: { color: '#9CA3AF', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  acceptedRow: { borderColor: 'rgba(241,143,52,0.45)', backgroundColor: 'rgba(241,143,52,0.08)' },
});
