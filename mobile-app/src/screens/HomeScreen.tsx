import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMatches } from '../api/matches';
import { fetchPublicTournaments } from '../api/tournaments';
import { mapMatchToPartido } from '../api/mapMatchToPartido';
import { fetchMyPlayerId, fetchMyPlayerProfile, type MyPlayerProfile } from '../api/players';
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
import { IAAfinidadModal } from '../components/home/IAAfinidadModal';
import { searchAiMatch } from '../api/aiMatch';
import { fetchMatchmakingLeagueConfig, type MatchmakingLeagueConfigRow } from '../api/matchmaking';

type TabId = 'pistas' | 'partidos' | 'torneos';

type HomeScreenProps = {
  onNavigateToTab?: (tab: TabId) => void;
  onPartidoPress?: (partido: PartidoItem) => void;
  onDailyLessonPress?: () => void;
  onCoursesPress?: () => void;
  onOpenCompetitiveLeague?: () => void;
};

export function HomeScreen({
  onNavigateToTab,
  onPartidoPress,
  onDailyLessonPress,
  onCoursesPress,
  onOpenCompetitiveLeague,
}: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { stats, loading: statsLoading } = useHomeStats();
  const [publicTournamentsCount, setPublicTournamentsCount] = useState<number | null>(null);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);
  const [partidos, setPartidos] = useState<PartidoItem[]>([]);
  const [misProximosPartidos, setMisProximosPartidos] = useState<PartidoItem[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [myPlayerProfile, setMyPlayerProfile] = useState<MyPlayerProfile | null>(null);
  const [affinityModalVisible, setAffinityModalVisible] = useState(false);
  const [affinityLoading, setAffinityLoading] = useState(false);
  const [affinityResponse, setAffinityResponse] = useState<string | null>(null);
  const [affinityError, setAffinityError] = useState<string | null>(null);
  const [leagueRows, setLeagueRows] = useState<MatchmakingLeagueConfigRow[] | null>(null);

  useEffect(() => {
    let mounted = true;
    void fetchMatchmakingLeagueConfig().then((rows) => {
      if (mounted) setLeagueRows(rows);
    });
    return () => {
      mounted = false;
    };
  }, []);

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

  useEffect(() => {
    if (!session?.access_token) {
      setMyPlayerProfile(null);
      return;
    }
    void fetchMyPlayerProfile(session.access_token).then(setMyPlayerProfile);
  }, [session?.access_token]);

  const listLoading = statsLoading || matchesLoading || tournamentsLoading;

  const competitiveLeagueHomeProps = useMemo(() => {
    const p = myPlayerProfile;
    if (!p) {
      return {
        divisionName: null as string | null,
        leaguePoints: null as string | null,
        ladderProgressPercent: null as number | null,
        winsLabel: null as string | null,
        lossesLabel: null as string | null,
        eloFiabCaption: null as string | null,
      };
    }
    const row = leagueRows?.find((r) => r.code === p.liga);
    const divisionName =
      row?.label ??
      (p.liga && p.liga.length > 0 ? p.liga.charAt(0).toUpperCase() + p.liga.slice(1) : null);
    const leaguePoints = p.lps != null ? String(p.lps) : null;
    let ladderProgressPercent: number | null = null;
    if (p.lps != null) {
      const t = row?.lps_to_promote != null && row.lps_to_promote > 0 ? row.lps_to_promote : 100;
      ladderProgressPercent = Math.min(100, Math.round((p.lps / t) * 100));
    }
    const winsLabel = `${p.mmWins} victorias`;
    const lossesLabel = `${p.mmLosses} derrotas`;
    const capParts: string[] = [];
    if (p.eloRating != null) capParts.push(`Elo ${p.eloRating.toFixed(1)}`);
    if (p.fiabilidad != null) capParts.push(`Fiab. ${p.fiabilidad}%`);
    if (p.matchesPlayedMatchmaking != null) capParts.push(`${p.matchesPlayedMatchmaking} PJ MM`);
    if (p.mmDraws > 0) capParts.push(`${p.mmDraws} empates`);
    const eloFiabCaption = capParts.length > 0 ? capParts.join(' · ') : null;
    return {
      divisionName,
      leaguePoints,
      ladderProgressPercent,
      winsLabel,
      lossesLabel,
      eloFiabCaption,
    };
  }, [myPlayerProfile, leagueRows]);

  const handleAffinitySearch = useCallback(
    async (prompt: string) => {
      setAffinityLoading(true);
      setAffinityError(null);
      setAffinityResponse(null);

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
        setAffinityResponse(result.text);
      } else {
        setAffinityError(result.error ?? 'No se pudo completar la búsqueda.');
      }
      setAffinityLoading(false);
    },
    [myPlayerProfile, session?.user?.email, session?.user?.user_metadata?.full_name]
  );

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
          divisionName={competitiveLeagueHomeProps.divisionName}
          leaguePoints={competitiveLeagueHomeProps.leaguePoints}
          ladderProgressPercent={competitiveLeagueHomeProps.ladderProgressPercent}
          winsLabel={competitiveLeagueHomeProps.winsLabel}
          lossesLabel={competitiveLeagueHomeProps.lossesLabel}
          eloFiabCaption={competitiveLeagueHomeProps.eloFiabCaption}
          onPress={() => {
            onOpenCompetitiveLeague?.();
          }}
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
            setAffinityError(null);
            setAffinityResponse(null);
            setAffinityModalVisible(true);
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

      <IAAfinidadModal
        visible={affinityModalVisible}
        loading={affinityLoading}
        responseText={affinityResponse}
        errorText={affinityError}
        onClose={() => setAffinityModalVisible(false)}
        onSubmit={handleAffinitySearch}
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
