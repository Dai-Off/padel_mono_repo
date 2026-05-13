import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import PlayerBack from '../../../../assets/puzzles/player_back.svg';
import PlayerFront from '../../../../assets/puzzles/player_front.svg';
import type { PuzzlePlayer } from '../../../types/puzzle';

const SPRITE_ASPECT = 3054 / 1408; // alto/ancho del SVG original

type Props = {
  player: PuzzlePlayer;
  // Posición central en píxeles del Stage interior.
  cxPx: number;
  cyPx: number;
  widthPx: number;          // tamaño del lado del cuadrado del jugador
  durationMs: number;       // duración de la animación de transición
};

export function AnimatedPlayer({ player, cxPx, cyPx, widthPx, durationMs }: Props) {
  const heightPx = widthPx * SPRITE_ASPECT;
  // Posición top-left = centro − mitad de tamaño.
  const targetX = cxPx - widthPx / 2;
  const targetY = cyPx - heightPx / 2;

  const xy = useRef(new Animated.ValueXY({ x: targetX, y: targetY })).current;
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      // Primer mount: no animar, simplemente fijar.
      xy.setValue({ x: targetX, y: targetY });
      initialized.current = true;
      return;
    }
    Animated.timing(xy, {
      toValue: { x: targetX, y: targetY },
      duration: durationMs,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [targetX, targetY, durationMs, xy]);

  const Sprite = player.team === 1 ? PlayerBack : PlayerFront;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.actor,
        {
          width: widthPx,
          height: heightPx,
          transform: [{ translateX: xy.x }, { translateY: xy.y }],
        },
      ]}
    >
      <Sprite width={widthPx} height={heightPx} preserveAspectRatio="xMidYMid meet" />
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

// ---------------------------------------------------------------------------
// Render no animado, usado durante el estado inicial antes de tener `size` del Stage.
// (Evita parpadeos al primer mount.)
// ---------------------------------------------------------------------------
export function StaticPlayer({ player, cxPx, cyPx, widthPx }: Omit<Props, 'durationMs'>) {
  const heightPx = widthPx * SPRITE_ASPECT;
  const Sprite = player.team === 1 ? PlayerBack : PlayerFront;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.actor,
        {
          width: widthPx,
          height: heightPx,
          transform: [{ translateX: cxPx - widthPx / 2 }, { translateY: cyPx - heightPx / 2 }],
        },
      ]}
    >
      <Sprite width={widthPx} height={heightPx} preserveAspectRatio="xMidYMid meet" />
    </View>
  );
}
