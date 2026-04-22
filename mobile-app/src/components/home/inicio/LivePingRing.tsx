import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

const PING_MS = 1100;

type Props = {
  /** Diámetro del punto central (px). El anillo exterior escala desde este tamaño. */
  size?: number;
};

/**
 * Equiv. a `animate-ping` de Tailwind: anillo que crece y se desvanece en bucle.
 */
export function LivePingRing({ size = 12 }: Props) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, {
          toValue: 1,
          duration: PING_MS,
          useNativeDriver: true,
        }),
        Animated.timing(t, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [t]);

  const scale = t.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.15],
  });
  const opacity = t.interpolate({
    inputRange: [0, 0.75, 1],
    outputRange: [0.72, 0.2, 0],
  });

  const dot = size * 0.85;
  const dotRadius = dot / 2;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            opacity,
            transform: [{ scale }],
          },
        ]}
      />
      <View
        style={[
          styles.dot,
          {
            width: dot,
            height: dot,
            borderRadius: dotRadius,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  ring: {
    position: 'absolute',
    backgroundColor: '#ef4444',
  },
  dot: {
    backgroundColor: '#dc2626',
  },
});
