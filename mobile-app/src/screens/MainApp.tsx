import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Pressable, Text, View, StyleSheet } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from '../i18n';
import { BackHeader } from '../components/layout/BackHeader';
import { BottomNavbar, type MainTabId } from '../components/layout/BottomNavbar';
import { HomeHeader } from '../components/layout/HomeHeader';
import { MobileSidebar } from '../components/layout/MobileSidebar';
import { ScreenLayout } from '../components/layout/ScreenLayout';
import { SidebarContent } from '../components/layout/SidebarContent';
import { SidebarProvider } from '../contexts/SidebarContext';
import { useHomeData } from '../contexts/HomeDataContext';
import { useSidebar } from '../hooks/useSidebar';
import { CompeticionesScreen } from './CompeticionesScreen';
import { HomeScreen } from './HomeScreen';
import { PartidosScreen } from './PartidosScreen';
import { MatchSearchScreen } from './MatchSearchScreen';
import { TuActividadFlow } from './TuActividadFlow';
import type { TuActividadDestination } from './TuActividadScreen';
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
  fetchMatchmakingStatus,
  fetchSeasonTransition,
  leaveMatchmaking,
  type PairInvite,
  type SeasonTransition,
} from '../api/matchmaking';
import { SeasonTransitionModal } from '../components/matchmaking/SeasonTransitionModal';
import { UsernameSetupModal } from '../components/profile/UsernameSetupModal';
import { acceptTournamentInvite } from '../api/tournamentInvites';
import { fetchReceivedMatchInvites, acceptMatchInviteByToken, type ReceivedMatchInvite } from '../api/matchInvites';
import { parseTournamentInviteUrl } from '../lib/parseTournamentInviteUrl';
import { parseMatchDeepLink, type ParsedMatchDeepLink } from '../lib/parseMatchDeepLink';
import { reloadMatchPartido } from '../lib/reloadMatchPartido';
import { isPlayerInPartido } from '../lib/partidoPlayerUtils';
import { CompetitiveLeagueScreen } from './CompetitiveLeagueScreen';
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

type MatchmakingHomeBannerState = 'hidden' | 'searching' | 'matched' | 'timed_out';
const MATCHMAKING_TIMEOUT_SECONDS = 3 * 60;
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
  // MainApp es la ruta `Main` del stack raiz; cuando hay rutas pusheadas
  // encima pierde el foco y su BackHandler debe inhibirse (via ref para no
  // reinstalar el listener).
  const isFocused = useIsFocused();
  const isFocusedRef = useRef(isFocused);
  useEffect(() => {
    isFocusedRef.current = isFocused;
  }, [isFocused]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const { session } = useAuth();
  const { totalCount: cartCount } = useCart();
  const { profile, refreshMatches, upsertMisPartido } = useHomeData();
  const [activeTab, setActiveTab] = useState<MainTabId>('inicio');
  // Cada incremento pide a ProfileScreen hacer scroll a la Vitrina de Logros.
  const [vitrinaScrollNonce, setVitrinaScrollNonce] = useState(0);
  const [showTuActividad, setShowTuActividad] = useState(false);
  const [tuActividadSubView, setTuActividadSubView] = useState<TuActividadDestination | null>(null);
  /** Al cerrar la lección, fuerza otro fetch de racha en Inicio (por si el árbol no remonta). */
  const [streakRefreshKey, setStreakRefreshKey] = useState(0);
  const [partidosRefreshNonce, setPartidosRefreshNonce] = useState(0);
  const [matchReceivedInvites, setMatchReceivedInvites] = useState<ReceivedMatchInvite[]>([]);
  const [matchInviteNonce, setMatchInviteNonce] = useState(0);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [openTournamentId, setOpenTournamentId] = useState<string | null>(null);
  // Si llegamos al perfil desde una feature bloqueada por falta de onboarding
  // (p.ej. Daily Lesson), pedimos a ProfileScreen que abra el modal del
  // cuestionario de nivelación automáticamente al montar.
  const [profileAutoOpenOnboarding, setProfileAutoOpenOnboarding] = useState(false);
  /** Incrementar para que HomeScreen reabra el modal de IA Afinidad (p. ej. volver del perfil) */
  const [affinityReopenSignal, setAffinityReopenSignal] = useState(0);
  const [showCompetitiveLeague, setShowCompetitiveLeague] = useState(false);
  const [competitiveLeagueEntryIntent, setCompetitiveLeagueEntryIntent] =
    useState<'default' | 'queue' | 'prefs'>('default');
  const [competitiveQueueElapsedSec, setCompetitiveQueueElapsedSec] = useState(0);
  const [competitiveQueueStartedAtMs, setCompetitiveQueueStartedAtMs] = useState<number | null>(null);
  const [matchmakingHomeBannerState, setMatchmakingHomeBannerState] =
    useState<MatchmakingHomeBannerState>('hidden');
  const [pairInvites, setPairInvites] = useState<PairInvite[]>([]);
  const [pairInviteNonce, setPairInviteNonce] = useState(0);
  const [competitivePartnerInvite, setCompetitivePartnerInvite] = useState<PairInvite | null>(null);
  const [seasonTransition, setSeasonTransition] = useState<SeasonTransition | null>(null);
  const [matchmakingTimeoutNoticePending, setMatchmakingTimeoutNoticePending] = useState(false);
  const matchmakingTimeoutInFlightRef = useRef(false);
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

  useEffect(() => {
    const token = session?.access_token ?? null;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (!token) {
      setMatchmakingHomeBannerState('hidden');
      setMatchmakingTimeoutNoticePending(false);
      setCompetitiveQueueStartedAtMs(null);
      setCompetitiveQueueElapsedSec(0);
      matchmakingTimeoutInFlightRef.current = false;
      return;
    }

    const pollStatus = async () => {
      const status = await fetchMatchmakingStatus(token);
      if (cancelled) return;
      setPairInvites(status?.pair_invites ?? []);
      if (status?.status === 'matched') {
        setMatchmakingHomeBannerState('matched');
        setMatchmakingTimeoutNoticePending(false);
        setCompetitiveQueueStartedAtMs(null);
        setCompetitiveQueueElapsedSec(0);
        matchmakingTimeoutInFlightRef.current = false;
      } else if (status?.status === 'searching') {
        setMatchmakingHomeBannerState('searching');
        setMatchmakingTimeoutNoticePending(false);
        const startedAt = competitiveQueueStartedAtMs ?? Date.now();
        if (competitiveQueueStartedAtMs == null) setCompetitiveQueueStartedAtMs(startedAt);
        const elapsedSec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
        setCompetitiveQueueElapsedSec(elapsedSec);
        if (elapsedSec >= MATCHMAKING_TIMEOUT_SECONDS && !matchmakingTimeoutInFlightRef.current) {
          matchmakingTimeoutInFlightRef.current = true;
          const leaveResult = await leaveMatchmaking(token);
          if (cancelled) return;
          if (leaveResult.ok) {
            setMatchmakingHomeBannerState('timed_out');
            setMatchmakingTimeoutNoticePending(true);
            setCompetitiveQueueStartedAtMs(null);
            setCompetitiveQueueElapsedSec(0);
          } else {
            matchmakingTimeoutInFlightRef.current = false;
          }
        }
      } else {
        setCompetitiveQueueStartedAtMs(null);
        setCompetitiveQueueElapsedSec(0);
        matchmakingTimeoutInFlightRef.current = false;
        setMatchmakingHomeBannerState(matchmakingTimeoutNoticePending ? 'timed_out' : 'hidden');
      }
      timer = setTimeout(() => {
        void pollStatus();
      }, 5000);
    };

    void pollStatus();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [competitiveQueueStartedAtMs, matchmakingTimeoutNoticePending, pairInviteNonce, session?.access_token]);

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

  const handleMatchmakingBannerStateChange = useCallback(
    (state: MatchmakingHomeBannerState, options?: { force?: boolean }) => {
      const force = options?.force === true;
      if (state === 'timed_out') {
        setMatchmakingTimeoutNoticePending(true);
        setMatchmakingHomeBannerState('timed_out');
        return;
      }

      if (state === 'searching' || state === 'matched') {
        setMatchmakingTimeoutNoticePending(false);
        setMatchmakingHomeBannerState(state);
        return;
      }

      if (state === 'hidden') {
        // El timeout debe quedar visible hasta que el usuario haga una nueva
        // búsqueda o aparezca un match; no se oculta automáticamente.
        setMatchmakingHomeBannerState((prev) => {
          if (!force && (matchmakingTimeoutNoticePending || prev === 'timed_out')) {
            return prev;
          }
          return 'hidden';
        });
      }
    },
    [matchmakingTimeoutNoticePending],
  );

  const handleCompetitiveLeagueBannerStateChange = useCallback(
    (state: MatchmakingHomeBannerState, options?: { force?: boolean }) => {
      handleMatchmakingBannerStateChange(state, options);
      if (state === 'hidden' && options?.force) {
        setCompetitiveLeagueEntryIntent('default');
      }
    },
    [handleMatchmakingBannerStateChange],
  );

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
        setActiveTab('torneos');
        setOpenTournamentId(tournamentId);
      } else {
        Alert.alert(t('alerts.tournamentInvite.title'), result.error);
      }
    },
    [session?.access_token, t],
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
        setMatchInviteNonce((n) => n + 1);
        setPartidosRefreshNonce((n) => n + 1);
      },
      openOnboardingFromSection: (returnTo) => {
        setPendingOnboardingReturn(returnTo);
        setProfileAutoOpenOnboarding(true);
        setActiveTab('perfil');
      },
      goToProfileTab: () => setActiveTab('perfil'),
      goToTab: (tab) => {
        setActiveTab(tab);
        setShowCompetitiveLeague(false);
        setShowTuActividad(false);
        setTuActividadSubView(null);
      },
      goHome: () => {
        setShowTuActividad(false);
        setTuActividadSubView(null);
        setActiveTab('inicio');
      },
      affinityProfileClosed: () => setAffinityReopenSignal((s) => s + 1),
      openMatchFromInvite: (invite) => void openMatchFromInvite(invite),
    });
    return () => registerMainAppActions(null);
  }, [openMatchFromInvite]);

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
        setActiveTab('partidos');
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
    const token = session?.access_token ?? null;
    if (!token) {
      setMatchReceivedInvites([]);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      const res = await fetchReceivedMatchInvites(token);
      if (!cancelled && res.ok) setMatchReceivedInvites(res.invites);
      if (!cancelled) {
        timer = setTimeout(() => void poll(), 8000);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [session?.access_token, matchInviteNonce]);

  useEffect(() => {
    if (partidosRefreshNonce < 1) return;
    void refreshMatches({ force: true, scope: 'mine' });
  }, [partidosRefreshNonce, refreshMatches]);

  const openOnboardingFromSection = (returnTo: PostOnboardingReturn) => {
    setPendingOnboardingReturn(returnTo);
    setProfileAutoOpenOnboarding(true);
    setActiveTab('perfil');
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
      setActiveTab('inicio');
      return;
    }
    if (target === 'daily-lesson') navigation.navigate('DailyLesson');
    else if (target === 'matchmaking') setShowCompetitiveLeague(true);
    else if (target === 'torneos') setActiveTab('torneos');
    else if (target === 'cursos') setActiveTab('cursos');
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

  /** Cierra overlays del menú lateral antes de abrir otro destino (evita flags superpuestos). */
  const resetSidebarOverlays = useCallback(() => {
    setShowTuActividad(false);
    setTuActividadSubView(null);
  }, []);

  const fullscreenOverlayOpen = showTuActividad || showCompetitiveLeague;

  // Tras aceptar una invitación desde el banner: abrir Liga competitiva en preferencias
  // con ese compañero ya fijado para buscar.
  const openCompetitiveWithPartner = useCallback((invite: PairInvite) => {
    setCompetitivePartnerInvite(invite);
    setCompetitiveLeagueEntryIntent('default');
    setShowCompetitiveLeague(true);
  }, []);

  const openCompetitiveLeagueFromHome = useCallback(() => {
    if (matchmakingHomeBannerState === 'timed_out') {
      setCompetitiveLeagueEntryIntent('prefs');
    } else if (matchmakingHomeBannerState === 'searching') {
      setCompetitiveLeagueEntryIntent('queue');
    } else {
      setCompetitiveLeagueEntryIntent('default');
    }
    setShowCompetitiveLeague(true);
  }, [matchmakingHomeBannerState]);

  /**
   * Botón hardware atrás (Android). La app no usa React Navigation, así que
   * sin este listener Android cierra la activity por defecto.
   *
   * Cada `if` replica la acción de cierre del `onBack` de la pantalla
   * correspondiente, en el MISMO orden de prioridad que `renderContent`.
   * Devuelve `true` para consumir el evento, `false` para dejar a Android
   * que cierre la app (solo en Inicio sin nada abierto).
   */
  useEffect(() => {
    const onBack = (): boolean => {
      // Con una ruta del stack encima (pantalla ya migrada a React
      // Navigation), el pop lo gestiona el navigator, no esta cadena.
      if (!isFocusedRef.current) {
        return false;
      }
      // Sidebar abierto → cerrar primero (cubre cualquier pantalla).
      if (sidebar.isOpen) {
        sidebar.close();
        return true;
      }
      if (activeTab === 'perfil') {
        setActiveTab('inicio');
        setProfileAutoOpenOnboarding(false);
        return true;
      }
      // Liga competitiva
      if (showCompetitiveLeague) {
        setShowCompetitiveLeague(false);
        return true;
      }
      // Tu actividad (subpantalla → menú → cerrar)
      if (showTuActividad) {
        if (tuActividadSubView != null) {
          setTuActividadSubView(null);
          return true;
        }
        setShowTuActividad(false);
        return true;
      }
      // En otra pestaña sin nada abierto → volver a Inicio.
      if (activeTab !== 'inicio') {
        setActiveTab('inicio');
        return true;
      }
      // Inicio sin nada abierto → Android cierra la app (comportamiento por
      // defecto, sin confirmación).
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [
    sidebar,
    showCompetitiveLeague,
    showTuActividad,
    tuActividadSubView,
    activeTab,
  ]);

  const renderContent = () => {
    if (showCompetitiveLeague) {
      return (
        <CompetitiveLeagueScreen
          onBack={() => setShowCompetitiveLeague(false)}
          entryIntent={competitiveLeagueEntryIntent}
          queueElapsedSec={competitiveQueueElapsedSec}
          setQueueElapsedSec={setCompetitiveQueueElapsedSec}
          queueStartedAtMs={competitiveQueueStartedAtMs}
          setQueueStartedAtMs={setCompetitiveQueueStartedAtMs}
          matchmakingBannerState={matchmakingHomeBannerState}
          onMatchmakingBannerStateChange={handleCompetitiveLeagueBannerStateChange}
          pendingPartnerInvite={competitivePartnerInvite}
          onPartnerApplied={() => setCompetitivePartnerInvite(null)}
          onPartidoPress={(p) => {
            setShowCompetitiveLeague(false);
            navigation.push('PartidoDetail', { partido: p });
          }}
          onOpenPlayer={(pid) => {
            navigation.push('PublicProfile', { playerId: pid });
          }}
        />
      );
    }
    if (showTuActividad) {
      return (
        <TuActividadFlow
          subView={tuActividadSubView}
          onCloseFlow={() => {
            setShowTuActividad(false);
            setTuActividadSubView(null);
          }}
          onBackToMenu={() => setTuActividadSubView(null)}
          onNavigate={(destination: TuActividadDestination) => {
            setTuActividadSubView(destination);
          }}
          onPartidoPress={(p) => navigation.push('PartidoDetail', { partido: p })}
        />
      );
    }
    switch (activeTab) {
      case 'inicio':
        return (
          <HomeScreen
            streakRefreshKey={streakRefreshKey}
            onNavigateToTab={(tab) => setActiveTab(tab)}
            onPartidoPress={(p) => navigation.push('PartidoDetail', { partido: p })}
            onCourtReservationPress={(reservation) =>
              navigation.navigate('CourtReservationDetail', { reservation })
            }
            onDailyLessonPress={() => navigation.navigate('DailyLesson')}
            onCoursesPress={() => setActiveTab('cursos')}
            onOpenCompetitiveLeague={openCompetitiveLeagueFromHome}
            matchmakingBannerState={matchmakingHomeBannerState}
            pairInvites={pairInvites}
            onPairInvitesChanged={() => setPairInviteNonce((n) => n + 1)}
            onAcceptInviteAndSearch={openCompetitiveWithPartner}
            matchReceivedInvites={matchReceivedInvites}
            onMatchInvitesChanged={() => setMatchInviteNonce((n) => n + 1)}
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
        );
      case 'pistas':
        return (
          <MatchSearchScreen
            onCourtPress={(court) => navigation.navigate('ClubDetail', { court })}
            onBack={() => setActiveTab('inicio')}
          />
        );
      case 'tienda':
        return <TiendaScreen />;
      case 'torneos':
        return (
          <CompeticionesScreen
            onBack={() => setActiveTab('inicio')}
            initialOpenTournamentId={openTournamentId}
            onInitialTournamentOpened={() => setOpenTournamentId(null)}
            onOpenProfileForOnboarding={() => openOnboardingFromSection('torneos')}
          />
        );
      case 'partidos':
        return (
          <PartidosScreen
            onPartidoPress={(p) => navigation.push('PartidoDetail', { partido: p })}
            onOpenWeMatchClubsFlow={(organizerId, matchVisibility) =>
              navigation.navigate('CrearPartido', {
                organizerId: organizerId ?? profile?.id ?? null,
                matchVisibility,
              })
            }
            onNavigateToCompleteOnboarding={() => setActiveTab('perfil')}
            partidosRefreshNonce={partidosRefreshNonce}
          />
        );
      case 'cursos':
        return (
          <CoursesScreen
            onBack={() => setActiveTab('inicio')}
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
        );
      case 'perfil':
        return (
          <ProfileScreen
            key={profileRefreshKey}
            onBack={() => {
              setActiveTab('inicio');
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
        );
      default:
        return (
          <HomeScreen
            streakRefreshKey={streakRefreshKey}
            matchmakingBannerState={matchmakingHomeBannerState}
            onOpenCompetitiveLeague={openCompetitiveLeagueFromHome}
          />
        );
    }
  };

  const showMainTabs = !fullscreenOverlayOpen;

  const profileBtn = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('nav.userProfileA11y')}
      hitSlop={8}
      onPress={() => setActiveTab('perfil')}
      style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.75 }]}
    >
      <Ionicons name="person-circle-outline" size={22} color="#fff" />
    </Pressable>
  );

  const customHeader =
    fullscreenOverlayOpen
      ? undefined
      : activeTab === 'tienda'
          ? (
              <BackHeader
                title={t('nav.tabTienda')}
                tone="dark"
                onBack={() => setActiveTab('inicio')}
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
            )
          : activeTab === 'partidos'
              ? (
                  <BackHeader
                    title={t('nav.tabPartidos')}
                    tone="dark"
                    onBack={() => setActiveTab('inicio')}
                    rightSlot={profileBtn}
                  />
                )
              : activeTab === 'inicio'
                ? (
                    <HomeHeader
                      onMenuPress={sidebar.toggle}
                      onMessagesPress={() => navigation.navigate('Messages')}
                      onNotificationsPress={() => navigation.navigate('Notifications')}
                      onGroupsPress={() => navigation.navigate('Community')}
                      onProfilePress={() => setActiveTab('perfil')}
                    />
                  )
                : undefined;

  const layoutBackgroundColor =
    showTuActividad
      ? '#0F0F0F'
      : showCompetitiveLeague
        ? '#0F0F0F'
        : activeTab === 'perfil'
          ? '#0F0F0F'
          : showMainTabs && (activeTab === 'inicio' || activeTab === 'partidos')
            ? '#000000'
            : showMainTabs && (activeTab === 'pistas' || activeTab === 'tienda' || activeTab === 'torneos' || activeTab === 'cursos')
              ? '#0F0F0F'
              : '#ffffff';

  const handleTabChange = (tab: MainTabId) => {
    setActiveTab(tab);
    setShowCompetitiveLeague(false);
    setShowTuActividad(false);
    setTuActividadSubView(null);
  };

  return (
    <View style={styles.container}>
      <SidebarProvider
        close={sidebar.close}
        onNavigateToMonedero={() => {
          resetSidebarOverlays();
          navigation.navigate('Monedero');
        }}
        onNavigateToTuActividad={() => {
          resetSidebarOverlays();
          setShowTuActividad(true);
        }}
        onNavigateToAjustes={() => {
          resetSidebarOverlays();
          navigation.navigate('Ajustes');
        }}
        onNavigateToClubReviews={() => {
          resetSidebarOverlays();
          navigation.navigate('ClubReviews');
        }}
        onNavigateToInfo={(screenId) => {
          resetSidebarOverlays();
          navigation.navigate('Info', { screenId });
        }}
        onProfilePress={() => {
          resetSidebarOverlays();
          setActiveTab('perfil');
        }}
      >
        <View style={styles.mainColumn}>
          <ScreenLayout
            sidebar={sidebar}
            customHeader={customHeader}
            hideHeader={
              fullscreenOverlayOpen ||
              (showMainTabs && activeTab === 'pistas') ||
              (showMainTabs && activeTab === 'torneos') ||
              (showMainTabs && activeTab === 'cursos') ||
              (showMainTabs && activeTab === 'perfil')
            }
            layoutBackgroundColor={layoutBackgroundColor}
            navbarActions={{
              onMessagesPress: () => navigation.navigate('Messages'),
              onGroupsPress: () => navigation.navigate('Community'),
            }}
          >
            {renderContent()}
          </ScreenLayout>
          {showMainTabs && (
            <View style={styles.bottomBar}>
              <BottomNavbar activeTab={activeTab} onTabChange={handleTabChange} />
            </View>
          )}
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
          setActiveTab('perfil');
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
  /** Columna explícita: ScreenLayout + barra inferior compartidos en flex (evita barra invisible en Android). */
  mainColumn: {
    flex: 1,
    minHeight: 0,
  },
  /** Ancho completo del dispositivo (sin márgenes laterales). */
  bottomBar: {
    width: '100%',
    alignSelf: 'stretch',
  },
});
