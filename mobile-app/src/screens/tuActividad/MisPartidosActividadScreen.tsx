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
import { useTranslation } from '../../i18n';
import { theme } from '../../theme';

type MisPartidosActividadScreenProps = {
  onBack: () => void;
  onPartidoPress?: (partido: PartidoItem) => void;
};

export function MisPartidosActividadScreen({ onBack, onPartidoPress }: MisPartidosActividadScreenProps) {
  const { t } = useTranslation();
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
      return n === 1 ? t('activity.rowMatchesPlayedOne') : t('activity.rowMatchesPlayedMany', { count: n });
    }
    return n === 1 ? t('activity.matchesSummaryOne') : t('activity.matchesSummaryMany', { count: n });
  }, [filteredPartidos.length, outcomeFilter, t]);

  if (loading) {
    return <TuActividadListSkeleton title={t('activity.rowMatches')} onBack={onBack} />;
  }

  if (error && pastPartidos.length === 0) {
    return (
      <View style={styles.container}>
        <TuActividadHeader title={t('activity.rowMatches')} onBack={onBack} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TuActividadHeader title={t('activity.rowMatches')} onBack={onBack} />
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
            title={outcomeFilter === 'all' ? t('activity.matchesEmptyAll') : t('activity.matchesEmptyFilter')}
            message={
              outcomeFilter === 'all'
                ? t('activity.matchesEmptyAllSub')
                : t('activity.matchesEmptyFilterSub')
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
