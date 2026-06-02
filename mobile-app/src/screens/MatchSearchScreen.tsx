import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SearchFilterBar } from '../components/search/SearchFilterBar';
import { SearchFiltersSheet } from '../components/search/SearchFiltersSheet';
import {
  SearchQuickPickers,
  type SearchQuickPickerKind,
} from '../components/search/SearchQuickPickers';
import { FilterSearchHeader } from '../components/filters/FilterSearchHeader';
import { filterTheme } from '../components/filters/filterTheme';
import { countAdvancedSearchFilters } from '../domain/searchFilters';
import { theme } from '../theme';
import { SearchResultsList } from '../components/search/SearchResultsList';
import { aggregateCourtsByClub } from '../domain/aggregateCourtsByClub';
import { useMatchSearch } from '../hooks/useMatchSearch';
import type { SearchCourtResult } from '../api/search';

const BG = filterTheme.bg;

type MatchSearchScreenProps = {
  onCourtPress?: (representativeCourt: SearchCourtResult) => void;
  onBack?: () => void;
};

/** Buscador de pistas (tab Pistas). */
export function MatchSearchScreen({ onCourtPress, onBack }: MatchSearchScreenProps) {
  const insets = useSafeAreaInsets();
  const [filtersSheetVisible, setFiltersSheetVisible] = useState(false);
  const [quickPicker, setQuickPicker] = useState<SearchQuickPickerKind>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const {
    filters,
    applyFilters,
    patchFilters,
    clearFilters,
    results,
    listResults,
    loading,
    fetchError,
    refetch,
    sportLabel,
    dateLabel,
    timeRangeLabel,
    chipActive,
  } = useMatchSearch();

  const advancedFilterCount = countAdvancedSearchFilters(filters);

  const filteredResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return results;
    return results.filter(
      (r) =>
        r.courtName.toLowerCase().includes(q) ||
        r.clubName.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q),
    );
  }, [results, searchQuery]);

  const clubGroups = useMemo(
    () => aggregateCourtsByClub(filteredResults, { sortBy: filters.sortBy }),
    [filteredResults, filters.sortBy],
  );

  const clubCountForFilters = useMemo(
    () => aggregateCourtsByClub(listResults, { sortBy: filters.sortBy }).length,
    [listResults, filters.sortBy],
  );

  return (
    <View style={styles.root}>
      <View style={[styles.stickyHeader, { paddingTop: 6, paddingBottom: 12 }]}>
        <FilterSearchHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          placeholder="Buscar club o zona..."
          onBack={onBack}
          showFiltersButton={false}
        />
        <SearchFilterBar
          sportLabel={sportLabel}
          dateLabel={dateLabel}
          timeRangeLabel={timeRangeLabel}
          sportActive={chipActive.sport}
          dateActive={chipActive.date}
          timeActive={chipActive.time}
          onSportPress={() => setQuickPicker('sport')}
          onDatePress={() => setQuickPicker('date')}
          onTimeRangePress={() => setQuickPicker('time')}
          showCercaBadge={filters.sortBy === 'distancia'}
          advancedCount={advancedFilterCount}
          onAdvancedPress={() => setFiltersSheetVisible(true)}
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
          clubGroups={clubGroups}
          loading={loading && clubGroups.length === 0}
          fetchError={fetchError}
          onRetry={refetch}
          onClubPress={onCourtPress}
          onFavoritePress={(court) =>
            Alert.alert(
              'Favoritos',
              `Próximamente podrás guardar «${court.clubName}» en favoritos.`,
            )
          }
        />
      </ScrollView>

      <SearchQuickPickers
        kind={quickPicker}
        filters={filters}
        onClose={() => setQuickPicker(null)}
        onApply={patchFilters}
      />

      <SearchFiltersSheet
        visible={filtersSheetVisible}
        onClose={() => setFiltersSheetVisible(false)}
        onApply={applyFilters}
        onClear={clearFilters}
        initialFilters={filters}
        resultCount={clubCountForFilters}
        resultCountKind="clubs"
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
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
});
