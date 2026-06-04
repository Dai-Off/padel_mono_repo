import { useContext, useEffect, useState, useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StripeProvider } from './src/stripe';
import { AuthContext, AuthProvider } from './src/contexts/AuthContext';
import { HomeDataProvider } from './src/contexts/HomeDataContext';
import { SplashScreen } from './src/components/SplashScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MainApp } from './src/screens/MainApp';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { ForgotPasswordScreen } from './src/screens/ForgotPasswordScreen';
import { ResetPasswordScreen, type RecoveryPayload } from './src/screens/ResetPasswordScreen';
import { RequireAuth } from './src/components/auth';
import { STRIPE_PUBLISHABLE_KEY } from './src/config';
import { theme } from './src/theme';
import { isRecoveryDeepLink, parseSupabaseRecoveryFromUrl } from './src/lib/parseAuthRecoveryUrl';
import { parseTournamentInviteUrl } from './src/lib/parseTournamentInviteUrl';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_TOURNAMENT_INVITE_KEY = 'pending_tournament_invite';

async function stashTournamentInviteFromUrl(url: string | null) {
  if (!url) return;
  const parsed = parseTournamentInviteUrl(url);
  if (parsed) {
    await AsyncStorage.setItem(PENDING_TOURNAMENT_INVITE_KEY, JSON.stringify(parsed));
  }
}

type AuthScreen = 'login' | 'register' | 'forgot_password' | 'reset_password';

function AuthFlowWrapper() {
  const [screen, setScreen] = useState<AuthScreen>('login');
  const [recovery, setRecovery] = useState<RecoveryPayload | null>(null);

  const consumeDeepLink = useCallback((url: string | null) => {
    if (!url) return;
    void stashTournamentInviteFromUrl(url);

    if (url.includes('email-confirmed')) {
      setRecovery(null);
      setScreen('login');
      return;
    }

    if (!isRecoveryDeepLink(url)) return;
    const parsed = parseSupabaseRecoveryFromUrl(url);
    setRecovery({
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
      token_hash: parsed.token_hash,
    });
    setScreen('reset_password');
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const initial = await Linking.getInitialURL();
      if (alive && initial) consumeDeepLink(initial);
    })();
    const sub = Linking.addEventListener('url', ({ url }) => {
      consumeDeepLink(url);
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [consumeDeepLink]);

  const goLogin = () => {
    setRecovery(null);
    setScreen('login');
  };

  return (
    <SafeAreaView style={[styles.container, styles.authContainer]} edges={['top', 'bottom']}>
      {screen === 'login' && (
        <LoginScreen
          onGoToRegister={() => setScreen('register')}
          onGoToForgot={() => setScreen('forgot_password')}
        />
      )}
      {screen === 'register' && (
        <RegisterScreen onGoToLogin={() => setScreen('login')} />
      )}
      {screen === 'forgot_password' && (
        <ForgotPasswordScreen onBackToLogin={goLogin} />
      )}
      {screen === 'reset_password' && recovery ? (
        <ResetPasswordScreen recovery={recovery} onBackToLogin={goLogin} />
      ) : null}
    </SafeAreaView>
  );
}

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

  if (isAuthenticated) {
    return (
      <>
        <StatusBar style="dark" />
        <RequireAuth>
          <MainApp />
        </RequireAuth>
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <AuthFlowWrapper />
    </>
  );
}

export default function App() {
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  const urlScheme =
    Constants.appOwnership === 'expo' ? Linking.createURL('/--/') : Linking.createURL('');

  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} urlScheme={urlScheme}>
      <SafeAreaProvider>
        <AuthProvider>
          {/* Montado siempre (no dentro del branch authed) para que un
              parpadeo de sesión no destruya el cache y dispare reload infinito. */}
          <HomeDataProvider>
            <AppContent />
          </HomeDataProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </StripeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  authContainer: {
    backgroundColor: theme.auth.bg,
  },
});
