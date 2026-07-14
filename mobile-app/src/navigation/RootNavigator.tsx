import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RequireAuth } from '../components/auth';
import { MainApp } from '../screens/MainApp';
import { navigationRef } from './navigationRef';
import { flushPendingNavActions } from './nav';
import { useAuthDeepLinks } from './useAuthDeepLinks';
import {
  ForgotPasswordRoute,
  LoginRoute,
  RegisterRoute,
  ResetPasswordRoute,
} from './authRoutes';
import type { RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();

function MainRoute() {
  return (
    <RequireAuth>
      <MainApp />
    </RequireAuth>
  );
}

type RootNavigatorProps = {
  isAuthenticated: boolean;
};

export function RootNavigator({ isAuthenticated }: RootNavigatorProps) {
  useAuthDeepLinks(!isAuthenticated);

  return (
    <NavigationContainer ref={navigationRef} onReady={flushPendingNavActions}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <RootStack.Group>
            <RootStack.Screen name="Main" component={MainRoute} />
            {/* Las rutas de la app (antes overlays de MainApp) se registran
                aqui por fases durante la migracion. */}
          </RootStack.Group>
        ) : (
          <RootStack.Group>
            <RootStack.Screen name="Login" component={LoginRoute} />
            <RootStack.Screen name="Register" component={RegisterRoute} />
            <RootStack.Screen name="ForgotPassword" component={ForgotPasswordRoute} />
            <RootStack.Screen name="ResetPassword" component={ResetPasswordRoute} />
          </RootStack.Group>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
