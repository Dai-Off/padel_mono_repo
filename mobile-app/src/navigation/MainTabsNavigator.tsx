import type { ReactElement, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { BottomNavbar, type MainTabId } from '../components/layout/BottomNavbar';
import type { MainTabsParamList } from './types';

const Tab = createBottomTabNavigator<MainTabsParamList>();

const ROUTE_FOR_TAB: Record<MainTabId, keyof MainTabsParamList> = {
  inicio: 'InicioTab',
  partidos: 'PartidosTab',
  pistas: 'PistasTab',
  tienda: 'TiendaTab',
  cursos: 'CursosTab',
  torneos: 'TorneosTab',
  perfil: 'PerfilTab',
};

const TAB_FOR_ROUTE = Object.fromEntries(
  Object.entries(ROUTE_FOR_TAB).map(([tab, route]) => [route, tab]),
) as Record<string, MainTabId>;

/** Ruta del tab navigator que corresponde a un MainTabId. */
export function tabRouteFor(tab: MainTabId): keyof MainTabsParamList {
  return ROUTE_FOR_TAB[tab];
}

/**
 * Marco de cada tab: sustituye lo que ScreenLayout montaba una sola vez
 * (safe-area superior + fondo + header propio del tab).
 */
export function TabScreenShell({
  children,
  backgroundColor = '#0F0F0F',
  header,
}: {
  children: ReactNode;
  backgroundColor?: string;
  header?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.shell, { backgroundColor, paddingTop: insets.top }]}>
      {header}
      <View style={styles.shellContent}>{children}</View>
    </View>
  );
}

/**
 * Adaptador entre el tab navigator y la barra visual existente: BottomNavbar
 * no cambia ni un pixel, solo recibe el tab activo desde el estado del
 * navigator. Torneos y perfil no tienen boton (igual que siempre): sus rutas
 * no casan con ningun id de la barra y esta no marca nada.
 */
function BottomNavbarAdapter({ state, navigation }: BottomTabBarProps) {
  const activeTab = TAB_FOR_ROUTE[state.routes[state.index].name] ?? null;
  return (
    <View style={styles.bottomBar}>
      <BottomNavbar
        activeTab={activeTab}
        onTabChange={(tab) => navigation.navigate(ROUTE_FOR_TAB[tab])}
      />
    </View>
  );
}

type MainTabsScreens = {
  [K in keyof MainTabsParamList]: () => ReactElement;
};

/**
 * Tabs principales como bottom-tabs navigator. Las pantallas llegan como
 * render callbacks desde MainApp (siguen recibiendo sus props/nonces igual
 * que con el switch anterior); lazy por defecto: cada tab monta en su
 * primera visita y permanece montado.
 */
export function MainTabsNavigator({ screens }: { screens: MainTabsScreens }) {
  return (
    <Tab.Navigator
      initialRouteName="InicioTab"
      // Back fisico en un tab distinto de Inicio → vuelve a Inicio (el
      // comportamiento que implementaba a mano el BackHandler de MainApp).
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        sceneStyle: styles.scene,
      }}
      tabBar={(props) => <BottomNavbarAdapter {...props} />}
    >
      <Tab.Screen name="InicioTab">{screens.InicioTab}</Tab.Screen>
      <Tab.Screen name="PartidosTab">{screens.PartidosTab}</Tab.Screen>
      <Tab.Screen name="PistasTab">{screens.PistasTab}</Tab.Screen>
      <Tab.Screen name="TiendaTab">{screens.TiendaTab}</Tab.Screen>
      <Tab.Screen name="CursosTab">{screens.CursosTab}</Tab.Screen>
      <Tab.Screen name="TorneosTab">{screens.TorneosTab}</Tab.Screen>
      <Tab.Screen name="PerfilTab">{screens.PerfilTab}</Tab.Screen>
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  scene: {
    backgroundColor: '#0F0F0F',
  },
  shell: {
    flex: 1,
  },
  shellContent: {
    flex: 1,
    minHeight: 0,
  },
  /** Ancho completo del dispositivo (sin márgenes laterales). */
  bottomBar: {
    width: '100%',
    alignSelf: 'stretch',
  },
});
