import { DarkTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationOptions,
} from '@react-navigation/native-stack';
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

/**
 * Opciones por defecto de todas las rutas apiladas del grupo autenticado.
 * `transparentModal` mantiene la pantalla de debajo montada y pintada mientras
 * esta está encima (native-stack v7 no la detacha en modales transparentes),
 * así al volver se revela sin flash negro ni re-montaje. Las pantallas tienen
 * fondo opaco propio (RouteShell), no se transparentan en uso.
 */
const REVEAL_HOME_OPTIONS: NativeStackNavigationOptions = {
  presentation: 'transparentModal',
  animation: 'fade',
  animationDuration: 220,
};

/**
 * El Home (ruta base) NO es un modal: es la pantalla de fondo del stack. Card
 * normal opaca, sin animación (nunca se "entra" a ella con push).
 */
const MAIN_OPTIONS: NativeStackNavigationOptions = {
  presentation: 'card',
  animation: 'none',
};

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
          <RootStack.Group screenOptions={REVEAL_HOME_OPTIONS}>
            <RootStack.Screen name="Main" component={MainRoute} options={MAIN_OPTIONS} />
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
            <RootStack.Screen name="SeasonPass" component={SeasonPassRoute} />
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
