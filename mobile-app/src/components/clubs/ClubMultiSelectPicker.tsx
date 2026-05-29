import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { ClubCatalogItem } from '../../hooks/useClubCatalog';
import { useClubCatalog } from '../../hooks/useClubCatalog';
import { theme } from '../../theme';

const BG = '#0F0F0F';
const ACCENT = theme.auth.accent;

export type ClubMultiSelectFilters = {
  sport: 'all' | 'padel' | 'tenis' | 'pickleball';
  cerramiento: 'all' | 'indoor' | 'outdoor';
};

const DEFAULT_FILTERS: ClubMultiSelectFilters = {
  sport: 'all',
  cerramiento: 'all',
};

type ClubMultiSelectPickerProps = {
  visible: boolean;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  maxSelection?: number;
};

function FilterChipButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.filterChip, pressed && styles.pressed]}>
      <Text style={styles.filterChipText} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.75)" />
    </Pressable>
  );
}

function matchesFilters(club: ClubCatalogItem, filters: ClubMultiSelectFilters): boolean {
  if (filters.sport !== 'all' && !club.sports.has(filters.sport)) return false;
  if (filters.cerramiento === 'indoor' && !club.hasIndoor) return false;
  if (filters.cerramiento === 'outdoor' && !club.hasOutdoor) return false;
  return true;
}

export function ClubMultiSelectPicker({
  visible,
  selectedIds,
  onChange,
  onClose,
  title = 'Clubes preferidos',
  subtitle = 'Elegí uno o varios clubes donde quieras jugar',
  maxSelection = 20,
}: ClubMultiSelectPickerProps) {
  const insets = useSafeAreaInsets();
  const { clubs, loading, error, reload } = useClubCatalog();
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<ClubMultiSelectFilters>(DEFAULT_FILTERS);
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return clubs.filter((club) => {
      if (!matchesFilters(club, filters)) return false;
      if (!q) return true;
      return (
        club.name.toLowerCase().includes(q) ||
        club.city.toLowerCase().includes(q) ||
        club.address.toLowerCase().includes(q)
      );
    });
  }, [clubs, filters, searchQuery]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const sportChipLabel =
    filters.sport === 'all'
      ? 'Deporte'
      : filters.sport === 'padel'
        ? 'Pádel'
        : filters.sport === 'tenis'
          ? 'Tenis'
          : 'Pickleball';

  const cerramientoChipLabel =
    filters.cerramiento === 'all'
      ? 'Cerramiento'
      : filters.cerramiento === 'indoor'
        ? 'Interior'
        : 'Exterior';

  const toggleClub = (clubId: string) => {
    if (selectedSet.has(clubId)) {
      onChange(selectedIds.filter((id) => id !== clubId));
      return;
    }
    if (selectedIds.length >= maxSelection) return;
    onChange([...selectedIds, clubId]);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: Math.max(insets.top, 8) }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.iconBtn} accessibilityLabel="Cerrar">
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
        </View>

        <View style={styles.topRow}>
          <View style={styles.searchShell}>
            <Ionicons name="search" size={16} color="#737373" style={styles.searchIcon} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Buscar club o zona..."
              placeholderTextColor="#737373"
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
          <Pressable
            onPress={() => setFilterModalVisible(true)}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          >
            <Ionicons name="options-outline" size={18} color="#fff" />
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <FilterChipButton label={sportChipLabel} onPress={() => setFilterModalVisible(true)} />
          <FilterChipButton label={cerramientoChipLabel} onPress={() => setFilterModalVisible(true)} />
          {selectedIds.length > 0 ? (
            <Pressable
              onPress={() => onChange([])}
              style={({ pressed }) => [styles.clearChip, pressed && styles.pressed]}
            >
              <Text style={styles.clearChipText}>Limpiar ({selectedIds.length})</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={ACCENT} />
            <Text style={styles.loadingText}>Cargando clubes…</Text>
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void reload()} style={styles.retryBtn}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: insets.bottom + 88, paddingHorizontal: 16 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={styles.emptyText}>No hay clubes que coincidan con tu búsqueda.</Text>
            }
            renderItem={({ item }) => {
              const active = selectedSet.has(item.id);
              const location =
                item.distanceKm != null ? `${item.distanceKm} km · ${item.city}` : item.city;
              return (
                <Pressable
                  onPress={() => toggleClub(item.id)}
                  style={({ pressed }) => [
                    styles.clubRow,
                    active && styles.clubRowActive,
                    pressed && styles.pressed,
                  ]}
                >
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.clubThumb} />
                  ) : (
                    <View style={[styles.clubThumb, styles.clubThumbPlaceholder]}>
                      <Ionicons name="business-outline" size={20} color="#9CA3AF" />
                    </View>
                  )}
                  <View style={styles.clubTextCol}>
                    <Text style={styles.clubName}>{item.name}</Text>
                    <Text style={styles.clubMeta} numberOfLines={1}>
                      {location}
                    </Text>
                  </View>
                  <Ionicons
                    name={active ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={active ? ACCENT : '#6B7280'}
                  />
                </Pressable>
              );
            }}
          />
        )}

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Text style={styles.footerHint}>
            {selectedIds.length === 0
              ? 'Sin clubes = buscar por distancia'
              : `${selectedIds.length} club${selectedIds.length === 1 ? '' : 'es'} seleccionado${selectedIds.length === 1 ? '' : 's'}`}
          </Text>
          <Pressable onPress={onClose} style={styles.doneBtn}>
            <Text style={styles.doneBtnText}>Listo</Text>
          </Pressable>
        </View>

        <Modal
          visible={filterModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setFilterModalVisible(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setFilterModalVisible(false)}>
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>Filtros</Text>
              <Text style={styles.modalSectionLabel}>Deporte</Text>
              {(['all', 'padel', 'tenis', 'pickleball'] as const).map((key) => (
                <Pressable
                  key={key}
                  style={({ pressed }) => [styles.modalRow, pressed && styles.pressed]}
                  onPress={() => setFilters((f) => ({ ...f, sport: key }))}
                >
                  <Text style={[styles.modalRowText, filters.sport === key && styles.modalRowTextActive]}>
                    {key === 'all' ? 'Todos' : key === 'padel' ? 'Pádel' : key === 'tenis' ? 'Tenis' : 'Pickleball'}
                  </Text>
                  {filters.sport === key ? (
                    <Ionicons name="checkmark" size={18} color={ACCENT} />
                  ) : null}
                </Pressable>
              ))}
              <Text style={styles.modalSectionLabel}>Cerramiento</Text>
              {(['all', 'indoor', 'outdoor'] as const).map((key) => (
                <Pressable
                  key={key}
                  style={({ pressed }) => [styles.modalRow, pressed && styles.pressed]}
                  onPress={() => setFilters((f) => ({ ...f, cerramiento: key }))}
                >
                  <Text
                    style={[styles.modalRowText, filters.cerramiento === key && styles.modalRowTextActive]}
                  >
                    {key === 'all' ? 'Todos' : key === 'indoor' ? 'Interior' : 'Exterior'}
                  </Text>
                  {filters.cerramiento === key ? (
                    <Ionicons name="checkmark" size={18} color={ACCENT} />
                  ) : null}
                </Pressable>
              ))}
              <Pressable style={styles.modalClose} onPress={() => setFilterModalVisible(false)}>
                <Text style={styles.modalCloseText}>Listo</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#9CA3AF', fontSize: 13, marginTop: 2 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
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
  searchIcon: { marginLeft: 12 },
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
  filterScroll: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#1A1A1A',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  filterChipText: { color: '#E5E5E5', fontSize: 13, fontWeight: '500' },
  clearChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(241,143,52,0.15)',
  },
  clearChipText: { color: ACCENT, fontSize: 13, fontWeight: '600' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: '#9CA3AF', fontSize: 14 },
  errorText: { color: '#F87171', fontSize: 14, textAlign: 'center', paddingHorizontal: 24 },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1A1A1A',
  },
  retryText: { color: '#fff', fontWeight: '600' },
  emptyText: { color: '#9CA3AF', textAlign: 'center', marginTop: 32, fontSize: 14 },
  clubRow: {
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
  clubRowActive: {
    borderColor: 'rgba(241,143,52,0.45)',
    backgroundColor: 'rgba(241,143,52,0.08)',
  },
  clubThumb: { width: 48, height: 48, borderRadius: 10 },
  clubThumbPlaceholder: {
    backgroundColor: '#262626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubTextCol: { flex: 1, minWidth: 0 },
  clubName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  clubMeta: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: 'rgba(15,15,15,0.98)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  footerHint: { color: '#9CA3AF', fontSize: 13, flex: 1, marginRight: 12 },
  doneBtn: {
    backgroundColor: ACCENT,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  pressed: { opacity: 0.85 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  modalSectionLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 6,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  modalRowText: { color: '#D4D4D4', fontSize: 15 },
  modalRowTextActive: { color: '#fff', fontWeight: '600' },
  modalClose: {
    marginTop: 16,
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalCloseText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
