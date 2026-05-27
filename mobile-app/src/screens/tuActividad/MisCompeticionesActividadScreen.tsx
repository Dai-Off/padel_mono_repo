import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHomeData } from '../../contexts/HomeDataContext';
import { useTuActividadData } from '../../contexts/TuActividadDataContext';
import { TournamentListCard } from '../../components/competiciones/TournamentListCard';
import { ActivityEmptyState } from '../../components/tuActividad/ActivityEmptyState';
import { TuActividadHeader } from '../../components/tuActividad/TuActividadHeader';
import { TuActividadListSkeleton } from '../../components/tuActividad/TuActividadListSkeleton';
import { TournamentDetailScreen } from '../TournamentDetailScreen';
import { theme } from '../../theme';

type MisCompeticionesActividadScreenProps = {
  onBack: () => void;
};

export function MisCompeticionesActividadScreen({ onBack }: MisCompeticionesActividadScreenProps) {
  const insets = useSafeAreaInsets();
  const { profile } = useHomeData();
  const {
    loading,
    refreshing,
    error,
    tournaments,
    tournamentsHasMore,
    loadingMoreTournaments,
    refresh,
    loadMoreTournaments,
  } = useTuActividadData();
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    if (detailId == null) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setDetailId(null);
      return true;
    });
    return () => sub.remove();
  }, [detailId]);

  const needsOnboarding = profile != null && profile.onboardingCompleted === false;

  const summary = useMemo(() => {
    if (tournaments.length === 0) return null;
    return tournaments.length === 1
      ? '1 competición a la que te uniste'
      : `${tournaments.length} competiciones`;
  }, [tournaments.length]);

  if (loading) {
    return <TuActividadListSkeleton title="Competiciones" onBack={onBack} rows={3} />;
  }

  if (error && tournaments.length === 0) {
    return (
      <View style={styles.container}>
        <TuActividadHeader title="Competiciones" onBack={onBack} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TuActividadHeader title="Competiciones" onBack={onBack} />
      <FlatList
        data={tournaments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: 24 + (insets.bottom ?? 0) },
          tournaments.length === 0 && styles.listEmpty,
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
        onEndReached={() => void loadMoreTournaments()}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={summary ? <Text style={styles.summary}>{summary}</Text> : null}
        ListFooterComponent={
          loadingMoreTournaments ? (
            <ActivityIndicator style={styles.footerLoader} color={theme.auth.accent} />
          ) : null
        }
        ListEmptyComponent={
          <ActivityEmptyState
            icon="shield-outline"
            title="Sin competiciones"
            message="Cuando te inscribas en un torneo o liga, aparecerá en este listado."
          />
        }
        renderItem={({ item }) => (
          <View style={styles.cardWrap}>
            <TournamentListCard
              row={item}
              userElo={profile?.eloRating ?? null}
              lockedByOnboarding={needsOnboarding}
              onPress={() => setDetailId(item.id)}
            />
          </View>
        )}
      />

      <Modal visible={detailId != null} animationType="slide" presentationStyle="fullScreen">
        {detailId != null ? (
          <TournamentDetailScreen tournamentId={detailId} onClose={() => setDetailId(null)} />
        ) : null}
      </Modal>
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
  cardWrap: { marginBottom: 12 },
  footerLoader: { marginVertical: 16 },
});
