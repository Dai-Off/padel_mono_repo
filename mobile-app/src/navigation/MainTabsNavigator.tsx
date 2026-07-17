import { StyleSheet, View } from 'react-native';
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { BottomNavbar, type MainTabId } from '../components/layout/BottomNavbar';
import {
  CursosTab,
  InicioTab,
  PartidosTab,
  PerfilTab,
  PistasTab,
  TiendaTab,
  TorneosTab,
} from './routes/tabRoutes';
import type { MainTabsParamList } from './types';

const Tab = createBottomTabNavigator<MainTabsParamList>();

const TAB_FOR_ROUTE: Record<string, MainTabId> = {
  InicioTab: 'inicio',
  PartidosTab: 'partidos',
  PistasTab: 'pistas',
  TiendaTab: 'tienda',
  CursosTab: 'cursos',
  TorneosTab: 'torneos',
  PerfilTab: 'perfil',
};

const ROUTE_FOR_TAB = Object.fromEntries(
  Object.entries(TAB_FOR_ROUTE).map(([route, tab]) => [tab, route]),
) as Record<MainTabId, keyof MainTabsParamList>;

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

/**
 * Tabs principales como bottom-tabs navigator con componentes ESTABLES:
 * cada tab consume del contexto solo lo que necesita, asi un cambio de
 * estado global no re-renderiza a los siete a la vez. Lazy por defecto:
 * cada tab monta en su primera visita y permanece montado.
 */
export function MainTabsNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="InicioTab"
      // Back fisico en un tab distinto de Inicio → vuelve a Inicio.
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        sceneStyle: styles.scene,
      }}
      tabBar={(props) => <BottomNavbarAdapter {...props} />}
    >
      <Tab.Screen name="InicioTab" component={InicioTab} />
      <Tab.Screen name="PartidosTab" component={PartidosTab} />
      <Tab.Screen name="PistasTab" component={PistasTab} />
      <Tab.Screen name="TiendaTab" component={TiendaTab} />
      <Tab.Screen name="CursosTab" component={CursosTab} />
      <Tab.Screen name="TorneosTab" component={TorneosTab} />
      <Tab.Screen name="PerfilTab" component={PerfilTab} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  scene: {
    backgroundColor: '#0F0F0F',
  },
  /** Ancho completo del dispositivo (sin márgenes laterales). */
  bottomBar: {
    width: '100%',
    alignSelf: 'stretch',
  },
});
