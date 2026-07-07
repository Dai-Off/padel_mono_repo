import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Pressable, Text, View, StyleSheet } from 'react-native';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from '../i18n';
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
import { HomeScreen, markAffinityModalPendingReopen } from './HomeScreen';
import type { PartidoItem } from './PartidosScreen';
import { PartidoDetailScreen } from './PartidoDetailScreen';
import { CourtReservationDetailScreen } from './CourtReservationDetailScreen';
import type { CourtReservation } from '../api/bookings';
import { NotificationsScreen } from './NotificationsScreen';
import { PartidosScreen } from './PartidosScreen';
import { MatchSearchScreen } from './MatchSearchScreen';
import { MonederoScreen } from './MonederoScreen';
import { PagosPendientesScreen } from './PagosPendientesScreen';
import { MovimientosMonederoScreen } from './MovimientosMonederoScreen';
import { TuActividadFlow } from './TuActividadFlow';
import type { TuActividadDestination } from './TuActividadScreen';
import { TransaccionesScreen } from './TransaccionesScreen';
import { TiendaScreen } from './TiendaScreen';
import { CartScreen } from './CartScreen';
import { DailyLessonScreen } from './DailyLessonScreen';
import { CoursesScreen } from './CoursesScreen';
import { EducationalCourseDetailScreen } from './EducationalCourseDetailScreen';
import { PublicCourseDetailScreen } from './PublicCourseDetailScreen';
import { ProfileScreen } from './ProfileScreen';
import { EditProfileScreen } from './EditProfileScreen';
import { ChangePasswordScreen } from './ChangePasswordScreen';
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
import { fetchReceivedMatchInvites, type ReceivedMatchInvite } from '../api/matchInvites';
import { parseTournamentInviteUrl } from '../lib/parseTournamentInviteUrl';
import { reloadMatchPartido } from '../lib/reloadMatchPartido';
import { isPlayerInPartido } from '../lib/partidoPlayerUtils';
import { CommunityScreen } from './CommunityScreen';
import { MessagesScreen, type MessagePeerNav } from './MessagesScreen';
import { DirectMessageThreadScreen } from './DirectMessageThreadScreen';
import { CompetitiveLeagueScreen } from './CompetitiveLeagueScreen';
import { SeasonPassScreen } from './SeasonPassScreen';
import { PreferencesScreen } from './PreferencesScreen';
import { PublicProfileScreen } from './PublicProfileScreen';
import { AjustesScreen } from './AjustesScreen';
import { ClubReviewsScreen } from './ClubReviewsScreen';
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
  const { session } = useAuth();
  const { totalCount: cartCount } = useCart();
  const { profile, refreshMatches, refreshCourtReservations, syncMisPartidoFromMatchId, upsertMisPartido } = useHomeData();
  const [activeTab, setActiveTab] = useState<MainTabId>('inicio');
  // Cada incremento pide a ProfileScreen hacer scroll a la Vitrina de Logros.
  const [vitrinaScrollNonce, setVitrinaScrollNonce] = useState(0);
  const [showCart, setShowCart] = useState(false);
  const [clubDetailCourt, setClubDetailCourt] = useState<SearchCourtResult | null>(null);
  const [selectedPartido, setSelectedPartido] = useState<PartidoItem | null>(null);
  const [selectedCourtReservation, setSelectedCourtReservation] = useState<CourtReservation | null>(null);
  const [showMonedero, setShowMonedero] = useState(false);
  const [showPagosPendientes, setShowPagosPendientes] = useState(false);
  const [showMovimientosMonedero, setShowMovimientosMonedero] = useState(false);
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
    matchVisibility: 'public' | 'private';
  }>({ open: false, organizerId: null, matchVisibility: 'public' });
  const [partidosRefreshNonce, setPartidosRefreshNonce] = useState(0);
  const [bookingSuccessData, setBookingSuccessData] = useState<BookingConfirmationData | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [matchReceivedInvites, setMatchReceivedInvites] = useState<ReceivedMatchInvite[]>([]);
  const [matchInviteNonce, setMatchInviteNonce] = useState(0);
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
  const [showClubReviews, setShowClubReviews] = useState(false);
  const [infoScreen, setInfoScreen] = useState<InfoScreenId | null>(null);
  const [infoReturnToProfile, setInfoReturnToProfile] = useState(false);
  const [showCommunity, setShowCommunity] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [messagesPeer, setMessagesPeer] = useState<MessagePeerNav | null>(null);
  // Si el chat se abrió desde el perfil ajeno (botón Mensaje), al volver del chat
  // se regresa al perfil ajeno en vez de a la lista de mensajes.
  const [messagesReturnToProfile, setMessagesReturnToProfile] = useState(false);
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
  const [showSeasonPass, setShowSeasonPass] = useState(false);
  const [showPublicProfile, setShowPublicProfile] = useState(false);
  const [selectedPublicPlayerId, setSelectedPublicPlayerId] = useState<string | null>(null);
  // Si un partido se abrió DESDE el perfil ajeno (su gráfico de evolución), el detalle
  // de partido tiene prioridad sobre el perfil ajeno; al volver del partido, vuelve al perfil.
  const [matchOpenedFromPublicProfile, setMatchOpenedFromPublicProfile] = useState(false);
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
        setSelectedPartido(loaded);
        if (viewerId && isPlayerInPartido(loaded, viewerId)) {
          upsertMisPartido(loaded);
        }
      } else {
        Alert.alert(t('alerts.error.title'), t('partidos.matchInviteOpenFail'));
      }
    },
    [session?.access_token, profile?.id, upsertMisPartido, t],
  );

  const consumeInviteUrl = useCallback(
    async (url: string | null) => {
      if (!url) return;
      const tournamentParsed = parseTournamentInviteUrl(url);
      if (tournamentParsed) {
        await AsyncStorage.removeItem(PENDING_TOURNAMENT_INVITE_KEY);
        await processTournamentInvite(tournamentParsed.token, tournamentParsed.tournamentId);
      }
    },
    [processTournamentInvite],
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
      const initial = await Linking.getInitialURL();
      if (initial) await consumeInviteUrl(initial);
    })();
    const sub = Linking.addEventListener('url', ({ url }) => {
      void consumeInviteUrl(url);
    });
    return () => sub.remove();
  }, [session?.access_token, consumeInviteUrl, processTournamentInvite]);

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
    if (target === 'daily-lesson') setShowDailyLesson(true);
    else if (target === 'matchmaking') setShowCompetitiveLeague(true);
    else if (target === 'torneos') setActiveTab('torneos');
    else if (target === 'cursos') setShowCourses(true);
    // partido-detail: no podemos reabrirlo automáticamente sin el objeto del
    // partido (se perdería en el ciclo de perfil). El usuario lo verá al volver.
  };

  const showClubDetail = activeTab === 'pistas' && clubDetailCourt != null;
  const showPartidoDetail = selectedPartido != null;
  const showCourtReservationDetail = selectedCourtReservation != null;

  // Abre el detalle de un partido a partir de su id (desde el gráfico de
  // evolución del perfil). Carga el partido y lo normaliza a PartidoItem.
  const openMatchById = useCallback(
    async (matchId: string) => {
      const m = await fetchMatchById(matchId, session?.access_token ?? null);
      if (!m) return;
      const item = mapMatchToPartido(m, { viewerPlayerId: profile?.id ?? null });
      if (item) setSelectedPartido(item);
    },
    [session?.access_token, profile?.id],
  );

  /** Cierra overlays del menú lateral antes de abrir otro destino (evita flags superpuestos). */
  const resetSidebarOverlays = useCallback(() => {
    setShowEditProfile(false);
    setShowChangePassword(false);
    setShowPreferences(false);
    setPreferencesReturnToTuActividad(false);
    setShowAjustes(false);
    setShowClubReviews(false);
    setInfoScreen(null);
    setInfoReturnToProfile(false);
    setShowTuActividad(false);
    setTuActividadSubView(null);
    setShowMonedero(false);
    setShowPagosPendientes(false);
    setShowMovimientosMonedero(false);
    setShowTransacciones(false);
    registerOverlayNestedBack(null);
  }, []);

  const fullscreenOverlayOpen =
    bookingSuccessData != null ||
    showMonedero ||
    showPagosPendientes ||
    showMovimientosMonedero ||
    showTransacciones ||
    showTuActividad ||
    showEditProfile ||
    showChangePassword ||
    showPreferences ||
    showAjustes ||
    showClubReviews ||
    infoScreen != null ||
    showPartidoDetail ||
    showCourtReservationDetail ||
    showClubDetail ||
    showCompetitiveLeague ||
    showSeasonPass ||
    crearPartidoFlow.open ||
    showDailyLesson ||
    showCourses ||
    selectedEducationalCourse != null ||
    selectedPublicCourse != null ||
    showMessages ||
    showNotifications ||
    showCommunity ||
    showPublicProfile ||
    affinityPublicProfileId !== null;

  const closeInfoScreen = useCallback(() => {
    setInfoScreen(null);
    if (infoReturnToProfile) {
      setInfoReturnToProfile(false);
      setActiveTab('perfil');
    }
  }, [infoReturnToProfile]);

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
      // Carrito de la tienda
      if (showCart) {
        setShowCart(false);
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
        setCrearPartidoFlow({ open: false, organizerId: null, matchVisibility: 'public' });
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
      // Valorar clubes
      if (showClubReviews) {
        setShowClubReviews(false);
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
      // Notificaciones
      if (showNotifications) {
        setShowNotifications(false);
        return true;
      }
      // Community
      if (showCommunity) {
        setShowCommunity(false);
        return true;
      }
      // Hilo DM dentro de Mensajes
      if (showMessages && messagesPeer) {
        if (messagesReturnToProfile) {
          setShowMessages(false);
          setMessagesReturnToProfile(false);
        }
        setMessagesPeer(null);
        return true;
      }
      // Lista de mensajes
      if (showMessages) {
        setShowMessages(false);
        setMessagesPeer(null);
        setMessagesReturnToProfile(false);
        return true;
      }
      // Perfil público (genérico o desde afinidad)
      if (affinityPublicProfileId) {
        markAffinityModalPendingReopen();
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
      // Transacciones (sale antes que Wallet en renderContent)
      if (showTransacciones) {
        setShowTransacciones(false);
        return true;
      }
      if (showPagosPendientes) {
        setShowPagosPendientes(false);
        return true;
      }
      if (showMovimientosMonedero) {
        setShowMovimientosMonedero(false);
        return true;
      }
      // Detalle de partido (prioridad sobre flujos padre, p. ej. Tu actividad)
      if (selectedCourtReservation) {
        setSelectedCourtReservation(null);
        return true;
      }
      if (selectedPartido) {
        setSelectedPartido(null);
        setMatchOpenedFromPublicProfile(false);
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
    showCart,
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
    showClubReviews,
    infoScreen,
    closeInfoScreen,
    showCommunity,
    showMessages,
    messagesPeer,
    affinityPublicProfileId,
    showPublicProfile,
    showCompetitiveLeague,
    showSeasonPass,
    showTransacciones,
    showPagosPendientes,
    showMovimientosMonedero,
    showTuActividad,
    tuActividadSubView,
    showMonedero,
    selectedPartido,
    selectedCourtReservation,
    clubDetailCourt,
    activeTab,
  ]);

  const renderContent = () => {
    if (showCart) {
      return (
        <CartScreen
          onBack={() => setShowCart(false)}
          onContinueShopping={() => {
            setShowCart(false);
            setActiveTab('tienda');
          }}
        />
      );
    }
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
        setCrearPartidoFlow({ open: false, organizerId: null, matchVisibility: 'public' });
        bumpPartidos();
      };
      return (
        <CrearPartidoLocationSheet
          presentation="fullscreen"
          initialStep="clubs"
          initialMatchVisibility={crearPartidoFlow.matchVisibility}
          organizerPlayerId={crearPartidoFlow.organizerId}
          onClose={closeFlow}
          onSiguiente={closeFlow}
          onNavigateToCompleteOnboarding={() => {
            setCrearPartidoFlow({ open: false, organizerId: null, matchVisibility: 'public' });
            bumpPartidos();
            setActiveTab('perfil');
          }}
          onPartidoCreado={(data) => {
            const organizerId = crearPartidoFlow.organizerId ?? profile?.id ?? null;
            setCrearPartidoFlow({ open: false, organizerId: null, matchVisibility: 'public' });
            bumpPartidos();
            setBookingSuccessData(data);
            if (data.matchId) {
              upsertMisPartido({
                id: data.matchId,
                dateTime: data.dateTimeFormatted,
                visibility: data.matchVisibility,
                organizerPlayerId: organizerId,
                matchPhase: 'upcoming',
                mode: 'amistoso',
                typeLabel: 'Todos los jugadores',
                levelRange: 'Libre',
                players: [
                  {
                    name: profile?.firstName ?? 'Tú',
                    level: '—',
                    isFree: false,
                    initial: profile?.firstName?.[0]?.toUpperCase() ?? 'T',
                    avatar: profile?.avatarUrl ?? undefined,
                  },
                  { name: '', level: '', isFree: true },
                  { name: '', level: '', isFree: true },
                  { name: '', level: '', isFree: true },
                ],
                playerIds: organizerId ? [organizerId] : [],
                playerIdsBySlot: [organizerId ?? null, null, null, null],
                venue: data.clubName,
                location: '—',
                price: data.courtPriceFormatted ?? data.priceFormatted,
                pricePerPlayer: data.priceFormatted,
                duration: data.duration,
                courtName: data.courtName,
                clubId: data.clubId,
                startAt: data.date,
              });
              void syncMisPartidoFromMatchId(data.matchId, {
                organizerPlayerId: organizerId,
                matchVisibility: data.matchVisibility,
              });
            } else {
              void refreshMatches({ force: true, scope: 'mine' });
            }
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
    if (showClubReviews) {
      return <ClubReviewsScreen onBack={() => setShowClubReviews(false)} />;
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
    if (showNotifications) {
      return (
        <NotificationsScreen
          onBack={() => setShowNotifications(false)}
          onOpenMatch={async (invite) => {
            setShowNotifications(false);
            await openMatchFromInvite(invite);
          }}
        />
      );
    }
    // Community cede el paso al perfil público SOLO cuando se abre un perfil desde
    // aquí (guard). Así no cambia la precedencia del resto de pantallas.
    if (showCommunity && !(showPublicProfile && selectedPublicPlayerId)) {
      return (
        <CommunityScreen
          onBack={() => setShowCommunity(false)}
          onMessagesPress={() => { setShowCommunity(false); setShowMessages(true); }}
          onOpenPlayer={(pid) => {
            setAffinityPublicProfileId(null);
            setMatchOpenedFromPublicProfile(false);
            setSelectedPublicPlayerId(pid);
            setShowPublicProfile(true);
          }}
        />
      );
    }
    if (showMessages) {
      if (messagesPeer) {
        return (
          <DirectMessageThreadScreen
            peer={messagesPeer}
            onBack={() => {
              // Si el chat se abrió desde el perfil ajeno, cerramos Mensajes para volver al perfil;
              // si no, volvemos a la lista de mensajes.
              if (messagesReturnToProfile) {
                setShowMessages(false);
                setMessagesReturnToProfile(false);
              }
              setMessagesPeer(null);
            }}
          />
        );
      }
      return (
        <MessagesScreen
          onBack={() => {
            setShowMessages(false);
            setMessagesPeer(null);
            setMessagesReturnToProfile(false);
          }}
          onSelectPeer={(peer) => {
            setMessagesReturnToProfile(false);
            setMessagesPeer(peer);
          }}
        />
      );
    }
    if (!matchOpenedFromPublicProfile && ((showPublicProfile && selectedPublicPlayerId) || affinityPublicProfileId)) {
      const pid = affinityPublicProfileId || selectedPublicPlayerId || '';
      const isFromAffinity = !!affinityPublicProfileId;

      return (
        <PublicProfileScreen
          playerId={pid}
          onBack={() => {
            setShowPublicProfile(false);
            if (isFromAffinity) {
              markAffinityModalPendingReopen();
              setAffinityPublicProfileId(null);
              setAffinityReopenSignal((s) => s + 1);
            } else {
              setSelectedPublicPlayerId(null);
            }
          }}
          onChatPress={(chatPid, name) => {
            // No cerramos el perfil ajeno: el chat se abre encima y al volver se regresa al perfil.
            setMessagesReturnToProfile(true);
            setShowMessages(true);
            setMessagesPeer({ id: chatPid, displayName: name, avatarUrl: null });
          }}
          onOpenMatch={(matchId) => {
            setMatchOpenedFromPublicProfile(true);
            void openMatchById(matchId);
          }}
          onOpenPlayer={(pid) => {
            setAffinityPublicProfileId(null);
            setMatchOpenedFromPublicProfile(false);
            setSelectedPublicPlayerId(pid);
            setShowPublicProfile(true);
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
          onMatchmakingBannerStateChange={handleCompetitiveLeagueBannerStateChange}
          pendingPartnerInvite={competitivePartnerInvite}
          onPartnerApplied={() => setCompetitivePartnerInvite(null)}
          onPartidoPress={(p) => {
            setShowCompetitiveLeague(false);
            setSelectedPartido(p);
          }}
          onOpenPlayer={(pid) => {
            setAffinityPublicProfileId(null);
            setMatchOpenedFromPublicProfile(false);
            setSelectedPublicPlayerId(pid);
            setShowPublicProfile(true);
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
    if (showPagosPendientes) {
      return <PagosPendientesScreen onBack={() => setShowPagosPendientes(false)} />;
    }
    if (showMovimientosMonedero) {
      return <MovimientosMonederoScreen onBack={() => setShowMovimientosMonedero(false)} />;
    }
    if (showMonedero) {
      return (
        <MonederoScreen
          onBack={() => setShowMonedero(false)}
          onPagosPendientesPress={() => setShowPagosPendientes(true)}
          onMovimientosPress={() => setShowMovimientosMonedero(true)}
          onTransaccionesPress={() => setShowTransacciones(true)}
        />
      );
    }
    if (showCourtReservationDetail && selectedCourtReservation) {
      return (
        <CourtReservationDetailScreen
          reservation={selectedCourtReservation}
          onBack={() => setSelectedCourtReservation(null)}
          onCancelled={() => {
            setSelectedCourtReservation(null);
            void refreshCourtReservations({ force: true });
          }}
        />
      );
    }
    if (showPartidoDetail && selectedPartido) {
      return (
        <PartidoDetailScreen
          partido={selectedPartido}
          onMatchDataChanged={() => {
            setMatchInviteNonce((n) => n + 1);
            setPartidosRefreshNonce((n) => n + 1);
          }}
          onBack={() => {
            void refreshMatches({ scope: 'mine' });
            setSelectedPartido(null);
            // Si el partido se abrió desde el perfil ajeno, al volver se regresa a él.
            setMatchOpenedFromPublicProfile(false);
          }}
          onGoHome={() => {
            void refreshMatches({ scope: 'mine' });
            setSelectedPartido(null);
            setShowTuActividad(false);
            setTuActividadSubView(null);
            // "Ir a inicio" cierra también el perfil ajeno para no dejarlo debajo.
            setMatchOpenedFromPublicProfile(false);
            setShowPublicProfile(false);
            setSelectedPublicPlayerId(null);
            setAffinityPublicProfileId(null);
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
            setTuActividadSubView(destination);
          }}
          onPartidoPress={(p) => setSelectedPartido(p)}
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
            onCourtReservationPress={(reservation) => setSelectedCourtReservation(reservation)}
            onDailyLessonPress={() => setShowDailyLesson(true)}
            onCoursesPress={() => setShowCourses(true)}
            onOpenCompetitiveLeague={openCompetitiveLeagueFromHome}
            matchmakingBannerState={matchmakingHomeBannerState}
            pairInvites={pairInvites}
            onPairInvitesChanged={() => setPairInviteNonce((n) => n + 1)}
            onAcceptInviteAndSearch={openCompetitiveWithPartner}
            matchReceivedInvites={matchReceivedInvites}
            onMatchInvitesChanged={() => setMatchInviteNonce((n) => n + 1)}
            onViewMatchInvite={(invite) => openMatchFromInvite(invite)}
            onOpenSeasonPass={() => setShowSeasonPass(true)}
            onOpenMessageThread={(peer) => {
              setMessagesReturnToProfile(false);
              setMessagesPeer(peer);
              setShowMessages(true);
            }}
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
            onOpenWeMatchClubsFlow={(organizerId, matchVisibility) =>
              setCrearPartidoFlow({
                open: true,
                organizerId: organizerId ?? profile?.id ?? null,
                matchVisibility,
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
            onOpenMatch={openMatchById}
            onOpenPublicProfile={(pid) => {
              setSelectedPublicPlayerId(pid);
              setShowPublicProfile(true);
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

  const customHeader =
    fullscreenOverlayOpen || showCart
      ? undefined
      : activeTab === 'tienda'
          ? (
              <BackHeader
                title={t('nav.tabTienda')}
                tone="dark"
                onBack={() => setActiveTab('inicio')}
                rightSlot={(
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('nav.tiendaCart')}
                    hitSlop={8}
                    onPress={() => setShowCart(true)}
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
                )}
              />
            )
          : activeTab === 'partidos'
              ? (
                  <BackHeader
                    title={t('nav.tabPartidos')}
                    tone="dark"
                    onBack={() => setActiveTab('inicio')}
                  />
                )
              : activeTab === 'inicio'
                ? (
                    <HomeHeader
                      onMenuPress={sidebar.toggle}
                      onMessagesPress={() => setShowMessages(true)}
                      onNotificationsPress={() => setShowNotifications(true)}
                      onGroupsPress={() => setShowCommunity(true)}
                    />
                  )
                : undefined;

  const layoutBackgroundColor =
    bookingSuccessData != null
      ? '#000000'
      : showCart
        ? '#0F0F0F'
        : showMessages
        ? '#0A0A0A'
        : showEditProfile || showChangePassword || showPreferences || showAjustes || showClubReviews || infoScreen || showMonedero || showTuActividad
          ? '#0F0F0F'
        : showDailyLesson
          ? '#0F0F0F'
          : showCompetitiveLeague || showSeasonPass
            ? '#0F0F0F'
          : showPartidoDetail || showCourtReservationDetail
            ? '#0F0F0F'
            : showClubDetail
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
    setShowCart(false);
    setShowEditProfile(false);
    setShowChangePassword(false);
    setShowPreferences(false);
    setShowAjustes(false);
    setShowClubReviews(false);
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
        onNavigateToClubReviews={() => {
          resetSidebarOverlays();
          setShowClubReviews(true);
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
              showCart ||
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

      <SeasonTransitionModal
        visible={!!seasonTransition}
        transition={seasonTransition}
        onClose={handleSeasonTransitionClose}
      />

      {bookingSuccessData != null &&
      (bookingSuccessData.confirmationKind === 'reservation' ||
        bookingSuccessData.matchVisibility === 'private') ? (
        <PrivateReservationModal
          visible
          data={bookingSuccessData}
          onClose={() => setBookingSuccessData(null)}
        />
      ) : bookingSuccessData != null ? (
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
  /** Por encima de ScreenLayout y navbar: la confirmación no puede quedar recortada por el contenedor flex. */
  bookingSuccessOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
    elevation: 2000,
  },
});
