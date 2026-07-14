import { useEffect, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';
import { theme } from '../theme';
import type { RootStackParamList } from './types';

/** Marco visual comun del flujo de auth (antes en AuthFlowWrapper). */
function AuthShell({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.authContainer} edges={['top', 'bottom']}>
      {children}
    </SafeAreaView>
  );
}

export function LoginRoute({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'Login'>) {
  const initialEmail = route.params?.initialEmail ?? '';
  return (
    <AuthShell>
      {/* key: LoginScreen captura initialEmail en un useState al montar;
          remontamos cuando cambia (mismo comportamiento que el switch antiguo). */}
      <LoginScreen
        key={initialEmail}
        initialEmail={initialEmail}
        onGoToRegister={() => navigation.navigate('Register')}
        onGoToForgot={() => navigation.navigate('ForgotPassword')}
      />
    </AuthShell>
  );
}

export function RegisterRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Register'>) {
  return (
    <AuthShell>
      <RegisterScreen
        onGoToLogin={(email) => navigation.popTo('Login', { initialEmail: email ?? '' })}
      />
    </AuthShell>
  );
}

export function ForgotPasswordRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>) {
  return (
    <AuthShell>
      <ForgotPasswordScreen onBackToLogin={() => navigation.popTo('Login')} />
    </AuthShell>
  );
}

export function ResetPasswordRoute({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'ResetPassword'>) {
  const recovery = route.params?.recovery ?? null;

  // Guard defensivo: sin payload de recovery la pantalla no tiene sentido.
  useEffect(() => {
    if (!recovery) navigation.popTo('Login');
  }, [recovery, navigation]);

  if (!recovery) return null;

  return (
    <AuthShell>
      <ResetPasswordScreen
        recovery={recovery}
        onBackToLogin={() => navigation.popTo('Login', { initialEmail: '' })}
      />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  authContainer: {
    flex: 1,
    backgroundColor: theme.auth.bg,
  },
});
