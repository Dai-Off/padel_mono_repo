import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMatches } from '../api/matches';
import { mapMatchToPartido } from '../api/mapMatchToPartido';
import {
  CompetitiveLeagueHomeCard,
  DailyLessonCard,
  EnDirectoSection,
  IAAfinidadCard,
  InicioQuickActions,
  INICIO_PAD_BOTTOM,
  INICIO_PAD_H,
  INICIO_PAD_TOP,
  INICIO_STACK_GAP,
  MissionsHomeSection,
  SeasonPassHomeCard,
} from '../components/home/inicio';
import { useAuth } from '../contexts/AuthContext';
import { useHomeStats } from '../hooks/useHomeStats';
import type { PartidoItem } from './PartidosScreen';

type TabId = 'pistas' | 'partidos' | 'torneos';

type HomeScreenProps = {
  onNavigateToTab?: (tab: TabId) => void;
  onPartidoPress?: (partido: PartidoItem) => void;
};

export function HomeScreen({ onNavigateToTab, onPartidoPress }: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { stats, loading: statsLoading } = useHomeStats();
  const [partidos, setPartidos] = useState<PartidoItem[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);

  const loadMatches = useCallback(async () => {
    setMatchesLoading(true);
    const token = session?.access_token ?? null;
    const matches = await fetchMatches({ expand: true, token });
    const all = matches
      .map(mapMatchToPartido)
      .filter((p): p is PartidoItem => p != null);
    setPartidos(all.filter((p) => p.visibility !== 'private'));
    setMatchesLoading(false);
  }, [session?.access_token]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  const listLoading = statsLoading || matchesLoading;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: INICIO_PAD_TOP,
          paddingBottom: INICIO_PAD_BOTTOM + insets.bottom,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <DailyLessonCard onPress={() => onNavigateToTab?.('partidos')} />
      <SeasonPassHomeCard />
      <CompetitiveLeagueHomeCard
        onPress={() => onNavigateToTab?.('torneos')}
      />
      <InicioQuickActions
        onNavigateToTab={onNavigateToTab}
        openMatchesCount={partidos.length}
        courtsFree={stats?.courtsFree}
        tournamentsCount={stats?.tournaments}
        loading={listLoading}
      />
      <IAAfinidadCard />
      <MissionsHomeSection />
      <EnDirectoSection
        partidos={partidos}
        loading={matchesLoading}
        onPartidoPress={onPartidoPress}
        onOpenPartidos={() => onNavigateToTab?.('partidos')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    paddingHorizontal: INICIO_PAD_H,
    gap: INICIO_STACK_GAP,
  },
});
