import { useCallback, useEffect, useMemo, useState } from 'react';
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
import type { PublicTournamentRow } from '../api/tournaments';
import { fetchMyTournaments, fetchPublicTournaments } from '../api/tournaments';
import { TournamentListCard } from '../components/competiciones/TournamentListCard';
import { TournamentDetailScreen } from './TournamentDetailScreen';
import { useAuth } from '../contexts/AuthContext';
import {
  formatFormatLabel,
  matchesFormatFilter,
  matchesLevelFilter,
  matchesSearch,
  type TournamentFormatFilter,
  type TournamentLevelFilter,
} from '../domain/tournamentDisplay';
import { theme } from '../theme';

const BG = '#0F0F0F';

type CompeticionTab = 'disponibles' | 'inscritas';

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
  const [items, setItems] = useState<PublicTournamentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [detailOpen, setDetailOpen] = useState<{ id: string } | null>(null);

  const load = useCallback(async () => {
    setError(null);
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filtered = useMemo(() => {
    return items
      .filter((row) => String(row.status ?? '').toLowerCase() !== 'cancelled')
      .filter(
        (row) =>
          matchesSearch(row, searchQuery) &&
          matchesFormatFilter(row, formatFilter) &&
          matchesLevelFilter(row, levelFilter),
      );
  }, [items, searchQuery, formatFilter, levelFilter]);

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

  const listHeader = (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>
        {activeTab === 'disponibles' ? 'Torneos disponibles' : 'Mis torneos'}
      </Text>
      <Text style={styles.sectionSub}>
        {filtered.length === 1 ? '1 torneo' : `${filtered.length} torneos`}
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
          data={filtered}
          keyExtractor={(item) => item.id}
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
          renderItem={({ item }) => (
            <TournamentListCard
              row={item}
              onPress={() => setDetailOpen({ id: item.id })}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                {activeTab === 'inscritas' && !session?.access_token
                  ? 'Inicia sesión para ver tus torneos inscritos.'
                  : error
                    ? error
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
