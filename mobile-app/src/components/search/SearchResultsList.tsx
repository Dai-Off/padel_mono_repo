import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SearchCourtResult } from '../../api/search';
import type { SearchClubGroup } from '../../domain/aggregateCourtsByClub';
import { SearchClubCard } from './SearchClubCard';
import { SearchCourtCardSkeleton } from './SearchCourtCardSkeleton';
import { theme } from '../../theme';

const SKELETON_COUNT = 4;

type SearchResultsListProps = {
  clubGroups: SearchClubGroup[];
  loading: boolean;
  fetchError?: string | null;
  onRetry?: () => void;
  /** Abre el detalle del club (pistas dentro); se pasa la pista representativa del club. */
  onClubPress?: (representativeCourt: SearchCourtResult) => void;
  onFavoritePress?: (representativeCourt: SearchCourtResult) => void;
};

export function SearchResultsList({
  clubGroups,
  loading,
  fetchError,
  onRetry,
  onClubPress,
  onFavoritePress,
}: SearchResultsListProps) {
  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.resultCount}>Buscando clubes…</Text>
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
      {fetchError ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.errorBanner, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Reintentar cargar clubes"
        >
          <Text style={styles.errorText}>
            No se pudo actualizar la lista. Toca para reintentar.
          </Text>
        </Pressable>
      ) : null}
      <Text style={styles.resultCount}>
        {clubGroups.length}{' '}
        {clubGroups.length === 1 ? 'club encontrado' : 'clubes encontrados'}
      </Text>
      <View style={styles.list}>
        {clubGroups.map((group) => (
          <SearchClubCard
            key={group.representative.clubId}
            group={group}
            onPress={() => onClubPress?.(group.representative)}
            onFavoritePress={() => onFavoritePress?.(group.representative)}
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
  errorBanner: {
    marginBottom: theme.spacing.md,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(227, 30, 36, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(227, 30, 36, 0.35)',
  },
  errorText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: '#fca5a5',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.85,
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
