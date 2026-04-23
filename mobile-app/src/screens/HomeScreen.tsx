import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, type AppStateStatus, ScrollView, StyleSheet, View } from 'react-native';
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
  InicioAmbientBackground,
  InicioEnterBlock,
  InicioWidgetsCarousel,
  InicioQuickActions,
  INICIO_PAD_BOTTOM,
  INICIO_PAD_H,
  INICIO_PAD_TOP,
  INICIO_STACK_GAP,
  MissionsHomeSection,
  type HomeMission,
  ProximosPartidosSection,
  SeasonPassHomeCard,
} from '../components/home/inicio';
import { selectMyUpcomingMatches } from '../domain/selectMyUpcomingMatches';
import { useAuth } from '../contexts/AuthContext';
import { useHomeStats } from '../hooks/useHomeStats';
import type { PartidoItem } from './PartidosScreen';
import { IAAfinidadModal } from '../components/home/IAAfinidadModal';
import { searchAiMatch } from '../api/aiMatch';
import { fetchSeasonPassMe, type SeasonPassMeOk, type SeasonPassMissionDto } from '../api/seasonPass';
import {
  isSeasonPassSpCapped,
  seasonPassHomeNextLine,
  seasonPassNextLevel,
  seasonSlugToLabel,
  levelMaxResolved,
} from '../lib/seasonPassHome';

type TabId = 'pistas' | 'partidos' | 'torneos';

function mapSeasonMissionToHome(m: SeasonPassMissionDto): HomeMission {
  const pctNum = m.target > 0 ? Math.min(100, Math.round((m.current / m.target) * 100)) : 0;
  const tag = m.period === 'daily' ? 'Diaria' : m.period === 'weekly' ? 'Semanal' : 'Mensual';
  return {
    id: m.id,
    tag,
    title: m.title,
    desc: m.reward_hint ? `${m.description} (${m.reward_hint})` : m.description,
    progress: `${m.current}/${m.target}`,
    pct: `${pctNum}%`,
    pctNum,
    claim: false,
    highlight: m.done,
  };
}

type HomeScreenProps = {
  /** Incrementar al volver de la lección diaria para refrescar racha en la card. */
  streakRefreshKey?: number;
  onNavigateToTab?: (tab: TabId) => void;
  onPartidoPress?: (partido: PartidoItem) => void;
  onDailyLessonPress?: () => void;
  onCoursesPress?: () => void;
  onOpenCompetitiveLeague?: () => void;
  onOpenSeasonPass?: () => void;
  onOpenMessageThread?: (peer: { id: string; displayName: string; avatarUrl: string | null }) => void;
};

export function HomeScreen({
  streakRefreshKey = 0,
  onNavigateToTab,
  onPartidoPress,
  onDailyLessonPress,
  onCoursesPress,
  onOpenCompetitiveLeague,
  onOpenSeasonPass,
  onOpenMessageThread,
}: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const { session, refreshAccessToken } = useAuth();
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
  const [seasonPassMe, setSeasonPassMe] = useState<SeasonPassMeOk | null>(null);
  const [seasonPassLoading, setSeasonPassLoading] = useState(false);

  const loadMatches = useCallback(async () => {
    setMatchesLoading(true);
    let token = session?.access_token ?? null;
    let [playerId, matches] = await Promise.all([
      token ? fetchMyPlayerId(token) : Promise.resolve(null),
      fetchMatches({ expand: true, token }),
    ]);

    if (!playerId && session?.refresh_token) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        token = newToken;
        [playerId, matches] = await Promise.all([
          fetchMyPlayerId(newToken),
          fetchMatches({ expand: true, token: newToken }),
        ]);
      }
    }

    const mineRaw = selectMyUpcomingMatches(matches, playerId);
    const misProximos = mineRaw
      .map(mapMatchToPartido)
      .filter((p): p is PartidoItem => p != null);
    setMisProximosPartidos(misProximos);

    const all = matches
      .map(mapMatchToPartido)
      .filter((p): p is PartidoItem => p != null)
      .filter((p) => p.matchPhase !== 'past');
    setPartidos(all);
    setMatchesLoading(false);
  }, [session?.access_token, session?.refresh_token, refreshAccessToken]);

  const loadSeasonPass = useCallback(async () => {
    let token = session?.access_token ?? null;
    if (!token) {
      setSeasonPassMe(null);
      setSeasonPassLoading(false);
      return;
    }
    setSeasonPassLoading(true);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    /** No llamar a `refreshAccessToken` aquí ante 4xx/5xx: si `/season-pass/me` falla (p. ej. 500 sin migración 050), refrescar token cambia `access_token`, re-dispara este effect y genera bucle infinito. */
    const data = await fetchSeasonPassMe(token, tz);
    setSeasonPassMe(data);
    setSeasonPassLoading(false);
  }, [session?.access_token, streakRefreshKey]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  useEffect(() => {
    void loadSeasonPass();
  }, [loadSeasonPass]);

  useEffect(() => {
    let last: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      const prev = last;
      last = next;
      if (prev.match(/inactive|background/) && next === 'active') {
        loadMatches();
        void loadSeasonPass();
      }
    });
    return () => sub.remove();
  }, [loadMatches, loadSeasonPass]);

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

  const homeMissionsFromPass = useMemo(() => {
    const list = seasonPassMe?.missions ?? [];
    return list.filter((m) => m.period === 'daily').slice(0, 8).map(mapSeasonMissionToHome);
  }, [seasonPassMe?.missions]);

  const seasonPassCardProps =
    seasonPassMe != null
      ? {
          loading: false as const,
          seasonLabel: seasonSlugToLabel(seasonPassMe.season.slug),
          seasonTitle: seasonPassMe.season.title,
          levelCurrent: String(seasonPassMe.level),
          levelMax: String(levelMaxResolved(seasonPassMe)),
          progressPercent: Math.min(100, Math.max(0, seasonPassMe.pct * 100)),
          spCurrent: `${seasonPassMe.into_level.toLocaleString('es-ES')} SP`,
          spToNext: isSeasonPassSpCapped(seasonPassMe)
            ? 'Tope de SP'
            : `${seasonPassMe.sp_to_next.toLocaleString('es-ES')} SP para nivel ${seasonPassNextLevel(seasonPassMe)}`,
          nextRewardName: seasonPassHomeNextLine(seasonPassMe),
        }
      : {
          loading: Boolean(session?.access_token && seasonPassLoading),
          seasonLabel: null as string | null,
          seasonTitle: null as string | null,
          levelCurrent: null as string | null,
          levelMax: null as string | null,
          progressPercent: null as number | null,
          spCurrent: null as string | null,
          spToNext: null as string | null,
          nextRewardName: null as string | null,
        };

  return (
    <>
      <View style={styles.screenRoot}>
        <InicioAmbientBackground />
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
        {(matchesLoading || misProximosPartidos.length > 0) && (
          <InicioEnterBlock enterIndex={0}>
            <ProximosPartidosSection
              items={misProximosPartidos}
              /** No acoplar a session aquí: en iOS la sesión hidrata tarde y `loading` quedaba false con items vacíos → la sección se ocultaba por completo (early return). */
              loading={matchesLoading}
              onPartidoPress={onPartidoPress}
            />
          </InicioEnterBlock>
        )}
        <InicioEnterBlock enterIndex={1}>
          <InicioWidgetsCarousel>
            <DailyLessonCard
              variant="carousel"
              streakRefreshKey={streakRefreshKey}
              onPress={() => onDailyLessonPress?.()}
            />
            <SeasonPassHomeCard
              compact
              loading={seasonPassCardProps.loading}
              seasonLabel={seasonPassCardProps.seasonLabel}
              seasonTitle={seasonPassCardProps.seasonTitle}
              levelCurrent={seasonPassCardProps.levelCurrent}
              levelMax={seasonPassCardProps.levelMax}
              progressPercent={seasonPassCardProps.progressPercent}
              spCurrent={seasonPassCardProps.spCurrent}
              spToNext={seasonPassCardProps.spToNext}
              nextRewardName={seasonPassCardProps.nextRewardName}
              onPress={() => onOpenSeasonPass?.()}
            />
            <CompetitiveLeagueHomeCard
              compact
              onPress={() => onOpenCompetitiveLeague?.()}
            />
          </InicioWidgetsCarousel>
        </InicioEnterBlock>
        <InicioEnterBlock enterIndex={2}>
          <InicioQuickActions
            onNavigateToTab={onNavigateToTab}
            onCoursesPress={onCoursesPress}
            openMatchesCount={partidos.length}
            courtsFree={stats?.courtsFree}
            tournamentsCount={publicTournamentsCount}
            loading={listLoading}
          />
        </InicioEnterBlock>
        <InicioEnterBlock enterIndex={3}>
          <IAAfinidadCard
            onPress={() => {
              setAffinityError(null);
              setAffinityResponse(null);
              setAffinityModalVisible(true);
            }}
          />
        </InicioEnterBlock>
        <InicioEnterBlock enterIndex={4}>
          <MissionsHomeSection missions={homeMissionsFromPass} />
        </InicioEnterBlock>
        <InicioEnterBlock enterIndex={5}>
          <EnDirectoSection
            partidos={partidos.filter((p) => p.matchPhase === 'live')}
            loading={matchesLoading}
            onPartidoPress={onPartidoPress}
            onOpenPartidos={() => onNavigateToTab?.('partidos')}
          />
        </InicioEnterBlock>
        </ScrollView>
      </View>

      <IAAfinidadModal
        visible={affinityModalVisible}
        loading={affinityLoading}
        responseText={affinityResponse}
        errorText={affinityError}
        onClose={() => setAffinityModalVisible(false)}
        onSubmit={handleAffinitySearch}
        onDirectMessageSent={(target) => {
          setAffinityModalVisible(false);
          onOpenMessageThread?.(target);
        }}
      />

    </>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  scroll: {
    flex: 1,
    zIndex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    paddingHorizontal: INICIO_PAD_H,
    gap: INICIO_STACK_GAP,
  },
});
