import { useMemo, useState } from 'react';
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
import type { ClubCatalogItem } from '../../hooks/useClubCatalog';
import { useClubCatalog } from '../../hooks/useClubCatalog';
import { ClubFilterBar } from './ClubFilterBar';
import { ClubFiltersSheet } from './ClubFiltersSheet';
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

function matchesFilters(club: ClubCatalogItem, filters: ClubMultiSelectFilters): boolean {
  if (filters.sport !== 'all' && !club.sports.has(filters.sport)) return false;
  if (filters.cerramiento === 'indoor' && !club.hasIndoor) return false;
  if (filters.cerramiento === 'outdoor' && !club.hasOutdoor) return false;
  return true;
}

export type ClubMultiSelectBodyProps = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
  onDone?: () => void;
  title?: string;
  subtitle?: string;
  maxSelection?: number;
  doneLabel?: string;
  doneDisabled?: boolean;
  clubs: ClubCatalogItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

export function ClubMultiSelectBody({
  selectedIds,
  onChange,
  onClose,
  onDone,
  title = 'Clubes preferidos',
  subtitle = 'Elegí uno o varios clubes donde quieras jugar',
  maxSelection = 20,
  doneLabel = 'Listo',
  doneDisabled = false,
  clubs,
  loading,
  error,
  onRetry,
}: ClubMultiSelectBodyProps) {
  const insets = useSafeAreaInsets();
  const reload = onRetry;

  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<ClubMultiSelectFilters>(DEFAULT_FILTERS);
  const [filtersSheetVisible, setFiltersSheetVisible] = useState(false);
  const [filtersBarVisible, setFiltersBarVisible] = useState(false);

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

  const hasActiveFilters = filters.sport !== 'all' || filters.cerramiento !== 'all';

  const toggleClub = (clubId: string) => {
    if (selectedSet.has(clubId)) {
      onChange(selectedIds.filter((id) => id !== clubId));
      return;
    }
    if (selectedIds.length >= maxSelection) return;
    onChange([...selectedIds, clubId]);
  };

  const toggleFiltersBar = () => {
    setFiltersBarVisible((v) => !v);
    if (!filtersBarVisible) setFiltersSheetVisible(false);
  };

  const handleDonePress = () => {
    if (onDone) onDone();
    else onClose();
  };

  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, 8) }]}>
      <View style={styles.header}>
        <Pressable onPress={onClose} style={styles.iconBtn} accessibilityLabel="Cerrar">
          <Ionicons name="close" size={20} color="#fff" />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
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
          onPress={toggleFiltersBar}
          style={({ pressed }) => [
            styles.iconBtn,
            filtersBarVisible && styles.iconBtnActive,
            pressed && styles.pressed,
          ]}
          accessibilityLabel={filtersBarVisible ? 'Ocultar filtros' : 'Mostrar filtros'}
        >
          <Ionicons name="options-outline" size={18} color={filtersBarVisible ? ACCENT : '#fff'} />
        </Pressable>
      </View>

      {filtersBarVisible ? (
        <View style={styles.filterBarWrap}>
          <ClubFilterBar
            filters={filters}
            sportLabel={sportChipLabel}
            cerramientoLabel={cerramientoChipLabel}
            hasActiveFilters={hasActiveFilters}
            onSportPress={() => setFiltersSheetVisible(true)}
            onCerramientoPress={() => setFiltersSheetVisible(true)}
          />
        </View>
      ) : null}

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
          style={styles.list}
          contentContainerStyle={{ paddingBottom: insets.bottom + 96, paddingHorizontal: 16 }}
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
        <View style={styles.footerLeft}>
          <Text style={styles.footerHint}>
            {selectedIds.length === 0
              ? 'Sin clubes = buscar por distancia'
              : `${selectedIds.length} seleccionado${selectedIds.length === 1 ? '' : 's'}`}
          </Text>
          {selectedIds.length > 0 ? (
            <Pressable onPress={() => onChange([])} hitSlop={8}>
              <Text style={styles.clearSelectionText}>Quitar selección</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={handleDonePress}
          style={[styles.doneBtn, doneDisabled && styles.doneBtnDisabled]}
          disabled={doneDisabled}
        >
          <Text style={styles.doneBtnText}>{doneLabel}</Text>
        </Pressable>
      </View>

      <ClubFiltersSheet
        visible={filtersSheetVisible}
        onClose={() => setFiltersSheetVisible(false)}
        initialFilters={filters}
        onApply={setFilters}
        resultCount={filtered.length}
      />
    </View>
  );
}

type ClubMultiSelectPickerProps = {
  visible: boolean;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  maxSelection?: number;
};

export function ClubMultiSelectPicker({
  visible,
  selectedIds,
  onChange,
  onClose,
  title,
  subtitle,
  maxSelection,
}: ClubMultiSelectPickerProps) {
  const { clubs, loading, error, reload } = useClubCatalog();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ClubMultiSelectBody
        selectedIds={selectedIds}
        onChange={onChange}
        onClose={onClose}
        title={title}
        subtitle={subtitle}
        maxSelection={maxSelection}
        clubs={clubs}
        loading={loading}
        error={error}
        onRetry={reload}
      />
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
    marginBottom: 4,
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
  iconBtnActive: {
    borderColor: 'rgba(241,143,52,0.45)',
    backgroundColor: 'rgba(241,143,52,0.12)',
  },
  filterBarWrap: { marginBottom: 8 },
  list: { flex: 1 },
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
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: 'rgba(15,15,15,0.98)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 12,
  },
  footerLeft: { flex: 1, minWidth: 0, gap: 4 },
  footerHint: { color: '#9CA3AF', fontSize: 13 },
  clearSelectionText: { color: ACCENT, fontSize: 12, fontWeight: '600' },
  doneBtn: {
    backgroundColor: ACCENT,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  doneBtnDisabled: { opacity: 0.6 },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  pressed: { opacity: 0.85 },
});
