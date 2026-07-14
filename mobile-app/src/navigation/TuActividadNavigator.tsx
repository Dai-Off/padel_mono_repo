import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StackActions } from '@react-navigation/native';
import { TuActividadDataProvider } from '../contexts/TuActividadDataContext';
import { TuActividadScreen, type TuActividadDestination } from '../screens/TuActividadScreen';
import { MisPartidosActividadScreen } from '../screens/tuActividad/MisPartidosActividadScreen';
import { MisClasesActividadScreen } from '../screens/tuActividad/MisClasesActividadScreen';
import { MisCompeticionesActividadScreen } from '../screens/tuActividad/MisCompeticionesActividadScreen';
import { MisClubesFavoritosActividadScreen } from '../screens/tuActividad/MisClubesFavoritosActividadScreen';
import { navigationRef } from './navigationRef';
import { RouteShell } from './RouteShell';
import type { TuActividadStackParamList } from './types';

const TuActividadStack = createNativeStackNavigator<TuActividadStackParamList>();

const DESTINATION_ROUTES: Record<TuActividadDestination, keyof TuActividadStackParamList> = {
  partidos: 'MisPartidosActividad',
  clases: 'MisClasesActividad',
  competiciones: 'MisCompeticionesActividad',
  'clubes-favoritos': 'MisClubesFavoritosActividad',
};

function TuActividadMenuRoute({
  navigation,
}: NativeStackScreenProps<TuActividadStackParamList, 'TuActividadMenu'>) {
  return (
    <TuActividadScreen
      // goBack en la ruta inicial burbujea al stack raiz y cierra el flujo.
      onBack={() => navigation.goBack()}
      onNavigate={(destination) => navigation.navigate(DESTINATION_ROUTES[destination])}
    />
  );
}

function MisPartidosRoute({
  navigation,
}: NativeStackScreenProps<TuActividadStackParamList, 'MisPartidosActividad'>) {
  return (
    <MisPartidosActividadScreen
      onBack={() => navigation.goBack()}
      onPartidoPress={(partido) => {
        // PartidoDetail vive en el stack raiz; se despacha por ref para no
        // acoplar el stack anidado a sus tipos.
        if (navigationRef.isReady()) {
          navigationRef.dispatch(StackActions.push('PartidoDetail', { partido }));
        }
      }}
    />
  );
}

function MisClasesRoute({
  navigation,
}: NativeStackScreenProps<TuActividadStackParamList, 'MisClasesActividad'>) {
  return <MisClasesActividadScreen onBack={() => navigation.goBack()} />;
}

function MisCompeticionesRoute({
  navigation,
}: NativeStackScreenProps<TuActividadStackParamList, 'MisCompeticionesActividad'>) {
  return <MisCompeticionesActividadScreen onBack={() => navigation.goBack()} />;
}

function MisClubesFavoritosRoute({
  navigation,
}: NativeStackScreenProps<TuActividadStackParamList, 'MisClubesFavoritosActividad'>) {
  return <MisClubesFavoritosActividadScreen onBack={() => navigation.goBack()} />;
}

/**
 * Seccion "Tu actividad" como stack anidado (antes TuActividadFlow con el
 * puntero de sub-vista viviendo en MainApp). El provider envuelve el navigator
 * para que el menu y las 4 subpantallas compartan datos.
 */
export function TuActividadNavigator() {
  return (
    <TuActividadDataProvider>
      <RouteShell>
        <TuActividadStack.Navigator
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}
        >
          <TuActividadStack.Screen name="TuActividadMenu" component={TuActividadMenuRoute} />
          <TuActividadStack.Screen name="MisPartidosActividad" component={MisPartidosRoute} />
          <TuActividadStack.Screen name="MisClasesActividad" component={MisClasesRoute} />
          <TuActividadStack.Screen name="MisCompeticionesActividad" component={MisCompeticionesRoute} />
          <TuActividadStack.Screen name="MisClubesFavoritosActividad" component={MisClubesFavoritosRoute} />
        </TuActividadStack.Navigator>
      </RouteShell>
    </TuActividadDataProvider>
  );
}
