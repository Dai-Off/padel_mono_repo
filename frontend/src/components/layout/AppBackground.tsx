import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

const PARTICLES = 16;
const COLORS = ['#22d3ee', '#22c55e', '#3b82f6'];

function createParticleConfig() {
  return Array.from({ length: PARTICLES }, (_, i) => ({
    left: `${5 + (i * 5.5) % 85}%`,
    top: `${5 + (i * 6.2) % 75}%`,
    color: COLORS[i % COLORS.length],
  }));
}

export function AppBackground() {
  const config = useMemo(createParticleConfig, []);
  const anims = useRef(
    Array.from({ length: PARTICLES }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    const loops = anims.map((anim) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1,
            duration: 2500,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 2500,
            useNativeDriver: true,
          }),
        ])
      )
    );
    Animated.parallel(loops).start();
  }, [anims]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {config.map((p, i) => {
        const translateY = anims[i].interpolate({
          inputRange: [0, 1],
          outputRange: [0, -20],
        });
        const scale = anims[i].interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.2],
        });
        return (
          <Animated.View
            key={i}
            style={[
              styles.particle,
              {
                left: p.left,
                top: p.top,
                backgroundColor: p.color,
                transform: [{ translateY }, { scale }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  particle: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
