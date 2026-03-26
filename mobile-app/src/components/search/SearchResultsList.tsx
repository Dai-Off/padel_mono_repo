import { StyleSheet, Text, View } from 'react-native';
import { SearchCourtCard } from './SearchCourtCard';
import { SearchCourtCardSkeleton } from './SearchCourtCardSkeleton';
import type { SearchCourtResult } from '../../api/search';
import { theme } from '../../theme';

const SKELETON_COUNT = 4;

type SearchResultsListProps = {
  results: SearchCourtResult[];
  loading: boolean;
  onCourtPress?: (court: SearchCourtResult) => void;
  onTimeSlotPress?: (courtId: string, slot: string) => void;
  onFavoritePress?: (court: SearchCourtResult) => void;
};

export function SearchResultsList({
  results,
  loading,
  onCourtPress,
  onTimeSlotPress,
  onFavoritePress,
}: SearchResultsListProps) {
  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.resultCount}>Buscando pistas…</Text>
        <View style={styles.list}>
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <SearchCourtCardSkeleton key={i} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.resultCount}>
        {results.length}{' '}
        {results.length === 1 ? 'pista encontrada' : 'pistas encontradas'}
      </Text>
      <View style={styles.list}>
        {results.map((court) => (
          <SearchCourtCard
            key={court.id}
            court={court}
            onPress={() => onCourtPress?.(court)}
            onTimeSlotPress={onTimeSlotPress}
            onFavoritePress={() => onFavoritePress?.(court)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 0,
  },
  resultCount: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: '#737373',
    marginBottom: theme.spacing.md,
  },
  list: {
    gap: theme.spacing.md,
  },
});
