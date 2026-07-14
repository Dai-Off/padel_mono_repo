import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from '../i18n';
import { BackHeader } from '../components/layout/BackHeader';
import type { MainTabId } from '../components/layout/BottomNavbar';
import { HomeHeader } from '../components/layout/HomeHeader';
import { MobileSidebar } from '../components/layout/MobileSidebar';
import { SidebarContent } from '../components/layout/SidebarContent';
import {
  MainTabsNavigator,
  TabScreenShell,
  tabRouteFor,
} from '../navigation/MainTabsNavigator';
import { SidebarProvider } from '../contexts/SidebarContext';
import { useHomeData } from '../contexts/HomeDataContext';
import { useSidebar } from '../hooks/useSidebar';
import { CompeticionesScreen } from './CompeticionesScreen';
import { HomeScreen } from './HomeScreen';
import { PartidosScreen } from './PartidosScreen';
import { MatchSearchScreen } from './MatchSearchScreen';
import { TiendaScreen } from './TiendaScreen';
import { CoursesScreen } from './CoursesScreen';
import { ProfileScreen } from './ProfileScreen';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { fetchMyPlayerProfile } from '../api/players';
import { fetchMatchById } from '../api/matches';
import { mapMatchToPartido } from '../api/mapMatchToPartido';
import { UnlockModalHost } from '../components/profile/UnlockModalHost';
import { SeasonPassCelebrationHost } from '../components/seasonPass/SeasonPassCelebrationHost';
import {
  fetchSeasonTransition,
  type PairInvite,
  type SeasonTransition,
} from '../api/matchmaking';
import { useMatchmaking } from '../contexts/MatchmakingContext';
import { SeasonTransitionModal } from '../components/matchmaking/SeasonTransitionModal';
import { UsernameSetupModal } from '../components/profile/UsernameSetupModal';
import { acceptTournamentInvite } from '../api/tournamentInvites';
import { acceptMatchInviteByToken, type ReceivedMatchInvite } from '../api/matchInvites';
import { parseTournamentInviteUrl } from '../lib/parseTournamentInviteUrl';
import { parseMatchDeepLink, type ParsedMatchDeepLink } from '../lib/parseMatchDeepLink';
import { reloadMatchPartido } from '../lib/reloadMatchPartido';
import { isPlayerInPartido } from '../lib/partidoPlayerUtils';
import {
  registerMainAppActions,
  type PostOnboardingReturn,
} from '../navigation/mainAppActions';
import type { RootStackParamList } from '../navigation/types';

/**
 * Claves de retorno post-onboarding. Cuando el usuario llega al cuestionario
 * desde una feature bloqueada, al completarlo lo devolvemos a esa sección en
 * vez de dejarlo en el perfil.
 */
const PENDING_TOURNAMENT_INVITE_KEY = 'pending_tournament_invite';
const PENDING_MATCH_DEEPLINK_KEY = 'pending_match_deeplink';

const SEASON_TRANSITION_SEEN_KEY = 'season_transition_seen';
/** Dev: poner a `true` para forzar el modal de fin de temporada con datos de prueba. */
const SEASON_TRANSITION_PREVIEW = false;
const SEASON_TRANSITION_PREVIEW_DATA: SeasonTransition = {
  season_id: 'preview',
  previous_liga: 'oro',
  previous_season_name: 'Temporada 1',
  new_liga: 'plata',
  new_season_name: 'Temporada 2',
};

export function MainApp() {
  const { t } = useTranslation();
  const sidebar = useSidebar(false);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  /** Cambia el tab activo del navigator de tabs (antes setActiveTab). */
  const goToTab = useCallback(
    (tab: MainTabId) => {
      navigation.navigate('Main', { screen: tabRouteFor(tab) });
    },
    [navigation],
  );

  const { session } = useAuth();
  const { totalCount: cartCount } = useCart();
  const { profile, refreshMatches, upsertMisPartido } = useHomeData();
  // Cada incremento pide a ProfileScreen hacer scroll a la Vitrina de Logros.
  const [vitrinaScrollNonce, setVitrinaScrollNonce] = useState(0);
  /** Al cerrar la lección, fuerza otro fetch de racha en Inicio (por si el árbol no remonta). */
  const [streakRefreshKey, setStreakRefreshKey] = useState(0);
  const [partidosRefreshNonce, setPartidosRefreshNonce] = useState(0);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [openTournamentId, setOpenTournamentId] = useState<string | null>(null);
  // Si llegamos al perfil desde una feature bloqueada por falta de onboarding
  // (p.ej. Daily Lesson), pedimos a ProfileScreen que abra el modal del
  // cuestionario de nivelación automáticamente al montar.
  const [profileAutoOpenOnboarding, setProfileAutoOpenOnboarding] = useState(false);
  /** Incrementar para que HomeScreen reabra el modal de IA Afinidad (p. ej. volver del perfil) */
  const [affinityReopenSignal, setAffinityReopenSignal] = useState(0);
  const [seasonTransition, setSeasonTransition] = useState<SeasonTransition | null>(null);
  const {
    bannerState: matchmakingBannerState,
    pairInvites,
    bumpPairInvites,
    matchReceivedInvites,
    bumpMatchInvites,
  } = useMatchmaking();
  /**
   * Si el usuario llega al cuestionario desde una feature bloqueada, guardamos
   * aquí la clave de origen para devolverlo a esa pantalla al completarlo.
   * Null = no hay sección de origen (se queda en el perfil).
   */
  const [pendingOnboardingReturn, setPendingOnboardingReturn] =
    useState<PostOnboardingReturn | null>(null);
  const [needsUsernameSetup, setNeedsUsernameSetup] = useState(false);
  const [usernameCheckDone, setUsernameCheckDone] = useState(false);

  useEffect(() => {
    if (!session?.access_token) {
      setNeedsUsernameSetup(false);
      setUsernameCheckDone(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const profile = await fetchMyPlayerProfile(session.access_token);
      if (cancelled) return;
      setNeedsUsernameSetup(Boolean(profile && !profile.username?.trim()));
      setUsernameCheckDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.access_token, profileRefreshKey]);

  // Modal de fin de temporada: una vez al abrir la app, si hay transición sin ver (por dispositivo).
  useEffect(() => {
    if (SEASON_TRANSITION_PREVIEW) {
      setSeasonTransition(SEASON_TRANSITION_PREVIEW_DATA);
      return;
    }
    const token = session?.access_token ?? null;
    if (!token) return;
    let cancelled = false;
    (async () => {
      const tr = await fetchSeasonTransition(token);
      if (cancelled || !tr) return;
      const seen = await AsyncStorage.getItem(SEASON_TRANSITION_SEEN_KEY);
      if (cancelled || seen === tr.season_id) return;
      setSeasonTransition(tr);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  const handleSeasonTransitionClose = useCallback(() => {
    setSeasonTransition((current) => {
      if (current && current.season_id !== 'preview') {
        void AsyncStorage.setItem(SEASON_TRANSITION_SEEN_KEY, current.season_id);
      }
      return null;
    });
  }, []);

  /**
   * Abre el perfil con el modal del cuestionario auto-abierto y guarda la
   * sección de origen para devolver al usuario al completarlo. Usado por todos
   * los bloqueos (banner home, hard blocks, soft blocks).
   */
  const processTournamentInvite = useCallback(
    async (inviteToken: string, tournamentId: string) => {
      const accessToken = session?.access_token;
      if (!accessToken) return;
      const result = await acceptTournamentInvite(accessToken, inviteToken, tournamentId);
      if (result.ok) {
        Alert.alert(t('alerts.tournamentInvite.accepted'), t('alerts.tournamentInvite.acceptedBody'));
        setOpenTournamentId(tournamentId);
        goToTab('torneos');
      } else {
        Alert.alert(t('alerts.tournamentInvite.title'), result.error);
      }
    },
    [session?.access_token, goToTab, t],
  );

  const openMatchFromInvite = useCallback(
    async (invite: ReceivedMatchInvite) => {
      const accessToken = session?.access_token;
      if (!accessToken) return;
      const viewerId = profile?.id ?? null;
      const loaded = await reloadMatchPartido(invite.match_id, accessToken, {
        viewerPlayerId: viewerId,
      });
      if (loaded) {
        navigation.push('PartidoDetail', { partido: loaded });
        if (viewerId && isPlayerInPartido(loaded, viewerId)) {
          upsertMisPartido(loaded);
        }
      } else {
        Alert.alert(t('alerts.error.title'), t('partidos.matchInviteOpenFail'));
      }
    },
    [session?.access_token, profile?.id, upsertMisPartido, navigation, t],
  );

  // Puente temporal: rutas ya migradas disparan estado que sigue viviendo aqui.
  useEffect(() => {
    registerMainAppActions({
      profileSaved: () => {
        setProfileRefreshKey((k) => k + 1);
        setPartidosRefreshNonce((n) => n + 1);
      },
      bumpPartidosRefresh: () => setPartidosRefreshNonce((n) => n + 1),
      bumpStreakRefresh: () => setStreakRefreshKey((k) => k + 1),
      matchDataChanged: () => {
        bumpMatchInvites();
        setPartidosRefreshNonce((n) => n + 1);
      },
      openOnboardingFromSection: (returnTo) => {
        setPendingOnboardingReturn(returnTo);
        setProfileAutoOpenOnboarding(true);
        goToTab('perfil');
      },
      goToProfileTab: () => goToTab('perfil'),
      goToTab: (tab) => goToTab(tab),
      goHome: () => goToTab('inicio'),
      affinityProfileClosed: () => setAffinityReopenSignal((s) => s + 1),
      openMatchFromInvite: (invite) => void openMatchFromInvite(invite),
    });
    return () => registerMainAppActions(null);
  }, [openMatchFromInvite, bumpMatchInvites, goToTab]);

  const processMatchDeepLink = useCallback(
    async (link: ParsedMatchDeepLink) => {
      const accessToken = session?.access_token;
      if (!accessToken) return;

      if (link.kind === 'invite') {
        const result = await acceptMatchInviteByToken(link.token, accessToken);
        if (result.ok) {
          if (!result.already_accepted) {
            Alert.alert(t('alerts.matchInvite.accepted'), t('alerts.matchInvite.acceptedBody'));
          }
        } else {
          Alert.alert(t('alerts.matchInvite.title'), result.error);
        }
      }

      const viewerId = profile?.id ?? null;
      const loaded = await reloadMatchPartido(link.matchId, accessToken, {
        viewerPlayerId: viewerId,
      });
      if (loaded) {
        goToTab('partidos');
        navigation.push('PartidoDetail', { partido: loaded });
        if (viewerId && isPlayerInPartido(loaded, viewerId)) {
          upsertMisPartido(loaded);
        }
      } else {
        Alert.alert(t('alerts.error.title'), t('partidos.matchInviteOpenFail'));
      }
    },
    [session?.access_token, profile?.id, upsertMisPartido, navigation, goToTab, t],
  );

  const consumeInviteUrl = useCallback(
    async (url: string | null) => {
      if (!url) return;
      const matchParsed = parseMatchDeepLink(url);
      if (matchParsed) {
        await AsyncStorage.removeItem(PENDING_MATCH_DEEPLINK_KEY);
        await processMatchDeepLink(matchParsed);
        return;
      }
      const tournamentParsed = parseTournamentInviteUrl(url);
      if (tournamentParsed) {
        await AsyncStorage.removeItem(PENDING_TOURNAMENT_INVITE_KEY);
        await processTournamentInvite(tournamentParsed.token, tournamentParsed.tournamentId);
      }
    },
    [processMatchDeepLink, processTournamentInvite],
  );

  useEffect(() => {
    if (!session?.access_token) return;
    void (async () => {
      const rawTournament = await AsyncStorage.getItem(PENDING_TOURNAMENT_INVITE_KEY);
      if (rawTournament) {
        try {
          const parsed = JSON.parse(rawTournament) as { token: string; tournamentId: string };
          if (parsed.token && parsed.tournamentId) {
            await AsyncStorage.removeItem(PENDING_TOURNAMENT_INVITE_KEY);
            await processTournamentInvite(parsed.token, parsed.tournamentId);
            return;
          }
        } catch {
          await AsyncStorage.removeItem(PENDING_TOURNAMENT_INVITE_KEY);
        }
      }
      const rawMatch = await AsyncStorage.getItem(PENDING_MATCH_DEEPLINK_KEY);
      if (rawMatch) {
        try {
          const parsed = JSON.parse(rawMatch) as ParsedMatchDeepLink;
          if (parsed.matchId) {
            await AsyncStorage.removeItem(PENDING_MATCH_DEEPLINK_KEY);
            await processMatchDeepLink(parsed);
            return;
          }
        } catch {
          await AsyncStorage.removeItem(PENDING_MATCH_DEEPLINK_KEY);
        }
      }
      const initial = await Linking.getInitialURL();
      if (initial) await consumeInviteUrl(initial);
    })();
    const sub = Linking.addEventListener('url', ({ url }) => {
      void consumeInviteUrl(url);
    });
    return () => sub.remove();
  }, [session?.access_token, consumeInviteUrl, processTournamentInvite, processMatchDeepLink]);

  useEffect(() => {
    if (partidosRefreshNonce < 1) return;
    void refreshMatches({ force: true, scope: 'mine' });
  }, [partidosRefreshNonce, refreshMatches]);

  const openOnboardingFromSection = (returnTo: PostOnboardingReturn) => {
    setPendingOnboardingReturn(returnTo);
    setProfileAutoOpenOnboarding(true);
    goToTab('perfil');
  };

  /**
   * Disparado cuando el modal del cuestionario completa con éxito. Devuelve al
   * usuario a la sección de origen reabriendo la pantalla correspondiente.
   */
  const handleOnboardingCompleted = () => {
    const target = pendingOnboardingReturn;
    setPendingOnboardingReturn(null);
    setProfileAutoOpenOnboarding(false);
    if (!target || target === 'home') {
      goToTab('inicio');
      return;
    }
    if (target === 'daily-lesson') navigation.navigate('DailyLesson');
    else if (target === 'matchmaking') navigation.navigate('CompetitiveLeague', { entryIntent: 'default' });
    else if (target === 'torneos') goToTab('torneos');
    else if (target === 'cursos') goToTab('cursos');
    // partido-detail: no podemos reabrirlo automáticamente sin el objeto del
    // partido (se perdería en el ciclo de perfil). El usuario lo verá al volver.
  };

  // Abre el detalle de un partido a partir de su id (desde el gráfico de
  // evolución del perfil). Carga el partido y lo normaliza a PartidoItem.
  const openMatchById = useCallback(
    async (matchId: string) => {
      const m = await fetchMatchById(matchId, session?.access_token ?? null);
      if (!m) return;
      const item = mapMatchToPartido(m, { viewerPlayerId: profile?.id ?? null });
      if (item) navigation.push('PartidoDetail', { partido: item });
    },
    [session?.access_token, profile?.id, navigation],
  );

  // Tras aceptar una invitación desde el banner: abrir Liga competitiva en preferencias
  // con ese compañero ya fijado para buscar.
  const openCompetitiveWithPartner = useCallback((invite: PairInvite) => {
    navigation.navigate('CompetitiveLeague', { entryIntent: 'default', partnerInvite: invite });
  }, [navigation]);

  const openCompetitiveLeagueFromHome = useCallback(() => {
    const entryIntent =
      matchmakingBannerState === 'timed_out'
        ? 'prefs'
        : matchmakingBannerState === 'searching'
          ? 'queue'
          : 'default';
    navigation.navigate('CompetitiveLeague', { entryIntent });
  }, [matchmakingBannerState, navigation]);

  // El back fisico ya no necesita cadena manual: las rutas del stack hacen
  // pop nativo, el tab navigator vuelve a Inicio (backBehavior initialRoute)
  // y el sidebar gestiona su propio cierre.

  const tabScreens = {
    InicioTab: () => (
      <TabScreenShell backgroundColor="#000000" header={homeHeader}>
        <HomeScreen
            streakRefreshKey={streakRefreshKey}
            onNavigateToTab={goToTab}
            onPartidoPress={(p) => navigation.push('PartidoDetail', { partido: p })}
            onCourtReservationPress={(reservation) =>
              navigation.navigate('CourtReservationDetail', { reservation })
            }
            onDailyLessonPress={() => navigation.navigate('DailyLesson')}
            onCoursesPress={() => goToTab('cursos')}
            onOpenCompetitiveLeague={openCompetitiveLeagueFromHome}
            matchmakingBannerState={matchmakingBannerState}
            pairInvites={pairInvites}
            onPairInvitesChanged={bumpPairInvites}
            onAcceptInviteAndSearch={openCompetitiveWithPartner}
            matchReceivedInvites={matchReceivedInvites}
            onMatchInvitesChanged={bumpMatchInvites}
            onViewMatchInvite={(invite) => openMatchFromInvite(invite)}
            onOpenSeasonPass={() => navigation.navigate('SeasonPass')}
            onOpenMessageThread={(peer) => {
              // Se replica el flujo antiguo: el hilo se apila sobre la lista
              // de mensajes para que el back caiga en ella.
              navigation.navigate('Messages');
              navigation.push('DirectMessageThread', { peer });
            }}
            affinityReopenSignal={affinityReopenSignal}
            onAffinityReopened={() => setAffinityReopenSignal(0)}
            onOpenPublicProfile={(pid) => {
              navigation.push('PublicProfile', { playerId: pid });
            }}
            onOpenAffinityPublicProfile={(pid) => {
              navigation.push('PublicProfile', { playerId: pid, origin: 'affinity' });
            }}
            onOpenProfileForOnboarding={() => openOnboardingFromSection('home')}
          />
      </TabScreenShell>
    ),
    PistasTab: () => (
      <TabScreenShell>
        <MatchSearchScreen
          onCourtPress={(court) => navigation.navigate('ClubDetail', { court })}
          onBack={() => goToTab('inicio')}
        />
      </TabScreenShell>
    ),
    TiendaTab: () => (
      <TabScreenShell header={tiendaHeader}>
        <TiendaScreen />
      </TabScreenShell>
    ),
    TorneosTab: () => (
      <TabScreenShell>
        <CompeticionesScreen
          onBack={() => goToTab('inicio')}
          initialOpenTournamentId={openTournamentId}
          onInitialTournamentOpened={() => setOpenTournamentId(null)}
          onOpenProfileForOnboarding={() => openOnboardingFromSection('torneos')}
        />
      </TabScreenShell>
    ),
    PartidosTab: () => (
      <TabScreenShell backgroundColor="#000000" header={partidosHeader}>
        <PartidosScreen
          onPartidoPress={(p) => navigation.push('PartidoDetail', { partido: p })}
          onOpenWeMatchClubsFlow={(organizerId, matchVisibility) =>
            navigation.navigate('CrearPartido', {
              organizerId: organizerId ?? profile?.id ?? null,
              matchVisibility,
            })
          }
          onNavigateToCompleteOnboarding={() => goToTab('perfil')}
          partidosRefreshNonce={partidosRefreshNonce}
        />
      </TabScreenShell>
    ),
    CursosTab: () => (
      <TabScreenShell>
        <CoursesScreen
          onBack={() => goToTab('inicio')}
          onCoursePress={(course, isReserved) => {
            navigation.navigate('PublicCourseDetail', { course, isReserved });
          }}
          onEducationalCoursePress={(course) => {
            navigation.navigate('EducationalCourseDetail', { course });
          }}
          onOpenProfileForOnboarding={() => {
            openOnboardingFromSection('cursos');
          }}
        />
      </TabScreenShell>
    ),
    PerfilTab: () => (
      <TabScreenShell>
        <ProfileScreen
          key={profileRefreshKey}
          onBack={() => {
            goToTab('inicio');
            setProfileAutoOpenOnboarding(false);
          }}
          onMenuPress={sidebar.toggle}
          onEditProfilePress={() => {
            navigation.navigate('EditProfile');
          }}
          onPreferencesPress={() => {
            navigation.navigate('Preferences');
          }}
          onNavigateToInfo={(screenId) => {
            navigation.navigate('Info', { screenId });
          }}
          autoOpenOnboarding={profileAutoOpenOnboarding}
          onOnboardingAutoOpened={() => setProfileAutoOpenOnboarding(false)}
          onOnboardingCompleted={handleOnboardingCompleted}
          onOpenMatch={openMatchById}
          onOpenPublicProfile={(pid) => {
            navigation.push('PublicProfile', { playerId: pid });
          }}
          scrollToVitrinaNonce={vitrinaScrollNonce}
        />
      </TabScreenShell>
    ),
  };

  const profileBtn = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('nav.userProfileA11y')}
      hitSlop={8}
      onPress={() => goToTab('perfil')}
      style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.75 }]}
    >
      <Ionicons name="person-circle-outline" size={22} color="#fff" />
    </Pressable>
  );

  const homeHeader = (
    <HomeHeader
      onMenuPress={sidebar.toggle}
      onMessagesPress={() => navigation.navigate('Messages')}
      onNotificationsPress={() => navigation.navigate('Notifications')}
      onGroupsPress={() => navigation.navigate('Community')}
      onProfilePress={() => goToTab('perfil')}
    />
  );

  const partidosHeader = (
    <BackHeader
      title={t('nav.tabPartidos')}
      tone="dark"
      onBack={() => goToTab('inicio')}
      rightSlot={profileBtn}
    />
  );

  const tiendaHeader = (
    <BackHeader
      title={t('nav.tabTienda')}
      tone="dark"
      onBack={() => goToTab('inicio')}
      rightSlot={(
        <>
          {profileBtn}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('nav.tiendaCart')}
            hitSlop={8}
            onPress={() => navigation.navigate('Cart')}
            style={({ pressed }) => [
              styles.tiendaHeaderCart,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="cart-outline" size={18} color="#fff" />
            {cartCount > 0 ? (
              <View style={styles.tiendaCartBadge}>
                <Text style={styles.tiendaCartBadgeText}>
                  {cartCount > 99 ? '99+' : cartCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </>
      )}
    />
  );

  return (
    <View style={styles.container}>
      <SidebarProvider
        close={sidebar.close}
        onNavigateToMonedero={() => navigation.navigate('Monedero')}
        onNavigateToTuActividad={() => navigation.navigate('TuActividad')}
        onNavigateToAjustes={() => navigation.navigate('Ajustes')}
        onNavigateToClubReviews={() => navigation.navigate('ClubReviews')}
        onNavigateToInfo={(screenId) => navigation.navigate('Info', { screenId })}
        onProfilePress={() => goToTab('perfil')}
      >
        <View style={styles.mainColumn}>
          <MainTabsNavigator screens={tabScreens} />
        </View>
        <MobileSidebar visible={sidebar.isOpen} onClose={sidebar.close}>
          <SidebarContent />
        </MobileSidebar>
      </SidebarProvider>

      <SeasonTransitionModal
        visible={!!seasonTransition}
        transition={seasonTransition}
        onClose={handleSeasonTransitionClose}
      />

      {usernameCheckDone ? (
        <UsernameSetupModal
          visible={needsUsernameSetup}
          onComplete={() => {
            setNeedsUsernameSetup(false);
            setProfileRefreshKey((k) => k + 1);
          }}
        />
      ) : null}

      {/* Modal global de desbloqueos: aparece esté donde esté el usuario. */}
      <UnlockModalHost
        onGoToVitrina={() => {
          goToTab('perfil');
          setVitrinaScrollNonce((n) => n + 1);
        }}
      />

      {/* Cola de celebraciones del pase: misiones completadas "fuera" de la app. */}
      <SeasonPassCelebrationHost />
    </View>
  );
}

const styles = StyleSheet.create({
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  tiendaHeaderCart: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  tiendaCartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F18F34',
    borderWidth: 1.5,
    borderColor: '#0F0F0F',
  },
  tiendaCartBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  /** Columna explícita del navigator de tabs (evita barra invisible en Android). */
  mainColumn: {
    flex: 1,
    minHeight: 0,
  },
});
