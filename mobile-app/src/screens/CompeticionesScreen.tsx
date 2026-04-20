import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { MyTournamentEntryRequest, PublicTournamentRow } from '../api/tournaments';
import { fetchMyTournamentEntryRequests, fetchMyTournaments, fetchPublicTournaments } from '../api/tournaments';
import { TournamentListCard } from '../components/competiciones/TournamentListCard';
import { TournamentDetailScreen } from './TournamentDetailScreen';
import { useAuth } from '../contexts/AuthContext';
import { fetchMyPlayerProfile } from '../api/players';
import {
  formatFormatLabel,
  matchesFormatFilter,
  matchesLevelFilter,
  matchesSearch,
  type TournamentFormatFilter,
  type TournamentLevelFilter,
} from '../domain/tournamentDisplay';
import { tournamentTitle } from '../domain/tournamentDisplay';
import { theme } from '../theme';

const BG = '#0F0F0F';

type CompeticionTab = 'disponibles' | 'inscritas' | 'solicitudes';

type CompeticionesScreenProps = {
  onBack?: () => void;
};

function FilterChipButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.filterChip, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.filterChipText} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.75)" />
    </Pressable>
  );
}

export function CompeticionesScreen({ onBack }: CompeticionesScreenProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState<CompeticionTab>('disponibles');
  const [searchQuery, setSearchQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState<TournamentFormatFilter>('all');
  const [levelFilter, setLevelFilter] = useState<TournamentLevelFilter>('all');
  const [joinableOnly, setJoinableOnly] = useState(true);
  const [myElo, setMyElo] = useState<number | null>(null);
  const [items, setItems] = useState<PublicTournamentRow[]>([]);
  const [requestItems, setRequestItems] = useState<MyTournamentEntryRequest[]>([]);
  const [requestUnreadCount, setRequestUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [detailOpen, setDetailOpen] = useState<{ id: string } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    if (activeTab === 'solicitudes') {
      const r = await fetchMyTournamentEntryRequests(session?.access_token ?? null);
      if (r.ok) setRequestItems(r.requests);
      else {
        setRequestItems([]);
        setError(r.error);
      }
      return;
    }
    if (activeTab === 'disponibles') {
      const r = await fetchPublicTournaments(session?.access_token ?? null);
      if (r.ok) setItems(r.tournaments);
      else {
        setItems([]);
        setError(r.error);
      }
      return;
    }
    const r = await fetchMyTournaments(session?.access_token ?? null);
    if (r.ok) setItems(r.tournaments);
    else {
      setItems([]);
      setError(r.error);
    }
  }, [activeTab, session?.access_token]);

  useEffect(() => {
    if (!session?.access_token || requestItems.length === 0) {
      setRequestUnreadCount(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      let unread = 0;
      for (const req of requestItems) {
        const status = String(req.status ?? '').toLowerCase();
        if (status === 'pending') continue;
        const stamp = req.updated_at || req.resolved_at || req.created_at;
        const seen = await AsyncStorage.getItem(`@entry_request_seen_${req.id}`);
        if (!seen || new Date(stamp).getTime() > new Date(seen).getTime()) unread += 1;
      }
      if (!cancelled) setRequestUnreadCount(unread);
    })();
    return () => {
      cancelled = true;
    };
  }, [requestItems, session?.access_token]);

  useEffect(() => {
    if (activeTab !== 'solicitudes' || requestItems.length === 0) return;
    void (async () => {
      const writes = requestItems
        .filter((r) => String(r.status ?? '').toLowerCase() !== 'pending')
        .map((r) =>
          AsyncStorage.setItem(
            `@entry_request_seen_${r.id}`,
            r.updated_at || r.resolved_at || r.created_at,
          ),
        );
      await Promise.allSettled(writes);
      setRequestUnreadCount(0);
    })();
  }, [activeTab, requestItems]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const p = await fetchMyPlayerProfile(session?.access_token ?? null);
      if (!cancelled) setMyElo(p?.eloRating ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const canJoinTournament = useCallback(
    (row: PublicTournamentRow) => {
      const statusOk = String(row.status ?? '').toLowerCase() === 'open';
      if (!statusOk) return false;
      const startAtMs = new Date(String(row.start_at ?? '')).getTime();
      if (Number.isFinite(startAtMs) && Date.now() >= startAtMs) return false;
      const confirmed = Number(row.confirmed_count ?? 0);
      const pending = Number(row.pending_count ?? 0);
      if (confirmed + pending >= Number(row.max_players ?? 0)) return false;
      const mode = String(row.registration_mode ?? 'individual');
      if (!['individual', 'both'].includes(mode)) return false;
      const eloMin = row.elo_min != null ? Number(row.elo_min) : null;
      const eloMax = row.elo_max != null ? Number(row.elo_max) : null;
      if (eloMin == null && eloMax == null) return true;
      if (myElo == null) return false;
      if (eloMin != null && myElo < eloMin) return false;
      if (eloMax != null && myElo > eloMax) return false;
      return true;
    },
    [myElo],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filtered = useMemo(() => {
    if (activeTab === 'solicitudes') return [];
    const now = Date.now();
    return items
      .filter((row) => String(row.status ?? '').toLowerCase() !== 'cancelled')
      .filter((row) => {
        const endMs = new Date(String(row.end_at ?? '')).getTime();
        if (!Number.isFinite(endMs)) return true;
        return endMs >= now;
      })
      .filter(
        (row) =>
          matchesSearch(row, searchQuery) &&
          matchesFormatFilter(row, formatFilter) &&
          matchesLevelFilter(row, levelFilter) &&
          (!joinableOnly || canJoinTournament(row)),
      )
      .sort((a, b) => {
        const da = new Date(String(a.start_at ?? '')).getTime();
        const db = new Date(String(b.start_at ?? '')).getTime();
        if (!Number.isFinite(da) && !Number.isFinite(db)) return 0;
        if (!Number.isFinite(da)) return 1;
        if (!Number.isFinite(db)) return -1;
        return da - db;
      });
  }, [activeTab, items, searchQuery, formatFilter, levelFilter, joinableOnly, canJoinTournament]);

  const formatChipLabel =
    formatFilter === 'all' ? 'Formato' : formatFormatLabel(formatFilter);
  const levelChipLabel =
    levelFilter === 'all'
      ? 'Nivel'
      : levelFilter === 'principiante'
        ? 'Principiante'
        : levelFilter === 'medio'
          ? 'Medio'
          : 'Avanzado';
  const joinableChipLabel = joinableOnly ? 'Solo me puedo unir' : 'Mostrar todas';

  const listHeader = (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>
        {activeTab === 'disponibles'
          ? 'Torneos disponibles'
          : activeTab === 'inscritas'
            ? 'Mis torneos'
            : 'Mis solicitudes'}
      </Text>
      <Text style={styles.sectionSub}>
        {activeTab === 'solicitudes'
          ? requestItems.length === 1
            ? '1 solicitud'
            : `${requestItems.length} solicitudes`
          : filtered.length === 1
            ? '1 torneo'
            : `${filtered.length} torneos`}
        {activeTab === 'inscritas' && !session?.access_token
          ? ' · inicia sesión para ver inscripciones'
          : ''}
      </Text>
    </View>
  );

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.stickyHeader,
          {
            // Misma referencia que MatchSearchScreen (Pistas): ScreenLayout ya aplica `insets.top` al contenedor;
            // no duplicar safe area aquí o el bloque queda más bajo que en Pistas.
            paddingTop: 6,
            paddingBottom: 12,
          },
        ]}
      >
        <View style={styles.topRow}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Volver al inicio"
            >
              <Ionicons name="arrow-back" size={18} color="#fff" />
            </Pressable>
          ) : (
            <View style={styles.iconBtn} />
          )}
          <View style={styles.searchShell}>
            <Ionicons name="search" size={16} color="#737373" style={styles.searchIcon} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Buscar torneos..."
              placeholderTextColor="#737373"
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
          <Pressable
            onPress={() => setFilterModalVisible(true)}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Filtros avanzados"
          >
            <Ionicons name="options-outline" size={18} color="#fff" />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          <FilterChipButton
            label="Pádel"
            onPress={() =>
              Alert.alert('Deporte', 'Por ahora todos los torneos son de pádel.')
            }
          />
          <FilterChipButton label={formatChipLabel} onPress={() => setFilterModalVisible(true)} />
          <FilterChipButton label={levelChipLabel} onPress={() => setFilterModalVisible(true)} />
          <FilterChipButton label={joinableChipLabel} onPress={() => setJoinableOnly((v) => !v)} />
        </ScrollView>

        <View style={styles.segmented}>
          <Pressable
            style={({ pressed }) => [
              styles.segmentedBtn,
              activeTab === 'disponibles' && styles.segmentedBtnActive,
              pressed && styles.pressed,
            ]}
            onPress={() => setActiveTab('disponibles')}
          >
            <Text
              style={[
                styles.segmentedText,
                activeTab === 'disponibles' && styles.segmentedTextActive,
              ]}
            >
              Disponibles
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.segmentedBtn,
              activeTab === 'inscritas' && styles.segmentedBtnActive,
              pressed && styles.pressed,
            ]}
            onPress={() => setActiveTab('inscritas')}
          >
            <Text
              style={[
                styles.segmentedText,
                activeTab === 'inscritas' && styles.segmentedTextActive,
              ]}
            >
              Inscritas
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.segmentedBtn,
              activeTab === 'solicitudes' && styles.segmentedBtnActive,
              pressed && styles.pressed,
            ]}
            onPress={() => setActiveTab('solicitudes')}
          >
            <View style={styles.segmentedReqWrap}>
              <Text
                style={[
                  styles.segmentedText,
                  activeTab === 'solicitudes' && styles.segmentedTextActive,
                ]}
              >
                Solicitudes
              </Text>
              {requestUnreadCount > 0 ? (
                <View style={styles.segmentedBadge}>
                  <Text style={styles.segmentedBadgeText}>{requestUnreadCount}</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.auth.accent} />
          <Text style={styles.loadingText}>Cargando torneos…</Text>
        </View>
      ) : error && items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={async () => {
              setLoading(true);
              setError(null);
              await load();
              setLoading(false);
            }}
            style={styles.retryBtn}
          >
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={activeTab === 'solicitudes' ? requestItems : filtered}
          keyExtractor={(item) => String((item as any).id)}
          ListHeaderComponent={listHeader}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: theme.scrollBottomPadding + insets.bottom + 8 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.auth.accent}
              colors={[theme.auth.accent]}
            />
          }
          renderItem={({ item }) =>
            activeTab === 'solicitudes' ? (
              <Pressable
                onPress={() => {
                  const tid = (item as MyTournamentEntryRequest).tournament_id;
                  if (tid) setDetailOpen({ id: tid });
                }}
                style={({ pressed }) => [styles.requestCard, pressed && styles.pressed]}
              >
                <Text style={styles.requestTitle}>
                  {tournamentTitle({
                    id: String((item as MyTournamentEntryRequest).tournament?.id ?? (item as MyTournamentEntryRequest).tournament_id),
                    club_id: '',
                    start_at: String((item as MyTournamentEntryRequest).tournament?.start_at ?? ''),
                    end_at: String((item as MyTournamentEntryRequest).tournament?.start_at ?? ''),
                    duration_min: 0,
                    price_cents: Number((item as MyTournamentEntryRequest).tournament?.price_cents ?? 0),
                    currency: 'EUR',
                    max_players: 0,
                    status: String((item as MyTournamentEntryRequest).tournament?.status ?? ''),
                    description: String((item as MyTournamentEntryRequest).tournament?.name ?? ''),
                    elo_min: (item as MyTournamentEntryRequest).tournament?.elo_min ?? null,
                    elo_max: (item as MyTournamentEntryRequest).tournament?.elo_max ?? null,
                    registration_mode: ((item as MyTournamentEntryRequest).tournament?.registration_mode as any) ?? 'individual',
                  } as PublicTournamentRow)}
                </Text>
                <Text style={styles.requestStatus}>
                  Estado: {String((item as MyTournamentEntryRequest).status ?? '').toUpperCase()}
                </Text>
                <Text style={styles.requestMessage} numberOfLines={2}>
                  {(item as MyTournamentEntryRequest).response_message?.trim() ||
                    (item as MyTournamentEntryRequest).message ||
                    'Sin mensaje'}
                </Text>
              </Pressable>
            ) : (
              <TournamentListCard
                row={item as PublicTournamentRow}
                onPress={() => setDetailOpen({ id: (item as PublicTournamentRow).id })}
              />
            )
          }
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                {activeTab === 'inscritas' && !session?.access_token
                  ? 'Inicia sesión para ver tus torneos inscritos.'
                  : activeTab === 'solicitudes' && !session?.access_token
                    ? 'Inicia sesión para ver tus solicitudes.'
                  : error
                    ? error
                    : activeTab === 'solicitudes'
                      ? 'No tienes solicitudes todavía.'
                      : 'No hay torneos que coincidan con tu búsqueda.'}
              </Text>
            </View>
          }
        />
      )}

      <Modal
        visible={detailOpen != null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setDetailOpen(null)}
      >
        {detailOpen ? (
          /** `flex:1` en Android/iOS evita que el modal no reparta altura y el área inferior no reciba toques. */
          <View style={styles.tournamentDetailModalRoot}>
            <TournamentDetailScreen
              tournamentId={detailOpen.id}
              onClose={() => setDetailOpen(null)}
            />
          </View>
        ) : null}
      </Modal>

      <Modal
        visible={filterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setFilterModalVisible(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Filtros</Text>
            <Text style={styles.modalSectionLabel}>Formato</Text>
            <ScrollView style={styles.modalScroll} nestedScrollEnabled>
              {(
                ['all', 'liga', 'americano', 'eliminatoria', 'torneo'] as TournamentFormatFilter[]
              ).map((key) => (
                <Pressable
                  key={key}
                  style={({ pressed }) => [styles.modalRow, pressed && styles.pressed]}
                  onPress={() => setFormatFilter(key)}
                >
                  <Text
                    style={[
                      styles.modalRowText,
                      formatFilter === key && styles.modalRowTextActive,
                    ]}
                  >
                    {key === 'all' ? 'Todos' : formatFormatLabel(key)}
                  </Text>
                  {formatFilter === key ? (
                    <Ionicons name="checkmark" size={18} color={theme.auth.accent} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.modalSectionLabel}>Nivel</Text>
            <ScrollView style={styles.modalScroll} nestedScrollEnabled>
              {(['all', 'principiante', 'medio', 'avanzado'] as TournamentLevelFilter[]).map(
                (key) => (
                  <Pressable
                    key={key}
                    style={({ pressed }) => [styles.modalRow, pressed && styles.pressed]}
                    onPress={() => setLevelFilter(key)}
                  >
                    <Text
                      style={[
                        styles.modalRowText,
                        levelFilter === key && styles.modalRowTextActive,
                      ]}
                    >
                      {key === 'all'
                        ? 'Todos'
                        : key === 'principiante'
                          ? 'Principiante'
                          : key === 'medio'
                            ? 'Medio'
                            : 'Avanzado'}
                    </Text>
                    {levelFilter === key ? (
                      <Ionicons name="checkmark" size={18} color={theme.auth.accent} />
                    ) : null}
                  </Pressable>
                ),
              )}
            </ScrollView>
            <Text style={styles.modalSectionLabel}>Disponibilidad</Text>
            <Pressable
              style={({ pressed }) => [styles.modalRow, pressed && styles.pressed]}
              onPress={() => setJoinableOnly(true)}
            >
              <Text style={[styles.modalRowText, joinableOnly && styles.modalRowTextActive]}>
                Solo torneos a los que me puedo unir
              </Text>
              {joinableOnly ? (
                <Ionicons name="checkmark" size={18} color={theme.auth.accent} />
              ) : null}
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.modalRow, pressed && styles.pressed]}
              onPress={() => setJoinableOnly(false)}
            >
              <Text style={[styles.modalRowText, !joinableOnly && styles.modalRowTextActive]}>
                Mostrar todos (incluye no cumplo requisitos)
              </Text>
              {!joinableOnly ? (
                <Ionicons name="checkmark" size={18} color={theme.auth.accent} />
              ) : null}
            </Pressable>
            <Pressable
              style={styles.modalClose}
              onPress={() => setFilterModalVisible(false)}
            >
              <Text style={styles.modalCloseText}>Listo</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  tournamentDetailModalRoot: {
    flex: 1,
    backgroundColor: BG,
    minHeight: 0,
  },
  root: {
    flex: 1,
    backgroundColor: BG,
    minHeight: 0,
  },
  stickyHeader: {
    backgroundColor: 'rgba(15,15,15,0.98)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchShell: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingLeft: 10,
    paddingRight: 12,
    minHeight: 40,
  },
  searchIcon: { marginRight: 6 },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: Platform.select({ ios: 8, default: 6 }),
    fontSize: theme.fontSize.sm,
    color: '#fff',
    includeFontPadding: false,
  },
  filterScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 4,
    paddingRight: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    maxWidth: 200,
  },
  filterChipText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: '#fff',
    flexShrink: 1,
  },
  segmented: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    marginTop: 4,
    marginBottom: 4,
  },
  segmentedBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  segmentedText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: '#9ca3af',
  },
  segmentedTextActive: {
    color: '#ffffff',
  },
  segmentedReqWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  segmentedBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  sectionHead: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: '#fff',
  },
  sectionSub: {
    marginTop: 2,
    fontSize: theme.fontSize.xs,
    color: '#9ca3af',
  },
  listContent: {
    paddingHorizontal: 16,
    /** Alineado con `MatchSearchScreen` `scrollContent.paddingTop` (primera línea de resultados). */
    paddingTop: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: theme.fontSize.sm,
    color: '#9ca3af',
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: '#fca5a5',
    textAlign: 'center',
    marginBottom: 12,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(241,143,52,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.35)',
  },
  retryText: {
    color: theme.auth.accent,
    fontWeight: '600',
    fontSize: theme.fontSize.sm,
  },
  emptyWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: theme.fontSize.sm,
    color: '#9ca3af',
    textAlign: 'center',
  },
  requestCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 12,
    gap: 6,
  },
  requestTitle: {
    color: '#fff',
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  requestStatus: {
    color: '#f59e0b',
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  requestMessage: {
    color: '#9ca3af',
    fontSize: theme.fontSize.xs,
  },
  pressed: { opacity: 0.85 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 16,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  modalSectionLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 4,
  },
  modalScroll: { maxHeight: 200 },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  modalRowText: {
    fontSize: theme.fontSize.sm,
    color: '#e5e5e5',
  },
  modalRowTextActive: {
    color: theme.auth.accent,
    fontWeight: '600',
  },
  modalClose: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 8,
  },
  modalCloseText: {
    color: '#9ca3af',
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
});
