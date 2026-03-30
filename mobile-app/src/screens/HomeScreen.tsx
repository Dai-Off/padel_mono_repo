import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMatches } from '../api/matches';
import { fetchMyPlayerProfile } from '../api/players';
import type { MyPlayerProfile } from '../api/players';
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
import { AiMatchModal } from '../components/home/AiMatchModal';
import { searchAiMatch } from '../api/aiMatch';

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
  const [myPlayerProfile, setMyPlayerProfile] = useState<MyPlayerProfile | null>(null);
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token) {
      setMyPlayerProfile(null);
      return;
    }
    fetchMyPlayerProfile(session.access_token).then(setMyPlayerProfile);
  }, [session?.access_token]);

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

  const handleAiMatchSearch = useCallback(async (prompt: string) => {
    setAiLoading(true);
    setAiError(null);
    setAiResponse(null);

    const userName =
      [myPlayerProfile?.firstName, myPlayerProfile?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() ||
      session?.user?.user_metadata?.full_name ||
      session?.user?.email?.split('@')[0] ||
      'Sin dato';

    const enrichedPrompt = [
      'CONTEXTO JUGADOR LOGUEADO (ANCLA)',
      `- player_id: ${myPlayerProfile?.id ?? 'Sin dato'}`,
      `- nombre: ${userName}`,
      `- email: ${myPlayerProfile?.email ?? session?.user?.email ?? 'Sin dato'}`,
      `- elo_rating: ${myPlayerProfile?.eloRating ?? 'Sin dato'}`,
      `- telefono: ${myPlayerProfile?.phone ?? 'Sin dato'}`,
      '',
      'SOLICITUD DEL USUARIO',
      prompt,
      '',
      'INSTRUCCION IMPORTANTE',
      'Usa el jugador logueado como jugador ancla para el matching.',
    ].join('\n');

    const result = await searchAiMatch(enrichedPrompt);
    if (result.ok && result.text) {
      setAiResponse(result.text);
    } else {
      setAiError(result.error ?? 'No se pudo completar la búsqueda.');
    }
    setAiLoading(false);
  }, [myPlayerProfile, session?.user?.email, session?.user?.user_metadata?.full_name]);

  return (
    <>
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
        <CompetitiveLeagueHomeCard onPress={() => onNavigateToTab?.('torneos')} />
        <InicioQuickActions
          onNavigateToTab={onNavigateToTab}
          openMatchesCount={partidos.length}
          courtsFree={stats?.courtsFree}
          tournamentsCount={stats?.tournaments}
          loading={listLoading}
        />
        <IAAfinidadCard
          onPress={() => {
            setAiError(null);
            setAiResponse(null);
            setAiModalVisible(true);
          }}
        />
        <MissionsHomeSection />
        <EnDirectoSection
          partidos={partidos}
          loading={matchesLoading}
          onPartidoPress={onPartidoPress}
          onOpenPartidos={() => onNavigateToTab?.('partidos')}
        />
      </ScrollView>

      <AiMatchModal
        visible={aiModalVisible}
        loading={aiLoading}
        responseText={aiResponse}
        errorText={aiError}
        onClose={() => setAiModalVisible(false)}
        onSubmit={handleAiMatchSearch}
      />
    </>
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
