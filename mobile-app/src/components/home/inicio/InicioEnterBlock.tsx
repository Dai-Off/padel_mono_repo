import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import {
  INICIO_ENTER_DURATION_MS,
  INICIO_ENTER_EASING,
  getInicioSectionDelayMs,
} from './inicioMotion';

type Props = {
  children: ReactNode;
  /** Orden en la columna (0 = primero); define retardo acumulado. */
  enterIndex: number;
  /** Cambiar el valor re-dispara la entrada (p. ej. al recuperar el foco del tab). */
  enterKey?: number;
  /** Recorrido vertical inicial en px (más corto en re-entradas para no cansar). */
  distance?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Entrada tipo prototipo: opacidad + ligero `translateY` con easing suave.
 * Con la navegación por tabs el Home ya no se remonta al volver, así que la
 * entrada solo corría una vez por sesión; `enterKey` permite re-dispararla
 * desde fuera (useFocusEffect) en cada vuelta a la pantalla.
 */
export function InicioEnterBlock({ children, enterIndex, enterKey = 0, distance = 20, style }: Props) {
  const p = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    p.setValue(0);
    Animated.timing(p, {
      toValue: 1,
      delay: getInicioSectionDelayMs(enterIndex),
      duration: INICIO_ENTER_DURATION_MS,
      easing: INICIO_ENTER_EASING,
      useNativeDriver: true,
    }).start();
  }, [enterIndex, enterKey, p]);

  const animatedStyle = {
    opacity: p,
    transform: [
      {
        translateY: p.interpolate({
          inputRange: [0, 1],
          outputRange: [distance, 0],
        }),
      },
    ],
  };

  return (
    <Animated.View style={[{ alignSelf: 'stretch', width: '100%' }, animatedStyle, style]}>
      {children}
    </Animated.View>
  );
}
