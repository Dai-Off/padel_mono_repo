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
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { MyTournamentEntryRequest, PublicTournamentRow } from '../api/tournaments';
import { fetchMyTournamentEntryRequests, fetchMyTournaments, fetchPublicTournaments } from '../api/tournaments';
import { TournamentListCard } from '../components/competiciones/TournamentListCard';
import { TournamentDetailScreen } from './TournamentDetailScreen';
import { OnboardingInlineBanner } from '../components/onboarding/OnboardingInlineBanner';
import { useAuth } from '../contexts/AuthContext';
import { useHomeData } from '../contexts/HomeDataContext';
import { tournamentTitle } from '../domain/tournamentDisplay';
import {
  countTournamentActiveFilters,
  filterTournamentRows,
  formatFilterChipLabel,
  getInitialTournamentFilters,
  joinableChipLabel,
  levelChipLabel,
  type TournamentFiltersState,
} from '../domain/tournamentFilters';
import { AppFilterBar } from '../components/filters/AppFilterBar';
import { FilterSearchHeader } from '../components/filters/FilterSearchHeader';
import {
  TournamentFilterSheets,
  type TournamentSheetKind,
} from '../components/competiciones/TournamentFilterSheets';
import { theme } from '../theme';

const BG = '#0F0F0F';

type CompeticionTab = 'disponibles' | 'inscritas' | 'solicitudes';

/** Fila unificada para `FlatList` (torneos vs solicitudes de inscripción). */
type CompeticionesListRow =
  | { kind: 'tournament'; row: PublicTournamentRow }
  | { kind: 'request'; req: MyTournamentEntryRequest };

type CompeticionesScreenProps = {
  onBack?: () => void;
  /** Abre el detalle de un torneo (p. ej. tras aceptar invitación). */
  initialOpenTournamentId?: string | null;
  onInitialTournamentOpened?: () => void;
  /** Abre el perfil con el cuestionario auto-abierto (banner soft block). */
  onOpenProfileForOnboarding?: () => void;
};

export function CompeticionesScreen({
  onBack,
  initialOpenTournamentId,
  onInitialTournamentOpened,
  onOpenProfileForOnboarding,
}: CompeticionesScreenProps) {
  const PAGE_SIZE = 20;
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState<CompeticionTab>('disponibles');
  const [searchQuery, setSearchQuery] = useState('');
  const [tournamentFilters, setTournamentFilters] = useState<TournamentFiltersState>(
    getInitialTournamentFilters,
  );
  const [filterSheet, setFilterSheet] = useState<TournamentSheetKind>(null);
  // elo y onboarding del profile compartido (HomeDataContext) — evita un GET
  // /players/me al montar esta pantalla.
  const { profile } = useHomeData();
  const myElo = profile?.eloRating ?? null;
  /**
   * Soft block: torneos competitivos bloquean inscripción si el usuario no
   * ha completado el cuestionario de nivelación (backend tournaments.ts
   * gatea por elo, que es NULL sin onboarding).
   */
  const needsOnboarding = profile != null && profile.onboardingCompleted === false;
  const [items, setItems] = useState<PublicTournamentRow[]>([]);
  const [requestItems, setRequestItems] = useState<MyTournamentEntryRequest[]>([]);
  const [requestUnreadCount, setRequestUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState<{ id: string } | null>(null);

  useEffect(() => {
    if (initialOpenTournamentId) {
      setActiveTab('inscritas');
      setDetailOpen({ id: initialOpenTournamentId });
      onInitialTournamentOpened?.();
    }
  }, [initialOpenTournamentId, onInitialTournamentOpened]);

  const load = useCallback(async (opts?: { append?: boolean; offset?: number }) => {
    const append = Boolean(opts?.append);
    const nextOffset = append ? Math.max(0, Number(opts?.offset ?? 0)) : 0;
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
      const r = await fetchPublicTournaments(session?.access_token ?? null, { limit: PAGE_SIZE, offset: nextOffset });
      if (r.ok) {
        setItems((prev) => (append ? [...prev, ...r.tournaments] : r.tournaments));
        setHasMore(r.pagination.has_more);
      }
      else {
        if (!append) setItems([]);
        setError(r.error);
      }
      return;
    }
    const r = await fetchMyTournaments(session?.access_token ?? null, { limit: PAGE_SIZE, offset: nextOffset });
    if (r.ok) {
      setItems((prev) => (append ? [...prev, ...r.tournaments] : r.tournaments));
      setHasMore(r.pagination.has_more);
    }
    else {
      if (!append) setItems([]);
      setError(r.error);
    }
  }, [PAGE_SIZE, activeTab, session?.access_token]);

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
    (async () => {
      setLoading(true);
      setError(null);
      setHasMore(true);
      await load({ append: false });
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
      if (!['individual', 'pair', 'both'].includes(mode)) return false;
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
    setHasMore(true);
    await load({ append: false });
    setRefreshing(false);
  }, [load]);

  const handleLoadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore || activeTab === 'solicitudes') return;
    setLoadingMore(true);
    await load({ append: true, offset: items.length });
    setLoadingMore(false);
  }, [loading, loadingMore, hasMore, activeTab, items.length, load]);

  const filterContext = useMemo(
    () => ({
      searchQuery,
      activeTab,
      canJoin: canJoinTournament,
    }),
    [searchQuery, activeTab, canJoinTournament],
  );

  const filtered = useMemo((): PublicTournamentRow[] => {
    if (activeTab === 'solicitudes') return [];
    return filterTournamentRows(items, tournamentFilters, filterContext);
  }, [activeTab, items, tournamentFilters, filterContext]);

  const previewTournamentCount = useCallback(
    (draft: TournamentFiltersState) =>
      activeTab === 'solicitudes'
        ? 0
        : filterTournamentRows(items, draft, filterContext).length,
    [activeTab, items, filterContext],
  );

  const activeFilterCount = countTournamentActiveFilters(tournamentFilters, {
    includeJoinable: activeTab === 'disponibles',
  });

  const flatListData = useMemo((): CompeticionesListRow[] => {
    if (activeTab === 'solicitudes') {
      return requestItems.map((req) => ({ kind: 'request' as const, req }));
    }
    return filtered.map((row) => ({ kind: 'tournament' as const, row }));
  }, [activeTab, requestItems, filtered]);

  const listHeader = (
    <>
      {/* Banner inline (no sticky) cuando el usuario aún no tiene nivel.
          Solo en tab 'disponibles' — en 'inscritas'/'solicitudes' ya está
          dentro de su flujo. Mismo componente que en Cursos para consistencia. */}
      {needsOnboarding && activeTab === 'disponibles' && (
        <OnboardingInlineBanner
          icon="trophy-outline"
          message="Descubre tu nivel para inscribirte en torneos competitivos"
          onPress={() => onOpenProfileForOnboarding?.()}
        />
      )}

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
    </>
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
        <FilterSearchHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          placeholder="Buscar torneos..."
          onBack={onBack}
          showFiltersButton={false}
        />

        <AppFilterBar
          advancedCount={activeFilterCount}
          onAdvancedPress={() => setFilterSheet('all')}
          chips={[
            {
              id: 'sport',
              label: 'Pádel',
              active: true,
              onPress: () =>
                Alert.alert('Deporte', 'Por ahora todos los torneos son de pádel.'),
            },
            {
              id: 'format',
              label: formatFilterChipLabel(tournamentFilters),
              active: tournamentFilters.format !== 'all',
              onPress: () => setFilterSheet('format'),
            },
            {
              id: 'level',
              label: levelChipLabel(tournamentFilters),
              active: tournamentFilters.level !== 'all',
              onPress: () => setFilterSheet('level'),
            },
            ...(activeTab === 'disponibles'
              ? [
                  {
                    id: 'joinable',
                    label: joinableChipLabel(tournamentFilters.joinableOnly),
                    active: tournamentFilters.joinableOnly,
                    showChevron: false,
                    onPress: () =>
                      setTournamentFilters((f) => ({ ...f, joinableOnly: !f.joinableOnly })),
                  },
                ]
              : []),
          ]}
        />

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
        <FlatList<CompeticionesListRow>
          data={flatListData}
          keyExtractor={(item) =>
            item.kind === 'request' ? `req:${item.req.id}` : `t:${item.row.id}`
          }
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
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) =>
            item.kind === 'request' ? (
              <Pressable
                onPress={() => {
                  const tid = item.req.tournament_id;
                  if (tid) setDetailOpen({ id: tid });
                }}
                style={({ pressed }) => [styles.requestCard, pressed && styles.pressed]}
              >
                <Text style={styles.requestTitle}>
                  {tournamentTitle({
                    id: String(item.req.tournament?.id ?? item.req.tournament_id),
                    name: item.req.tournament?.name ?? null,
                    club_id: '',
                    start_at: String(item.req.tournament?.start_at ?? ''),
                    end_at: String(item.req.tournament?.start_at ?? ''),
                    duration_min: 0,
                    price_cents: Number(item.req.tournament?.price_cents ?? 0),
                    currency: 'EUR',
                    max_players: 0,
                    status: String(item.req.tournament?.status ?? ''),
                    description: String(item.req.tournament?.name ?? ''),
                    elo_min: item.req.tournament?.elo_min ?? null,
                    elo_max: item.req.tournament?.elo_max ?? null,
                    registration_mode: ((): PublicTournamentRow['registration_mode'] => {
                      const rm = item.req.tournament?.registration_mode;
                      if (rm === 'pair' || rm === 'both' || rm === 'individual') return rm;
                      return 'individual';
                    })(),
                  })}
                </Text>
                <Text style={styles.requestStatus}>
                  Estado: {String(item.req.status ?? '').toUpperCase()}
                </Text>
                <Text style={styles.requestMessage} numberOfLines={2}>
                  {item.req.response_message?.trim() ||
                    item.req.message ||
                    'Sin mensaje'}
                </Text>
              </Pressable>
            ) : (
              <TournamentListCard
                row={item.row}
                userElo={myElo}
                // Solo torneos competitivos (rango de elo definido) llevan
                // candado cuando falta onboarding. Los abiertos sin rango se
                // muestran normales y el usuario puede inscribirse.
                lockedByOnboarding={
                  needsOnboarding &&
                  (item.row.elo_min != null || item.row.elo_max != null)
                }
                onPress={() => setDetailOpen({ id: item.row.id })}
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
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 16 }}>
                <ActivityIndicator size="small" color={theme.auth.accent} />
              </View>
            ) : null
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
              onOpenProfileForOnboarding={() => {
                setDetailOpen(null);
                onOpenProfileForOnboarding?.();
              }}
            />
          </View>
        ) : null}
      </Modal>

      <TournamentFilterSheets
        kind={filterSheet}
        draft={tournamentFilters}
        showJoinableSection={activeTab === 'disponibles'}
        resultCount={previewTournamentCount(tournamentFilters)}
        onClose={() => setFilterSheet(null)}
        onApply={setTournamentFilters}
      />
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
});
