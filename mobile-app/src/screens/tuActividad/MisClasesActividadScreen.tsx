import { useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTuActividadData } from '../../contexts/TuActividadDataContext';
import { ActividadClaseCard } from '../../components/tuActividad/ActividadClaseCard';
import { ActivityEmptyState } from '../../components/tuActividad/ActivityEmptyState';
import { TuActividadHeader } from '../../components/tuActividad/TuActividadHeader';
import { TuActividadListSkeleton } from '../../components/tuActividad/TuActividadListSkeleton';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';

type MisClasesActividadScreenProps = {
  onBack: () => void;
};

export function MisClasesActividadScreen({ onBack }: MisClasesActividadScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { loading, refreshing, error, enrollments, refresh } = useTuActividadData();

  const sorted = useMemo(() => {
    return [...enrollments].sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (b.status === 'active' && a.status !== 'active') return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [enrollments]);

  const activeCount = sorted.filter((e) => e.status === 'active').length;

  const summary = useMemo(() => {
    if (sorted.length === 0) return null;
    if (activeCount > 0) {
      return activeCount === 1 ? t('activity.classesActiveOne') : t('activity.classesActiveMany', { count: activeCount });
    }
    return t('activity.classesHistorySub');
  }, [sorted.length, activeCount, t]);

  if (loading) {
    return <TuActividadListSkeleton title={t('activity.rowClasses')} onBack={onBack} />;
  }

  if (error && sorted.length === 0) {
    return (
      <View style={styles.container}>
        <TuActividadHeader title={t('activity.rowClasses')} onBack={onBack} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TuActividadHeader title={t('activity.rowClasses')} onBack={onBack} />
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: 24 + (insets.bottom ?? 0) },
          sorted.length === 0 && styles.listEmpty,
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
            icon="school-outline"
            title={t('activity.classesEmptyTitle')}
            message={t('activity.classesEmptyBody')}
          />
        }
        renderItem={({ item }) => <ActividadClaseCard enrollment={item} />}
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
