import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNavbar } from '../components/layout/BottomNavbar';
import { ScreenLayout } from '../components/layout/ScreenLayout';
import { HomeScreen } from './HomeScreen';

type TabId = 'inicio' | 'reservar' | 'competir' | 'partidos';

export function MainApp() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabId>('inicio');

  const renderContent = () => {
    switch (activeTab) {
      case 'inicio':
        return <HomeScreen />;
      case 'reservar':
      case 'competir':
      case 'partidos':
        return <HomeScreen />;
      default:
        return <HomeScreen />;
    }
  };

  return (
    <View style={styles.container}>
      <ScreenLayout>{renderContent()}</ScreenLayout>
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom - 12, 0) }]}>
        <BottomNavbar activeTab={activeTab} onTabChange={setActiveTab} />
      </View>
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
