import { Dimensions, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AUTH_COLUMN_MAX } from '../constants/authLayout';

/**
 * Ancho útil de la columna de auth (login/registro).
 *
 * En Android el primer frame a veces devuelve `width: 0` desde useWindowDimensions;
 * si eso se usa en `Math.max(0 - padding, 1)` el ancho queda en 1px y todo el texto se recorta.
 */
export function useAuthColumnWidth(horizontalPadding: number): number {
  const { width: layoutWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const windowWidth =
    layoutWidth > 0
      ? layoutWidth
      : Math.max(
          Dimensions.get('window').width,
          Dimensions.get('screen').width,
          360,
        );

  const available = Math.max(windowWidth - insets.left - insets.right, 1);

  const raw = available - horizontalPadding * 2;
  return Math.min(Math.max(raw, 1), AUTH_COLUMN_MAX);
}
