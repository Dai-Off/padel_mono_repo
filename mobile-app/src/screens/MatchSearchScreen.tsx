import { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SearchFilterBar } from '../components/search/SearchFilterBar';
import { SearchFiltersSheet } from '../components/search/SearchFiltersSheet';
import { theme } from '../theme';
import { SearchResultsList } from '../components/search/SearchResultsList';
import { useMatchSearch } from '../hooks/useMatchSearch';
import type { SearchCourtResult } from '../api/search';

const BG = '#0F0F0F';

type MatchSearchScreenProps = {
  onCourtPress?: (court: SearchCourtResult) => void;
  onBack?: () => void;
};

/** Buscador de pistas (tab Pistas): tema oscuro alineado a BuscadorScreen web. */
export function MatchSearchScreen({ onCourtPress, onBack }: MatchSearchScreenProps) {
  const insets = useSafeAreaInsets();
  const [filtersSheetVisible, setFiltersSheetVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const {
    filters,
    applyFilters,
    clearFilters,
    results,
    resultCount,
    loading,
    sportLabel,
    dateLabel,
    timeRangeLabel,
  } = useMatchSearch();

  const openFilters = () => setFiltersSheetVisible(true);

  const filteredResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return results;
    return results.filter(
      (r) =>
        r.courtName.toLowerCase().includes(q) ||
        r.clubName.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q)
    );
  }, [results, searchQuery]);

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.stickyHeader,
          {
            paddingTop: 6,
            paddingBottom: 12,
          },
        ]}
      >
        <View style={styles.topRow}>
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Volver"
          >
            <Ionicons name="arrow-back" size={18} color="#fff" />
          </Pressable>
          <View style={styles.searchShell}>
            <Ionicons
              name="search"
              size={16}
              color="#737373"
              style={styles.searchIcon}
            />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Buscar club o zona..."
              placeholderTextColor="#737373"
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
          <Pressable
            onPress={openFilters}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Filtros"
          >
            <Ionicons name="options-outline" size={18} color="#fff" />
          </Pressable>
        </View>
        <SearchFilterBar
          sportLabel={sportLabel}
          dateLabel={dateLabel}
          timeRangeLabel={timeRangeLabel}
          onSportPress={openFilters}
          onDatePress={openFilters}
          onTimeRangePress={openFilters}
          showCercaBadge={filters.sortBy === 'distancia'}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: theme.scrollBottomPadding + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SearchResultsList
          results={filteredResults}
          loading={loading}
          onCourtPress={onCourtPress}
        />
      </ScrollView>

      <SearchFiltersSheet
        visible={filtersSheetVisible}
        onClose={() => setFiltersSheetVisible(false)}
        onApply={applyFilters}
        onClear={clearFilters}
        initialFilters={filters}
        resultCount={resultCount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
    minHeight: 0,
  },
  stickyHeader: {
    backgroundColor: 'rgba(15,15,15,0.96)',
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
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: Platform.select({ ios: 8, default: 4 }),
    fontSize: theme.fontSize.sm,
    color: '#fff',
    includeFontPadding: false,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  pressed: {
    opacity: 0.85,
  },
});
