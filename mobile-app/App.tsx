import { useContext, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SystemUI from 'expo-system-ui';
import { StripeProvider } from './src/stripe';
import { AuthContext, AuthProvider } from './src/contexts/AuthContext';
import { MatchmakingProvider } from './src/contexts/MatchmakingContext';
import { HomeDataProvider } from './src/contexts/HomeDataContext';
import { ProfileDataProvider } from './src/contexts/ProfileDataContext';
import { CartProvider } from './src/contexts/CartContext';
import { SplashScreen } from './src/components/SplashScreen';
import { RootNavigator } from './src/navigation/RootNavigator';
import { STRIPE_PUBLISHABLE_KEY } from './src/config';
import { I18nProvider } from './src/i18n';

function AppContent() {
  const ctx = useContext(AuthContext);
  if (!ctx) return null;

  const { isAuthenticated, isLoading } = ctx;

  if (isLoading) {
    return (
      <>
        <StatusBar style="light" />
        <SplashScreen />
      </>
    );
  }

  return (
    <>
      <StatusBar style={isAuthenticated ? 'dark' : 'light'} />
      <RootNavigator isAuthenticated={isAuthenticated} />
    </>
  );
}

export default function App() {
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    // Fondo de la ventana nativa: al hacer pop, react-native-screens deja ver
    // la ventana un frame mientras re-engancha la pantalla anterior; en blanco
    // (default) produce un flash en cada vuelta atras.
    void SystemUI.setBackgroundColorAsync('#0F0F0F');
  }, []);

  const urlScheme =
    Constants.appOwnership === 'expo' ? Linking.createURL('/--/') : Linking.createURL('');

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider preload={false}>
        <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} urlScheme={urlScheme}>
          <SafeAreaProvider>
            <I18nProvider>
              <AuthProvider>
                <MatchmakingProvider>
                  <HomeDataProvider>
                    <ProfileDataProvider>
                      <CartProvider>
                        <AppContent />
                      </CartProvider>
                    </ProfileDataProvider>
                  </HomeDataProvider>
                </MatchmakingProvider>
              </AuthProvider>
            </I18nProvider>
          </SafeAreaProvider>
        </StripeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
