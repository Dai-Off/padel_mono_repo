import { useCallback, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { HomeScreen } from '../../screens/HomeScreen';
import { PartidosScreen } from '../../screens/PartidosScreen';
import { MatchSearchScreen } from '../../screens/MatchSearchScreen';
import { TiendaScreen } from '../../screens/TiendaScreen';
import { CoursesScreen } from '../../screens/CoursesScreen';
import { CompeticionesScreen } from '../../screens/CompeticionesScreen';
import { ProfileScreen } from '../../screens/ProfileScreen';
import { BackHeader } from '../../components/layout/BackHeader';
import { HomeHeader } from '../../components/layout/HomeHeader';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { useHomeData } from '../../contexts/HomeDataContext';
import { useMatchmaking } from '../../contexts/MatchmakingContext';
import { useAppSignals } from '../../contexts/AppSignalsContext';
import { useSidebarActions } from '../../contexts/SidebarContext';
import { useOpenMatchById, useOpenMatchFromInvite } from '../matchActions';
import { goToMainTab } from '../nav';
import { useTranslation } from '../../i18n';
import type { PairInvite } from '../../api/matchmaking';
import type { RootStackParamList } from '../types';

type RootNav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Marco de cada tab: safe-area superior + fondo + header propio (lo que
 * ScreenLayout montaba una sola vez para todos).
 */
export function TabScreenShell({
  children,
  backgroundColor = '#0F0F0F',
  header,
}: {
  children: ReactNode;
  backgroundColor?: string;
  header?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.shell, { backgroundColor, paddingTop: insets.top }]}>
      {header}
      <View style={styles.shellContent}>{children}</View>
    </View>
  );
}

function ProfileHeaderButton() {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('nav.userProfileA11y')}
      hitSlop={8}
      onPress={() => goToMainTab('perfil')}
      style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.75 }]}
    >
      <Ionicons name="person-circle-outline" size={22} color="#fff" />
    </Pressable>
  );
}

export function InicioTab() {
  const navigation = useNavigation<RootNav>();
  const { toggle: toggleSidebar } = useSidebarActions();
  const {
    bannerState: matchmakingBannerState,
    pairInvites,
    bumpPairInvites,
    matchReceivedInvites,
    bumpMatchInvites,
  } = useMatchmaking();
  const {
    streakRefreshKey,
    affinityReopenSignal,
    clearAffinityReopen,
    openOnboardingFromSection,
  } = useAppSignals();
  const openMatchFromInvite = useOpenMatchFromInvite();

  const openCompetitiveLeagueFromHome = useCallback(() => {
    const entryIntent =
      matchmakingBannerState === 'timed_out'
        ? 'prefs'
        : matchmakingBannerState === 'searching'
          ? 'queue'
          : 'default';
    navigation.navigate('CompetitiveLeague', { entryIntent });
  }, [matchmakingBannerState, navigation]);

  // Tras aceptar una invitacion desde el banner: liga competitiva con ese
  // companero ya fijado para buscar.
  const openCompetitiveWithPartner = useCallback(
    (invite: PairInvite) => {
      navigation.navigate('CompetitiveLeague', { entryIntent: 'default', partnerInvite: invite });
    },
    [navigation],
  );

  return (
    <TabScreenShell
      backgroundColor="#000000"
      header={(
        <HomeHeader
          onMenuPress={toggleSidebar}
          onMessagesPress={() => navigation.navigate('Messages')}
          onNotificationsPress={() => navigation.navigate('Notifications')}
          onGroupsPress={() => navigation.navigate('Community')}
          onProfilePress={() => goToMainTab('perfil')}
        />
      )}
    >
      <HomeScreen
        streakRefreshKey={streakRefreshKey}
        onNavigateToTab={goToMainTab}
        onPartidoPress={(p) => navigation.push('PartidoDetail', { partido: p })}
        onCourtReservationPress={(reservation) =>
          navigation.navigate('CourtReservationDetail', { reservation })
        }
        onDailyLessonPress={() => navigation.navigate('DailyLesson')}
        onCoursesPress={() => goToMainTab('cursos')}
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
          // El hilo se apila sobre la lista de mensajes para que el back
          // caiga en ella.
          navigation.navigate('Messages');
          navigation.push('DirectMessageThread', { peer });
        }}
        affinityReopenSignal={affinityReopenSignal}
        onAffinityReopened={clearAffinityReopen}
        onOpenPublicProfile={(pid) => {
          navigation.push('PublicProfile', { playerId: pid });
        }}
        onOpenAffinityPublicProfile={(pid) => {
          navigation.push('PublicProfile', { playerId: pid, origin: 'affinity' });
        }}
        onOpenProfileForOnboarding={() => openOnboardingFromSection('home')}
      />
    </TabScreenShell>
  );
}

export function PartidosTab() {
  const navigation = useNavigation<RootNav>();
  const { t } = useTranslation();
  const { profile } = useHomeData();
  const { partidosRefreshNonce } = useAppSignals();

  return (
    <TabScreenShell
      backgroundColor="#000000"
      header={(
        <BackHeader
          title={t('nav.tabPartidos')}
          tone="dark"
          onBack={() => goToMainTab('inicio')}
          rightSlot={<ProfileHeaderButton />}
        />
      )}
    >
      <PartidosScreen
        onPartidoPress={(p) => navigation.push('PartidoDetail', { partido: p })}
        onOpenWeMatchClubsFlow={(organizerId, matchVisibility) =>
          navigation.navigate('CrearPartido', {
            organizerId: organizerId ?? profile?.id ?? null,
            matchVisibility,
          })
        }
        onNavigateToCompleteOnboarding={() => goToMainTab('perfil')}
        partidosRefreshNonce={partidosRefreshNonce}
      />
    </TabScreenShell>
  );
}

export function PistasTab() {
  const navigation = useNavigation<RootNav>();
  return (
    <TabScreenShell>
      <MatchSearchScreen
        onCourtPress={(court) => navigation.navigate('ClubDetail', { court })}
        onBack={() => goToMainTab('inicio')}
      />
    </TabScreenShell>
  );
}

export function TiendaTab() {
  const navigation = useNavigation<RootNav>();
  const { t } = useTranslation();
  const { totalCount: cartCount } = useCart();

  return (
    <TabScreenShell
      header={(
        <BackHeader
          title={t('nav.tabTienda')}
          tone="dark"
          onBack={() => goToMainTab('inicio')}
          rightSlot={(
            <>
              <ProfileHeaderButton />
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
      )}
    >
      <TiendaScreen />
    </TabScreenShell>
  );
}

export function CursosTab() {
  const navigation = useNavigation<RootNav>();
  const { openOnboardingFromSection } = useAppSignals();
  return (
    <TabScreenShell>
      <CoursesScreen
        onBack={() => goToMainTab('inicio')}
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
  );
}

export function TorneosTab() {
  const { pendingTournamentId, setPendingTournamentId, openOnboardingFromSection } =
    useAppSignals();
  return (
    <TabScreenShell>
      <CompeticionesScreen
        onBack={() => goToMainTab('inicio')}
        initialOpenTournamentId={pendingTournamentId}
        onInitialTournamentOpened={() => setPendingTournamentId(null)}
        onOpenProfileForOnboarding={() => openOnboardingFromSection('torneos')}
      />
    </TabScreenShell>
  );
}

export function PerfilTab() {
  const navigation = useNavigation<RootNav>();
  const { toggle: toggleSidebar } = useSidebarActions();
  const {
    vitrinaScrollNonce,
    autoOpenOnboarding,
    setAutoOpenOnboarding,
    pendingOnboardingReturn,
    setPendingOnboardingReturn,
  } = useAppSignals();
  const openMatchById = useOpenMatchById();

  /**
   * Cuestionario completado: devuelve al usuario a la seccion de origen.
   * partido-detail no puede reabrirse (el objeto se perdio en el ciclo).
   */
  const handleOnboardingCompleted = () => {
    const target = pendingOnboardingReturn;
    setPendingOnboardingReturn(null);
    setAutoOpenOnboarding(false);
    if (!target || target === 'home') {
      goToMainTab('inicio');
      return;
    }
    if (target === 'daily-lesson') navigation.navigate('DailyLesson');
    else if (target === 'matchmaking') navigation.navigate('CompetitiveLeague', { entryIntent: 'default' });
    else if (target === 'torneos') goToMainTab('torneos');
    else if (target === 'cursos') goToMainTab('cursos');
  };

  return (
    <TabScreenShell>
      <ProfileScreen
        onBack={() => {
          goToMainTab('inicio');
          setAutoOpenOnboarding(false);
        }}
        onMenuPress={toggleSidebar}
        onEditProfilePress={() => {
          navigation.navigate('EditProfile');
        }}
        onPreferencesPress={() => {
          navigation.navigate('Preferences');
        }}
        onNavigateToInfo={(screenId) => {
          navigation.navigate('Info', { screenId });
        }}
        autoOpenOnboarding={autoOpenOnboarding}
        onOnboardingAutoOpened={() => setAutoOpenOnboarding(false)}
        onOnboardingCompleted={handleOnboardingCompleted}
        onOpenMatch={openMatchById}
        onOpenPublicProfile={(pid) => {
          navigation.push('PublicProfile', { playerId: pid });
        }}
        scrollToVitrinaNonce={vitrinaScrollNonce}
      />
    </TabScreenShell>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
  shellContent: {
    flex: 1,
    minHeight: 0,
  },
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
});
