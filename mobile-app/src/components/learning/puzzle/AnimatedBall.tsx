import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Ball from '../../../../assets/puzzles/ball.svg';
import type { PuzzleBall } from '../../../types/puzzle';

type Props = {
  ball: PuzzleBall;
  cxPx: number;          // posición central destino (en px del Stage interior)
  cyPx: number;
  sizePx: number;
  durationMs: number;
};

export function AnimatedBall({ ball, cxPx, cyPx, sizePx, durationMs }: Props) {
  // progress 0→1 conduce toda la animación: posición lineal + scale parabólica + rotate.
  const progress = useRef(new Animated.Value(1)).current;
  // Trackeamos la posición previa para interpolar de start→end en cada cambio.
  const startRef = useRef({ x: cxPx, y: cyPx });
  const endRef = useRef({ x: cxPx, y: cyPx });
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      startRef.current = { x: cxPx, y: cyPx };
      endRef.current = { x: cxPx, y: cyPx };
      progress.setValue(1);
      initialized.current = true;
      return;
    }
    // start = donde estaba el último frame final; end = nuevo target.
    startRef.current = endRef.current;
    endRef.current = { x: cxPx, y: cyPx };
    progress.setValue(0);

    const isArc = ball.shot_type === 'lob' || ball.shot_type === 'chiquita';
    const easing = isArc ? Easing.linear : Easing.out(Easing.cubic);

    Animated.timing(progress, {
      toValue: 1,
      duration: durationMs,
      easing,
      useNativeDriver: true,
    }).start();
  }, [cxPx, cyPx, ball.shot_type, ball.spin, durationMs, progress]);

  const halfSize = sizePx / 2;
  const startX = startRef.current.x - halfSize;
  const startY = startRef.current.y - halfSize;
  const endX = endRef.current.x - halfSize;
  const endY = endRef.current.y - halfSize;

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [startX, endX] });
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [startY, endY] });

  // Lob: la pelota sube alto (scale máxima en t=0.5). Chiquita: sube poco. Sin shot: sin scale.
  const isLob = ball.shot_type === 'lob';
  const isChiquita = ball.shot_type === 'chiquita';
  const scaleMax = isLob ? 2.5 : isChiquita ? 1.25 : 1;
  const scale = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, scaleMax, 1],
  });

  // Spin: rota durante el viaje. random = giro aleatorio decidido al inicio.
  const spinDeg =
    ball.spin === 'clockwise'
      ? 360
      : ball.spin === 'counter-clockwise'
        ? -360
        : ball.spin === 'random'
          ? (initialized.current ? (Math.random() < 0.5 ? -1 : 1) * 270 : 0)
          : 0;
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${spinDeg}deg`],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.actor,
        {
          width: sizePx,
          height: sizePx,
          transform: [{ translateX }, { translateY }, { scale }, { rotate }],
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
