import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Court from '../../../../assets/puzzles/court.svg';
import { AnimatedPlayer, StaticPlayer } from './AnimatedPlayer';
import { AnimatedBall, StaticBall } from './AnimatedBall';
import {
  STAGE_ASPECT,
  courtConfig,
  m2pctX,
  m2pctY,
} from './lib/courtConfig';
import type { PuzzleFrame } from '../../../types/puzzle';

const STAGE_H_M = 20 + 2 * courtConfig.outerMargin;

type Props = {
  frame: PuzzleFrame;
  // Cuando es false, los actores se renderizan en posición fija sin animar
  // (útil para el render inicial estático antes de confirmar).
  animate?: boolean;
};

export function PuzzleStage({ frame, animate = true }: Props) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  };

  const playerWidthPx = size ? ((courtConfig.player.radius * 3.5) / STAGE_H_M) * size.h : 0;
  const ballSidePx = size ? ((courtConfig.ball.radius * 2) / STAGE_H_M) * size.h : 0;
  const durationMs = frame.duration_ms ?? 1500;

  return (
    <View style={styles.wrapper}>
      <View style={styles.stage} onLayout={onLayout}>
        {/* Pista de fondo (incluye paredes y márgenes). */}
        <Court width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />

        {size &&
          frame.players.map((p) => {
            const cxPx = (m2pctX(p.x) / 100) * size.w;
            const cyPx = (m2pctY(p.y) / 100) * size.h;
            return animate ? (
              <AnimatedPlayer
                key={p.id}
                player={p}
                cxPx={cxPx}
                cyPx={cyPx}
                widthPx={playerWidthPx}
                durationMs={durationMs}
              />
            ) : (
              <StaticPlayer
                key={p.id}
                player={p}
                cxPx={cxPx}
                cyPx={cyPx}
                widthPx={playerWidthPx}
              />
            );
          })}

        {size && (
          animate ? (
            <AnimatedBall
              ball={frame.ball}
              cxPx={(m2pctX(frame.ball.x) / 100) * size.w}
              cyPx={(m2pctY(frame.ball.y) / 100) * size.h}
              sizePx={ballSidePx}
              durationMs={durationMs}
            />
          ) : (
            <StaticBall
              ball={frame.ball}
              cxPx={(m2pctX(frame.ball.x) / 100) * size.w}
              cyPx={(m2pctY(frame.ball.y) / 100) * size.h}
              sizePx={ballSidePx}
            />
          )
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    aspectRatio: STAGE_ASPECT,
    alignSelf: 'center',
    maxWidth: 420,
  },
  stage: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#3b82f6',
  },
});
