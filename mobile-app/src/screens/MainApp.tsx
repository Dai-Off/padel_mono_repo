import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SearchCourtResult } from '../api/search';
import { BackHeader } from '../components/layout/BackHeader';
import { BottomNavbar } from '../components/layout/BottomNavbar';
import { ScreenLayout } from '../components/layout/ScreenLayout';
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

type TabId = 'inicio' | 'reservar' | 'competir' | 'partidos';

export function MainApp() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabId>('inicio');
  const [clubDetailCourt, setClubDetailCourt] = useState<SearchCourtResult | null>(null);
  const [selectedPartido, setSelectedPartido] = useState<PartidoItem | null>(null);
  const [showTusPagos, setShowTusPagos] = useState(false);
  const [showTransacciones, setShowTransacciones] = useState(false);

  const showClubDetail = activeTab === 'reservar' && clubDetailCourt != null;
  const showPartidoDetail = selectedPartido != null;

  const renderContent = () => {
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
            onPartidoPress={(p) => setSelectedPartido(p)}
            onNavigateToTab={(tab) => setActiveTab(tab)}
          />
        );
      case 'reservar':
        return (
          <MatchSearchScreen
            onCourtPress={(court) => setClubDetailCourt(court)}
          />
        );
      case 'competir':
        return <CompeticionesScreen />;
      case 'partidos':
        return (
          <PartidosScreen
            onPartidoPress={(p) => setSelectedPartido(p)}
          />
        );
      default:
        return <HomeScreen />;
    }
  };

  const customHeader =
    showTusPagos || showTransacciones || showPartidoDetail ? undefined : activeTab === 'reservar' && !showClubDetail ? (
      <BackHeader title="Buscador" onBack={() => setActiveTab('inicio')} />
    ) : activeTab === 'competir' ? (
      <BackHeader title="Competiciones" onBack={() => setActiveTab('inicio')} />
    ) : activeTab === 'partidos' ? (
      <BackHeader title="Partidos" onBack={() => setActiveTab('inicio')} />
    ) : undefined;

  return (
    <View style={styles.container}>
      <ScreenLayout
        customHeader={customHeader}
        hideHeader={showClubDetail || showPartidoDetail || showTusPagos || showTransacciones}
        onNavigateToTusPagos={() => setShowTusPagos(true)}
      >
        {renderContent()}
      </ScreenLayout>
      {!showClubDetail && !showPartidoDetail && !showTusPagos && !showTransacciones && (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <BottomNavbar activeTab={activeTab} onTabChange={setActiveTab} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  bottomBar: {
    backgroundColor: '#fff',
  },
});
