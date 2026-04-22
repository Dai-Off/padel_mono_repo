import { useContext, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StripeProvider } from './src/stripe';
import { AuthContext, AuthProvider } from './src/contexts/AuthContext';
import { SplashScreen } from './src/components/SplashScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MainApp } from './src/screens/MainApp';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { ForgotPasswordScreen } from './src/screens/ForgotPasswordScreen';
import { RequireAuth } from './src/components/auth';
import { STRIPE_PUBLISHABLE_KEY } from './src/config';
import { theme } from './src/theme';

type AuthScreen = 'login' | 'register' | 'forgot_password';

function AuthFlowWrapper() {
  const [screen, setScreen] = useState<AuthScreen>('login');
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
        <ForgotPasswordScreen onBackToLogin={() => setScreen('login')} />
      )}
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
          <AppContent />
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
