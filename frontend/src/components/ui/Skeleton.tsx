import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

type SkeletonProps = {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  /** 'dark' para fondos oscuros (card "Cerca de ti"), 'light' para fondos claros */
  variant?: 'dark' | 'light';
  style?: object;
};

export function Skeleton({
  width,
  height = 16,
  borderRadius = 4,
  variant = 'light',
  style,
}: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.6,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  const bgColor = variant === 'dark' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.08)';

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width: width ?? '100%',
          height,
          borderRadius,
          backgroundColor: bgColor,
          opacity,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  skeleton: {},
});
