import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
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
import { useTranslation } from '../../i18n';
import { searchPlayers, type PlayerSearchHit } from '../../api/players';
import {
  acceptPairInvite,
  cancelPairInvite,
  createPairInvite,
  fetchMatchmakingStatus,
  rejectPairInvite,
  type PairInvite,
} from '../../api/matchmaking';
import { Toast } from '../ui/Toast';

const BG = '#0F0F0F';
const ACCENT = theme.auth.accent;
/** Mínimo de caracteres para lanzar la búsqueda de jugadores. */
const MIN_SEARCH_CHARS = 2;

export function playerDisplayName(p: PlayerSearchHit): string {
  const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  return name || p.username || 'Jugador';
}

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Tocar una pareja ya aceptada: ir a preferencias para buscar con ella. */
  onSelectAccepted?: (invite: PairInvite) => void;
  /** Ids a ocultar de los resultados (ej. uno mismo). */
  excludeIds?: string[];
};

export function PlayerSelectModal({ visible, onClose, onSelectAccepted, excludeIds }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { t } = useTranslation();
  const token = session?.access_token ?? null;
  const [query, setQuery] = useState('');
  const [players, setPlayers] = useState<PlayerSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<PairInvite[]>([]);
  const [pending, setPending] = useState<PairInvite[]>([]);
  const [received, setReceived] = useState<PairInvite[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<'success' | 'error'>('success');
  const showToast = (msg: string, variant: 'success' | 'error' = 'success') => {
    setToastVariant(variant);
    setToastMsg(msg);
  };

  useEffect(() => {
    if (!visible) return;
    // No cargamos jugadores hasta que el usuario escriba algo (evita listar "randoms").
    if (query.trim().length < MIN_SEARCH_CHARS) {
      setPlayers([]);
      setLoading(false);
      setError(null);
      return;
    }
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

  // Invitaciones que envié: aceptadas (listas para buscar) y pendientes (esperando respuesta).
  useEffect(() => {
    if (!visible) {
      setAccepted([]);
      setPending([]);
      setReceived([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const st = await fetchMatchmakingStatus(token);
      if (cancelled) return;
      const invs = st?.pair_invites ?? [];
      // Aceptadas: cualquiera de los dos puede buscar. Enviadas pendientes: solo el invitador (cancelar).
      // Recibidas pendientes: las que me han enviado y debo aceptar/rechazar.
      setAccepted(invs.filter((i) => i.status === 'accepted'));
      setPending(invs.filter((i) => i.role === 'inviter' && i.status === 'pending'));
      setReceived(invs.filter((i) => i.role === 'invitee' && i.status === 'pending'));
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, token, refreshKey]);

  const handleCancelInvite = async (inv: PairInvite) => {
    const res = await cancelPairInvite(inv.id, token);
    if (!res.ok) showToast(res.error, 'error');
    setRefreshKey((k) => k + 1);
  };

  // Aceptar una invitación recibida: pasa a "Listos para jugar" (luego se busca tocándola).
  const handleAcceptReceived = async (inv: PairInvite) => {
    const res = await acceptPairInvite(inv.id, token);
    if (!res.ok) showToast(res.error, 'error');
    setRefreshKey((k) => k + 1);
  };

  const handleRejectReceived = async (inv: PairInvite) => {
    const res = await rejectPairInvite(inv.id, token);
    if (!res.ok) showToast(res.error, 'error');
    setRefreshKey((k) => k + 1);
  };

  const handleInvite = async (player: PlayerSearchHit) => {
    const res = await createPairInvite(player.id, token);
    if (!res.ok) {
      showToast(res.error, 'error');
      return;
    }
    showToast(t('competitive.partner.inviteSent', { name: playerDisplayName(player) }), 'success');
    setRefreshKey((k) => k + 1);
  };

  const renderAvatar = (url?: string | null) =>
    url ? (
      <Image source={{ uri: url }} style={styles.avatar} />
    ) : (
      <View style={styles.avatar}>
        <Ionicons name="person" size={18} color="#9CA3AF" />
      </View>
    );

  const exclude = new Set(excludeIds ?? []);
  // Oculta a uno mismo y a quien no ha completado el onboarding (no puede jugar competitiva).
  const list = players.filter((p) => !exclude.has(p.id) && p.onboarding_completed !== false);

  const showReceived = received.length > 0;
  const showAccepted = !!onSelectAccepted && accepted.length > 0;
  const showPending = pending.length > 0;
  const listHeader =
    showReceived || showAccepted || showPending ? (
      <View style={styles.acceptedBlock}>
        {showReceived ? (
          <>
            <Text style={styles.sectionLabel}>{t('competitive.partner.received')}</Text>
            {received.map((inv) => (
              <View key={inv.id} style={[styles.row, styles.acceptedRow]}>
                {renderAvatar(inv.other_player_avatar)}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {inv.other_player_name}
                  </Text>
                  <Text style={styles.meta}>{t('competitive.partner.invitedYou')}</Text>
                </View>
                <View style={styles.receivedActions}>
                  <Pressable onPress={() => void handleRejectReceived(inv)} hitSlop={6} style={styles.cancelBtn}>
                    <Text style={styles.cancelBtnText}>{t('competitive.banner.reject')}</Text>
                  </Pressable>
                  <Pressable onPress={() => void handleAcceptReceived(inv)} hitSlop={6} style={styles.acceptBtn}>
                    <Text style={styles.acceptBtnText}>{t('competitive.banner.accept')}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        ) : null}
        {showAccepted ? (
          <>
            <Text style={[styles.sectionLabel, showReceived ? { marginTop: 12 } : null]}>
              {t('competitive.partner.ready')}
            </Text>
            {accepted.map((inv) => (
              <Pressable
                key={inv.id}
                onPress={() => {
                  onSelectAccepted?.(inv);
                  onClose();
                }}
                style={({ pressed }) => [styles.row, styles.acceptedRow, pressed && { opacity: 0.85 }]}
              >
                {renderAvatar(inv.other_player_avatar)}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name}>{inv.other_player_name}</Text>
                  <Text style={styles.meta}>{t('competitive.partner.acceptedSub')}</Text>
                </View>
                <Ionicons name="flash" size={18} color={ACCENT} />
              </Pressable>
            ))}
          </>
        ) : null}
        {showPending ? (
          <>
            <Text style={[styles.sectionLabel, showReceived || showAccepted ? { marginTop: 12 } : null]}>
              {t('competitive.partner.pending')}
            </Text>
            {pending.map((inv) => (
              <View key={inv.id} style={[styles.row, styles.pendingRow]}>
                {renderAvatar(inv.other_player_avatar)}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name}>{inv.other_player_name}</Text>
                  <Text style={styles.meta}>{t('competitive.partner.waiting')}</Text>
                </View>
                <Pressable onPress={() => void handleCancelInvite(inv)} hitSlop={8} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>{t('competitive.common.cancel')}</Text>
                </Pressable>
              </View>
            ))}
          </>
        ) : null}
        <Text style={[styles.sectionLabel, { marginTop: 12 }]}>{t('competitive.partner.orInvite')}</Text>
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
            <Text style={styles.title}>{t('competitive.partner.title')}</Text>
            <Text style={styles.subtitle}>{t('competitive.partner.subtitle')}</Text>
          </View>
        </View>

        <View style={styles.topRow}>
          <View style={styles.searchShell}>
            <Ionicons name="search" size={16} color="#737373" style={{ marginLeft: 12 }} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('competitive.partner.searchPlaceholder')}
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
            ListHeaderComponent={listHeader}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {query.trim().length < MIN_SEARCH_CHARS
                  ? t('competitive.partner.searchHint')
                  : t('competitive.partner.empty')}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => void handleInvite(item)}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
              >
                {renderAvatar(item.avatar_url)}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name}>{playerDisplayName(item)}</Text>
                  {item.username ? <Text style={styles.meta}>@{item.username}</Text> : null}
                </View>
                <Ionicons name="person-add-outline" size={18} color={ACCENT} />
              </Pressable>
            )}
          />
        )}
        <Toast message={toastMsg} variant={toastVariant} onHide={() => setToastMsg(null)} />
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
  pendingRow: { borderColor: 'rgba(255,255,255,0.06)', backgroundColor: '#101010' },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#262626' },
  cancelBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  receivedActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  acceptBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: ACCENT },
  acceptBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
