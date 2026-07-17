import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

/**
 * Ref global del NavigationContainer. Permite navegar desde fuera del arbol
 * de React (deep links, hosts globales, efectos de MainApp).
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
