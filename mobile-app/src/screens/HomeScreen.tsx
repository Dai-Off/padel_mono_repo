import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMatches } from '../api/matches';
import { fetchPublicTournaments } from '../api/tournaments';
import { mapMatchToPartido } from '../api/mapMatchToPartido';
import { fetchMyPlayerId } from '../api/players';
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
  ProximosPartidosSection,
  SeasonPassHomeCard,
} from '../components/home/inicio';
import { selectMyUpcomingMatches } from '../domain/selectMyUpcomingMatches';
import { useAuth } from '../contexts/AuthContext';
import { useHomeStats } from '../hooks/useHomeStats';
import type { PartidoItem } from './PartidosScreen';
import { AiMatchModal, type MatchmakingSearchInput } from '../components/home/AiMatchModal';
import {
  fetchMatchmakingProposal,
  fetchMatchmakingStatus,
  joinMatchmaking,
  leaveMatchmaking,
  respondMatchmakingExpansion,
  type MatchmakingProposalResponse,
  type MatchmakingStatusResponse,
} from '../api/matchmaking';

type TabId = 'pistas' | 'partidos' | 'torneos';

type HomeScreenProps = {
  onNavigateToTab?: (tab: TabId) => void;
  onPartidoPress?: (partido: PartidoItem) => void;
  onDailyLessonPress?: () => void;
  onCoursesPress?: () => void;
};

function computeAvailabilityWindow(input: MatchmakingSearchInput): {
  availableFrom: string;
  availableUntil: string;
} {
  const now = new Date();
  const targetDay = new Date(now);

  if (input.day === 'manana') {
    targetDay.setDate(targetDay.getDate() + 1);
  } else if (input.day === 'esta-semana') {
    targetDay.setDate(targetDay.getDate() + 2);
  } else if (input.day === 'fin-semana') {
    const day = targetDay.getDay();
    const daysUntilSaturday = (6 - day + 7) % 7 || 7;
    targetDay.setDate(targetDay.getDate() + daysUntilSaturday);
  }

  let startHour = now.getHours();
  let endHour = Math.min(startHour + 2, 23);
  if (input.time === 'manana') {
    startHour = 9;
    endHour = 12;
  } else if (input.time === 'tarde') {
    startHour = 15;
    endHour = 18;
  } else if (input.time === 'noche') {
    startHour = 19;
    endHour = 22;
  }

  const availableFromDate = new Date(targetDay);
  availableFromDate.setHours(startHour, 0, 0, 0);

  const availableUntilDate = new Date(targetDay);
  availableUntilDate.setHours(endHour, 0, 0, 0);

  if (availableUntilDate <= availableFromDate) {
    availableUntilDate.setTime(availableFromDate.getTime() + 90 * 60 * 1000);
  }

  return {
    availableFrom: availableFromDate.toISOString(),
    availableUntil: availableUntilDate.toISOString(),
  };
}

export function HomeScreen({
  onNavigateToTab,
  onPartidoPress,
  onDailyLessonPress,
  onCoursesPress,
}: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { stats, loading: statsLoading } = useHomeStats();
  const [publicTournamentsCount, setPublicTournamentsCount] = useState<number | null>(null);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);
  const [partidos, setPartidos] = useState<PartidoItem[]>([]);
  const [misProximosPartidos, setMisProximosPartidos] = useState<PartidoItem[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [matchmakingStatus, setMatchmakingStatus] = useState<MatchmakingStatusResponse | null>(null);
  const [matchmakingProposal, setMatchmakingProposal] = useState<MatchmakingProposalResponse | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadMatches = useCallback(async () => {
    setMatchesLoading(true);
    const token = session?.access_token ?? null;
    const [playerId, matches] = await Promise.all([
      token ? fetchMyPlayerId(token) : Promise.resolve(null),
      fetchMatches({ expand: true, token }),
    ]);
    const mineRaw = selectMyUpcomingMatches(matches, playerId);
    const misProximos = mineRaw
      .map(mapMatchToPartido)
      .filter((p): p is PartidoItem => p != null)
      .filter((p) => p.visibility !== 'private');
    setMisProximosPartidos(misProximos);

    const all = matches
      .map(mapMatchToPartido)
      .filter((p): p is PartidoItem => p != null)
      .filter((p) => p.matchPhase !== 'past');
    setPartidos(all.filter((p) => p.visibility !== 'private'));
    setMatchesLoading(false);
  }, [session?.access_token]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  useEffect(() => {
    let mounted = true;
    setTournamentsLoading(true);
    fetchPublicTournaments(session?.access_token ?? null).then((r) => {
      if (!mounted) return;
      if (r.ok) {
        /** Misma lista que Competiciones → públicos y no cancelados (open + closed). */
        setPublicTournamentsCount(r.tournaments.length);
      } else {
        setPublicTournamentsCount(null);
      }
      setTournamentsLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [session?.access_token]);

  const listLoading = statsLoading || matchesLoading || tournamentsLoading;

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const pollMatchmaking = useCallback(async () => {
    const token = session?.access_token ?? null;
    if (!token) return;

    const status = await fetchMatchmakingStatus(token);
    setMatchmakingStatus(status);

    if (status?.status === 'matched') {
      const proposal = await fetchMatchmakingProposal(token);
      setMatchmakingProposal(proposal);
      setAiLoading(false);
      clearPollTimer();
      return;
    }

    if (status?.status === 'blocked' || status?.status === 'not_in_pool') {
      setAiLoading(false);
      clearPollTimer();
      return;
    }

    pollTimerRef.current = setTimeout(() => {
      void pollMatchmaking();
    }, 5000);
  }, [clearPollTimer, session?.access_token]);

  useEffect(() => () => clearPollTimer(), [clearPollTimer]);

  const handleAiMatchSearch = useCallback(async (input: MatchmakingSearchInput) => {
    const token = session?.access_token ?? null;
    if (!token) {
      setAiError('Necesitas iniciar sesión para buscar partido.');
      return;
    }

    setAiLoading(true);
    setAiError(null);
    setMatchmakingStatus(null);
    setMatchmakingProposal(null);
    clearPollTimer();

    const { availableFrom, availableUntil } = computeAvailabilityWindow(input);

    const result = await joinMatchmaking(
      {
        available_from: availableFrom,
        available_until: availableUntil,
      },
      token
    );
    if (!result.ok) {
      setAiError(result.error);
      setAiLoading(false);
      return;
    }

    await pollMatchmaking();
  }, [clearPollTimer, pollMatchmaking, session?.access_token]);

  const handleLeaveQueue = useCallback(async () => {
    const token = session?.access_token ?? null;
    if (!token) return;
    clearPollTimer();
    setAiLoading(false);
    const result = await leaveMatchmaking(token);
    if (!result.ok) {
      setAiError(result.error);
      return;
    }
    setMatchmakingStatus(null);
    setMatchmakingProposal(null);
  }, [clearPollTimer, session?.access_token]);

  const handleExpansionResponse = useCallback(async (accept: boolean) => {
    const token = session?.access_token ?? null;
    if (!token) return;
    const result = await respondMatchmakingExpansion(accept, token);
    if (!result.ok) {
      setAiError(result.error);
      return;
    }
    const status = await fetchMatchmakingStatus(token);
    setMatchmakingStatus(status);
  }, [session?.access_token]);

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
        <ProximosPartidosSection
          items={misProximosPartidos}
          /** No acoplar a session aquí: en iOS la sesión hidrata tarde y `loading` quedaba false con items vacíos → la sección se ocultaba por completo (early return). */
          loading={matchesLoading}
          onPartidoPress={onPartidoPress}
        />
        <DailyLessonCard onPress={() => onDailyLessonPress?.()} />
        <SeasonPassHomeCard />
        <CompetitiveLeagueHomeCard
          onPress={() => onNavigateToTab?.('torneos')}
        />
        <InicioQuickActions
          onNavigateToTab={onNavigateToTab}
          onCoursesPress={onCoursesPress}
          openMatchesCount={partidos.length}
          courtsFree={stats?.courtsFree}
          tournamentsCount={publicTournamentsCount}
          loading={listLoading}
        />
        <IAAfinidadCard
          onPress={() => {
            setAiError(null);
            setMatchmakingStatus(null);
            setMatchmakingProposal(null);
            setAiModalVisible(true);
          }}
        />
        <MissionsHomeSection />
        <EnDirectoSection
          partidos={partidos.filter((p) => p.matchPhase === 'live')}
          loading={matchesLoading}
          onPartidoPress={onPartidoPress}
          onOpenPartidos={() => onNavigateToTab?.('partidos')}
        />
      </ScrollView>

      <AiMatchModal
        visible={aiModalVisible}
        loading={aiLoading}
        status={matchmakingStatus}
        proposal={matchmakingProposal}
        errorText={aiError}
        onClose={() => {
          clearPollTimer();
          setAiLoading(false);
          setAiModalVisible(false);
        }}
        onSubmit={handleAiMatchSearch}
        onLeaveQueue={handleLeaveQueue}
        onRespondExpansion={handleExpansionResponse}
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
