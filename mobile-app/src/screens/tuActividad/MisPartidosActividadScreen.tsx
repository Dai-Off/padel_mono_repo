import { useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTuActividadData } from '../../contexts/TuActividadDataContext';
import { ActividadPartidoCard } from '../../components/tuActividad/ActividadPartidoCard';
import { ActivityEmptyState } from '../../components/tuActividad/ActivityEmptyState';
import { TuActividadHeader } from '../../components/tuActividad/TuActividadHeader';
import { TuActividadListSkeleton } from '../../components/tuActividad/TuActividadListSkeleton';
import type { PartidoItem } from '../PartidosScreen';
import { theme } from '../../theme';

type MisPartidosActividadScreenProps = {
  onBack: () => void;
  onPartidoPress?: (partido: PartidoItem) => void;
};

export function MisPartidosActividadScreen({ onBack, onPartidoPress }: MisPartidosActividadScreenProps) {
  const insets = useSafeAreaInsets();
  const { loading, refreshing, error, pastPartidos, refresh } = useTuActividadData();

  const summary = useMemo(() => {
    if (pastPartidos.length === 0) return null;
    return pastPartidos.length === 1 ? '1 partido jugado' : `${pastPartidos.length} partidos jugados`;
  }, [pastPartidos.length]);

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
        data={pastPartidos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: 24 + (insets.bottom ?? 0) },
          pastPartidos.length === 0 && styles.listEmpty,
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
        ListHeaderComponent={summary ? <Text style={styles.summary}>{summary}</Text> : null}
        ListEmptyComponent={
          <ActivityEmptyState
            icon="trophy-outline"
            title="Sin partidos todavía"
            message="Cuando completes un partido en el que participes, aparecerá aquí tu historial."
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
