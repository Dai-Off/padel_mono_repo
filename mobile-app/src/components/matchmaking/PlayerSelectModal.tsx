import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { searchPlayers, type PlayerSearchHit } from '../../api/players';
import { useDebouncedSearch } from '../../hooks/useDebouncedSearch';
import { fetchInviteSuggestions } from '../../lib/inviteSuggestions';
import {
  acceptPairInvite,
  cancelPairInvite,
  createPairInvite,
  fetchPairInvites,
  rejectPairInvite,
  type PairInvite,
} from '../../api/matchmaking';
import { Toast } from '../ui/Toast';

const BG = '#0F0F0F';
const ACCENT = theme.auth.accent;
/** Mínimo de caracteres para lanzar la búsqueda de jugadores. */
const MIN_SEARCH_CHARS = 2;
const SUGGESTIONS_LIMIT = 5;

export function playerDisplayName(p: PlayerSearchHit, fallback = 'Jugador'): string {
  const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  return name || p.username || fallback;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Tocar una pareja ya aceptada: ir a preferencias para buscar con ella. */
  onSelectAccepted?: (invite: PairInvite) => void;
  /** Ids a ocultar de los resultados (ej. uno mismo). */
  excludeIds?: string[];
  /** Id del usuario actual, para cargar sugerencias (compañeros frecuentes). */
  currentPlayerId?: string;
};

export function PlayerSelectModal({ visible, onClose, onSelectAccepted, excludeIds, currentPlayerId }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { t } = useTranslation();
  const token = session?.access_token ?? null;
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [inviting, setInviting] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<PlayerSearchHit[]>([]);
  const [accepted, setAccepted] = useState<PairInvite[]>([]);
  const [pending, setPending] = useState<PairInvite[]>([]);
  const [received, setReceived] = useState<PairInvite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<'success' | 'error'>('success');
  const showToast = (msg: string, variant: 'success' | 'error' = 'success') => {
    setToastVariant(variant);
    setToastMsg(msg);
  };

  // Búsqueda con debounce (300 ms, 2 chars); el backend excluye al propio usuario.
  const { items: rawPlayers, loading } = useDebouncedSearch(
    visible ? query : '',
    (q) => searchPlayers(q, token, { excludeSelf: true }).then((r) => (r.ok ? r.players : [])),
    { delay: 300, minChars: MIN_SEARCH_CHARS },
  );

  // Sugerencias por defecto (hoy: compañeros frecuentes + seguidos).
  useEffect(() => {
    if (!visible) {
      setSuggestions([]);
      setFocused(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const s = await fetchInviteSuggestions(currentPlayerId, SUGGESTIONS_LIMIT, token);
      if (!cancelled) setSuggestions(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, currentPlayerId, token]);

  // Invitaciones que envié: aceptadas (listas para buscar) y pendientes (esperando respuesta).
  useEffect(() => {
    if (!visible) {
      setAccepted([]);
      setPending([]);
      setReceived([]);
      setInvitesLoading(false);
      return;
    }
    let cancelled = false;
    setInvitesLoading(true);
    (async () => {
      const invs = await fetchPairInvites(token);
      if (cancelled) return;
      // Aceptadas: cualquiera de los dos puede buscar. Enviadas pendientes: solo el invitador (cancelar).
      // Recibidas pendientes: las que me han enviado y debo aceptar/rechazar.
      setAccepted(invs.filter((i) => i.status === 'accepted'));
      setPending(invs.filter((i) => i.role === 'inviter' && i.status === 'pending'));
      setReceived(invs.filter((i) => i.role === 'invitee' && i.status === 'pending'));
      setInvitesLoading(false);
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

  // Dejar una pareja aceptada: el invitador cancela, el invitado rechaza (ambos válidos en backend).
  const handleLeavePair = (inv: PairInvite) => {
    Alert.alert(t('competitive.partner.leavePair'), t('competitive.partner.leavePairMsg', { name: inv.other_player_name }), [
      { text: t('competitive.common.cancel'), style: 'cancel' },
      {
        text: t('competitive.partner.leavePair'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const res = await (inv.role === 'inviter' ? cancelPairInvite : rejectPairInvite)(inv.id, token);
            if (!res.ok) showToast(res.error, 'error');
            setRefreshKey((k) => k + 1);
          })();
        },
      },
    ]);
  };

  const handleInvite = async (player: PlayerSearchHit) => {
    if (inviting.has(player.id)) return; // evita doble invitación por doble tap
    setInviting((s) => new Set(s).add(player.id));
    const res = await createPairInvite(player.id, token);
    setInviting((s) => {
      const n = new Set(s);
      n.delete(player.id);
      return n;
    });
    if (!res.ok) {
      showToast(res.error, 'error');
      return;
    }
    showToast(
      t('competitive.partner.inviteSent', { name: playerDisplayName(player, t('competitive.screen.fallback.player')) }),
      'success',
    );
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

  const searching = query.trim().length >= MIN_SEARCH_CHARS;
  const exclude = useMemo(() => new Set(excludeIds ?? []), [excludeIds]);
  const suggestionIds = useMemo(() => new Set(suggestions.map((s) => s.id)), [suggestions]);
  // Ids con invitación en curso (enviada/aceptada/recibida): se marcan y no se re-invitan.
  const invitedIds = useMemo(
    () => new Set([...accepted, ...pending, ...received].map((i) => i.other_player_id)),
    [accepted, pending, received],
  );
  // Sin texto → sugerencias; con texto → resultados con las sugerencias que casen arriba.
  const list = useMemo(() => {
    const ok = (p: PlayerSearchHit) => !exclude.has(p.id) && p.onboarding_completed !== false;
    // Sugerencias por defecto: ocultar a los ya invitados (ya salen en la cabecera; evita duplicado).
    if (!searching) return focused ? suggestions.filter(ok).filter((p) => !invitedIds.has(p.id)) : [];
    const filtered = rawPlayers.filter(ok);
    const matched = filtered.filter((p) => suggestionIds.has(p.id));
    const others = filtered.filter((p) => !suggestionIds.has(p.id));
    return [...matched, ...others];
  }, [searching, focused, suggestions, rawPlayers, exclude, suggestionIds, invitedIds]);

  const showReceived = received.length > 0;
  const showAccepted = !!onSelectAccepted && accepted.length > 0;
  const showPending = pending.length > 0;
  const invitesEmpty = !showReceived && !showAccepted && !showPending;
  const listHeader =
    invitesLoading && invitesEmpty ? (
      <View style={styles.invitesLoadingWrap}>
        <ActivityIndicator color={ACCENT} />
      </View>
    ) : showReceived || showAccepted || showPending ? (
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
                <Pressable
                  onPress={() => handleLeavePair(inv)}
                  hitSlop={8}
                  style={styles.leaveBtn}
                  accessibilityLabel={t('competitive.partner.leavePair')}
                >
                  <Ionicons name="close" size={16} color="#9CA3AF" />
                </Pressable>
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
      <KeyboardAvoidingView behavior="padding" style={[styles.root, { paddingTop: Math.max(insets.top, 8) }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.iconBtn} accessibilityLabel={t('competitive.common.close')}>
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
              onFocus={() => setFocused(true)}
              placeholder={t('competitive.partner.searchPlaceholder')}
              placeholderTextColor="#737373"
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
        </View>

        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 16 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            loading ? (
              <View style={styles.centered}>
                <ActivityIndicator color={ACCENT} />
              </View>
            ) : (
              <Text style={styles.emptyText}>
                {query.trim().length < MIN_SEARCH_CHARS
                  ? t('competitive.partner.searchHint')
                  : t('competitive.partner.empty')}
              </Text>
            )
          }
          renderItem={({ item }) => {
            const isInvited = invitedIds.has(item.id);
            const busy = inviting.has(item.id);
            const isSuggestion = suggestionIds.has(item.id);
            const disabled = isInvited || busy;
            return (
              <Pressable
                onPress={disabled ? undefined : () => void handleInvite(item)}
                disabled={disabled}
                style={({ pressed }) => [styles.row, disabled && styles.rowDisabled, pressed && !disabled && { opacity: 0.85 }]}
              >
                {renderAvatar(item.avatar_url)}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name}>{playerDisplayName(item, t('competitive.screen.fallback.player'))}</Text>
                  {item.username ? <Text style={styles.meta}>@{item.username}</Text> : null}
                </View>
                {isInvited ? (
                  <Text style={styles.invitedBadge}>{t('competitive.partner.alreadyInvited')}</Text>
                ) : busy ? (
                  <ActivityIndicator size="small" color={ACCENT} />
                ) : (
                  <>
                    {isSuggestion ? <Ionicons name="star" size={13} color={ACCENT} style={styles.suggestionStar} /> : null}
                    <Ionicons name="person-add-outline" size={18} color={ACCENT} />
                  </>
                )}
              </Pressable>
            );
          }}
        />
        <Toast message={toastMsg} variant={toastVariant} onHide={() => setToastMsg(null)} />
      </KeyboardAvoidingView>
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
  rowDisabled: { opacity: 0.55 },
  suggestionStar: { marginRight: 2 },
  invitedBadge: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  acceptedBlock: { marginBottom: 4 },
  invitesLoadingWrap: { paddingVertical: 24, alignItems: 'center' },
  sectionLabel: { color: '#9CA3AF', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  acceptedRow: { borderColor: 'rgba(241,143,52,0.45)', backgroundColor: 'rgba(241,143,52,0.08)' },
  pendingRow: { borderColor: 'rgba(255,255,255,0.06)', backgroundColor: '#101010' },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#262626' },
  cancelBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  receivedActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  acceptBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: ACCENT },
  acceptBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  leaveBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
