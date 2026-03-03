import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SearchFilterBar } from '../components/search/SearchFilterBar';
import { SearchFiltersSheet } from '../components/search/SearchFiltersSheet';
import { theme } from '../theme';
import { SearchResultsList } from '../components/search/SearchResultsList';
import { useMatchSearch } from '../hooks/useMatchSearch';
import type { SearchCourtResult } from '../api/search';

type MatchSearchScreenProps = {
  onCourtPress?: (court: SearchCourtResult) => void;
};

/** Pantalla del buscador de pistas para reservar. La navbar (BackHeader) se renderiza vía ScreenLayout. */
export function MatchSearchScreen({ onCourtPress }: MatchSearchScreenProps) {
  const [filtersSheetVisible, setFiltersSheetVisible] = useState(false);
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.filterBarWrapper}>
        <SearchFilterBar
          sportLabel={sportLabel}
          dateLabel={dateLabel}
          timeRangeLabel={timeRangeLabel}
          onFiltersPress={() => setFiltersSheetVisible(true)}
        />
      </View>
      <SearchFiltersSheet
        visible={filtersSheetVisible}
        onClose={() => setFiltersSheetVisible(false)}
        onApply={applyFilters}
        onClear={clearFilters}
        initialFilters={filters}
        resultCount={resultCount}
      />
      <SearchResultsList
        results={results}
        loading={loading}
        onCourtPress={onCourtPress}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: theme.scrollBottomPadding,
  },
  /** Cancela el padding del padre para que la barra ocupe todo el ancho y quede centrada */
  filterBarWrapper: {
    marginHorizontal: -20,
  },
});
