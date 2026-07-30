import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

type ScreenFadeInProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Escala inicial. 0.9 replica la entrada de la lección diaria; 1 = solo fade. */
  fromScale?: number;
  /** Duración del fade en ms. */
  duration?: number;
};

/**
 * Entrada suave de contenido (fade + scale con spring), replicando la animación
 * de intro de DailyLessonScreen. Se monta DENTRO del fondo opaco de la pantalla
 * (p. ej. dentro de RouteShell): así el fondo tapa el Home que hay detrás con
 * la presentación transparentModal, y el efecto no reintroduce el parpadeo que
 * daría un fade a nivel de navegación.
 */
export function ScreenFadeIn({ children, style, fromScale = 0.9, duration = 400 }: ScreenFadeInProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(fromScale)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 8, tension: 60, useNativeDriver: true }),
    ]).start();
  }, [opacity, scale, duration]);

  return (
    <Animated.View style={[{ flex: 1, opacity, transform: [{ scale }] }, style]}>
      {children}
    </Animated.View>
  );
}
