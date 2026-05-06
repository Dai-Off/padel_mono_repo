import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Ball from '../../../../assets/puzzles/ball.svg';
import type { PuzzleBall } from '../../../types/puzzle';

type Props = {
  ball: PuzzleBall;
  // Posición central destino (en px del Stage interior).
  cxPx: number;
  cyPx: number;
  sizePx: number;
  durationMs: number;
};

export function AnimatedBall({ ball, cxPx, cyPx, sizePx, durationMs }: Props) {
  // Posición top-left del bounding box de la pelota.
  const targetX = cxPx - sizePx / 2;
  const targetY = cyPx - sizePx / 2;

  // Posición animada (top-left). Se anima con timing al cambiar el target.
  const xy = useRef(new Animated.ValueXY({ x: targetX, y: targetY })).current;
  // Progreso 0→1 sincronizado con la transición, conduce scale/rotate (efectos parabólicos).
  const progress = useRef(new Animated.Value(1)).current;
  // Spin angle final para esta animación; se decide al disparar (random necesita azar).
  const spinDegRef = useRef(0);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      xy.setValue({ x: targetX, y: targetY });
      progress.setValue(1);
      initialized.current = true;
      return;
    }

    // Decidir spin para esta animación.
    spinDegRef.current =
      ball.spin === 'clockwise'
        ? 360
        : ball.spin === 'counter-clockwise'
          ? -360
          : ball.spin === 'random'
            ? (Math.random() < 0.5 ? -1 : 1) * 270
            : 0;

    progress.setValue(0);

    Animated.parallel([
      Animated.timing(xy, {
        toValue: { x: targetX, y: targetY },
        duration: durationMs,
        // Lob/chiquita: lineal para que el arco fingido (scale) tenga su pico
        // exactamente en el medio de la trayectoria.
        easing:
          ball.shot_type === 'lob' || ball.shot_type === 'chiquita'
            ? Easing.linear
            : Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(progress, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ]).start();
  }, [targetX, targetY, ball.shot_type, ball.spin, durationMs, xy, progress]);

  // Lob: pico de scale 2.5 a t=0.5. Chiquita: pico 1.25. Sin shot: scale 1.
  const isLob = ball.shot_type === 'lob';
  const isChiquita = ball.shot_type === 'chiquita';
  const scaleMax = isLob ? 2.5 : isChiquita ? 1.25 : 1;
  const scale = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, scaleMax, 1],
  });

  // Rotate de 0deg a spinDeg. Si no hay spin, queda fijo en 0.
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${spinDegRef.current}deg`],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.actor,
        {
          width: sizePx,
          height: sizePx,
          transform: [
            { translateX: xy.x },
            { translateY: xy.y },
            { scale },
            { rotate },
          ],
        },
      ]}
    >
      <Ball width={sizePx} height={sizePx} preserveAspectRatio="xMidYMid meet" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  actor: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});

export function StaticBall({ ball: _ball, cxPx, cyPx, sizePx }: Omit<Props, 'durationMs'>) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.actor,
        {
          width: sizePx,
          height: sizePx,
          transform: [{ translateX: cxPx - sizePx / 2 }, { translateY: cyPx - sizePx / 2 }],
        },
      ]}
    >
      <Ball width={sizePx} height={sizePx} preserveAspectRatio="xMidYMid meet" />
    </View>
  );
}
