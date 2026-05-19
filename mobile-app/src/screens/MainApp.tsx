import { useState } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
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
import { TransaccionesScreen } from './TransaccionesScreen';
import { TiendaScreen } from './TiendaScreen';
import { DailyLessonScreen } from './DailyLessonScreen';
import { CoursesScreen } from './CoursesScreen';
import { EducationalCourseDetailScreen } from './EducationalCourseDetailScreen';
import { PublicCourseDetailScreen } from './PublicCourseDetailScreen';
import { ProfileScreen } from './ProfileScreen';
import { CommunityScreen } from './CommunityScreen';
import { MessagesScreen, type MessagePeerNav } from './MessagesScreen';
import { DirectMessageThreadScreen } from './DirectMessageThreadScreen';
import { CompetitiveLeagueScreen } from './CompetitiveLeagueScreen';
import { SeasonPassScreen } from './SeasonPassScreen';
import { PreferencesScreen } from './PreferencesScreen';
import { PublicProfileScreen } from './PublicProfileScreen';
import type { EducationalCourse } from '../api/dailyLessons';
import type { PublicCourse } from '../api/schoolCourses';

/**
 * Claves de retorno post-onboarding. Cuando el usuario llega al cuestionario
 * desde una feature bloqueada, al completarlo lo devolvemos a esa sección en
 * vez de dejarlo en el perfil.
 */
type PostOnboardingReturn =
  | 'home'
  | 'daily-lesson'
  | 'ia-afinidad'
  | 'matchmaking'
  | 'partido-detail'
  | 'torneos'
  | 'cursos';

export function MainApp() {
  const sidebar = useSidebar(false);
  const [activeTab, setActiveTab] = useState<MainTabId>('inicio');
  const [clubDetailCourt, setClubDetailCourt] = useState<SearchCourtResult | null>(null);
  const [selectedPartido, setSelectedPartido] = useState<PartidoItem | null>(null);
  const [showTusPagos, setShowTusPagos] = useState(false);
  const [showTransacciones, setShowTransacciones] = useState(false);
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
  const [showProfile, setShowProfile] = useState(false);
  // Si llegamos al perfil desde una feature bloqueada por falta de onboarding
  // (p.ej. Daily Lesson), pedimos a ProfileScreen que abra el modal del
  // cuestionario de nivelación automáticamente al montar.
  const [profileAutoOpenOnboarding, setProfileAutoOpenOnboarding] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showCommunity, setShowCommunity] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [messagesPeer, setMessagesPeer] = useState<MessagePeerNav | null>(null);
  /** DM abierto directamente desde IA Afinidad — back vuelve al modal de resultados */
  const [affinityDmPeer, setAffinityDmPeer] = useState<MessagePeerNav | null>(null);
  /** Incrementar para que HomeScreen reabra el modal de IA Afinidad */
  const [affinityReopenSignal, setAffinityReopenSignal] = useState(0);
  const [showCompetitiveLeague, setShowCompetitiveLeague] = useState(false);
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

  /**
   * Abre el perfil con el modal del cuestionario auto-abierto y guarda la
   * sección de origen para devolver al usuario al completarlo. Usado por todos
   * los bloqueos (banner home, hard blocks, soft blocks).
   */
  const openOnboardingFromSection = (returnTo: PostOnboardingReturn) => {
    setPendingOnboardingReturn(returnTo);
    setProfileAutoOpenOnboarding(true);
    setShowProfile(true);
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
      setShowProfile(false);
      setActiveTab('inicio');
      return;
    }
    setShowProfile(false);
    if (target === 'daily-lesson') setShowDailyLesson(true);
    else if (target === 'matchmaking') setShowCompetitiveLeague(true);
    else if (target === 'torneos') setActiveTab('torneos');
    else if (target === 'cursos') setShowCourses(true);
    // partido-detail: no podemos reabrirlo automáticamente sin el objeto del
    // partido (se perdería en el ciclo de perfil). El usuario lo verá al volver.
  };

  const showClubDetail = activeTab === 'pistas' && clubDetailCourt != null;
  const showPartidoDetail = selectedPartido != null;

  const renderContent = () => {
    if (selectedEducationalCourse) {
      return (
        <EducationalCourseDetailScreen
          course={selectedEducationalCourse}
          onBack={() => setSelectedEducationalCourse(null)}
          onOpenProfileForOnboarding={() => {
            // Cerramos también `showCourses` (listado): en `renderContent` se
            // evalúa antes que `showProfile`, así que sin esto la navegación
            // se quedaba en el listado de cursos en vez de ir al perfil.
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
            setShowProfile(true);
          }}
          onPartidoCreado={(data) => {
            setCrearPartidoFlow({ open: false, organizerId: null });
            bumpPartidos();
            setBookingSuccessData(data);
          }}
        />
      );
    }
    if (showProfile) {
      return (
        <ProfileScreen
          onBack={() => {
            setShowProfile(false);
            setShowPreferences(false);
            setProfileAutoOpenOnboarding(false);
          }}
          onMenuPress={sidebar.toggle}
          onPreferencesPress={() => {
            setShowProfile(false);
            setShowPreferences(true);
          }}
          autoOpenOnboarding={profileAutoOpenOnboarding}
          onOnboardingAutoOpened={() => setProfileAutoOpenOnboarding(false)}
          onOnboardingCompleted={handleOnboardingCompleted}
        />
      );
    }
    if (showPreferences) {
      return (
        <PreferencesScreen onBack={() => {
          setShowPreferences(false);
          setShowProfile(true);
        }} />
      );
    }
    if (showCommunity) {
      return (
        <CommunityScreen onBack={() => setShowCommunity(false)} />
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
    if (showTusPagos) {
      return (
        <TusPagosScreen
          onBack={() => setShowTusPagos(false)}
          onTransaccionesPress={() => setShowTransacciones(true)}
        />
      );
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
            onOpenCompetitiveLeague={() => setShowCompetitiveLeague(true)}
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
            onOpenProfileForOnboarding={() => openOnboardingFromSection('torneos')}
          />
        );
      case 'partidos':
        return (
          <PartidosScreen
            onPartidoPress={(p) => setSelectedPartido(p)}
            onOpenWeMatchClubsFlow={(organizerId) =>
              setCrearPartidoFlow({ open: true, organizerId })
            }
            onNavigateToCompleteOnboarding={() => setShowProfile(true)}
            partidosRefreshNonce={partidosRefreshNonce}
          />
        );
      default:
        return <HomeScreen streakRefreshKey={streakRefreshKey} />;
    }
  };

  const showMainTabs =
    bookingSuccessData == null &&
    !showTusPagos &&
    !showTransacciones &&
    !showProfile &&
    !showPreferences &&
    !showPartidoDetail &&
    !showClubDetail &&
    !crearPartidoFlow.open &&
    !showDailyLesson &&
    !showCourses &&
    !selectedEducationalCourse &&
    !selectedPublicCourse &&
    !showMessages &&
    !affinityDmPeer &&
    !showCompetitiveLeague &&
    !showSeasonPass &&
    !showPublicProfile;

  const customHeader =
    bookingSuccessData != null ||
    showTusPagos ||
    showTransacciones ||
    showProfile ||
    showPreferences ||
    showPartidoDetail ||
    showCompetitiveLeague ||
    showSeasonPass ||
    crearPartidoFlow.open ||
    showDailyLesson ||
    showCourses ||
    showMessages ||
    !!affinityDmPeer ||
    selectedEducationalCourse != null ||
    selectedPublicCourse != null ||
    showPublicProfile
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
        : showPreferences
          ? '#0F0F0F'
        : showDailyLesson
          ? '#0F0F0F'
          : showCompetitiveLeague || showSeasonPass
            ? '#0F0F0F'
          : showPartidoDetail
            ? '#0F0F0F'
            : crearPartidoFlow.open
              ? '#0F0F0F'
              : showProfile
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
    setShowProfile(false);
    setShowPreferences(false);
    setShowMessages(false);
    setMessagesPeer(null);
    setShowCompetitiveLeague(false);
    setShowSeasonPass(false);
  };

  return (
    <View style={styles.container}>
      <SidebarProvider
        close={sidebar.close}
        onNavigateToTusPagos={() => setShowTusPagos(true)}
        onProfilePress={() => setShowProfile(true)}
      >
        <View style={styles.mainColumn}>
          <ScreenLayout
            sidebar={sidebar}
            customHeader={customHeader}
            hideHeader={
              bookingSuccessData != null ||
                showProfile ||
              showPreferences ||
              showClubDetail ||
              showPartidoDetail ||
              showCompetitiveLeague ||
              showSeasonPass ||
              showTusPagos ||
              showTransacciones ||
              crearPartidoFlow.open ||
              showDailyLesson ||
              showCourses ||
              selectedEducationalCourse != null ||
              selectedPublicCourse != null ||
              showMessages ||
              !!affinityDmPeer ||
              showPublicProfile ||
              affinityPublicProfileId !== null ||
              (showMainTabs && activeTab === 'pistas') ||
              (showMainTabs && activeTab === 'torneos')
            }
            layoutBackgroundColor={layoutBackgroundColor}
            navbarActions={{
              onMessagesPress: () => setShowMessages(true),
              onGroupsPress: () => setShowCommunity(true),
            }}
          >
            {renderContent()}
          </ScreenLayout>
          {bookingSuccessData == null &&
            !showClubDetail &&
            !showPartidoDetail &&
            !showTusPagos &&
            !showTransacciones &&
            !showPreferences &&
            !crearPartidoFlow.open &&
            !showDailyLesson &&
            !showCourses &&
            !selectedEducationalCourse &&
            !selectedPublicCourse &&
            !showMessages &&
            !affinityDmPeer &&
            !showCompetitiveLeague &&
            !showSeasonPass &&
            !showPublicProfile &&
            affinityPublicProfileId === null && (
            <View style={styles.bottomBar}>
              <BottomNavbar activeTab={(showProfile || showPublicProfile) ? null : activeTab} onTabChange={handleTabChange} />
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
