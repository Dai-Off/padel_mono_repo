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
  style?: StyleProp<ViewStyle>;
};

/**
 * Entrada tipo prototipo: opacidad + ligero `translateY` con easing suave.
 */
export function InicioEnterBlock({ children, enterIndex, style }: Props) {
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
  }, [enterIndex, p]);

  const animatedStyle = {
    opacity: p,
    transform: [
      {
        translateY: p.interpolate({
          inputRange: [0, 1],
          outputRange: [20, 0],
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
