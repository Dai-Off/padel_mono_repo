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
import {
  AjustesRoute,
  AjustesSectionRoute,
  ChangePasswordRoute,
  ClubReviewsRoute,
  EditProfileRoute,
  InfoRoute,
  MonederoRoute,
  MovimientosMonederoRoute,
  PagosPendientesRoute,
  PreferencesRoute,
  TransaccionesRoute,
} from './routes/settingsRoutes';
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
            {/* Cluster ajustes/sidebar */}
            <RootStack.Screen name="Monedero" component={MonederoRoute} />
            <RootStack.Screen name="Transacciones" component={TransaccionesRoute} />
            <RootStack.Screen name="PagosPendientes" component={PagosPendientesRoute} />
            <RootStack.Screen name="MovimientosMonedero" component={MovimientosMonederoRoute} />
            <RootStack.Screen name="Ajustes" component={AjustesRoute} />
            <RootStack.Screen name="AjustesSection" component={AjustesSectionRoute} />
            <RootStack.Screen name="Info" component={InfoRoute} />
            <RootStack.Screen name="ClubReviews" component={ClubReviewsRoute} />
            <RootStack.Screen name="Preferences" component={PreferencesRoute} />
            <RootStack.Screen name="EditProfile" component={EditProfileRoute} />
            <RootStack.Screen name="ChangePassword" component={ChangePasswordRoute} />
            {/* Las siguientes fases de la migracion registran aqui el resto
                de overlays de MainApp. */}
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
