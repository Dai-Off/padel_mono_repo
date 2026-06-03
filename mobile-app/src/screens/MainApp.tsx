import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Pressable, View, StyleSheet } from 'react-native';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { SearchCourtResult } from '../api/search';
import { BackHeader } from '../components/layout/BackHeader';
import { BottomNavbar, type MainTabId } from '../components/layout/BottomNavbar';
import { HomeHeader } from '../components/layout/HomeHeader';
import { MobileSidebar } from '../components/layout/MobileSidebar';
import { ScreenLayout } from '../components/layout/ScreenLayout';
import { SidebarContent } from '../components/layout/SidebarContent';
import { SidebarProvider } from '../contexts/SidebarContext';
import { useHomeData } from '../contexts/HomeDataContext';
import { useSidebar } from '../hooks/useSidebar';
import {
  BookingConfirmationScreen,
  type BookingConfirmationData,
} from './BookingConfirmationScreen';
import { PrivateReservationModal } from '../components/partido/PrivateReservationModal';
import { CrearPartidoLocationSheet } from '../components/partido/CrearPartidoLocationSheet';
import { ClubDetailScreen } from './ClubDetailScreen';
import { CompeticionesScreen } from './CompeticionesScreen';
import { HomeScreen } from './HomeScreen';
import type { PartidoItem } from './PartidosScreen';
import { PartidoDetailScreen } from './PartidoDetailScreen';
import { PartidoPrivadoDetailScreen } from './PartidoPrivadoDetailScreen';
import { PartidosScreen } from './PartidosScreen';
import { MatchSearchScreen } from './MatchSearchScreen';
import { TusPagosScreen } from './TusPagosScreen';
import { MonederoScreen } from './MonederoScreen';
import { TuActividadFlow } from './TuActividadFlow';
import type { TuActividadDestination } from './TuActividadScreen';
import { TransaccionesScreen } from './TransaccionesScreen';
import { TiendaScreen } from './TiendaScreen';
import { DailyLessonScreen } from './DailyLessonScreen';
import { CoursesScreen } from './CoursesScreen';
import { EducationalCourseDetailScreen } from './EducationalCourseDetailScreen';
import { PublicCourseDetailScreen } from './PublicCourseDetailScreen';
import { ProfileScreen } from './ProfileScreen';
import { EditProfileScreen } from './EditProfileScreen';
import { ChangePasswordScreen } from './ChangePasswordScreen';
import { useAuth } from '../contexts/AuthContext';
import { fetchMyPlayerProfile } from '../api/players';
import { fetchMatchmakingStatus, leaveMatchmaking } from '../api/matchmaking';
import { UsernameSetupModal } from '../components/profile/UsernameSetupModal';
import { acceptTournamentInvite } from '../api/tournamentInvites';
import { parseTournamentInviteUrl } from '../lib/parseTournamentInviteUrl';
import { CommunityScreen } from './CommunityScreen';
import { MessagesScreen, type MessagePeerNav } from './MessagesScreen';
import { DirectMessageThreadScreen } from './DirectMessageThreadScreen';
import { CompetitiveLeagueScreen } from './CompetitiveLeagueScreen';
import { SeasonPassScreen } from './SeasonPassScreen';
import { PreferencesScreen } from './PreferencesScreen';
import { PublicProfileScreen } from './PublicProfileScreen';
import { AjustesScreen } from './AjustesScreen';
import { InfoContentScreen } from './InfoContentScreen';
import type { InfoScreenId } from '../content/infoContent';
import { consumeOverlayNestedBack, registerOverlayNestedBack } from '../navigation/overlayBackRef';
import type { EducationalCourse } from '../api/dailyLessons';
import type { PublicCourse } from '../api/schoolCourses';

/**
 * Claves de retorno post-onboarding. Cuando el usuario llega al cuestionario
 * desde una feature bloqueada, al completarlo lo devolvemos a esa sección en
 * vez de dejarlo en el perfil.
 */
const PENDING_TOURNAMENT_INVITE_KEY = 'pending_tournament_invite';

type PostOnboardingReturn =
  | 'home'
  | 'daily-lesson'
  | 'ia-afinidad'
  | 'matchmaking'
  | 'partido-detail'
  | 'torneos'
  | 'cursos';

type MatchmakingHomeBannerState = 'hidden' | 'searching' | 'matched' | 'timed_out';
const MATCHMAKING_TIMEOUT_SECONDS = 3 * 60;

export function MainApp() {
  const sidebar = useSidebar(false);
  const { session } = useAuth();
  const { profile } = useHomeData();
  const [activeTab, setActiveTab] = useState<MainTabId>('inicio');
  const [clubDetailCourt, setClubDetailCourt] = useState<SearchCourtResult | null>(null);
  const [selectedPartido, setSelectedPartido] = useState<PartidoItem | null>(null);
  const [showTusPagos, setShowTusPagos] = useState(false);
  const [showMonedero, setShowMonedero] = useState(false);
  const [showTuActividad, setShowTuActividad] = useState(false);
  const [tuActividadSubView, setTuActividadSubView] = useState<TuActividadDestination | null>(null);
  const [showTransacciones, setShowTransacciones] = useState(false);
  const [preferencesReturnToTuActividad, setPreferencesReturnToTuActividad] = useState(false);
  const [showDailyLesson, setShowDailyLesson] = useState(false);
  /** Al cerrar la lección, fuerza otro fetch de racha en Inicio (por si el árbol no remonta). */
  const [streakRefreshKey, setStreakRefreshKey] = useState(0);
  const [showCourses, setShowCourses] = useState(false);
  const [selectedEducationalCourse, setSelectedEducationalCourse] = useState<EducationalCourse | null>(null);
  const [selectedPublicCourse, setSelectedPublicCourse] = useState<{ course: PublicCourse; isReserved: boolean } | null>(null);
  const [coursesTab, setCoursesTab] = useState<'apuntate' | 'cursos' | 'tusclases'>('apuntate');
  const [crearPartidoFlow, setCrearPartidoFlow] = useState<{
    open: boolean;
    organizerId: string | null;
  }>({ open: false, organizerId: null });
  const [partidosRefreshNonce, setPartidosRefreshNonce] = useState(0);
  const [bookingSuccessData, setBookingSuccessData] = useState<BookingConfirmationData | null>(null);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [openTournamentId, setOpenTournamentId] = useState<string | null>(null);
  // Si llegamos al perfil desde una feature bloqueada por falta de onboarding
  // (p.ej. Daily Lesson), pedimos a ProfileScreen que abra el modal del
  // cuestionario de nivelación automáticamente al montar.
  const [profileAutoOpenOnboarding, setProfileAutoOpenOnboarding] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showAjustes, setShowAjustes] = useState(false);
  const [infoScreen, setInfoScreen] = useState<InfoScreenId | null>(null);
  const [infoReturnToProfile, setInfoReturnToProfile] = useState(false);
  const [showCommunity, setShowCommunity] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [messagesPeer, setMessagesPeer] = useState<MessagePeerNav | null>(null);
  /** DM abierto directamente desde IA Afinidad — back vuelve al modal de resultados */
  const [affinityDmPeer, setAffinityDmPeer] = useState<MessagePeerNav | null>(null);
  /** Incrementar para que HomeScreen reabra el modal de IA Afinidad */
  const [affinityReopenSignal, setAffinityReopenSignal] = useState(0);
  const [showCompetitiveLeague, setShowCompetitiveLeague] = useState(false);
  const [competitiveLeagueEntryIntent, setCompetitiveLeagueEntryIntent] =
    useState<'default' | 'queue' | 'prefs'>('default');
  const [competitiveQueueElapsedSec, setCompetitiveQueueElapsedSec] = useState(0);
  const [competitiveQueueStartedAtMs, setCompetitiveQueueStartedAtMs] = useState<number | null>(null);
  const [matchmakingHomeBannerState, setMatchmakingHomeBannerState] =
    useState<MatchmakingHomeBannerState>('hidden');
  const [matchmakingTimeoutNoticePending, setMatchmakingTimeoutNoticePending] = useState(false);
  const matchmakingTimeoutInFlightRef = useRef(false);
  const [showSeasonPass, setShowSeasonPass] = useState(false);
  const [showPublicProfile, setShowPublicProfile] = useState(false);
  const [selectedPublicPlayerId, setSelectedPublicPlayerId] = useState<string | null>(null);
  /** Perfil público abierto desde IA Afinidad — back reabre el modal */
  const [affinityPublicProfileId, setAffinityPublicProfileId] = useState<string | null>(null);
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
  }, [competitiveQueueStartedAtMs, matchmakingTimeoutNoticePending, session?.access_token]);

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
        Alert.alert('Invitación aceptada', 'Ya estás inscrito en el torneo.');
        setActiveTab('torneos');
        setOpenTournamentId(tournamentId);
      } else {
        Alert.alert('Invitación al torneo', result.error);
      }
    },
    [session?.access_token],
  );

  const consumeInviteUrl = useCallback(
    async (url: string | null) => {
      if (!url) return;
      const parsed = parseTournamentInviteUrl(url);
      if (!parsed) return;
      await AsyncStorage.removeItem(PENDING_TOURNAMENT_INVITE_KEY);
      await processTournamentInvite(parsed.token, parsed.tournamentId);
    },
    [processTournamentInvite],
  );

  useEffect(() => {
    if (!session?.access_token) return;
    void (async () => {
      const raw = await AsyncStorage.getItem(PENDING_TOURNAMENT_INVITE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { token: string; tournamentId: string };
          if (parsed.token && parsed.tournamentId) {
            await AsyncStorage.removeItem(PENDING_TOURNAMENT_INVITE_KEY);
            await processTournamentInvite(parsed.token, parsed.tournamentId);
            return;
          }
        } catch {
          await AsyncStorage.removeItem(PENDING_TOURNAMENT_INVITE_KEY);
        }
      }
      const initial = await Linking.getInitialURL();
      if (initial) await consumeInviteUrl(initial);
    })();
    const sub = Linking.addEventListener('url', ({ url }) => {
      void consumeInviteUrl(url);
    });
    return () => sub.remove();
  }, [session?.access_token, consumeInviteUrl, processTournamentInvite]);

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
    if (target === 'daily-lesson') setShowDailyLesson(true);
    else if (target === 'matchmaking') setShowCompetitiveLeague(true);
    else if (target === 'torneos') setActiveTab('torneos');
    else if (target === 'cursos') setShowCourses(true);
    // partido-detail: no podemos reabrirlo automáticamente sin el objeto del
    // partido (se perdería en el ciclo de perfil). El usuario lo verá al volver.
  };

  const showClubDetail = activeTab === 'pistas' && clubDetailCourt != null;
  const showPartidoDetail = selectedPartido != null;

  /** Cierra overlays del menú lateral antes de abrir otro destino (evita flags superpuestos). */
  const resetSidebarOverlays = useCallback(() => {
    setShowEditProfile(false);
    setShowChangePassword(false);
    setShowPreferences(false);
    setPreferencesReturnToTuActividad(false);
    setShowAjustes(false);
    setInfoScreen(null);
    setInfoReturnToProfile(false);
    setShowTuActividad(false);
    setTuActividadSubView(null);
    setShowMonedero(false);
    setShowTusPagos(false);
    setShowTransacciones(false);
    registerOverlayNestedBack(null);
  }, []);

  const fullscreenOverlayOpen =
    bookingSuccessData != null ||
    showTusPagos ||
    showMonedero ||
    showTuActividad ||
    showTransacciones ||
    showEditProfile ||
    showChangePassword ||
    showPreferences ||
    showAjustes ||
    infoScreen != null ||
    showPartidoDetail ||
    showClubDetail ||
    showCompetitiveLeague ||
    showSeasonPass ||
    crearPartidoFlow.open ||
    showDailyLesson ||
    showCourses ||
    selectedEducationalCourse != null ||
    selectedPublicCourse != null ||
    showMessages ||
    showCommunity ||
    !!affinityDmPeer ||
    showPublicProfile ||
    affinityPublicProfileId !== null;

  const closeInfoScreen = useCallback(() => {
    setInfoScreen(null);
    if (infoReturnToProfile) {
      setInfoReturnToProfile(false);
      setActiveTab('perfil');
    }
  }, [infoReturnToProfile]);

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
      // Sidebar abierto → cerrar primero (cubre cualquier pantalla).
      if (sidebar.isOpen) {
        sidebar.close();
        return true;
      }
      // Subpantallas internas (Ajustes → Notificaciones, etc.)
      if (consumeOverlayNestedBack()) {
        return true;
      }
      // Flujos modales por encima de todo
      if (bookingSuccessData != null) {
        setBookingSuccessData(null);
        return true;
      }
      // Detalle de curso educativo
      if (selectedEducationalCourse) {
        setSelectedEducationalCourse(null);
        return true;
      }
      // Detalle de curso público
      if (selectedPublicCourse) {
        setSelectedPublicCourse(null);
        return true;
      }
      // Listado de cursos
      if (showCourses) {
        setShowCourses(false);
        return true;
      }
      // Lección diaria
      if (showDailyLesson) {
        setShowDailyLesson(false);
        return true;
      }
      // Flujo crear partido (cierra y refresca lista)
      if (crearPartidoFlow.open) {
        setCrearPartidoFlow({ open: false, organizerId: null });
        setPartidosRefreshNonce((n) => n + 1);
        return true;
      }
      // Cambiar contraseña (desde editar perfil)
      if (showChangePassword) {
        setShowChangePassword(false);
        return true;
      }
      // Editar perfil
      if (showEditProfile) {
        setShowEditProfile(false);
        setActiveTab('perfil');
        return true;
      }
      // Preferences → vuelve a perfil o a Tu actividad
      if (showPreferences) {
        setShowPreferences(false);
        if (preferencesReturnToTuActividad) {
          setPreferencesReturnToTuActividad(false);
          setTuActividadSubView(null);
          setShowTuActividad(true);
        } else {
          setActiveTab('perfil');
        }
        return true;
      }
      // Ajustes
      if (showAjustes) {
        setShowAjustes(false);
        return true;
      }
      // Ayuda / legal
      if (infoScreen) {
        closeInfoScreen();
        return true;
      }
      if (activeTab === 'perfil' && !showEditProfile && !showPreferences && !infoScreen) {
        setActiveTab('inicio');
        setProfileAutoOpenOnboarding(false);
        return true;
      }
      // Community
      if (showCommunity) {
        setShowCommunity(false);
        return true;
      }
      // Hilo DM dentro de Mensajes
      if (showMessages && messagesPeer) {
        setMessagesPeer(null);
        return true;
      }
      // Lista de mensajes
      if (showMessages) {
        setShowMessages(false);
        setMessagesPeer(null);
        return true;
      }
      // DM abierto desde IA Afinidad → reabre el modal
      if (affinityDmPeer) {
        setAffinityDmPeer(null);
        setAffinityReopenSignal((s) => s + 1);
        return true;
      }
      // Perfil público (genérico o desde afinidad)
      if (affinityPublicProfileId) {
        setAffinityPublicProfileId(null);
        setShowPublicProfile(false);
        setAffinityReopenSignal((s) => s + 1);
        return true;
      }
      if (showPublicProfile) {
        setShowPublicProfile(false);
        setSelectedPublicPlayerId(null);
        return true;
      }
      // Liga competitiva
      if (showCompetitiveLeague) {
        setShowCompetitiveLeague(false);
        return true;
      }
      // Season Pass
      if (showSeasonPass) {
        setShowSeasonPass(false);
        return true;
      }
      // Transacciones (sale antes que TusPagos en renderContent)
      if (showTransacciones) {
        setShowTransacciones(false);
        return true;
      }
      // Detalle de partido (prioridad sobre flujos padre, p. ej. Tu actividad)
      if (selectedPartido) {
        setSelectedPartido(null);
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
      // Monedero
      if (showMonedero) {
        setShowMonedero(false);
        return true;
      }
      // Tus Pagos
      if (showTusPagos) {
        setShowTusPagos(false);
        return true;
      }
      // Detalle de club en pestaña Pistas
      if (clubDetailCourt) {
        setClubDetailCourt(null);
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
    bookingSuccessData,
    selectedEducationalCourse,
    selectedPublicCourse,
    showCourses,
    showDailyLesson,
    crearPartidoFlow.open,
    showChangePassword,
    showEditProfile,
    showPreferences,
    preferencesReturnToTuActividad,
    showAjustes,
    infoScreen,
    closeInfoScreen,
    showCommunity,
    showMessages,
    messagesPeer,
    affinityDmPeer,
    affinityPublicProfileId,
    showPublicProfile,
    showCompetitiveLeague,
    showSeasonPass,
    showTransacciones,
    showTuActividad,
    tuActividadSubView,
    showMonedero,
    showTusPagos,
    selectedPartido,
    clubDetailCourt,
    activeTab,
  ]);

  const renderContent = () => {
    if (selectedEducationalCourse) {
      return (
        <EducationalCourseDetailScreen
          course={selectedEducationalCourse}
          onBack={() => setSelectedEducationalCourse(null)}
          onOpenProfileForOnboarding={() => {
            // Cerramos también `showCourses` (listado): en `renderContent` se
            // Cierra el listado de cursos antes de ir al tab Perfil (onboarding).
            setSelectedEducationalCourse(null);
            setShowCourses(false);
            openOnboardingFromSection('cursos');
          }}
        />
      );
    }
    if (selectedPublicCourse) {
      return (
        <PublicCourseDetailScreen
          course={selectedPublicCourse.course}
          onBack={() => setSelectedPublicCourse(null)}
        />
      );
    }
    if (showCourses) {
      return (
        <CoursesScreen
          onBack={() => setShowCourses(false)}
          initialTab={coursesTab}
          onCoursePress={(course, isReserved) => {
            setCoursesTab('apuntate');
            setSelectedPublicCourse({ course, isReserved });
          }}
          onEducationalCoursePress={(course) => {
            setCoursesTab('cursos');
            setSelectedEducationalCourse(course);
          }}
          onOpenProfileForOnboarding={() => {
            setShowCourses(false);
            openOnboardingFromSection('cursos');
          }}
        />
      );
    }
    if (showDailyLesson) {
      return (
        <DailyLessonScreen
          onBack={() => setShowDailyLesson(false)}
          onComplete={() => {
            setShowDailyLesson(false);
            setStreakRefreshKey((k) => k + 1);
          }}
          onOpenOnboarding={() => {
            setShowDailyLesson(false);
            openOnboardingFromSection('daily-lesson');
          }}
        />
      );
    }
    if (crearPartidoFlow.open) {
      const bumpPartidos = () => setPartidosRefreshNonce((n) => n + 1);
      const closeFlow = () => {
        setCrearPartidoFlow({ open: false, organizerId: null });
        bumpPartidos();
      };
      return (
        <CrearPartidoLocationSheet
          presentation="fullscreen"
          initialStep="clubs"
          organizerPlayerId={crearPartidoFlow.organizerId}
          onClose={closeFlow}
          onSiguiente={closeFlow}
          onNavigateToCompleteOnboarding={() => {
            setCrearPartidoFlow({ open: false, organizerId: null });
            bumpPartidos();
            setActiveTab('perfil');
          }}
          onPartidoCreado={(data) => {
            setCrearPartidoFlow({ open: false, organizerId: null });
            bumpPartidos();
            setBookingSuccessData(data);
          }}
        />
      );
    }
    if (showChangePassword) {
      return (
        <ChangePasswordScreen
          userEmail={session?.user?.email}
          onBack={() => setShowChangePassword(false)}
        />
      );
    }
    if (showEditProfile) {
      return (
        <EditProfileScreen
          onBack={() => {
            setShowEditProfile(false);
            setActiveTab('perfil');
          }}
          onSaved={() => {
            setProfileRefreshKey((k) => k + 1);
            setPartidosRefreshNonce((n) => n + 1);
          }}
          onPreferencesPress={() => {
            setShowEditProfile(false);
            setShowPreferences(true);
          }}
          onChangePasswordPress={() => setShowChangePassword(true)}
        />
      );
    }
    if (showAjustes) {
      return <AjustesScreen onBack={() => setShowAjustes(false)} />;
    }
    if (infoScreen) {
      return <InfoContentScreen screenId={infoScreen} onBack={closeInfoScreen} />;
    }
    if (showPreferences) {
      return (
        <PreferencesScreen
          onBack={() => {
            setShowPreferences(false);
            if (preferencesReturnToTuActividad) {
              setPreferencesReturnToTuActividad(false);
              setTuActividadSubView(null);
              setShowTuActividad(true);
            } else {
              setActiveTab('perfil');
            }
          }}
        />
      );
    }
    if (showCommunity) {
      return (
        <CommunityScreen
          onBack={() => setShowCommunity(false)}
          onMessagesPress={() => { setShowCommunity(false); setShowMessages(true); }}
        />
      );
    }
    if (showMessages) {
      if (messagesPeer) {
        return (
          <DirectMessageThreadScreen
            peer={messagesPeer}
            onBack={() => setMessagesPeer(null)}
          />
        );
      }
      return (
        <MessagesScreen
          onBack={() => {
            setShowMessages(false);
            setMessagesPeer(null);
          }}
          onSelectPeer={setMessagesPeer}
        />
      );
    }
    // DM abierto desde IA Afinidad: back va directo al Home y reabre el modal
    if (affinityDmPeer) {
      return (
        <DirectMessageThreadScreen
          peer={affinityDmPeer}
          onBack={() => {
            setAffinityDmPeer(null);
            setAffinityReopenSignal((s) => s + 1);
          }}
        />
      );
    }
    if ((showPublicProfile && selectedPublicPlayerId) || affinityPublicProfileId) {
      const pid = affinityPublicProfileId || selectedPublicPlayerId || '';
      const isFromAffinity = !!affinityPublicProfileId;

      return (
        <PublicProfileScreen
          playerId={pid}
          onBack={() => {
            setShowPublicProfile(false);
            if (isFromAffinity) {
              setAffinityPublicProfileId(null);
              setAffinityReopenSignal((s) => s + 1);
            } else {
              setSelectedPublicPlayerId(null);
            }
          }}
          onChatPress={(chatPid, name) => {
            setShowPublicProfile(false);
            if (isFromAffinity) {
              setAffinityPublicProfileId(null);
              setAffinityDmPeer({ id: chatPid, displayName: name, avatarUrl: null });
            } else {
              setSelectedPublicPlayerId(null);
              setShowMessages(true);
              setMessagesPeer({ id: chatPid, displayName: name, avatarUrl: null });
            }
          }}
        />
      );
    }
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
          onMatchmakingBannerStateChange={handleMatchmakingBannerStateChange}
          onPartidoPress={(p) => {
            setShowCompetitiveLeague(false);
            setSelectedPartido(p);
          }}
        />
      );
    }
    if (showSeasonPass) {
      return <SeasonPassScreen onBack={() => setShowSeasonPass(false)} />;
    }
    if (showTransacciones) {
      return (
        <TransaccionesScreen onBack={() => setShowTransacciones(false)} />
      );
    }
    if (showMonedero) {
      return <MonederoScreen onBack={() => setShowMonedero(false)} />;
    }
    if (showPartidoDetail && selectedPartido) {
      if (selectedPartido.visibility === 'private') {
        return (
          <PartidoPrivadoDetailScreen
            partido={selectedPartido}
            onBack={() => setSelectedPartido(null)}
          />
        );
      }
      return (
        <PartidoDetailScreen
          partido={selectedPartido}
          onBack={() => setSelectedPartido(null)}
          onGoHome={() => {
            setSelectedPartido(null);
            setShowTuActividad(false);
            setTuActividadSubView(null);
            setActiveTab('inicio');
          }}
          onOpenPublicProfile={(pid) => {
            setSelectedPublicPlayerId(pid);
            setShowPublicProfile(true);
          }}
          onOpenProfileForOnboarding={() => {
            setSelectedPartido(null);
            openOnboardingFromSection('partido-detail');
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
            if (destination === 'grupos') {
              setShowTuActividad(false);
              setTuActividadSubView(null);
              setShowCommunity(true);
              return;
            }
            setTuActividadSubView(destination);
          }}
          onPartidoPress={(p) => setSelectedPartido(p)}
        />
      );
    }
    if (showTusPagos) {
      return (
        <TusPagosScreen
          onBack={() => setShowTusPagos(false)}
          onTransaccionesPress={() => setShowTransacciones(true)}
          onMonederoPress={() => {
            setShowTusPagos(false);
            setShowMonedero(true);
          }}
        />
      );
    }
    if (showClubDetail && clubDetailCourt) {
      return (
        <ClubDetailScreen
          court={clubDetailCourt}
          onClose={() => setClubDetailCourt(null)}
          onPartidoPress={(p) => setSelectedPartido(p)}
        />
      );
    }
    switch (activeTab) {
      case 'inicio':
        return (
          <HomeScreen
            streakRefreshKey={streakRefreshKey}
            onNavigateToTab={(tab) => setActiveTab(tab)}
            onPartidoPress={(p) => setSelectedPartido(p)}
            onDailyLessonPress={() => setShowDailyLesson(true)}
            onCoursesPress={() => setShowCourses(true)}
            onOpenCompetitiveLeague={openCompetitiveLeagueFromHome}
            matchmakingBannerState={matchmakingHomeBannerState}
            onOpenSeasonPass={() => setShowSeasonPass(true)}
            onOpenMessageThread={(peer) => {
              setMessagesPeer(peer);
              setShowMessages(true);
            }}
            onOpenAffinityThread={(peer) => setAffinityDmPeer(peer)}
            affinityReopenSignal={affinityReopenSignal}
            onAffinityReopened={() => setAffinityReopenSignal(0)}
            onOpenPublicProfile={(pid) => {
              setSelectedPublicPlayerId(pid);
              setShowPublicProfile(true);
            }}
            onOpenAffinityPublicProfile={(pid) => {
              setAffinityPublicProfileId(pid);
              setShowPublicProfile(true);
            }}
            onOpenProfileForOnboarding={() => openOnboardingFromSection('home')}
          />
        );
      case 'pistas':
        return (
          <MatchSearchScreen
            onCourtPress={(court) => setClubDetailCourt(court)}
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
            onPartidoPress={(p) => setSelectedPartido(p)}
            onOpenWeMatchClubsFlow={(organizerId) =>
              setCrearPartidoFlow({
                open: true,
                organizerId: organizerId ?? profile?.id ?? null,
              })
            }
            onNavigateToCompleteOnboarding={() => setActiveTab('perfil')}
            partidosRefreshNonce={partidosRefreshNonce}
          />
        );
      case 'perfil':
        return (
          <ProfileScreen
            key={profileRefreshKey}
            onBack={() => {
              setActiveTab('inicio');
              setShowPreferences(false);
              setShowEditProfile(false);
              setShowChangePassword(false);
              setProfileAutoOpenOnboarding(false);
            }}
            onMenuPress={sidebar.toggle}
            onEditProfilePress={() => {
              setShowEditProfile(true);
            }}
            onPreferencesPress={() => {
              setShowPreferences(true);
            }}
            onNavigateToInfo={(screenId) => {
              setInfoReturnToProfile(true);
              setInfoScreen(screenId);
            }}
            autoOpenOnboarding={profileAutoOpenOnboarding}
            onOnboardingAutoOpened={() => setProfileAutoOpenOnboarding(false)}
            onOnboardingCompleted={handleOnboardingCompleted}
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

  const customHeader =
    fullscreenOverlayOpen
      ? undefined
      : activeTab === 'tienda'
          ? (
              <BackHeader
                title="Tienda"
                tone="dark"
                onBack={() => setActiveTab('inicio')}
                rightSlot={(
                  <View style={styles.tiendaHeaderRight}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Asistente de compras"
                      hitSlop={8}
                      style={({ pressed }) => [
                        styles.tiendaHeaderIconBase,
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <LinearGradient
                        colors={['#F18F34', '#FFB347']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                      <Ionicons name="sparkles" size={18} color="#fff" style={styles.tiendaHeaderIconFg} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Carrito"
                      hitSlop={8}
                      style={({ pressed }) => [
                        styles.tiendaHeaderCart,
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <Ionicons name="cart-outline" size={18} color="#fff" />
                    </Pressable>
                  </View>
                )}
              />
            )
          : activeTab === 'partidos'
              ? (
                  <BackHeader
                    title="Partidos"
                    tone="dark"
                    onBack={() => setActiveTab('inicio')}
                  />
                )
              : activeTab === 'inicio'
                ? (
                    <HomeHeader
                      onMenuPress={sidebar.toggle}
                      onMessagesPress={() => setShowMessages(true)}
                      onGroupsPress={() => setShowCommunity(true)}
                    />
                  )
                : undefined;

  const layoutBackgroundColor =
    bookingSuccessData != null
      ? '#000000'
      : showMessages || !!affinityDmPeer
        ? '#0A0A0A'
        : showEditProfile || showChangePassword || showPreferences || showAjustes || infoScreen || showMonedero || showTuActividad
          ? '#0F0F0F'
        : showDailyLesson
          ? '#0F0F0F'
          : showCompetitiveLeague || showSeasonPass
            ? '#0F0F0F'
          : showPartidoDetail
            ? '#0F0F0F'
            : crearPartidoFlow.open
              ? '#0F0F0F'
              : activeTab === 'perfil'
                ? '#0F0F0F'
                : showPublicProfile || !!affinityPublicProfileId
                  ? '#0F0F0F'
                  : showMainTabs && (activeTab === 'inicio' || activeTab === 'partidos')
                  ? '#000000'
                  : showMainTabs && (activeTab === 'pistas' || activeTab === 'tienda' || activeTab === 'torneos')
                    ? '#0F0F0F'
                    : '#ffffff';

  const handleTabChange = (tab: MainTabId) => {
    setActiveTab(tab);
    setShowEditProfile(false);
    setShowChangePassword(false);
    setShowPreferences(false);
    setShowAjustes(false);
    setInfoScreen(null);
    setInfoReturnToProfile(false);
    registerOverlayNestedBack(null);
    setShowMessages(false);
    setMessagesPeer(null);
    setShowCompetitiveLeague(false);
    setShowSeasonPass(false);
    setShowCommunity(false);
    setShowTuActividad(false);
    setTuActividadSubView(null);
  };

  return (
    <View style={styles.container}>
      <SidebarProvider
        close={sidebar.close}
        onNavigateToTusPagos={() => {
          resetSidebarOverlays();
          setShowTusPagos(true);
        }}
        onNavigateToMonedero={() => {
          resetSidebarOverlays();
          setShowMonedero(true);
        }}
        onNavigateToTuActividad={() => {
          resetSidebarOverlays();
          setShowTuActividad(true);
        }}
        onNavigateToAjustes={() => {
          resetSidebarOverlays();
          setShowAjustes(true);
        }}
        onNavigateToInfo={(screenId) => {
          resetSidebarOverlays();
          setInfoScreen(screenId);
        }}
        onNavigateToEditProfile={() => {
          resetSidebarOverlays();
          setShowEditProfile(true);
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
              (showMainTabs && activeTab === 'perfil')
            }
            layoutBackgroundColor={layoutBackgroundColor}
            navbarActions={{
              onMessagesPress: () => { setShowCommunity(false); setShowMessages(true); },
              onGroupsPress: () => setShowCommunity(true),
            }}
          >
            {renderContent()}
          </ScreenLayout>
          {showMainTabs && (
            <View style={styles.bottomBar}>
              <BottomNavbar activeTab={showPublicProfile ? null : activeTab} onTabChange={handleTabChange} />
            </View>
          )}
        </View>
        <MobileSidebar visible={sidebar.isOpen} onClose={sidebar.close}>
          <SidebarContent />
        </MobileSidebar>
      </SidebarProvider>

      {bookingSuccessData != null && bookingSuccessData.matchVisibility === 'private' ? (
        <PrivateReservationModal
          visible
          data={bookingSuccessData}
          onClose={() => setBookingSuccessData(null)}
        />
      ) : null}
      {bookingSuccessData != null && bookingSuccessData.matchVisibility === 'public' ? (
        <View style={styles.bookingSuccessOverlay} accessibilityViewIsModal>
          <BookingConfirmationScreen
            data={bookingSuccessData}
            onClose={() => setBookingSuccessData(null)}
          />
        </View>
      ) : null}

      {usernameCheckDone ? (
        <UsernameSetupModal
          visible={needsUsernameSetup}
          onComplete={() => {
            setNeedsUsernameSetup(false);
            setProfileRefreshKey((k) => k + 1);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tiendaHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tiendaHeaderIconBase: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tiendaHeaderIconFg: {
    zIndex: 1,
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
  /** Por encima de ScreenLayout y navbar: la confirmación no puede quedar recortada por el contenedor flex. */
  bookingSuccessOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
    elevation: 2000,
  },
});
