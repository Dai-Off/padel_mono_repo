import { DarkTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RequireAuth } from '../components/auth';
import { MainShell } from './MainShell';
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
import {
  CartRoute,
  CourtReservationDetailRoute,
  CrearPartidoRoute,
  DailyLessonRoute,
  EducationalCourseDetailRoute,
  PublicCourseDetailRoute,
  SeasonPassRoute,
} from './routes/commerceRoutes';
import {
  ClubDetailRoute,
  CommunityRoute,
  DirectMessageThreadRoute,
  MessagesRoute,
  NotificationsRoute,
  PartidoDetailRoute,
  PublicProfileRoute,
} from './routes/socialRoutes';
import { CompetitiveLeagueRoute } from './routes/matchmakingRoutes';
import { TuActividadNavigator } from './TuActividadNavigator';
import { BookingSuccessProvider } from '../contexts/BookingSuccessContext';
import { GlobalOverlaysHost } from './GlobalOverlaysHost';
import { theme } from '../theme';
import type { RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();

/**
 * Tema oscuro del navigator: sin el, las pantallas nativas animan sobre el
 * fondo del tema por defecto (blanco) y cada transicion muestra un flash.
 */
const APP_NAV_THEME: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#0F0F0F',
    card: '#0F0F0F',
  },
};

/** Fondo de las pantallas del stack durante las transiciones nativas. */
const APP_CONTENT_STYLE = { backgroundColor: '#0F0F0F' } as const;

function MainRoute() {
  return (
    <RequireAuth>
      <MainShell />
    </RequireAuth>
  );
}

type RootNavigatorProps = {
  isAuthenticated: boolean;
};

export function RootNavigator({ isAuthenticated }: RootNavigatorProps) {
  useAuthDeepLinks(!isAuthenticated);

  return (
    <BookingSuccessProvider>
      <NavigationContainer ref={navigationRef} theme={APP_NAV_THEME} onReady={flushPendingNavActions}>
        <RootStack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: APP_CONTENT_STYLE,
            // Sin animacion: replica el swap instantaneo previo a React
            // Navigation y evita ver el cascaron de la pantalla entrante
            // antes de que pinte su contenido. Se puede activar animacion
            // por pantalla cuando interese.
            animation: 'none',
          }}
        >
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
            {/* Cluster comercio / reservas / cursos */}
            <RootStack.Screen name="Cart" component={CartRoute} />
            <RootStack.Screen name="DailyLesson" component={DailyLessonRoute} />
            <RootStack.Screen name="EducationalCourseDetail" component={EducationalCourseDetailRoute} />
            <RootStack.Screen name="PublicCourseDetail" component={PublicCourseDetailRoute} />
            <RootStack.Screen name="CrearPartido" component={CrearPartidoRoute} />
            <RootStack.Screen name="CourtReservationDetail" component={CourtReservationDetailRoute} />
            {/* El pase pinta al instante (skeleton/cache), así que puede
                permitirse animación de entrada sin mostrar cascarón. Fade
                discreto: el slide se descartó por brusco para esta pantalla. */}
            <RootStack.Screen
              name="SeasonPass"
              component={SeasonPassRoute}
              options={{ animation: 'fade', animationDuration: 220 }}
            />
            {/* Grafo social / partidos */}
            <RootStack.Screen name="PartidoDetail" component={PartidoDetailRoute} />
            <RootStack.Screen name="PublicProfile" component={PublicProfileRoute} />
            <RootStack.Screen name="Messages" component={MessagesRoute} />
            <RootStack.Screen name="DirectMessageThread" component={DirectMessageThreadRoute} />
            <RootStack.Screen name="Notifications" component={NotificationsRoute} />
            <RootStack.Screen name="Community" component={CommunityRoute} />
            <RootStack.Screen name="ClubDetail" component={ClubDetailRoute} />
            {/* Matchmaking / actividad */}
            <RootStack.Screen name="CompetitiveLeague" component={CompetitiveLeagueRoute} />
            <RootStack.Screen name="TuActividad" component={TuActividadNavigator} />
          </RootStack.Group>
        ) : (
          <RootStack.Group
            screenOptions={{ contentStyle: { backgroundColor: theme.auth.bg } }}
          >
            <RootStack.Screen name="Login" component={LoginRoute} />
            <RootStack.Screen name="Register" component={RegisterRoute} />
            <RootStack.Screen name="ForgotPassword" component={ForgotPasswordRoute} />
            <RootStack.Screen name="ResetPassword" component={ResetPasswordRoute} />
          </RootStack.Group>
        )}
        </RootStack.Navigator>
        {/* Overlays por encima de cualquier ruta (confirmacion de reserva, etc.) */}
        <GlobalOverlaysHost />
      </NavigationContainer>
    </BookingSuccessProvider>
  );
}
