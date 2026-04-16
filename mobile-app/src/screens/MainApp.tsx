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

export function MainApp() {
  const sidebar = useSidebar(false);
  const [activeTab, setActiveTab] = useState<MainTabId>('inicio');
  const [clubDetailCourt, setClubDetailCourt] = useState<SearchCourtResult | null>(null);
  const [selectedPartido, setSelectedPartido] = useState<PartidoItem | null>(null);
  const [showTusPagos, setShowTusPagos] = useState(false);
  const [showTransacciones, setShowTransacciones] = useState(false);
  const [crearPartidoFlow, setCrearPartidoFlow] = useState<{
    open: boolean;
    organizerId: string | null;
  }>({ open: false, organizerId: null });
  const [partidosRefreshNonce, setPartidosRefreshNonce] = useState(0);
  const [bookingSuccessData, setBookingSuccessData] = useState<BookingConfirmationData | null>(null);

  const showClubDetail = activeTab === 'pistas' && clubDetailCourt != null;
  const showPartidoDetail = selectedPartido != null;

  const renderContent = () => {
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
          onPartidoCreado={(data) => {
            setCrearPartidoFlow({ open: false, organizerId: null });
            bumpPartidos();
            setBookingSuccessData(data);
          }}
        />
      );
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
            onNavigateToTab={(tab) => setActiveTab(tab)}
            onPartidoPress={(p) => setSelectedPartido(p)}
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
        return <CompeticionesScreen onBack={() => setActiveTab('inicio')} />;
      case 'partidos':
        return (
          <PartidosScreen
            onPartidoPress={(p) => setSelectedPartido(p)}
            onOpenWeMatchClubsFlow={(organizerId) =>
              setCrearPartidoFlow({ open: true, organizerId })
            }
            partidosRefreshNonce={partidosRefreshNonce}
          />
        );
      default:
        return <HomeScreen />;
    }
  };

  const showMainTabs =
    bookingSuccessData == null &&
    !showTusPagos &&
    !showTransacciones &&
    !showPartidoDetail &&
    !showClubDetail &&
    !crearPartidoFlow.open;

  const customHeader =
    bookingSuccessData != null ||
    showTusPagos ||
    showTransacciones ||
    showPartidoDetail ||
    crearPartidoFlow.open
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
                    <HomeHeader onMenuPress={sidebar.toggle} />
                  )
                : undefined;

  const layoutBackgroundColor =
    bookingSuccessData != null
      ? '#000000'
      : showPartidoDetail
        ? '#0F0F0F'
        : crearPartidoFlow.open
          ? '#0F0F0F'
          : showMainTabs && (activeTab === 'inicio' || activeTab === 'partidos')
            ? '#000000'
            : showMainTabs && (activeTab === 'pistas' || activeTab === 'tienda' || activeTab === 'torneos')
              ? '#0F0F0F'
              : '#ffffff';

  return (
    <View style={styles.container}>
      <SidebarProvider close={sidebar.close} onNavigateToTusPagos={() => setShowTusPagos(true)}>
        <View style={styles.mainColumn}>
          <ScreenLayout
            sidebar={sidebar}
            customHeader={customHeader}
            hideHeader={
              bookingSuccessData != null ||
              showClubDetail ||
              showPartidoDetail ||
              showTusPagos ||
              showTransacciones ||
              crearPartidoFlow.open ||
              (showMainTabs && activeTab === 'pistas') ||
              (showMainTabs && activeTab === 'torneos')
            }
            layoutBackgroundColor={layoutBackgroundColor}
          >
            {renderContent()}
          </ScreenLayout>
          {bookingSuccessData == null &&
            !showClubDetail &&
            !showPartidoDetail &&
            !showTusPagos &&
            !showTransacciones &&
            !crearPartidoFlow.open && (
            <View style={styles.bottomBar}>
              <BottomNavbar activeTab={activeTab} onTabChange={setActiveTab} />
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
