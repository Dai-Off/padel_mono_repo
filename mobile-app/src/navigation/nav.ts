import { navigationRef } from './navigationRef';
import type { PartidoItem } from '../screens/PartidosScreen';

/**
 * Acciones encoladas hasta que el NavigationContainer este listo. Cubre la
 * carrera de arranque en frio: un deep link puede querer navegar antes de
 * que el container haya montado.
 */
const pendingActions: Array<() => void> = [];

/** Ejecuta (o encola) una accion de navegacion segura fuera del arbol React. */
export function dispatchWhenReady(action: () => void) {
  if (navigationRef.isReady()) {
    action();
    return;
  }
  pendingActions.push(action);
}

/** Llamar desde el onReady del NavigationContainer. */
export function flushPendingNavActions() {
  while (pendingActions.length > 0) {
    const action = pendingActions.shift();
    action?.();
  }
}

/**
 * Punto unico de apertura del detalle de partido: todos los origenes
 * (listas, home, perfil, deep links, liga...) pasan por aqui.
 */
export function openPartidoDetail(partido: PartidoItem) {
  dispatchWhenReady(() => {
    navigationRef.navigate('PartidoDetail', { partido });
  });
}
