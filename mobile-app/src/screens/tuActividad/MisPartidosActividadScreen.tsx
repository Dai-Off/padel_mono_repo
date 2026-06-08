import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTuActividadData } from '../../contexts/TuActividadDataContext';
import { ActividadPartidoCard } from '../../components/tuActividad/ActividadPartidoCard';
import { ActividadPartidosFilterBar } from '../../components/tuActividad/ActividadPartidosFilterBar';
import { ActivityEmptyState } from '../../components/tuActividad/ActivityEmptyState';
import { TuActividadHeader } from '../../components/tuActividad/TuActividadHeader';
import { TuActividadListSkeleton } from '../../components/tuActividad/TuActividadListSkeleton';
import type { ActivityOutcomeFilter } from '../../domain/matchOutcome';
import { matchesActivityFilter } from '../../domain/matchOutcome';
import type { PartidoItem } from '../PartidosScreen';
import { theme } from '../../theme';

type MisPartidosActividadScreenProps = {
  onBack: () => void;
  onPartidoPress?: (partido: PartidoItem) => void;
};

export function MisPartidosActividadScreen({ onBack, onPartidoPress }: MisPartidosActividadScreenProps) {
  const insets = useSafeAreaInsets();
  const { loading, refreshing, error, pastPartidos, refresh } = useTuActividadData();
  const [outcomeFilter, setOutcomeFilter] = useState<ActivityOutcomeFilter>('all');

  const filteredPartidos = useMemo(
    () => pastPartidos.filter((p) => matchesActivityFilter(p, outcomeFilter)),
    [pastPartidos, outcomeFilter],
  );

  const summary = useMemo(() => {
    if (filteredPartidos.length === 0) return null;
    const n = filteredPartidos.length;
    if (outcomeFilter === 'all') {
      return n === 1 ? '1 partido jugado' : `${n} partidos jugados`;
    }
    return n === 1 ? '1 partido' : `${n} partidos`;
  }, [filteredPartidos.length, outcomeFilter]);

  if (loading) {
    return <TuActividadListSkeleton title="Partidos" onBack={onBack} />;
  }

  if (error && pastPartidos.length === 0) {
    return (
      <View style={styles.container}>
        <TuActividadHeader title="Partidos" onBack={onBack} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TuActividadHeader title="Partidos" onBack={onBack} />
      <FlatList
        data={filteredPartidos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: 24 + (insets.bottom ?? 0) },
          filteredPartidos.length === 0 && styles.listEmpty,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={theme.auth.accent}
            colors={[theme.auth.accent]}
          />
        }
        ListHeaderComponent={
          <>
            <ActividadPartidosFilterBar value={outcomeFilter} onChange={setOutcomeFilter} />
            {summary ? <Text style={styles.summary}>{summary}</Text> : null}
          </>
        }
        ListEmptyComponent={
          <ActivityEmptyState
            icon="trophy-outline"
            title={outcomeFilter === 'all' ? 'Sin partidos todavía' : 'Nada en este filtro'}
            message={
              outcomeFilter === 'all'
                ? 'Cuando completes un partido en el que participes, aparecerá aquí tu historial.'
                : 'Probá otro filtro o jugá un partido para ver más historial.'
            }
          />
        }
        renderItem={({ item }) => (
          <ActividadPartidoCard partido={item} onPress={() => onPartidoPress?.(item)} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: theme.auth.error, fontSize: 14, textAlign: 'center' },
  listContent: { paddingHorizontal: 16, paddingTop: 8 },
  listEmpty: { flexGrow: 1 },
  summary: {
    fontSize: 13,
    color: theme.auth.textSecondary,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
});
