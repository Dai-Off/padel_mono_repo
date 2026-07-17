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
  /** Cambia al recuperar el foco: re-dispara la entrada. */
  enterKey?: number;
  /** Cambia al perder el foco (con la pantalla ya tapada): esconde en seco. */
  resetKey?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Entrada tipo prototipo: opacidad + ligero `translateY` con easing suave.
 * Con la navegación por tabs el Home ya no se remonta al volver, así que el
 * replay va en dos fases desde fuera (useFocusEffect): `resetKey` esconde en
 * seco al perder el foco — invisible, la pantalla ya está cubierta — y
 * `enterKey` lanza la cascada al volver, sobre lienzo limpio. Nunca se
 * resetea contenido a la vista (eso producía un salto perceptible).
 */
export function InicioEnterBlock({ children, enterIndex, enterKey = 0, resetKey = 0, style }: Props) {
  const p = useRef(new Animated.Value(0)).current;

  // Fase 1 — blur: ocultación instantánea. En el montaje es inofensivo
  // (p ya nace en 0) y corre antes que el efecto de entrada.
  useEffect(() => {
    p.stopAnimation();
    p.setValue(0);
  }, [resetKey, p]);

  // Fase 2 — montaje y cada re-foco: entrada escalonada. Sin `setValue(0)`
  // aquí: si el bloque sigue visible (no hubo reset), animar 1→1 no salta.
  useEffect(() => {
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
