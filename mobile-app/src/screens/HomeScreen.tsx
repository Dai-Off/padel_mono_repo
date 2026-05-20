import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  HomeSkeleton,
  MissionsHomeSection,
  type HomeMission,
  OnboardingBanner,
  ProximosPartidosSection,
  SeasonPassHomeCard,
} from '../components/home/inicio';
import { useAuth } from '../contexts/AuthContext';
import { useHomeData } from '../contexts/HomeDataContext';
import type { PartidoItem } from './PartidosScreen';
import { IAAfinidadModal } from '../components/home/IAAfinidadModal';
import { OnboardingHardBlockModal } from '../components/onboarding/OnboardingHardBlockModal';
import { searchAiMatch } from '../api/aiMatch';
import { type SeasonPassMissionDto } from '../api/seasonPass';
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
  /** Abre un DM sin pasar por la lista de chats (usado por IA Afinidad) */
  onOpenAffinityThread?: (peer: { id: string; displayName: string; avatarUrl: string | null }) => void;
  /** Incrementar desde MainApp para que el modal de IA Afinidad se reabra al volver del chat */
  affinityReopenSignal?: number;
  /** Llamar tras consumir la señal para que no vuelva a dispararse en cambios de tab */
  onAffinityReopened?: () => void;
  /** Abre el perfil público de un jugador */
  onOpenPublicProfile?: (playerId: string) => void;
  /** Abre perfil público desde IA Afinidad — reabre modal al volver */
  onOpenAffinityPublicProfile?: (playerId: string) => void;
  /** Abre el perfil con el modal del cuestionario auto-abierto (banner + hard blocks). */
  onOpenProfileForOnboarding?: () => void;
};

/** Caché a nivel de módulo para que affinityResponse y los IDs enviados sobrevivan al desmonte/remonte de HomeScreen */
const _affinityCache = { 
  response: null as string | null,
  sentIds: new Set<string>()
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
  onOpenAffinityThread,
  affinityReopenSignal = 0,
  onAffinityReopened,
  onOpenPublicProfile,
  onOpenAffinityPublicProfile,
  onOpenProfileForOnboarding,
}: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  // Datos del home cacheados a nivel de app (sobreviven a remounts del Home
  // cuando navegas a otras pantallas y vuelves). Ver HomeDataContext.
  const {
    profile: myPlayerProfile,
    profileLoading,
    partidos,
    misProximosPartidos,
    matchesLoading,
    publicTournamentsCount,
    tournamentsLoading,
    seasonPassMe,
    seasonPassLoading,
    refreshSeasonPass,
    stats,
    statsLoading,
    refreshStreak,
  } = useHomeData();
  const [affinityModalVisible, setAffinityModalVisible] = useState(false);
  const [affinityLoading, setAffinityLoading] = useState(false);
  // Inicializar desde caché para sobrevivir remounts (ej. al volver del chat de IA Afinidad)
  const [affinityResponse, _setAffinityResponse] = useState<string | null>(() => _affinityCache.response);
  const setAffinityResponse = (r: string | null) => {
    _affinityCache.response = r;
    _setAffinityResponse(r);
  };
  const [affinityError, setAffinityError] = useState<string | null>(null);
  const [affinitySentIds, setAffinitySentIds] = useState<Set<string>>(() => _affinityCache.sentIds);
  
  const updateAffinitySentIds = (newSet: Set<string>) => {
    _affinityCache.sentIds = newSet;
    setAffinitySentIds(newSet);
  };
  /**
   * Cuál de los hard block modals está abierto. Se renderiza como Modal RN
   * fullScreen encima del Home, así "Ahora no" lo cierra sin remontar el Home
   * (no hay reload de partidos/season pass/etc).
   */
  const [hardBlockOpen, setHardBlockOpen] = useState<
    null | 'daily-lesson' | 'ia-afinidad' | 'matchmaking'
  >(null);

  // Cuando el usuario vuelve del chat de IA Afinidad, reabrir el modal con los resultados del caché
  useEffect(() => {
    if (affinityReopenSignal > 0 && _affinityCache.response) {
      _setAffinityResponse(_affinityCache.response);
      setAffinityModalVisible(true);
      // Consumir la señal para que cambios de tab no vuelvan a abrir el modal
      onAffinityReopened?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affinityReopenSignal]);

  // Refrescamos season pass y racha cuando volvemos de la lección diaria
  // (ambos pueden haber cambiado). El resto de datos del home se refrescan
  // a través de su TTL en HomeDataContext.
  useEffect(() => {
    if (streakRefreshKey > 0) {
      void refreshSeasonPass({ force: true });
      void refreshStreak({ force: true });
    }
  }, [streakRefreshKey, refreshSeasonPass, refreshStreak]);

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

  /**
   * Primera carga del Home: mantenemos el skeleton hasta que TODOS los
   * datasets hayan llegado. Si usáramos `&&` el skeleton desaparecería con
   * el primer fetch y las cards que llegan más tarde aparecerían bruscas —
   * exactamente el problema que el skeleton intenta evitar.
   *
   * El context expone `loading=true` SOLO en la primera carga (las
   * revalidaciones posteriores son silenciosas, ver HomeDataContext), así
   * que esto es seguro para distinguir "primera vez" de "volviendo al Home
   * con cache caliente".
   */
  const isFirstLoading =
    profileLoading || matchesLoading || tournamentsLoading || seasonPassLoading;

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
        {isFirstLoading ? <HomeSkeleton /> : (<>
        {/* Contenido real del Home a partir de aquí. Cuando los datos llegan
            todos a la vez, el skeleton desaparece y entra el contenido — la
            animación de `InicioEnterBlock` sigue funcionando como siempre. */}
        {/* Banner proactivo: visible arriba de todo si el jugador no ha
            completado el cuestionario de nivelación. Tap → perfil con modal
            del onboarding auto-abierto. */}
        {myPlayerProfile && !myPlayerProfile.onboardingCompleted && (
          <InicioEnterBlock enterIndex={0}>
            <OnboardingBanner onPress={() => onOpenProfileForOnboarding?.()} />
          </InicioEnterBlock>
        )}
        {(matchesLoading || misProximosPartidos.length > 0) && (
          <InicioEnterBlock enterIndex={1}>
            <ProximosPartidosSection
              items={misProximosPartidos}
              /** No acoplar a session aquí: en iOS la sesión hidrata tarde y `loading` quedaba false con items vacíos → la sección se ocultaba por completo (early return). */
              loading={matchesLoading}
              onPartidoPress={onPartidoPress}
            />
          </InicioEnterBlock>
        )}
        <InicioEnterBlock enterIndex={2}>
          <InicioWidgetsCarousel>
            <DailyLessonCard
              variant="carousel"
              streakRefreshKey={streakRefreshKey}
              onPress={() => {
                // Hard block: si falta onboarding, abrir modal en vez de entrar
                // a DailyLessonScreen. Evita el reload del home al cerrar.
                if (myPlayerProfile && !myPlayerProfile.onboardingCompleted) {
                  setHardBlockOpen('daily-lesson');
                  return;
                }
                onDailyLessonPress?.();
              }}
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
              locked={myPlayerProfile != null && !myPlayerProfile.onboardingCompleted}
              onPress={() => {
                if (myPlayerProfile && !myPlayerProfile.onboardingCompleted) {
                  setHardBlockOpen('matchmaking');
                  return;
                }
                onOpenCompetitiveLeague?.();
              }}
            />
          </InicioWidgetsCarousel>
        </InicioEnterBlock>
        <InicioEnterBlock enterIndex={3}>
          <InicioQuickActions
            onNavigateToTab={onNavigateToTab}
            onCoursesPress={onCoursesPress}
            openMatchesCount={partidos.length}
            courtsFree={stats?.courtsFree}
            tournamentsCount={publicTournamentsCount}
            loading={listLoading}
          />
        </InicioEnterBlock>
        <InicioEnterBlock enterIndex={4}>
          <IAAfinidadCard
            locked={myPlayerProfile != null && !myPlayerProfile.onboardingCompleted}
            onPress={() => {
              // Hard block: si no ha completado onboarding, abrir modal y no
              // el flujo de IA. El Home no se desmonta (Modal RN), así
              // "Ahora no" cierra sin reload.
              if (myPlayerProfile != null && !myPlayerProfile.onboardingCompleted) {
                setHardBlockOpen('ia-afinidad');
                return;
              }
              setAffinityError(null);
              // No resetear la respuesta si ya hay resultados — al volver del chat
              // el modal los mostrará directamente sin tener que buscar de nuevo.
              setAffinityModalVisible(true);
            }}
          />
        </InicioEnterBlock>
        <InicioEnterBlock enterIndex={5}>
          <MissionsHomeSection missions={homeMissionsFromPass} />
        </InicioEnterBlock>
        <InicioEnterBlock enterIndex={6}>
          <EnDirectoSection
            partidos={partidos.filter((p) => p.matchPhase === 'live')}
            loading={matchesLoading}
            onPartidoPress={onPartidoPress}
            onOpenPartidos={() => onNavigateToTab?.('partidos')}
          />
        </InicioEnterBlock>
        </>)}
        </ScrollView>
      </View>

      <IAAfinidadModal
        visible={affinityModalVisible}
        loading={affinityLoading}
        responseText={affinityResponse}
        errorText={affinityError}
        onClose={() => {
          setAffinityModalVisible(false);
          // Usuario conforme con resultados: limpiar caché y estado
          // para que no reaparezca al cambiar de tab
          _affinityCache.response = null;
          _affinityCache.sentIds = new Set();
          _setAffinityResponse(null);
          setAffinitySentIds(new Set());
        }}
        sentIds={affinitySentIds}
        onSentIdsChange={updateAffinitySentIds}
        onSubmit={handleAffinitySearch}
        onDirectMessageSent={(target) => {
          // Usa el hilo directo de afinidad: back vuelve al modal de resultados
          // en vez de pasar por la lista de chats.
          onOpenAffinityThread?.(target);
        }}
        onPlayerPress={(pid) => {
          setAffinityModalVisible(false);
          onOpenAffinityPublicProfile?.(pid);
        }}
      />

      {/* Modales hard block: se montan encima del Home sin desmontarlo.
          Cerrar "Ahora no" o el botón cerrar arriba no recarga el Home. */}
      <OnboardingHardBlockModal
        visible={hardBlockOpen === 'daily-lesson'}
        featureIcon="flame"
        title="Desbloquea la Lección diaria"
        subtitle="Completa el cuestionario de nivelación para acceder a tu entrenamiento diario personalizado."
        bullets={[
          'Preguntas adaptadas a tu nivel real',
          'Racha diaria con bonus de SP',
          'Progreso que evoluciona contigo',
        ]}
        onClose={() => setHardBlockOpen(null)}
        onStart={() => {
          setHardBlockOpen(null);
          onOpenProfileForOnboarding?.();
        }}
      />

      <OnboardingHardBlockModal
        visible={hardBlockOpen === 'ia-afinidad'}
        featureIcon="people"
        title="Desbloquea la IA de afinidad"
        subtitle="Completa el cuestionario de nivelación para encontrar los jugadores más compatibles contigo."
        bullets={[
          'Compatibilidad real, no solo nivel',
          'Jugadores cerca de ti con tu estilo',
          'Mejora con cada partido que juegas',
        ]}
        onClose={() => setHardBlockOpen(null)}
        onStart={() => {
          setHardBlockOpen(null);
          onOpenProfileForOnboarding?.();
        }}
      />

      <OnboardingHardBlockModal
        visible={hardBlockOpen === 'matchmaking'}
        featureIcon="trophy"
        title="Desbloquea la Liga Competitiva"
        subtitle="Completa el cuestionario de nivelación para acceder al matchmaking competitivo."
        bullets={[
          'Partidos 2v2 con matchmaking real',
          'Sube de división ganando LP',
          'Compite y gana premios por temporada',
        ]}
        onClose={() => setHardBlockOpen(null)}
        onStart={() => {
          setHardBlockOpen(null);
          onOpenProfileForOnboarding?.();
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
