import { useContext, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthContext, AuthProvider } from './src/contexts/AuthContext';
import { SplashScreen } from './src/components/SplashScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MainApp } from './src/screens/MainApp';
import { RegisterScreen } from './src/screens/RegisterScreen';

type AuthScreen = 'login' | 'register';

function AuthFlowWrapper() {
  const [screen, setScreen] = useState<AuthScreen>('login');
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {screen === 'login' ? (
        <LoginScreen onGoToRegister={() => setScreen('register')} />
      ) : (
        <RegisterScreen onGoToLogin={() => setScreen('login')} />
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
        <MainApp />
      </>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <AuthFlowWrapper />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
