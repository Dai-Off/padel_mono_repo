import { useRef, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = Omit<PressableProps, 'style'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  /** Escala al mantener pulsado (1 = sin cambio). */
  pressedScale?: number;
};

/**
 * Feedback táctil tipo “card” del prototipo: leve escala al `pressIn` / `pressOut`.
 */
export function ScalePressable({
  children,
  style,
  pressedScale = 0.98,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const to = (v: number) => {
    Animated.spring(scale, {
      toValue: v,
      friction: 7,
      tension: 320,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }], alignSelf: 'stretch' }}>
      <Pressable
        {...rest}
        style={(state) => {
          const base = typeof style === 'function' ? style(state) : style;
          return [base];
        }}
        onPressIn={(e) => {
          to(pressedScale);
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          to(1);
          onPressOut?.(e);
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
